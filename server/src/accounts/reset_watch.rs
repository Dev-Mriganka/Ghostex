//! Banked usage resets about to expire: a red row in the bell (the desktop also shows it as a system notification) when a reset of a saved account expires within 3 days and again within 24 hours, and, when the provider's auto-redeem setting is on, an automatic redeem before the reset is lost.
use super::{
    endpoint::account_id,
    model::{DiscoveredAccount, Provider, ResetCredit, SavedAccount},
    reset_claim, store,
};
use crate::{
    domain::DomainStateError,
    logging::{GxserverLogInput, LogLevel},
    notification_feed::{
        broadcast_notification_feed_changed,
        store::{
            account_notification_session_id, insert_notification_feed_row, mark_notification_read,
            NewNotificationFeedRow, ACCOUNT_NOTIFICATION_PROJECT_ID,
            NOTIFICATION_FEED_KIND_RESET_EXPIRING, NOTIFICATION_FEED_KIND_RESET_REDEEMED,
        },
    },
    server::AppState,
};
use chrono::{DateTime, Duration as Span, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const TICK: Duration = Duration::from_secs(5 * 60);
const FIRST_TICK: Duration = Duration::from_secs(60);
const WARNINGS_KEY: &str = "agents.accounts.resetWarnings.v1";
const CLAUDE_SETTING: &str = "claudeAutoRedeemExpiringResets";
const CODEX_SETTING: &str = "codexAutoRedeemExpiringResets";
const CLAUDE_AT_LIMIT_SETTING: &str = "claudeAutoRedeemResetsAtLimit";
const CODEX_AT_LIMIT_SETTING: &str = "codexAutoRedeemResetsAtLimit";
/// How long before a banked reset expires Auto-redeem uses it. The Settings and Help copy name this number.
pub(crate) const LAST_CALL_MINUTES: i64 = 60;
/// An automatic claim of one reset is tried at most this often, whatever it answered.
const RETRY_AFTER: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Threshold {
    ThreeDays,
    OneDay,
}

impl Threshold {
    fn id(self) -> &'static str {
        match self {
            Self::ThreeDays => "3d",
            Self::OneDay => "24h",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RedeemReason {
    AtLimit,
    LastHour,
}

impl RedeemReason {
    fn id(self) -> &'static str {
        match self {
            Self::AtLimit => "atLimit",
            Self::LastHour => "lastHour",
        }
    }
}

/// What the watcher makes of one account's soonest-expiring reset.
#[derive(Debug, PartialEq)]
pub(crate) struct Decision {
    pub credit_id: String,
    pub expires_at: DateTime<Utc>,
    /// Resets sharing this id and expiry (a Claude grant with several left).
    pub count: usize,
    pub requires_limit: bool,
    pub warning: Option<Threshold>,
    pub redeem: Option<RedeemReason>,
    /// Why a reset in its last 24 hours is not redeemed now.
    pub wait: Option<&'static str>,
}

/// CDXC:AgentProviders 2026-10-06 DECISION:
/// User: "implement a setting for Claude and Codex to auto redeem banked resets if they're going to expire anyways" (2026-10-05), then on the switch's text: "add 'automatically' and we need to say how many minute it's used before expiry. also no need to use it automatically in case expired with 24 hours remaining except if user enables that toggle". This supersedes the 2026-10-05 rule that also spent a reset at any usage limit in its last 24 hours by default.
/// Looking only at the soonest-expiring reset that can be claimed (Anthropic serves Claude grants in order; paused grants cannot be claimed):
/// 1. Auto-redeem expiring resets: in the reset's last 60 minutes (`LAST_CALL_MINUTES`, the number the Settings and Help copy name), use it if the account has used anything, since it is lost then anyway. A Claude grant that only works at a limit is used then only at a limit; Anthropic refuses it otherwise.
/// 2. Only with its own switch (`at_limit`, off by default): at a usage limit in the reset's last 24 hours, use it at once, since at a limit a reset gives back the whole window. It waits while the limit resets on its own within 30 minutes (that costs a short wait, not the reset).
/// Readings older than 10 minutes, or with a usage error, never trigger a redeem.
pub(crate) fn decide(
    account: &DiscoveredAccount,
    now: DateTime<Utc>,
    at_limit: bool,
) -> Option<Decision> {
    let credits = account.reset_credit_details.as_ref()?;
    let (first, expires_at) = credits.iter().filter(|c| !c.paused).find_map(|credit| {
        let expires = credit
            .expires_at
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())?
            .with_timezone(&Utc);
        (expires > now).then_some((credit, expires))
    })?;
    let count = credits
        .iter()
        .filter(|c| c.id == first.id && c.expires_at == first.expires_at)
        .count();
    let remaining = expires_at - now;
    let warning = if remaining <= Span::hours(24) {
        Some(Threshold::OneDay)
    } else if remaining <= Span::days(3) {
        Some(Threshold::ThreeDays)
    } else {
        None
    };
    let fresh = account.status == "ready"
        && account.usage_error.is_none()
        && !account.usage.is_empty()
        && account
            .usage_updated_at
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .is_some_and(|t| now - t.with_timezone(&Utc) < Span::minutes(10));
    let limits: Vec<_> = account.usage.iter().filter(|w| w.id != "spend").collect();
    let limited: Vec<_> = limits.iter().filter(|w| w.used_percent >= 100.).collect();
    let mut redeem = None;
    let mut wait = None;
    if at_limit && fresh && remaining <= Span::hours(24) && !limited.is_empty() {
        // The moment the account could work again without the reset: the last of its full windows to reset.
        let natural = limited
            .iter()
            .map(|w| {
                w.resets_at
                    .as_deref()
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                    .map(|t| t.with_timezone(&Utc))
            })
            .collect::<Option<Vec<_>>>()
            .and_then(|times| times.into_iter().max());
        if natural.is_some_and(|t| t <= now + Span::minutes(30) && t < expires_at) {
            wait = Some("The limit resets on its own within 30 minutes.");
        } else {
            redeem = Some(RedeemReason::AtLimit);
        }
    } else if fresh && remaining <= Span::minutes(LAST_CALL_MINUTES) {
        if first.requires_limit && limited.is_empty() {
            wait = Some("This reset only works at a usage limit.");
        } else if limits.iter().any(|w| w.used_percent >= 1.) {
            redeem = Some(RedeemReason::LastHour);
        } else {
            wait = Some("Nothing has been used, so the reset would give nothing back.");
        }
    }
    Some(Decision {
        credit_id: first.id.clone(),
        expires_at,
        count,
        requires_limit: first.requires_limit,
        warning,
        redeem,
        wait,
    })
}

/// One warning already shown, kept so a restart never shows it twice and so it can be marked read once its reset is gone.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShownWarning {
    account_id: String,
    credit_id: String,
    expires_at: String,
    threshold: String,
    #[serde(default)]
    notification_id: Option<String>,
}

fn read_shown(db: &Connection) -> Vec<ShownWarning> {
    db.query_row(
        "SELECT value FROM metadata WHERE key=?1",
        [WARNINGS_KEY],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

fn write_shown(db: &Connection, shown: &[ShownWarning]) -> Result<(), DomainStateError> {
    db.execute(
        "INSERT INTO metadata (key,value,updatedAt) VALUES (?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt",
        rusqlite::params![
            WARNINGS_KEY,
            serde_json::to_string(shown).map_err(store::error)?,
            Utc::now().to_rfc3339()
        ],
    )
    .map_err(store::error)?;
    Ok(())
}

/// The last automatic claim of each reset, so a refused or failed claim is retried at most every 30 minutes and its failure is shown once.
static ATTEMPTS: Mutex<Option<HashMap<String, Instant>>> = Mutex::new(None);

/// A test reset for the dry-run endpoint: replaces the account's resets with one expiring after `expiresInMinutes`, and optionally its usage, so warnings and the redeem decision can be checked without touching a real reset.
struct Simulation {
    account_id: String,
    expires_in_minutes: i64,
    used_percent: Option<f64>,
    requires_limit: bool,
}

fn simulate(account: &mut DiscoveredAccount, simulation: &Simulation, now: DateTime<Utc>) {
    account.reset_credit_details = Some(vec![ResetCredit {
        id: "simulated".into(),
        expires_at: Some((now + Span::minutes(simulation.expires_in_minutes)).to_rfc3339()),
        note: None,
        paused: false,
        requires_limit: simulation.requires_limit,
    }]);
    account.reset_credits = Some(1);
    if let Some(used) = simulation.used_percent {
        for window in &mut account.usage {
            window.used_percent = used;
        }
        account.usage_updated_at = Some(now.to_rfc3339());
        account.usage_error = None;
    }
}

pub(crate) fn start(state: Arc<AppState>) {
    let mut shutdown = state.shutdown_tx.subscribe();
    tokio::spawn(async move {
        let mut delay = FIRST_TICK;
        loop {
            tokio::select! {
                _ = shutdown.recv() => break,
                _ = tokio::time::sleep(delay) => {}
            }
            delay = TICK;
            let pass_state = state.clone();
            match tokio::task::spawn_blocking(move || pass(&pass_state, None, false, false)).await {
                // The next look also lands right after the soonest reset reaches its last 60 minutes, so Auto-redeem uses it then rather than up to one check later.
                Ok(Ok(report)) => {
                    if let Some(seconds) = report["nextLastCallInSeconds"].as_i64() {
                        delay = delay.min(Duration::from_secs(seconds.max(0) as u64 + 2));
                    }
                }
                Ok(Err(error)) => log(
                    &state,
                    LogLevel::Warn,
                    "accountResetWatchFailed",
                    Some(error.message),
                    json!({}),
                ),
                Err(join) => log(
                    &state,
                    LogLevel::Error,
                    "accountResetWatchPanicked",
                    Some(join.to_string()),
                    json!({}),
                ),
            }
        }
    });
}

/// `/api/agentAccounts` `resetWatch`: what the watcher would do for every saved account right now. It never redeems. `simulate` (`accountId`, `expiresInMinutes`, optional `usedPercent` and `requiresLimit`) swaps in a test reset; with `notify: true` its warning goes to the bell, marked as a test, so the red row and the system notification can be checked.
pub(crate) fn endpoint(
    state: &AppState,
    params: &Map<String, Value>,
) -> Result<Value, DomainStateError> {
    let simulation = match params.get("simulate") {
        None | Some(Value::Null) => None,
        Some(value) => Some(Simulation {
            account_id: value["accountId"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or_else(|| DomainStateError::bad_request("simulate.accountId is required."))?
                .to_string(),
            expires_in_minutes: value["expiresInMinutes"]
                .as_i64()
                .filter(|m| (1..=60 * 24 * 30).contains(m))
                .ok_or_else(|| {
                    DomainStateError::bad_request(
                        "simulate.expiresInMinutes must be between 1 and 43200.",
                    )
                })?,
            used_percent: value["usedPercent"].as_f64().map(|p| p.clamp(0., 100.)),
            requires_limit: value["requiresLimit"].as_bool() == Some(true),
        }),
    };
    let notify = params.get("notify").and_then(Value::as_bool) == Some(true);
    if notify && simulation.is_none() {
        return Err(DomainStateError::bad_request(
            "notify needs simulate: real warnings come from the watcher itself.",
        ));
    }
    pass(state, simulation.as_ref(), true, notify)
}

/// One look at every saved account. `dry_run` never redeems and records nothing; `notify_simulation` lets a dry run still post the simulated account's warning.
fn pass(
    state: &AppState,
    simulation: Option<&Simulation>,
    dry_run: bool,
    notify_simulation: bool,
) -> Result<Value, DomainStateError> {
    let registry = {
        let _gate = state.accounts.mutations.lock().map_err(store::error)?;
        let db = crate::storage::open_gxserver_database(&state.paths).map_err(store::error)?;
        store::read(&db)?
    };
    if registry.accounts.is_empty() {
        return Ok(json!({ "accounts": [] }));
    }
    let settings = crate::session_lifecycle::read_sidebar_settings(&state.paths);
    let enabled = |key: &str| {
        settings
            .as_ref()
            .and_then(|s| s.get(key))
            .and_then(Value::as_bool)
            == Some(true)
    };
    let auto = |provider: Provider| match provider {
        Provider::Claude => enabled(CLAUDE_SETTING),
        Provider::Codex => enabled(CODEX_SETTING),
    };
    let at_limit = |provider: Provider| match provider {
        Provider::Claude => enabled(CLAUDE_AT_LIMIT_SETTING),
        Provider::Codex => enabled(CODEX_AT_LIMIT_SETTING),
    };
    let snapshot = state.accounts.refresh(&state.paths.home_dir, false);
    let now = Utc::now();
    let db = crate::storage::open_gxserver_database(&state.paths).map_err(store::error)?;
    let mut shown = read_shown(&db);
    let shown_before = shown.len();
    shown.retain(|w| {
        DateTime::parse_from_rfc3339(&w.expires_at)
            .is_ok_and(|t| t.with_timezone(&Utc) > now - Span::days(1))
    });
    let mut changed_shown = shown.len() != shown_before;
    let mut feed_changed = false;
    let mut report = Vec::new();
    let mut next_last_call: Option<Span> = None;
    for saved in &registry.accounts {
        let Some(found) = snapshot
            .accounts
            .iter()
            .find(|a| a.provider == saved.provider && account_id(a) == saved.id)
        else {
            continue;
        };
        let simulated = simulation.filter(|s| s.account_id == saved.id);
        let mut account = found.clone();
        if let Some(simulation) = simulated {
            simulate(&mut account, simulation, now);
        }
        let auto_redeem = auto(saved.provider);
        let auto_at_limit = at_limit(saved.provider);
        // A warning whose reset is gone (used, or no longer offered) stops asking for attention.
        if simulated.is_none() && !dry_run {
            if let Some(credits) = &account.reset_credit_details {
                let mut gone = Vec::new();
                shown.retain(|w| {
                    let keep = w.account_id != saved.id
                        || credits.iter().any(|c| {
                            c.id == w.credit_id
                                && c.expires_at
                                    .as_deref()
                                    .is_some_and(|e| same_time(e, &w.expires_at))
                        });
                    if !keep {
                        gone.extend(w.notification_id.clone());
                    }
                    keep
                });
                if !gone.is_empty() {
                    changed_shown = true;
                    for id in gone {
                        feed_changed |= mark_notification_read(&db, &id)? > 0;
                    }
                }
            }
        }
        let Some(decision) = decide(&account, now, auto_at_limit) else {
            continue;
        };
        let until_last_call = decision.expires_at - Span::minutes(LAST_CALL_MINUTES) - now;
        if auto_redeem && simulated.is_none() && until_last_call > Span::zero() {
            next_last_call =
                Some(next_last_call.map_or(until_last_call, |n| n.min(until_last_call)));
        }
        let expires = decision.expires_at.to_rfc3339();
        let mut warned = None;
        if let Some(threshold) = decision.warning {
            let already = |t: Threshold, shown: &[ShownWarning]| {
                shown.iter().any(|w| {
                    w.account_id == saved.id
                        && w.credit_id == decision.credit_id
                        && same_time(&w.expires_at, &expires)
                        && w.threshold == t.id()
                })
            };
            let post = if simulated.is_some() {
                notify_simulation
            } else {
                !dry_run && !already(threshold, &shown)
            };
            if post {
                let id = post_warning(
                    &db,
                    saved,
                    &decision,
                    auto_redeem.then_some(auto_at_limit),
                    simulated.is_some(),
                    now,
                )?;
                feed_changed = true;
                warned = Some(threshold.id());
                if simulated.is_none() {
                    // The 24-hour warning also stands for the 3-day one, so a reset first seen inside 24 hours warns once.
                    for t in [Threshold::ThreeDays, Threshold::OneDay] {
                        if !already(t, &shown) && (t == threshold || threshold == Threshold::OneDay)
                        {
                            shown.push(ShownWarning {
                                account_id: saved.id.clone(),
                                credit_id: decision.credit_id.clone(),
                                expires_at: expires.clone(),
                                threshold: t.id().into(),
                                notification_id: Some(id.clone()),
                            });
                        }
                    }
                    changed_shown = true;
                }
            }
        }
        let mut action = match (decision.redeem, auto_redeem) {
            (Some(_), true) => "wouldRedeem",
            (Some(_), false) => "autoRedeemOff",
            (None, _) => "none",
        };
        let mut outcome = Value::Null;
        if let (Some(reason), true, false, None) =
            (decision.redeem, auto_redeem, dry_run, simulated)
        {
            if let Some((kind, message)) = auto_redeem_now(state, saved, &decision, reason) {
                action = if kind == "success" {
                    "redeemed"
                } else {
                    "attempted"
                };
                outcome = json!({ "outcome": kind, "message": message });
                feed_changed |= notify_redeem(&db, saved, &decision, reason, kind, &message)?;
            } else {
                action = "retryLater";
            }
        }
        report.push(json!({
            "accountId": saved.id,
            "provider": saved.provider,
            "name": saved.name,
            "simulated": simulated.is_some(),
            "creditId": decision.credit_id,
            "count": decision.count,
            "expiresAt": expires,
            "minutesLeft": (decision.expires_at - now).num_minutes(),
            "warning": decision.warning.map(Threshold::id),
            "warningPosted": warned,
            "redeem": decision.redeem.map(RedeemReason::id),
            "wait": decision.wait,
            "autoRedeem": auto_redeem,
            "autoRedeemAtLimit": auto_at_limit,
            "action": action,
            "result": outcome,
        }));
    }
    if changed_shown && !dry_run {
        write_shown(&db, &shown)?;
    }
    if feed_changed {
        broadcast_notification_feed_changed(state);
    }
    Ok(json!({
        "accounts": report,
        "dryRun": dry_run,
        "nextLastCallInSeconds": next_last_call.map(|span| span.num_seconds()),
    }))
}

fn same_time(a: &str, b: &str) -> bool {
    match (
        DateTime::parse_from_rfc3339(a),
        DateTime::parse_from_rfc3339(b),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// Claims the reset unless this one was tried within the last 30 minutes. Returns the outcome kind and message of a claim that ran.
fn auto_redeem_now(
    state: &AppState,
    saved: &SavedAccount,
    decision: &Decision,
    reason: RedeemReason,
) -> Option<(&'static str, String)> {
    let key = format!(
        "{}|{}|{}|{}",
        saved.id,
        decision.credit_id,
        decision.expires_at.to_rfc3339(),
        decision.count
    );
    {
        let mut attempts = ATTEMPTS.lock().unwrap_or_else(|e| e.into_inner());
        let attempts = attempts.get_or_insert_with(HashMap::new);
        attempts.retain(|_, at| at.elapsed() < RETRY_AFTER);
        if attempts.contains_key(&key) {
            return None;
        }
        attempts.insert(key.clone(), Instant::now());
    }
    // A stable key per reset (and per remaining count of a Claude grant) makes a retried claim replay instead of spending a second reset.
    let request_id = format!(
        "auto-{}",
        &format!("{:x}", Sha256::digest(key.as_bytes()))[..32]
    );
    let (kind, message) =
        match reset_claim::claim_for_account(state, saved, &decision.credit_id, &request_id) {
            Ok(outcome) => (outcome.kind(), outcome.message().to_string()),
            Err(error) => ("failed", error.message),
        };
    log(
        state,
        if kind == "failed" {
            LogLevel::Warn
        } else {
            LogLevel::Info
        },
        "accountResetAutoRedeem",
        (kind == "failed").then(|| message.clone()),
        json!({
            "accountId": saved.id,
            "provider": saved.provider,
            "reason": reason.id(),
            "outcome": kind,
            "expiresAt": decision.expires_at.to_rfc3339(),
        }),
    );
    Some((kind, message))
}

fn provider_name(provider: Provider) -> &'static str {
    match provider {
        Provider::Claude => "Claude",
        Provider::Codex => "Codex",
    }
}

fn local_time(at: DateTime<Utc>) -> String {
    at.with_timezone(&chrono::Local)
        .format("%a %b %-d at %H:%M")
        .to_string()
}

fn time_left(span: Span) -> String {
    let unit = |n: i64, word: &str| format!("{n} {word}{}", if n == 1 { "" } else { "s" });
    if span < Span::hours(1) {
        unit(span.num_minutes().max(1), "minute")
    } else if span < Span::hours(48) {
        unit(span.num_hours(), "hour")
    } else {
        unit(span.num_days(), "day")
    }
}

fn post_warning(
    db: &Connection,
    saved: &SavedAccount,
    decision: &Decision,
    // `Some(at_limit)` while Auto-redeem is on for this provider.
    auto_redeem: Option<bool>,
    simulated: bool,
    now: DateTime<Utc>,
) -> Result<String, DomainStateError> {
    let provider = provider_name(saved.provider);
    let resets = if decision.count == 1 {
        "A banked reset".to_string()
    } else {
        format!("{} banked resets", decision.count)
    };
    let plan = if auto_redeem == Some(true) {
        format!("Auto-redeem uses it when you hit a usage limit, or {LAST_CALL_MINUTES} minutes before it expires.")
    } else if auto_redeem == Some(false) {
        format!("Auto-redeem uses it {LAST_CALL_MINUTES} minutes before it expires.")
    } else if decision.requires_limit {
        "It only works at a usage limit. Open usage to use it.".to_string()
    } else {
        "Open usage to use it before then.".to_string()
    };
    let item = insert_notification_feed_row(
        db,
        NewNotificationFeedRow {
            project_id: ACCOUNT_NOTIFICATION_PROJECT_ID.into(),
            session_id: account_notification_session_id(&saved.id),
            kind: NOTIFICATION_FEED_KIND_RESET_EXPIRING,
            title: format!(
                "{}{provider} reset expires in {}",
                if simulated { "Test: " } else { "" },
                time_left(decision.expires_at - now)
            ),
            subtitle: format!("{provider} · {}", saved.name),
            body: format!(
                "{resets} expires {}. {plan}",
                local_time(decision.expires_at)
            ),
            agent_name: Some(saved.provider.id().into()),
            attention_event_id: None,
        },
    )?;
    Ok(item["id"].as_str().unwrap_or_default().to_string())
}

/// Tells the user what an automatic claim did. A claim that spent nothing and was only refused stays in the log; a failure is shown once per reset (the retry guard keeps it from repeating).
fn notify_redeem(
    db: &Connection,
    saved: &SavedAccount,
    decision: &Decision,
    reason: RedeemReason,
    kind: &str,
    message: &str,
) -> Result<bool, DomainStateError> {
    let provider = provider_name(saved.provider);
    let (feed_kind, title, body) = match kind {
        "success" => (
            NOTIFICATION_FEED_KIND_RESET_REDEEMED,
            format!("Used an expiring {provider} reset"),
            match reason {
                RedeemReason::AtLimit => format!(
                    "You were at a usage limit and the reset expired {}. Your limits are fresh again.",
                    local_time(decision.expires_at)
                ),
                RedeemReason::LastHour => format!(
                    "It would have expired unused {}. Your limits are fresh again.",
                    local_time(decision.expires_at)
                ),
            },
        ),
        "failed" => (
            NOTIFICATION_FEED_KIND_RESET_EXPIRING,
            format!("Couldn't use an expiring {provider} reset"),
            format!(
                "{message} It expires {}.",
                local_time(decision.expires_at)
            ),
        ),
        _ => return Ok(false),
    };
    insert_notification_feed_row(
        db,
        NewNotificationFeedRow {
            project_id: ACCOUNT_NOTIFICATION_PROJECT_ID.into(),
            session_id: account_notification_session_id(&saved.id),
            kind: feed_kind,
            title,
            subtitle: format!("{provider} · {}", saved.name),
            body,
            agent_name: Some(saved.provider.id().into()),
            attention_event_id: None,
        },
    )?;
    Ok(true)
}

fn log(state: &AppState, level: LogLevel, event: &str, error: Option<String>, details: Value) {
    let _ = state.logger.log(GxserverLogInput {
        level,
        event: event.to_string(),
        server_id: Some(state.metadata.server_id.clone()),
        request_id: None,
        client: None,
        duration_ms: None,
        error,
        details: Some(details),
    });
}

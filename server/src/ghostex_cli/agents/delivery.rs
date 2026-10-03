use super::{
    arguments::{Arguments, Delivery},
    identity::{self, text},
};
use crate::ghostex_cli::{
    args::Flags,
    rpc::{call_gxserver_rpc, CliError, CliResult},
    selector,
};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

/// CDXC:Cli 2026-09-26 DECISION:
/// User: messages between agents "shouldn't be added to the queue and stuck there, they should be just sent as normal, except if the agent intentionally queues". A default or interrupt send to a sleeping recipient goes to `/api/sendSessionChatMessage` like Enter in chat, which wakes the session and types the message once its agent is ready (SessionChat 2026-09-25 decision); only `--queue` holds a message for the recipient's next stop.
/// WHY: the old refusal for a sleeping recipient told the sender to use `--queue`, and agents kept reaching for `--queue` afterwards, even for running recipients, so their messages waited behind whole turns.
pub(super) fn send(args: &Arguments) -> CliResult<Value> {
    let body = match &args.body_file {
        Some(path) => std::fs::read_to_string(path).map_err(|error| {
            CliError::Other(format!("Could not read message file {path}: {error}"))
        })?,
        None => args.positional[1].clone(),
    };
    if body.trim().is_empty() {
        return Err(CliError::Other("Message body must not be empty.".into()));
    }
    let sender = identity::caller()?;
    let message = identity::message(&sender, &body);
    if message.len() > crate::zmx::GXSERVER_ZMX_SEND_TEXT_LIMIT_BYTES {
        return Err(CliError::Other(format!(
            "Message including sender header exceeds the {}-byte send limit.",
            crate::zmx::GXSERVER_ZMX_SEND_TEXT_LIMIT_BYTES
        )));
    }
    let reference = &args.positional[0];
    let flags = identity::inventory_flags(&args.flags, reference)?;
    let recipient = selector::resolve_live_or_closed_session(reference, &flags)?;
    if !identity::is_agent(&recipient) {
        return Err(CliError::Other(
            "The recipient is not an agent session. Run ghostex agents list --all.".into(),
        ));
    }
    // A sleeping or closed recipient has nothing to interrupt; the send itself wakes it and
    // resumes its conversation.
    let waking =
        args.delivery != Delivery::Queue && text(&recipient, "lifecycleState") != "running";
    let mut payload = json!({"globalRef": recipient["globalRef"], "projectId": recipient["projectId"], "sessionId": recipient["sessionId"]});
    let interrupted = args.delivery == Delivery::Interrupt && !waking;
    if interrupted {
        call_gxserver_rpc("/api/interruptSessionChat", &payload, &flags)?;
    }
    let read_payload = payload.clone();
    let sent_at_ms = chrono::Utc::now().timestamp_millis();
    payload["text"] = json!(message);
    let endpoint = if args.delivery == Delivery::Queue {
        "/api/queueSessionChatPrompt"
    } else {
        "/api/sendSessionChatMessage"
    };
    let result = call_gxserver_rpc(endpoint, &payload, &flags).map_err(|error| {
        let next_step = if waking {
            format!("The recipient was asleep: run ghostex wake {} and send again once it is running, after inspecting its chat.", text(&recipient, "globalRef"))
        } else {
            "Inspect chat and queue before retrying.".to_string()
        };
        CliError::Other(format!(
            "{}{} {}",
            if interrupted {
                "Interruption was requested, but message delivery failed or is uncertain: "
            } else {
                "Message delivery failed or is uncertain: "
            },
            error,
            next_step
        ))
    })?;
    // CDXC:Coordinators 2026-09-30 WHY: a coordinator's follow-up to a thread it already marked done reopens that thread, or its reply would go unsupervised and never be reported back.
    let _ = call_gxserver_rpc(
        "/api/linkCoordinatorThread",
        &json!({
            "coordinatorProjectId": sender["projectId"], "coordinatorSessionId": sender["sessionId"],
            "projectId": recipient["projectId"], "sessionId": recipient["sessionId"],
            "onlyIfCoordinator": true, "reopenOnly": true,
        }),
        &flags,
    );
    let receipt = receipt(&result);
    let (status, note) = if args.delivery == Delivery::Queue {
        (
            "queued",
            "Held in the recipient's queue until its current turn finishes and its input is ready.",
        )
    } else if transcript_shows(&read_payload, &body, sent_at_ms, &flags) {
        ("delivered", "The recipient's transcript shows the message.")
    } else if !receipt["queuedPromptId"].is_null() {
        ("pending", "The recipient is still starting; Ghostex types the message as soon as its input box appears. Read its chat before sending it again.")
    } else {
        ("accepted", "Ghostex typed and submitted the message, but the recipient's transcript does not show it yet; a busy agent takes it at its next input boundary. Read its chat before sending it again.")
    };
    Ok(json!({
        "ok": true,
        "status": status,
        "note": note,
        "mode": match args.delivery { Delivery::Normal => "normal", Delivery::Interrupt => "interrupt", Delivery::Queue => "queue" },
        "interruptRequested": interrupted,
        "wakingRecipient": waking,
        "sender": identity::summary(&sender),
        "recipient": identity::summary(&recipient),
        "receipt": receipt,
    }))
}

/// How long a default send waits for the recipient's transcript to record the message.
const DELIVERY_CONFIRM_WINDOW: Duration = Duration::from_secs(10);
const DELIVERY_CONFIRM_POLL: Duration = Duration::from_millis(500);
/// Normalized characters of the body a transcript row must contain.
const DELIVERY_MATCH_CHARS: usize = 80;
/// Transcript timestamps come from the recipient's machine, whose clock can differ from ours.
const DELIVERY_CLOCK_SLACK_MS: i64 = 60_000;

/// CDXC:Cli 2026-10-04 WHY:
/// "accepted" only ever meant that gxserver took the request: a message Claude Code left in its input box (a form feed in the text) came back "accepted", and the coordinator moved on while the recipient never saw it. A default send now reads the recipient's transcript for up to ten seconds and answers "delivered" only when the message is there; gxserver refuses a send whose Return the agent did not take (session_chat_send_submit.rs), so "accepted" is left for an agent that has not recorded it yet, typically a busy one.
fn transcript_shows(session: &Value, body: &str, sent_at_ms: i64, flags: &Flags) -> bool {
    let needle: String = normalize(body).chars().take(DELIVERY_MATCH_CHARS).collect();
    if needle.is_empty() {
        return false;
    }
    let mut params = session.clone();
    params["limit"] = json!(8);
    let started = Instant::now();
    loop {
        std::thread::sleep(DELIVERY_CONFIRM_POLL);
        let shown = call_gxserver_rpc("/api/readSessionChat", &params, flags)
            .ok()
            .and_then(|chat| chat.get("messages").and_then(Value::as_array).cloned())
            .is_some_and(|messages| messages.iter().any(|row| records(row, &needle, sent_at_ms)));
        if shown || started.elapsed() >= DELIVERY_CONFIRM_WINDOW {
            return shown;
        }
    }
}

fn records(row: &Value, needle: &str, sent_at_ms: i64) -> bool {
    text(row, "role") == "user"
        && text(row, "source") == "transcript"
        && row["timestamp"].as_i64().map_or(true, |timestamp| {
            timestamp >= sent_at_ms - DELIVERY_CLOCK_SLACK_MS
        })
        && row["blocks"].as_array().is_some_and(|blocks| {
            blocks
                .iter()
                .filter_map(|block| block["text"].as_str())
                .map(normalize)
                .collect::<String>()
                .contains(needle)
        })
}

/// Text minus whatever the trip to the transcript can change: whitespace, control characters,
/// and the Control Pictures signs gxserver writes in their place.
fn normalize(text: &str) -> String {
    text.chars()
        .filter(|character| {
            !character.is_whitespace()
                && !character.is_control()
                && !matches!(character, '\u{2400}'..='\u{243f}')
        })
        .collect()
}

pub(super) fn receipt(result: &Value) -> Value {
    json!({
        "requestId": result["requestId"],
        "queuedPromptId": result.get("queuedPromptId").or_else(|| result.pointer("/prompt/id")),
    })
}

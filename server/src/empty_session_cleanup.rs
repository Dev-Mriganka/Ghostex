//! New-session cleanup: when the user starts a new agent session in a project, that project's
//! other sessions that are still fully empty are closed. This file holds the marker, the "fully
//! empty" rule and the candidate list; `server/empty_session_cleanup_runtime.rs` reads each
//! candidate's input box and closes it.
//!
//! CDXC:Sessions 2026-10-04 DECISION:
//! User: "when i press the button to create a new session and we already have an empty session then please close the previous session if it doesn't have a pending draft and doesn't have anything queued and doesn't have any text in it basically. I don't want doing cmd + shift + o multiple times to keep multiple fully empty sessions in the sidebar for that project. It's easier to just open a new one and close the older unneeded ones automatically." A client sends `replaceEmptySessions: true` on `/api/createAgentSession` only for that user action (the new-session hotkey, a project's agent button or menu, the New Thread picker, the phone's new session); the close is the ordinary `/api/transitionSession` close, quiet, with one log line.
//!
//! CDXC:Sessions 2026-10-04 WHY:
//! Only a session made by that same user action carries the marker, so a session an agent, the CLI, a coordinator, the board or an automation started (it may be waiting for its task) is never a candidate. "Fully empty" means never prompted (still a draft), no chat draft text (parked ones included), nothing queued or armed, no note or stash, not pinned, parked, favorited, tagged, renamed or armed for Close After Done, idle, in the same folder, and an agent input box that reads as empty; a box that cannot be read counts as holding text. This supersedes "a draft is never thrown away on its own" (CDXC:Drafts 2026-08-29 in agents/drafts.rs) for exactly these sessions.
//!
//! SEE-ALSO: server/src/server/empty_session_cleanup_runtime.rs, apps/desktop/src/app/gx_store/create/agent.rs, apps/desktop/src/app/helpers/agents_hub/workspace_agent_actions.rs, server/src/ghostex_cli/actions/create.rs (`--replace-empty-sessions`, the phone's new session).

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};

use crate::agents::session_is_draft;
use crate::domain::{DomainRepository, DomainStateError};

/// The `/api/createAgentSession` parameter a client sends for the user's new-session action.
pub(crate) const REPLACE_EMPTY_SESSIONS_PARAM: &str = "replaceEmptySessions";
/// Server-owned: written at creation only when the create carried the parameter above.
const NEW_SESSION_MARKER_KEY: &str = "userNewSession";

pub(crate) fn requests_empty_session_cleanup(params: &Map<String, Value>) -> bool {
    params
        .get(REPLACE_EMPTY_SESSIONS_PARAM)
        .and_then(Value::as_bool)
        == Some(true)
}

/// Arms the marker beside the draft marker; a client cannot set it through `runtimeSettings`.
pub(crate) fn apply_new_session_marker(
    params: &Map<String, Value>,
    runtime_settings: &mut Map<String, Value>,
) {
    if requests_empty_session_cleanup(params) {
        runtime_settings.insert(NEW_SESSION_MARKER_KEY.to_string(), json!(true));
    } else {
        runtime_settings.remove(NEW_SESSION_MARKER_KEY);
    }
}

/// A session the rule may close once its agent's input box reads as empty.
#[derive(Clone, Debug)]
pub(crate) struct EmptySessionCandidate {
    pub session_id: String,
    pub zmx_name: String,
    pub agent_id: String,
}

/// The new session's project siblings that are empty as far as gxserver's own state can tell.
pub(crate) fn empty_session_candidates(
    db: &Connection,
    repository: &DomainRepository<'_>,
    project_id: &str,
    new_session_id: &str,
) -> Result<Vec<EmptySessionCandidate>, DomainStateError> {
    let Some(new_session) = repository.get_session(project_id, new_session_id)? else {
        return Ok(Vec::new());
    };
    let folder = new_session.get("cwd").cloned();
    let mut candidates = Vec::new();
    for session in repository.list_sessions_excluding_stopped(Some(project_id))? {
        let Some(session_id) = session.get("sessionId").and_then(Value::as_str) else {
            continue;
        };
        if session_id == new_session_id
            || session.get("cwd").cloned() != folder
            || !row_is_empty(&session)
        {
            continue;
        }
        let presentation = crate::presentation::build_presentation_session_delta(
            db, repository, project_id, session_id,
        )?;
        if !presentation
            .get("session")
            .is_some_and(presentation_is_empty)
            || holds_chat_text(db, project_id, session_id)
            || crate::session_chat_queue::session_has_pending_session_chat_queue(
                db, project_id, session_id,
            )
        {
            continue;
        }
        let (Ok(zmx_name), Some(agent_id)) = (
            crate::zmx::provider_zmx_session_name(&session),
            crate::session_chat_composer::session_chat_composer_agent_id(&session),
        ) else {
            continue;
        };
        candidates.push(EmptySessionCandidate {
            session_id: session_id.to_string(),
            zmx_name,
            agent_id,
        });
    }
    Ok(candidates)
}

/// The durable row: made by the new-session action, never prompted, untagged and never renamed.
fn row_is_empty(session: &Value) -> bool {
    let runtime_settings = session.get("runtimeSettings").and_then(Value::as_object);
    let setting = |key: &str| runtime_settings.and_then(|settings| settings.get(key));
    setting(NEW_SESSION_MARKER_KEY).and_then(Value::as_bool) == Some(true)
        && session_is_draft(session)
        && session.get("kind").and_then(Value::as_str) == Some("agent")
        && !crate::presentation::session_tag_is_truthy(session)
        && setting("pendingAgentTitleRequestStatus").is_none()
        && !matches!(
            setting("titleSource").and_then(Value::as_str),
            Some("user" | "generated")
        )
}

/// The sidebar row, with every overlay a client would show (draft dot, queue, delayed send, note,
/// stash, coordinator, Close After Done).
fn presentation_is_empty(session: &Value) -> bool {
    let flag = |key: &str| session.get(key).and_then(Value::as_bool) == Some(true);
    let count = |key: &str| session.get(key).and_then(Value::as_u64).unwrap_or(0);
    session.get("lifecycleState").and_then(Value::as_str) == Some("running")
        && session.get("activity").and_then(Value::as_str) == Some("idle")
        && ![
            "isPinned",
            "isParked",
            "isFavorite",
            "hasComposerDraft",
            "closeAfterDone",
        ]
        .into_iter()
        .any(flag)
        && [
            "queuedPromptCount",
            "queuedPromptFailedCount",
            "stashedPromptCount",
            "pendingQuestionCount",
        ]
        .into_iter()
        .all(|key| count(key) == 0)
        && [
            "coordinatorRole",
            "delayedSendDeadlineAt",
            "sendWhenAllProjectSessionsStopActive",
            "sendWhenAgentStopsActive",
            "sendWhenSpecificAgentFinishes",
            "sessionNote",
        ]
        .into_iter()
        .all(|key| session.get(key).is_none_or(Value::is_null))
}

/// Any synced chat draft with text, parked recovery text included; a failed read counts as text.
fn holds_chat_text(db: &Connection, project_id: &str, session_id: &str) -> bool {
    db.query_row(
        "SELECT 1 FROM session_chat_drafts WHERE projectId = ?1 AND sessionId = ?2 AND TRIM(content) <> '' LIMIT 1",
        params![project_id, session_id],
        |_| Ok(()),
    )
    .optional()
    .map_or(true, |row| row.is_some())
}

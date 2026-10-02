//! A coordinator's name: the one the user gave it in the New Coordinator dialog (or `ghostex
//! coordinator create --title`) stays, whatever the agent later calls the conversation.

use rusqlite::Connection;
use serde_json::Value;

use super::records::read_coordinator;

/// True when an agent-chosen title (its terminal title, or its own session metadata such as a
/// Codex thread name) must not replace this session's title.
///
/// CDXC:Coordinators 2026-10-03 DECISION:
/// User: "we should keep the name i assigned for the coordinator at the start. no auto renaming for coordinators." Claude's terminal title and Codex's thread name are adopted for every other session, so a coordinator was renamed from its first message. A coordinator therefore ignores the agent's naming; a rename the user asks for (the sidebar's Rename, which types `/rename` and waits for the agent's metadata to confirm it) still applies, and its threads keep naming themselves. A coordinator created without a name is saved as a placeholder "Coordinator", so the agent's first name replaces it once and is then kept like a typed one.
pub fn coordinator_keeps_its_title(db: &Connection, session: &Value) -> bool {
    let title_source = session
        .pointer("/runtimeSettings/titleSource")
        .and_then(Value::as_str);
    if title_source == Some("placeholder") {
        return false;
    }
    let text = |key: &str| session.get(key).and_then(Value::as_str).unwrap_or_default();
    read_coordinator(db, text("projectId"), text("sessionId"))
        .ok()
        .flatten()
        .is_some()
}

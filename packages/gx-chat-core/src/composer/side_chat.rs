//! Side chat: messages sent to Claude as `/btw` side questions.
//!
//! CDXC:SessionChat 2026-09-27 DECISION:
//! User: a "Side chat" button in the chat composer's More actions for Claude puts a "Side Chat" pill in the chat box; what is sent while it is there reaches the agent CLI with `/btw` at its start, and the user can delete the pill. The pill is the `/btw ` prefix itself, drawn as a reference pill, so drafts, other devices and the send path need nothing new; it stays after a send until the user removes it (the recommended answer to the open question about stickiness).
//! SEE-ALSO: apps/desktop/src/app/native_chat/actions.rs, apps/mobile/app/src/chat/native/composer/menus.ts, server/src/session_chat_claude_panel.rs.

use crate::menus::option_menus::DraftAgent;
use crate::state::ChatState;

/// What Side chat puts at the start of the chat box, and what Claude reads as a side question.
pub const SIDE_CHAT_PREFIX: &str = "/btw ";

/// The pill's words in the chat box.
pub const SIDE_CHAT_LABEL: &str = "Side Chat";

/// Whether this session's agent answers `/btw` as a side question: Claude Code, directly or as the
/// base of a custom agent. Codex's `/btw` opens a separate side conversation and is not wired yet.
pub fn side_chat_available(state: &ChatState) -> bool {
    // A custom agent reports its base CLI, the way the account panel resolves it (menus/controls.rs).
    let family = DraftAgent::list(state.session.available_agents.as_ref())
        .and_then(|agents| {
            agents
                .iter()
                .find(|row| {
                    Some(row.agent_id.as_str()) == state.session.session_agent_id.as_deref()
                })
                .and_then(|row| row.base_agent_id.clone())
        })
        .or_else(|| state.session.agent.clone());
    matches!(family.as_deref(), Some("claude" | "openclaude"))
}

/// The prefix a renderer keeps in the chat box after a send, when Side chat is available.
pub fn side_chat_prefix(state: &ChatState) -> Option<String> {
    side_chat_available(state).then(|| SIDE_CHAT_PREFIX.to_string())
}

/// The chat box with Side chat switched on (prefix added) or off (prefix removed).
pub fn toggle_side_chat(text: &str) -> String {
    match text.strip_prefix(SIDE_CHAT_PREFIX) {
        Some(rest) => rest.to_string(),
        None => format!("{SIDE_CHAT_PREFIX}{}", text.trim_start()),
    }
}

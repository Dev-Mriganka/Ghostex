//! Whether a message a coordinator handed to one of its threads reached it: the text helpers the
//! CLI and the supervisor share, and the supervisor's transcript check.

use std::path::PathBuf;

use serde_json::Value;

use crate::session_chat::{SessionChatBlock, SessionChatRole, SessionChatSource};
use crate::session_chat_tail::SessionChatTailPage;

/// The start of a pending message kept on the thread: enough for the needle and for the excerpt
/// an "undelivered" report quotes.
pub const COORDINATOR_PENDING_MESSAGE_MAX_CHARS: usize = 300;
/// Normalized characters of a message a transcript row must contain to count as delivered.
pub const COORDINATOR_DELIVERY_NEEDLE_CHARS: usize = 80;
/// Transcript timestamps come from the recipient's machine, whose clock can differ from ours.
pub const COORDINATOR_DELIVERY_CLOCK_SLACK_MS: i64 = 60_000;
/// Transcript rows the supervisor reads per check.
const DELIVERY_TAIL_ROWS: usize = 24;

/// Text minus whatever the trip to the transcript can change: whitespace, control characters,
/// and the Control Pictures signs gxserver writes in their place.
pub fn normalize_delivery_text(text: &str) -> String {
    text.chars()
        .filter(|character| {
            !character.is_whitespace()
                && !character.is_control()
                && !matches!(character, '\u{2400}'..='\u{243f}')
        })
        .collect()
}

/// What a transcript row must contain for `body` to count as delivered; empty when the body has
/// nothing to match.
pub fn delivery_needle(body: &str) -> String {
    normalize_delivery_text(body)
        .chars()
        .take(COORDINATOR_DELIVERY_NEEDLE_CHARS)
        .collect()
}

/// The start of a message as the thread record keeps it: one line, bounded.
pub fn pending_message_excerpt(body: &str) -> String {
    body.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(COORDINATOR_PENDING_MESSAGE_MAX_CHARS)
        .collect()
}

/// BLOCKING (transcript path resolution and a bounded tail read).
/// `Some(true)` when the thread's transcript records a user turn sent at or after `since_ms` that
/// contains `needle`, `Some(false)` when it was read and does not, `None` when there is no
/// transcript to read yet. `path` caches the resolved file between checks.
pub fn transcript_records_message(
    session: &Value,
    needle: &str,
    since_ms: i64,
    path: &mut Option<PathBuf>,
) -> Option<bool> {
    if needle.is_empty() {
        return None;
    }
    let agent = crate::session_chat_follower::session_chat_agent_for_session(session)?;
    let transcript_agent =
        crate::session_chat::resolve_session_chat_transcript_agent(Some(agent.as_str()))?;
    if !path.as_ref().is_some_and(|path| path.is_file()) {
        let runtime = |key: &str| {
            session
                .pointer(&format!("/runtimeSettings/{key}"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        *path = crate::session_chat_paths::resolve_session_chat_transcript_path(
            transcript_agent,
            runtime("agentSessionId").as_deref(),
            runtime("agentSessionPath").as_deref(),
        );
    }
    let page = crate::session_chat_tail::read_session_chat_tail_page(
        transcript_agent,
        path.as_ref()?,
        DELIVERY_TAIL_ROWS,
        None,
    )
    .ok()?;
    let SessionChatTailPage::Page { messages, .. } = page else {
        return None;
    };
    Some(messages.iter().any(|message| {
        message.role == SessionChatRole::User
            && message.source == SessionChatSource::Transcript
            && message.timestamp.map_or(true, |timestamp| {
                timestamp >= since_ms - COORDINATOR_DELIVERY_CLOCK_SLACK_MS
            })
            && message
                .blocks
                .iter()
                .filter_map(|block| match block {
                    SessionChatBlock::Text { text } => Some(normalize_delivery_text(text)),
                    _ => None,
                })
                .collect::<String>()
                .contains(needle)
    }))
}

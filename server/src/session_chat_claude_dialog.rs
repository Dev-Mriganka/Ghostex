//! Claude's live Ink panels, including nested menus and editable fields.

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::ops::RangeInclusive;

use crate::domain::DomainStateError;
use crate::session_chat_options::{normalize_spaces, strip_ansi_sgr};
use crate::session_chat_send::{
    capture_session_terminal_text, execute_session_chat_send, SessionChatSendStep,
    SessionChatSendTarget, SESSION_CHAT_INTERRUPT,
};
use crate::session_chat_terminal_dialog::{TerminalDialog, TerminalDialogRow};

/*
CDXC:AgentScreenDetection 2026-09-27 DECISION:
User: every Claude Code dialog that asks for a choice must reach the chat as a card whose buttons answer it, like the model switch confirmation.
Only the fullscreen renderer draws panels under a `▔` rule; the default one draws them in the input slot under the `─` rule that otherwise tops the composer, so tool prompts such as "Enter plan mode?", the setup screens (trust, new MCP servers, external imports, API key) and the resume, nudge and onboarding choosers were never read.
Such a panel is the last `─` rule followed by an indented `❯` row and no composer; the question tool (answered through its own card) and the offers a send closes with Escape (session_chat_claude_popups.rs, whose DECISION keeps Enter always sending) stay out.
*/
fn is_bottom_slot_dialog(text: &str, after: &[String]) -> bool {
    let highlighted = after
        .iter()
        .any(|line| line.starts_with(' ') && line.trim_start().starts_with("❯ "));
    let composer = after
        .iter()
        .any(|line| line.starts_with('❯') || line.starts_with("╭─"));
    let title_is_row = after
        .iter()
        .find(|line| line.chars().any(char::is_alphanumeric))
        .is_some_and(|line| {
            let line = line.trim_start().trim_start_matches('❯').trim_start();
            line.split_once(". ")
                .is_some_and(|(number, _)| number.parse::<u32>().is_ok())
        });
    let question_tool = after
        .iter()
        .any(|line| line.contains('☐') || line.contains('☒') || line.contains("✔ Submit"));
    highlighted
        && !composer
        && !title_is_row
        && !question_tool
        && crate::session_chat_claude_popups::claude_escape_safe_popup(text).is_none()
}

/// Whether a chooser is Claude's own usage-limit menu ("You've reached your Fable limit"), which
/// must stay a usage-limit notice so account switching and queued-delivery holds still see it.
pub(crate) fn is_claude_usage_limit_chooser(dialog: &TerminalDialog) -> bool {
    !dialog.rows.is_empty()
        && [
            "You've reached your",
            "You've hit your",
            "You're out of usage credits",
        ]
        .iter()
        .any(|lead| dialog.title.starts_with(lead))
}

/// "No, keep planning  shift+tab to approve with this feedback": a key the chat card has no use
/// for, not a description of the row it sits beside or under.
fn is_key_hint(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["shift+tab to ", "tab to ", "ctrl+", "esc to "]
        .iter()
        .any(|lead| lower.starts_with(lead))
}

/// The options a Claude chooser draws: the run of rows around the highlighted `❯` one, with the
/// lines each row wraps onto, and where that run sits in `remainder`. Unselected rows are indented to
/// the highlighted row's label and wrapped lines deeper. Numbers are optional (`hideIndexes`), so a
/// row's number is its printed one or its position; numbered lines outside the run (a plan's own
/// list above "Ready to code?"'s options) are not options.
fn option_rows(remainder: &[String]) -> (Vec<TerminalDialogRow>, RangeInclusive<usize>) {
    let indent = |line: &str| line.chars().take_while(|c| *c == ' ').count();
    let Some(selected) = remainder
        .iter()
        .rposition(|line| line.trim_start().starts_with('❯'))
    else {
        return (Vec::new(), 1..=0);
    };
    let label_column = indent(&remainder[selected]) + 2;
    let is_row = |index: usize| {
        index == selected
            || (!remainder[index].trim().is_empty() && indent(&remainder[index]) == label_column)
    };
    let is_wrap = |index: usize| {
        !remainder[index].trim().is_empty() && indent(&remainder[index]) > label_column
    };
    let mut first = selected;
    while first > 0 && (is_row(first - 1) || is_wrap(first - 1)) {
        first -= 1;
    }
    while first < selected && !is_row(first) {
        first += 1;
    }
    let mut last = selected;
    while last + 1 < remainder.len() && (is_row(last + 1) || is_wrap(last + 1)) {
        last += 1;
    }
    let mut rows: Vec<TerminalDialogRow> = Vec::new();
    for index in first..=last {
        let line = remainder[index].trim();
        if !is_row(index) {
            if is_key_hint(line) {
                continue;
            }
            if let Some(row) = rows.last_mut() {
                let detail = row.description.get_or_insert_with(String::new);
                if !detail.is_empty() {
                    detail.push(' ');
                }
                detail.push_str(line);
            }
            continue;
        }
        let text = line.trim_start_matches(['❯', '↓', '↑']).trim();
        let (number, text) = text
            .split_once(". ")
            .and_then(|(number, rest)| number.parse::<u32>().ok().map(|number| (number, rest)))
            .unwrap_or((rows.len() as u32 + 1, text));
        let (label, description) = text
            .trim()
            .split_once("  ")
            .map(|(label, description)| (label, Some(description.trim().to_string())))
            .unwrap_or((text.trim(), None));
        let description = description.filter(|description| !is_key_hint(description));
        rows.push(TerminalDialogRow {
            number,
            label: label.to_string(),
            description,
            selected: index == selected,
        });
    }
    (rows, first..=last)
}

/// CDXC:AgentScreenDetection 2026-09-05 DECISION:
/// User: drive Claude's commands through zmx and make their interactions usable in chat, as for Codex.
/// Claude's panel boundary survives nested menus and clipped footers; a later composer means the panel is historical.
/// SEE-ALSO: apps/desktop/src/app/native_chat/terminal_dialog.rs.
pub fn detect_claude_dialog(text: &str) -> Option<TerminalDialog> {
    if let Some(dialog) = crate::session_chat_claude_effort_notice::detect_effort_notice(text) {
        return Some(dialog);
    }
    let lines: Vec<String> = text
        .lines()
        .map(|line| {
            normalize_spaces(&strip_ansi_sgr(line))
                .trim_end()
                .to_string()
        })
        .collect();
    let rule = |fill: char| {
        lines.iter().rposition(|line| {
            let line = line.trim();
            line.chars().count() >= 20 && line.chars().all(|c| c == fill)
        })
    };
    let modal = rule('▔');
    let slot = rule('─').filter(|&index| is_bottom_slot_dialog(text, &lines[index + 1..]));
    // A `▔` panel keeps its own inner `─` rules ("Ready to code?"), so it wins unless transcript
    // rows between the two show it is an answered panel left on screen.
    let start = match (modal, slot) {
        (Some(modal), Some(slot))
            if slot > modal
                && lines[modal + 1..slot]
                    .iter()
                    .any(|line| line.starts_with('⏺') || line.starts_with('❯')) =>
        {
            slot
        }
        (Some(modal), _) => modal,
        (None, Some(slot)) => slot,
        (None, None) => return None,
    } + 1;
    let content = &lines[start..];
    // The composer has no left indent. Selection markers inside Ink panels do.
    if content
        .iter()
        .any(|line| line.starts_with('❯') || line.starts_with("╭─"))
    {
        return None;
    }
    let heading = content
        .iter()
        .position(|line| line.chars().any(|c| c.is_alphanumeric()))?;
    let title = content[heading].trim().to_string();
    if title.len() > 240 || title.starts_with("Question ") {
        return None;
    }
    let remainder = &content[heading + 1..];
    let is_hint = |line: &str| {
        let lower = line.to_ascii_lowercase();
        lower.contains("esc to")
            || lower.contains("esc cancel")
            || lower.contains("enter to")
            || lower.contains(" to search")
            || lower.contains(" to filter")
            || lower.contains(" to sort")
            || lower.contains("←/→")
            || lower.contains("↑/↓")
            || lower.contains("d to day")
    };
    let footer = remainder
        .iter()
        .filter(|line| is_hint(line))
        .map(|line| line.trim())
        .collect::<Vec<_>>()
        .join("\n");
    let lower = footer.to_ascii_lowercase();
    // A text field is boxed on both sides; a quote (the message `/rewind` restores to) only has
    // the left bar.
    let boxed = remainder.iter().find_map(|line| {
        let line = line.trim();
        let value = line.strip_prefix('│')?;
        (value.ends_with('│') || value.trim_start().starts_with('⌕'))
            .then(|| value.trim_end_matches('│').trim())
    });
    let search = boxed.is_some_and(|line| line.starts_with('⌕'));
    let feedback_field = remainder
        .iter()
        .position(|line| line.trim() == "Describe the issue below:")
        .map(|i| {
            remainder[i + 1..]
                .iter()
                .take_while(|line| !is_hint(line))
                .map(|line| line.trim())
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string()
        });
    let plan_feedback = (title == "Ready to code?"
        && remainder
            .iter()
            .any(|line| line.contains("shift+tab to approve with this feedback")))
    .then(|| {
        remainder.iter().rev().find_map(|line| {
            let row = line.trim().strip_prefix("❯ ")?;
            let (_, value) = row.split_once(". ")?;
            (!value.starts_with("Yes,")).then(|| {
                if value == "Tell Claude what to change" {
                    ""
                } else {
                    value
                }
            })
        })
    })
    .flatten();
    let text_field = remainder
        .iter()
        .find_map(|line| line.trim().strip_prefix("> "));
    let input = if search {
        Some("search")
    } else if boxed.is_some()
        || text_field.is_some()
        || feedback_field.is_some()
        || plan_feedback.is_some()
    {
        Some("text")
    } else {
        None
    };
    let field = plan_feedback
        .or(feedback_field.as_deref())
        .or(text_field)
        .or(boxed)
        .unwrap_or_default()
        .trim_start_matches('⌕')
        .trim();
    let input_value = if field.ends_with('…') {
        String::new()
    } else {
        field.to_string()
    };
    let (mut rows, option_lines) = option_rows(remainder);
    // Tabbed/searchable lists keep their full panel: a row click cannot express
    // focus changes, filtering, checkboxes, or partially visible numbered lists.
    let numbered = input.is_none()
        && rows.iter().filter(|r| r.selected).count() == 1
        && !title.contains("   ")
        // A scrolled list marks its cut-off row "↓ 5. …"; a lone arrow at the right edge only
        // scrolls a plan or text viewport above the options.
        && !remainder.iter().any(|line| {
            let line = line.trim();
            line.starts_with(['↓', '↑']) && line.chars().count() > 1
        })
        && !lower.contains("space");
    if !numbered {
        rows.clear();
    }
    let body = remainder
        .iter()
        .enumerate()
        .filter(|(index, line)| !is_hint(line) && (!numbered || !option_lines.contains(index)))
        .map(|(_, line)| line.clone())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    let mut actions = Vec::new();
    if input != Some("text")
        && (remainder
            .iter()
            .any(|line| line.trim().starts_with(['❯', '↓', '↑']))
            || lower.contains("↑/↓")
            || lower.contains("↓ to")
            || title.starts_with("Help ")
            || title.starts_with("Settings "))
    {
        actions.extend(["up", "down"]);
    }
    if lower.contains("←/→")
        || title.starts_with("Help ")
        || title.starts_with("Settings ")
        || title.starts_with("Plugins ")
    {
        actions.extend(["left", "right"]);
    }
    if lower.contains("tab") {
        actions.push("tab");
    }
    if lower.contains("space") {
        actions.push("toggle");
    }
    if lower.contains("session only") {
        actions.push("sessionOnly");
    }
    if lower.contains("ctrl+a") {
        actions.push("projects");
    }
    if lower.contains("ctrl+b") {
        actions.push("branch");
    }
    if lower.contains("t to sort") {
        actions.push("sort");
    }
    if lower.contains("r reset") {
        actions.push("reset");
    }
    if lower.contains("d to day") {
        actions.extend(["day", "week"]);
    }
    if lower.contains("enter") || !rows.is_empty() {
        actions.push("confirm");
    }
    if lower.contains("f to fork") {
        actions.push("fork");
    }
    actions.push("cancel");
    // CDXC:SessionChat 2026-09-27 WHY: the `/btw` panel animates a spinner glyph beside "Answering…", which changed the id on every capture, so Close pressed while Claude was still answering was always refused as "the dialog changed". Blank rows under a short panel are left out too: the probe's capture and the answer's capture disagree on them, which refused every answer to the Settings panel.
    let painted = content
        .iter()
        .rposition(|line| !line.trim().is_empty())
        .map_or(0, |last| last + 1);
    let identity: Vec<&str> = content[..painted]
        .iter()
        .map(|line| {
            let trimmed = line.trim_end();
            if trimmed.ends_with("Answering…") {
                "Answering…"
            // `/rewind`'s confirmation quotes the message with its age, "│ (14s ago)", which
            // ticks between the card's capture and the answer's.
            } else if trimmed.ends_with(" ago)") && trimmed.trim_start().starts_with("│ (") {
                "│ (ago)"
            } else {
                line.as_str()
            }
        })
        .collect();
    Some(TerminalDialog {
        id: format!("{:x}", Sha256::digest(identity.join("\n").as_bytes())),
        title,
        body,
        footer,
        rows,
        input: input.map(str::to_string),
        input_value,
        actions: actions.into_iter().map(str::to_string).collect(),
        side_question: None,
        blocks: None,
    })
}

fn invalid() -> DomainStateError {
    DomainStateError {
        code: "invalidParams",
        message: "That action is not offered by this Claude dialog.".to_string(),
    }
}

/// CDXC:AgentScreenDetection 2026-09-05 WHY:
/// Claude 2.1.260 ignored legacy arrows in live zmx menus; explicit unmodified CSI keys moved the highlight correctly.
/// Text editing and submission use separate stdin writes so Ink does not interpret a combined control/paste burst as literal input.
pub(crate) fn claude_dialog_steps(
    dialog: &TerminalDialog,
    params: &Map<String, Value>,
) -> Result<Vec<SessionChatSendStep>, DomainStateError> {
    let mut steps = vec![SessionChatSendStep::VerifyTerminalDialog {
        agent: "claude".to_string(),
        id: dialog.id.clone(),
    }];
    if let Some(index) = params.get("choiceIndex").and_then(Value::as_u64) {
        let index = usize::try_from(index).map_err(|_| invalid())?;
        dialog.rows.get(index).ok_or_else(invalid)?;
        let selected = dialog
            .rows
            .iter()
            .position(|row| row.selected)
            .ok_or_else(invalid)?;
        for _ in 0..index.abs_diff(selected) {
            steps.push(SessionChatSendStep::Write(
                if index > selected {
                    "\x1b[1;1B"
                } else {
                    "\x1b[1;1A"
                }
                .to_string(),
            ));
            steps.push(SessionChatSendStep::SleepMs(80));
        }
        if dialog.rows[index].label != "Tell Claude what to change" {
            steps.push(SessionChatSendStep::Write("\r".to_string()));
        }
    } else {
        let action = params
            .get("dialogAction")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        if (action == "text" && dialog.input.as_deref() == Some("search"))
            || (action == "submit" && dialog.input.as_deref() == Some("text"))
        {
            let text = params
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(invalid)?;
            if text.len() > 8192
                || text.chars().any(|c| {
                    c.is_control() && !(dialog.title == "Submit feedback / bug report" && c == '\n')
                })
            {
                return Err(invalid());
            }
            if dialog.footer.contains("/ to search") {
                steps.push(SessionChatSendStep::Write("/".to_string()));
                steps.push(SessionChatSendStep::SleepMs(100));
            }
            let clear = if dialog.input.as_deref() == Some("search") {
                "\x1b[101;5u\x1b[117;5u".to_string()
            } else {
                crate::session_chat_send::build_agent_tui_clear_input_for_text(&dialog.input_value)
                    .replace('\u{15}', "\x1b[117;5u")
                    .replace('\u{b}', "\x1b[107;5u")
            };
            steps.push(SessionChatSendStep::Write(clear));
            steps.push(SessionChatSendStep::SleepMs(100));
            if !text.is_empty() {
                steps.push(SessionChatSendStep::Write(
                    crate::session_chat_send::wrap_terminal_bracketed_paste_text(text),
                ));
                steps.push(SessionChatSendStep::SleepMs(150));
            }
            if action == "submit" {
                steps.push(SessionChatSendStep::Write("\r".to_string()));
            }
        } else if action == "selectTab" {
            // A tab strip moves one tab per arrow; the client sends how far to go.
            let delta = params
                .get("tabDelta")
                .and_then(Value::as_i64)
                .filter(|delta| *delta != 0 && delta.abs() <= 12)
                .ok_or_else(invalid)?;
            let key = if delta > 0 { "right" } else { "left" };
            if !dialog.actions.iter().any(|a| a == key) {
                return Err(invalid());
            }
            for index in 0..delta.unsigned_abs() {
                if index > 0 {
                    steps.push(SessionChatSendStep::SleepMs(80));
                }
                steps.push(SessionChatSendStep::Write(
                    if delta > 0 { "\x1b[1;1C" } else { "\x1b[1;1D" }.to_string(),
                ));
            }
        } else {
            if !dialog.actions.iter().any(|a| a == action) {
                return Err(invalid());
            }
            let payload = match action {
                "up" => "\x1b[1;1A",
                "down" => "\x1b[1;1B",
                "left" => "\x1b[1;1D",
                "right" => "\x1b[1;1C",
                "tab" => "\t",
                "toggle" => " ",
                "confirm" => "\r",
                "sessionOnly" => "s",
                "projects" => "\x1b[97;5u",
                "branch" => "\x1b[98;5u",
                "sort" => "t",
                "reset" => "r",
                "day" => "d",
                "week" => "w",
                "fork" => "f",
                "cancel" => SESSION_CHAT_INTERRUPT,
                _ => return Err(invalid()),
            };
            steps.push(SessionChatSendStep::Write(payload.to_string()));
        }
    }
    // CDXC:SessionChat 2026-09-16 DECISION: User requested prompt Escape and terminal controls; single-key actions must not hold the send queue for a fixed post-send delay.
    if params.contains_key("choiceIndex")
        || matches!(
            params.get("dialogAction").and_then(Value::as_str),
            Some("text" | "submit")
        )
    {
        steps.push(SessionChatSendStep::SleepMs(250));
    }
    Ok(steps)
}

pub(crate) async fn answer_claude_dialog(
    target: &SessionChatSendTarget,
    params: &Map<String, Value>,
) -> Result<Value, DomainStateError> {
    let stale = || DomainStateError {
        code: "invalidState",
        message: "Claude's dialog changed. Review the current choices and try again.".to_string(),
    };
    let dialog = capture_session_terminal_text(&target.zmx_name)
        .await
        .and_then(|screen| detect_claude_dialog(&screen))
        .ok_or_else(stale)?;
    if params.get("dialogId").and_then(Value::as_str) != Some(dialog.id.as_str()) {
        return Err(stale());
    }
    execute_session_chat_send(
        &target.project_id,
        &target.session_id,
        &target.zmx_name,
        "session-chat-dialog",
        claude_dialog_steps(&dialog, params)?,
    )
    .await
    .map_err(|error| DomainStateError {
        code: "invalidState",
        message: error.message,
    })?;
    if params.contains_key("choiceIndex")
        && capture_session_terminal_text(&target.zmx_name)
            .await
            .and_then(|screen| detect_claude_dialog(&screen))
            .is_some_and(|current| current.id == dialog.id)
    {
        return Err(DomainStateError {
            code: "invalidState",
            message: "Claude kept this dialog open. Review its message and try again.".to_string(),
        });
    }
    Ok(json!({"queued": true}))
}

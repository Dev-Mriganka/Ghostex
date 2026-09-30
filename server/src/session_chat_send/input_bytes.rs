use super::*;

// ---------------------------------------------------------------------------
// Clear burst (upstream chat spec §7.2) — measured, not derived
// ---------------------------------------------------------------------------

/// Logical line count: `text.split(/\r\n|\r|\n/).length`. Wrapping is
/// irrelevant; one Ctrl+U clears exactly one logical line.
pub fn count_agent_tui_input_lines(text: &str) -> usize {
    let bytes = text.as_bytes();
    let mut lines = 1usize;
    let mut index = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' => {
                lines += 1;
                if bytes.get(index + 1) == Some(&b'\n') {
                    index += 1;
                }
            }
            b'\n' => lines += 1,
            _ => {}
        }
        index += 1;
    }
    lines
}

/// The 2N-1 law: repetitions = 2*lines - 1 of Ctrl+U, then the same count of
/// Ctrl+K. The known line count is a LOWER bound (the user can also type into
/// the TUI directly), so bias upward — overshoot measured perfectly clean on
/// both Claude and Codex; undershoot leaves residue glued onto the next
/// message.
pub fn build_agent_tui_clear_input(line_count: usize) -> String {
    let lines = line_count.clamp(1, AGENT_TUI_CLEAR_MAX_LINES);
    let repetitions = 2 * lines - 1;
    format!(
        "{}{}",
        AGENT_TUI_CLEAR_INPUT_LINE.repeat(repetitions),
        AGENT_TUI_CLEAR_INPUT_FORWARD.repeat(repetitions)
    )
}

pub fn build_agent_tui_clear_input_for_text(text: &str) -> String {
    build_agent_tui_clear_input(count_agent_tui_input_lines(text) + AGENT_TUI_CLEAR_LINE_SLACK)
}

// ---------------------------------------------------------------------------
// Bracketed paste & sanitization (upstream chat spec §7.3/§7.4)
// ---------------------------------------------------------------------------

/// An embedded ESC (e.g. a pasted `\x1b[201~` from scrollback) would close
/// the paste frame early and run the tail as KEYSTROKES; replace with ␛.
pub fn sanitize_bracketed_paste_text(text: &str) -> String {
    text.replace('\u{1b}', "\u{241b}")
}

/// xterm's native paste converts every clipboard newline to CR; direct frames
/// must match, or ConPTY TUIs treat raw LF as submit.
pub fn normalize_terminal_paste_line_endings(text: &str) -> String {
    text.replace("\r\n", "\r").replace('\n', "\r")
}

/*
Agent composers reserve a final backslash followed by Return for inserting a
newline. Ghostex sends the body and Return as separate pty writes, so a prompt
whose final byte is `\\` otherwise triggers that shortcut instead of submitting.

Stage one terminal-only trailing space to disambiguate the Return. Supported
agent composers trim trailing whitespace when they submit, so the logical
prompt still ends in the user's backslash. Apply this at the shared terminal
encoding boundary so direct chat sends, queued sends, interactive free-text
answers, and generic submitted session messages all obey the same rule.
*/
pub fn disambiguate_agent_tui_submit_text(text: &str) -> String {
    let mut staged = text.to_string();
    if staged.ends_with('\\') || ends_with_mention_token(&staged) {
        staged.push(' ');
    }
    staged
}

/// CDXC:SessionChat 2026-09-26 WHY:
/// A message whose last word is a `$skill` or `@file` mention leaves the cursor inside that token, so the composer's mention popup is open when Ghostex's Return arrives and the popup takes it: Codex 0.156 kept "… More details: use $ghostex-agents" (the Copy Details trailer) in its input box, unsent, until the user pressed Enter in the terminal. The trailing space closes the popup, as it does for a person typing; verified live, the same text with the space submits.
fn ends_with_mention_token(text: &str) -> bool {
    text.rsplit(char::is_whitespace)
        .next()
        .is_some_and(|token| token.len() > 1 && token.starts_with(['$', '@']))
}

pub fn wrap_terminal_bracketed_paste_text(text: &str) -> String {
    format!(
        "{BRACKETED_PASTE_START}{}{BRACKETED_PASTE_END}",
        sanitize_bracketed_paste_text(&normalize_terminal_paste_line_endings(text))
    )
}

/// Trailing newline alone counts as multiline.
pub fn is_multiline_draft(text: &str) -> bool {
    text.contains(['\r', '\n'])
}

/// Multiline → framed (NO submit); single-line → sanitized unframed text.
pub fn build_session_chat_paste_bytes(text: &str) -> String {
    let staged = disambiguate_agent_tui_submit_text(text);
    if is_multiline_draft(text) {
        wrap_terminal_bracketed_paste_text(&staged)
    } else {
        sanitize_bracketed_paste_text(&staged)
    }
}

/// Image paths must LOOK like a real terminal image paste; a plain typed
/// path/@mention is read as text/file-read.
pub fn build_session_chat_image_paste_bytes(path: &str) -> String {
    wrap_terminal_bracketed_paste_text(path)
}

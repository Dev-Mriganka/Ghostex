//! Hand-written copy for agent panels whose painted text reads badly in a chat card.
//!
//! CDXC:SessionChat 2026-09-24 DECISION: User: the card a slash command like `/fast` opens must not look like terminal text in a text area; show copy we wrote for each of these panels instead of the panel's original text.
//! WHY: the copy is chosen only when every line of the panel is one we recognise, so a panel Claude rewords, or a state we have not seen, keeps its original text rather than a sentence that is no longer true. Panels whose layout is the content (the `/usage` bars, the `/status` table, the `/mobile` QR code) are deliberately not here.

use serde_json::{json, Value};

use crate::questions::model::TerminalDialog;

/// The card's title and markdown paragraphs for a panel we have copy for, or `None`.
pub fn terminal_dialog_copy(dialog: &TerminalDialog) -> Option<Value> {
    if !dialog.rows.is_empty() {
        return None;
    }
    let title = plain_title(&dialog.title);
    let lines: Vec<&str> = dialog
        .body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let (title, paragraphs) = if dialog.input.is_some() {
        if dialog.input.as_deref() == Some("text") && title == CLAUDE_SIGN_IN_TITLE {
            claude_sign_in_copy(&lines)?
        } else {
            return None;
        }
    } else if title == "Fast mode" || title == "Fast mode (research preview)" {
        fast_mode_copy(&lines)?
    } else if let Some(left) = title.strip_prefix("Guest passes · ") {
        guest_passes_copy(left, &lines)?
    } else {
        return None;
    };
    Some(json!({ "title": title, "paragraphs": paragraphs }))
}

/// The title without the leading glyph Claude draws before some panel names (`↯ Fast mode`).
fn plain_title(title: &str) -> &str {
    title
        .trim()
        .trim_start_matches(|c: char| !c.is_alphanumeric())
        .trim_start()
}

/// Claude's `/fast` panel: what the mode costs, and whether credits block turning it on.
fn fast_mode_copy(lines: &[&str]) -> Option<(String, Vec<String>)> {
    const COST: &str = ". Draws from usage credits at a higher rate. Separate rate limits apply.";
    let mut model = None;
    let mut needs_credits = false;
    for line in lines {
        if let Some(rest) = line.strip_prefix("High-speed mode for ") {
            model = Some(rest.strip_suffix(COST)?);
        } else if *line == "Fast mode requires usage credits · /usage-credits to turn them on" {
            needs_credits = true;
        } else if line.starts_with("Learn more: ") {
            // The docs link adds nothing the two sentences do not already say.
        } else {
            return None;
        }
    }
    let mut paragraphs = vec![format!(
        "Fast mode makes {} answer faster. It uses your usage credits at a higher rate and has its own rate limits.",
        model?
    )];
    if needs_credits {
        paragraphs.push(
            "Usage credits are off for this account, so Fast mode can't be turned on yet. Send `/usage-credits` to turn them on."
                .to_string(),
        );
    }
    Some(("Fast mode".to_string(), paragraphs))
}

/// Claude's `/passes` panel: the ticket art is dropped, the offer and the referral link stay.
fn guest_passes_copy(left: &str, lines: &[&str]) -> Option<(String, Vec<String>)> {
    let count = left.strip_suffix(" left")?;
    count.parse::<u32>().ok()?;
    let mut offer = None;
    let mut link = None;
    for line in lines {
        if line.starts_with("https://") && !line.contains(' ') {
            link = Some(*line);
        } else if line.starts_with("Share a free week of Claude Code with friends.") {
            offer = Some(*line);
        } else if !line.contains("CC ✻") {
            return None;
        }
    }
    let passes = if count == "1" { "pass" } else { "passes" };
    Some((
        "Guest passes".to_string(),
        vec![
            format!("You have {count} guest {passes} left. {}", offer?),
            format!("Your referral link: {}", link?),
        ],
    ))
}

/// The title of Claude's first-run sign-in step, where its browser sign-in hands back a code.
pub const CLAUDE_SIGN_IN_TITLE: &str = "Browser didn't open? Use the url below to sign in";

/// CDXC:Onboarding 2026-09-28 WHY: a new Claude install signs in through this card, and its terminal wording ("Browser didn't open?", a bare link, a field) did not say what to do with the code the browser shows.
fn claude_sign_in_copy(lines: &[&str]) -> Option<(String, Vec<String>)> {
    let [link] = lines else {
        return None;
    };
    (link.starts_with("https://") && !link.contains(char::is_whitespace)).then(|| {
        (
            "Sign in to Claude".to_string(),
            vec![
                "Sign in on the page that opened in your browser. When it shows a code, paste it below."
                    .to_string(),
                format!("Browser didn't open? Open this link to sign in: {link}"),
            ],
        )
    })
}

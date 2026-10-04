//! The text a thread starts from and the reports a coordinator receives.

/// What a brief carries from its coordinator.
pub struct BriefContext<'a> {
    pub title: &'a str,
    pub goal: &'a str,
    pub instructions: &'a str,
    pub notes: &'a [String],
    /// The thread works in its own Ghostex worktree.
    pub worktree: bool,
}

/// A report longer than this is cut, with a pointer to the full reply.
pub const COORDINATOR_REPORT_MAX_CHARS: usize = 12_000;

/// Who a message is from, in the fields of the agent-message header.
#[derive(Clone, Debug, Default)]
pub struct MessageSender {
    pub agent_name: String,
    pub title: String,
    pub session_id: String,
    pub agent_id: String,
    pub agent_session_id: String,
    pub global_ref: String,
}

fn header_value(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        return "unavailable".to_string();
    }
    value
        .chars()
        .map(|c| {
            if c.is_control() || c == '\u{2028}' || c == '\u{2029}' {
                ' '
            } else {
                c
            }
        })
        .collect()
}

/// CDXC:Coordinators 2026-09-30 WHY:
/// Thread briefs and thread reports use the header `ghostex agents send` writes, so every chat (desktop, web, phone) already draws them as "Message from" cards and the coordinator already knows to answer the `Reply to` reference.
/// SEE-ALSO: server/src/ghostex_cli/agents/identity.rs `message` (same header), packages/gx-chat-core/src/transcript/agent_message.rs (parses it).
pub fn agent_message(sender: &MessageSender, body: &str) -> String {
    format!(
        "Message from another agent\nAgent: {}\nSession: {}\nSession ID: {}\nAgent ID: {}\nAgent Session ID: {}\nReply to: {}\n\n{}",
        header_value(&sender.agent_name),
        header_value(&sender.title),
        header_value(&sender.session_id),
        header_value(&sender.agent_id),
        header_value(&sender.agent_session_id),
        header_value(&sender.global_ref),
        body
    )
}

/// The labels of the lines `agent_message` writes between its opener and the blank line, in order.
const AGENT_MESSAGE_HEADER_LABELS: [&str; 6] = [
    "Agent: ",
    "Session: ",
    "Session ID: ",
    "Agent ID: ",
    "Agent Session ID: ",
    "Reply to: ",
];

/// The body of an agent message, without the header `agent_message` (and `ghostex agents send`) prepends; any other text comes back unchanged.
/// CDXC:SessionTitles 2026-10-05 WHY:
/// The first-message auto-title read the whole prompt, so a session started by another agent was named after the SENDER's `Session:` title ("Coordinator promote operation"). Titles come from the body only. The match is the exact header (opener, the six labelled lines in order, a blank line), not a heuristic, so a user's own message that merely starts with similar words is never cut.
/// SEE-ALSO: server/src/ghostex_cli/agents/identity.rs `message` writes the same header; the three title paths read it through here: server/src/server/title_generation/first_prompt_decision.rs, server/src/agents/activity.rs and `build_session_history_title_source`.
pub fn strip_agent_message_header(text: &str) -> &str {
    let Some(mut rest) = text.strip_prefix("Message from another agent\n") else {
        return text;
    };
    for label in AGENT_MESSAGE_HEADER_LABELS {
        let Some((line, after)) = rest.split_once('\n') else {
            return text;
        };
        if !line.starts_with(label) {
            return text;
        }
        rest = after;
    }
    match rest.strip_prefix('\n') {
        Some(body) => body,
        None => text,
    }
}

/// CDXC:Coordinators 2026-09-30 WHY:
/// Claude's projects send "the project's instructions" to every new thread so a rule stated once reaches all of them. Here the goal, the standing instructions and the memory notes ride under the coordinator's task, followed by the reporting rules the supervisor depends on: the thread's final message is its report, so it must not message the coordinator itself.
pub fn thread_brief(coordinator: &BriefContext<'_>, task: &str) -> String {
    let mut brief = task.trim().to_string();
    brief.push_str("\n\n---\n");
    brief.push_str(&format!(
        "You are a thread started by the Ghostex coordinator \"{}\".",
        coordinator.title.trim()
    ));
    if !coordinator.goal.trim().is_empty() {
        brief.push_str(&format!("\nThe overall goal: {}", coordinator.goal.trim()));
    }
    if !coordinator.instructions.trim().is_empty() {
        brief.push_str("\n\nStanding instructions:\n");
        brief.push_str(coordinator.instructions.trim());
    }
    if !coordinator.notes.is_empty() {
        brief.push_str("\n\nNotes to keep in mind:");
        for (index, note) in coordinator.notes.iter().enumerate() {
            brief.push_str(&format!("\n{}. {}", index + 1, note.trim()));
        }
    }
    if coordinator.worktree {
        brief.push_str(
            "\n\nYou work in your own git worktree. Ghostex renames its temporary ghostex/<id> branch after this thread's title once you start; that is expected, so keep working on whichever branch is checked out.",
        );
    }
    brief.push_str(
        "\n\nWhen you are done:\n\
- End your turn with a final report: what you did, where (files, branch, pull request), how you verified it, and anything left or blocked. Ghostex forwards your final message to the coordinator automatically, so do not message the coordinator yourself.\n\
- If you need a decision you cannot make, ask it plainly in your final message and stop. The coordinator answers in this chat.\n\
- Do not merge, push, or delete anything unless this brief asks for it.",
    );
    brief
}

pub enum ThreadReport<'a> {
    Finished {
        message: Option<&'a str>,
    },
    Waiting {
        prompt: &'a str,
    },
    Closed,
    /// A message its coordinator sent it never showed up in its transcript, and it went idle.
    Undelivered {
        excerpt: &'a str,
        /// What its chat or screen shows about the send, when anything does.
        evidence: Option<&'a str>,
    },
}

/// The body of one report; the sender header names the thread.
pub fn report_body(report: &ThreadReport<'_>, thread_ref: &str) -> String {
    match report {
        ThreadReport::Finished { message: Some(message) } => {
            let message = message.trim();
            let mut body = String::from("Ghostex thread report: finished its turn. Its final message:\n\n");
            if message.chars().count() > COORDINATOR_REPORT_MAX_CHARS {
                body.extend(message.chars().take(COORDINATOR_REPORT_MAX_CHARS));
                body.push_str(&format!(
                    "\n\n[Cut here. Read the whole reply with: ghostex read-session-chat {thread_ref} --last 1 --format text]"
                ));
            } else {
                body.push_str(message);
            }
            body
        }
        ThreadReport::Finished { message: None } => format!(
            "Ghostex thread report: finished its turn, but its final message could not be read. Read it with: ghostex read-session-chat {thread_ref} --last 2 --format text"
        ),
        ThreadReport::Waiting { prompt } => format!(
            "Ghostex thread report: waiting for an answer.\n\n{}",
            prompt.trim()
        ),
        ThreadReport::Closed => format!(
            "Ghostex thread report: its session was closed, so it is marked done. `ghostex coordinator reopen {thread_ref}` or a message to it resumes the same conversation."
        ),
        ThreadReport::Undelivered { excerpt, evidence } => {
            let mut body = format!(
                "Ghostex thread report: your message did not reach it. Its transcript does not show the message you sent, and it is idle, so nothing is working on it.

Your message began: {}",
                excerpt.trim()
            );
            if let Some(evidence) = evidence.map(str::trim).filter(|evidence| !evidence.is_empty()) {
                body.push_str(&format!("

Its chat shows: {evidence}"));
            }
            body.push_str(&format!(
                "

Read its chat (ghostex read-session-chat {thread_ref} --last 2 --format text), then send the message again with ghostex agents send {thread_ref}. If it fails again, tell the user."
            ));
            body
        }
    }
}

/// The first line worth reading: a report's "## Final Report" or "**Summary:**" heading says
/// nothing, so the first plain sentence wins, with the heading as the fallback.
pub fn report_headline(text: &str, max: usize) -> String {
    let clean = |line: &str| {
        line.trim()
            .trim_start_matches(['#', '-', '*', '>', ' '])
            .replace("**", "")
            .replace('`', "")
            .trim()
            .to_string()
    };
    let is_heading = |line: &str| {
        let trimmed = line.trim();
        trimmed.starts_with('#')
            || (trimmed.starts_with("**") && trimmed.ends_with("**"))
            || trimmed.ends_with(':')
    };
    let lines = text.lines().filter(|line| !clean(line).is_empty());
    let line = lines
        .clone()
        .find(|line| !is_heading(line))
        .or_else(|| lines.clone().next())
        .map(clean)
        .unwrap_or_default();
    if line.chars().count() > max {
        format!("{}…", line.chars().take(max).collect::<String>())
    } else {
        line.to_string()
    }
}

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
    Finished { message: Option<&'a str> },
    Waiting { prompt: &'a str },
    Closed,
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
        ThreadReport::Closed => {
            "Ghostex thread report: its session was closed, so it is marked done.".to_string()
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

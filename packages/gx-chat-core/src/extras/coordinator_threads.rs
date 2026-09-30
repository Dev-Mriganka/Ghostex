//! A coordinator's Threads panel: its threads grouped by what they need, above the composer.
//!
//! CDXC:Coordinators 2026-09-30 WHY:
//! The panel answers "what needs me, what is running, what finished" without opening the sidebar, which the phone does not have. Grouping, order, labels and the done fold are decided here once for the desktop, web and phone renderers; gxserver only sends each thread's state and one line of detail (`coordinatorThreads`).
//! SEE-ALSO: server/src/coordinators/panel.rs (the field), apps/desktop/src/app/native_chat/coordinator_threads.rs and apps/mobile/app/src/chat/native/cards/AgentPanels.tsx (the renderers).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One thread row.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorThreadRow {
    /// `<projectId>:<sessionId>`, stable across frames.
    pub key: String,
    pub project_id: String,
    pub session_id: String,
    pub title: String,
    /// One line: the question it waits on, its task while working, or its last report.
    pub detail: String,
    pub state: String,
    /// The worktree branch, when it has one.
    pub branch: String,
    pub lifecycle_state: String,
}

/// One heading and its rows.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorThreadGroup {
    pub state: String,
    pub label: String,
    pub rows: Vec<CoordinatorThreadRow>,
}

/// The panel.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorThreadsPanel {
    /// "1 waiting on you · 2 working · 3 done".
    pub meta: String,
    pub groups: Vec<CoordinatorThreadGroup>,
    /// A thread waits on someone, which tints the header.
    pub attention: bool,
    pub collapsed: bool,
    pub show_done: bool,
    /// "3 done" / "Hide done", or "" when nothing is done.
    pub done_label: String,
}

const GROUPS: [(&str, &str); 6] = [
    ("waiting", "Waiting on you"),
    ("working", "Working"),
    ("finished", "Finished"),
    ("sleeping", "Sleeping"),
    ("closed", "Closed"),
    ("done", "Done"),
];

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn known_state(state: &str) -> &'static str {
    GROUPS
        .iter()
        .find(|(known, _)| *known == state)
        .map(|(known, _)| *known)
        .unwrap_or("finished")
}

/// `true` when the session is a coordinator, whatever its thread count.
pub fn is_coordinator(threads: Option<&Value>) -> bool {
    threads.is_some_and(Value::is_object)
}

/// The panel, or `None` for a session that is not a coordinator or has no threads yet.
pub fn coordinator_threads_panel(
    threads: Option<&Value>,
    collapsed: bool,
    show_done: bool,
) -> Option<CoordinatorThreadsPanel> {
    let threads = threads?;
    let rows: Vec<&Value> = threads
        .get("threads")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().collect())
        .unwrap_or_default();
    let done_count = threads
        .get("doneCount")
        .and_then(Value::as_u64)
        .unwrap_or_else(|| {
            rows.iter()
                .filter(|row| text(row, "state") == "done")
                .count() as u64
        });
    if rows.is_empty() && done_count == 0 {
        return None;
    }
    let mut groups = Vec::new();
    let mut counts = Vec::new();
    for (state, label) in GROUPS {
        let group_rows: Vec<CoordinatorThreadRow> = rows
            .iter()
            .filter(|row| known_state(&text(row, "state")) == state)
            .map(|row| CoordinatorThreadRow {
                key: format!("{}:{}", text(row, "projectId"), text(row, "sessionId")),
                project_id: text(row, "projectId"),
                session_id: text(row, "sessionId"),
                title: text(row, "title"),
                detail: text(row, "detail"),
                state: state.to_string(),
                branch: text(row, "branch"),
                lifecycle_state: text(row, "lifecycleState"),
            })
            .collect();
        let count = if state == "done" {
            done_count as usize
        } else {
            group_rows.len()
        };
        if count > 0 {
            counts.push(match state {
                "waiting" => format!("{count} waiting on you"),
                _ => format!("{count} {state}"),
            });
        }
        if group_rows.is_empty() || (state == "done" && !show_done) {
            continue;
        }
        groups.push(CoordinatorThreadGroup {
            state: state.to_string(),
            label: label.to_string(),
            rows: group_rows,
        });
    }
    Some(CoordinatorThreadsPanel {
        meta: counts.join(" \u{b7} "),
        attention: groups.iter().any(|group| group.state == "waiting"),
        collapsed,
        show_done,
        done_label: match (done_count, show_done) {
            (0, _) => String::new(),
            (_, true) => "Hide done".to_string(),
            (count, false) => format!("{count} done"),
        },
        groups,
    })
}

/// The document value, `null` when there is no panel.
pub fn project(threads: Option<&Value>, collapsed: bool, show_done: bool) -> Value {
    coordinator_threads_panel(threads, collapsed, show_done)
        .and_then(|panel| serde_json::to_value(panel).ok())
        .unwrap_or(Value::Null)
}

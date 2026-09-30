//! Coordinator trees: each open thread drawn right under its coordinator.
//!
//! SEE-ALSO: server/src/coordinators/presentation.rs (the fields), view.rs `RowNesting`.

use std::collections::HashMap;

use crate::keys::SessionKey;

use super::inputs::SectionId;
use super::ordering::{is_snoozed, section_of};
use super::view::{RowNesting, SessionView};

/// Deeper trees are drawn flat past this, so a coordinator of coordinators still reads as a tree
/// without running out of row width.
const MAX_DEPTH: u8 = 3;

fn is_nestable_thread(session: &SessionView, enable_parking: bool, now_ms: u64) -> bool {
    let row = &session.row;
    row.coordinator_parent.is_some()
        && !row.is_browser
        && row.thread_state.as_deref() != Some("done")
        && !(enable_parking && row.is_parked)
        && !is_snoozed(row, now_ms)
}

/// Reorders a group's rows (already in display order) so each open thread follows its
/// coordinator, and returns the section each row is drawn under: a thread takes its coordinator's.
pub(crate) fn nest_threads(
    sessions: Vec<SessionView>,
    enable_parking: bool,
    now_ms: u64,
) -> (Vec<SessionView>, Vec<SectionId>) {
    let base_sections: Vec<SectionId> = sessions
        .iter()
        .map(|session| section_of(&session.row, enable_parking, now_ms))
        .collect();
    let coordinators: HashMap<&SessionKey, usize> = sessions
        .iter()
        .enumerate()
        .filter(|(_, session)| session.row.is_coordinator)
        .filter_map(|(index, session)| session.row.key.as_ref().map(|key| (key, index)))
        .collect();
    if coordinators.is_empty() {
        return (sessions, base_sections);
    }
    let mut children: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut parent_of: Vec<Option<usize>> = vec![None; sessions.len()];
    for (index, session) in sessions.iter().enumerate() {
        if !is_nestable_thread(session, enable_parking, now_ms) {
            continue;
        }
        let Some(parent) = session
            .row
            .coordinator_parent
            .as_ref()
            .and_then(|parent| coordinators.get(parent).copied())
            .filter(|parent| *parent != index)
        else {
            continue;
        };
        children.entry(parent).or_default().push(index);
        parent_of[index] = Some(parent);
    }
    if children.is_empty() {
        return (sessions, base_sections);
    }
    // A cycle (two coordinators that are each other's thread) would never reach a root; such rows
    // stay top-level.
    let reaches_root = |parent_of: &[Option<usize>], mut index: usize| {
        for _ in 0..=parent_of.len() {
            match parent_of[index] {
                Some(parent) => index = parent,
                None => return true,
            }
        }
        false
    };
    for index in 0..sessions.len() {
        if parent_of[index].is_some() && !reaches_root(&parent_of, index) {
            parent_of[index] = None;
        }
    }
    children.retain(|_, list| {
        list.retain(|child| parent_of[*child].is_some());
        !list.is_empty()
    });

    let mut order: Vec<(usize, u8, bool, SectionId)> = Vec::with_capacity(sessions.len());
    fn emit(
        index: usize,
        depth: u8,
        last: bool,
        section: SectionId,
        children: &HashMap<usize, Vec<usize>>,
        order: &mut Vec<(usize, u8, bool, SectionId)>,
    ) {
        order.push((index, depth, last, section));
        if let Some(list) = children.get(&index) {
            let count = list.len();
            for (position, child) in list.iter().enumerate() {
                emit(
                    *child,
                    (depth + 1).min(MAX_DEPTH),
                    position + 1 == count,
                    section,
                    children,
                    order,
                );
            }
        }
    }
    for index in 0..sessions.len() {
        if parent_of[index].is_none() {
            emit(index, 0, false, base_sections[index], &children, &mut order);
        }
    }

    let mut sessions: Vec<Option<SessionView>> = sessions.into_iter().map(Some).collect();
    let mut nested = Vec::with_capacity(order.len());
    let mut sections = Vec::with_capacity(order.len());
    for (index, depth, last, section) in order {
        let Some(mut session) = sessions[index].take() else {
            continue;
        };
        session.nesting = RowNesting {
            depth,
            last_child: depth > 0 && last,
            thread_count: children
                .get(&index)
                .map_or(0, |list| u16::try_from(list.len()).unwrap_or(u16::MAX)),
            waiting_threads: 0,
            working_threads: 0,
        };
        nested.push(session);
        sections.push(section);
    }
    fill_thread_counts(&mut nested);
    (nested, sections)
}

/// Counts, on each coordinator row, the threads drawn directly under it by state.
fn fill_thread_counts(nested: &mut [SessionView]) {
    for index in 0..nested.len() {
        if nested[index].nesting.thread_count == 0 {
            continue;
        }
        let depth = nested[index].nesting.depth;
        let (mut waiting, mut working) = (0u16, 0u16);
        for child in nested.iter().skip(index + 1) {
            if child.nesting.depth <= depth {
                break;
            }
            if child.nesting.depth != depth + 1 {
                continue;
            }
            match child.row.thread_state.as_deref() {
                Some("waiting") => waiting += 1,
                Some("working") => working += 1,
                _ => {}
            }
        }
        nested[index].nesting.waiting_threads = waiting;
        nested[index].nesting.working_threads = working;
    }
}

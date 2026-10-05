//! Coordinator trees: each open thread drawn right under its coordinator.
//!
//! SEE-ALSO: server/src/coordinators/presentation.rs (the fields), view.rs `RowNesting`.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use crate::keys::SessionKey;

use super::inputs::SectionId;
use super::ordering::{is_snoozed, section_of};
use super::view::{RowNesting, SessionRow, SessionView, ThreadTally};

/// Every coordinator's threads among `rows`, by state. A row listed twice (a project's own rows and
/// a group's members) counts once.
pub(crate) fn tally_threads<'a>(
    rows: impl Iterator<Item = &'a Arc<SessionRow>>,
) -> HashMap<SessionKey, ThreadTally> {
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    let mut tallies: HashMap<SessionKey, ThreadTally> = HashMap::new();
    for row in rows {
        let Some(parent) = row.coordinator_parent.as_ref() else {
            continue;
        };
        if row.is_browser || !seen.insert(row.sidebar_session_id.as_str()) {
            continue;
        }
        let tally = tallies.entry(parent.clone()).or_default();
        let bump = |count: &mut u16| *count = count.saturating_add(1);
        bump(&mut tally.total);
        match row.thread_state.as_deref() {
            Some("waiting") => bump(&mut tally.waiting),
            Some("working") => bump(&mut tally.working),
            _ => {}
        }
    }
    tallies
}

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
/// The threads of a coordinator in `collapsed` (sidebar row ids) stay in the list, marked folded,
/// so the headers above still count them.
///
/// CDXC:Coordinators 2026-10-01 DECISION:
/// User: "I want to be able to collapse the coordinator's row by clicking on a button next to it." A chevron on the coordinator row folds its threads away and unfolds them, remembered per coordinator across restarts with the rest of the sidebar's collapse state. A folded coordinator still shows its badge (count and tint), its threads still count toward the section and project headers, revealing one of its threads unfolds it, and for a drop the folded block is just the coordinator row.
pub(crate) fn nest_threads(
    sessions: Vec<SessionView>,
    enable_parking: bool,
    group_working: bool,
    held: &HashSet<String>,
    collapsed: &BTreeSet<String>,
    now_ms: u64,
) -> (Vec<SessionView>, Vec<SectionId>) {
    let base_sections: Vec<SectionId> = sessions
        .iter()
        .map(|session| {
            let group_working = group_working && !held.contains(&session.row.sidebar_session_id);
            section_of(&session.row, enable_parking, group_working, now_ms)
        })
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

    let is_collapsed: Vec<bool> = sessions
        .iter()
        .enumerate()
        .map(|(index, session)| {
            children.contains_key(&index) && collapsed.contains(&session.row.sidebar_session_id)
        })
        .collect();

    /// Where one row is emitted: its index, depth, whether it is the last child, its section, and
    /// whether a folded coordinator hides it.
    struct Placed {
        index: usize,
        depth: u8,
        last: bool,
        section: SectionId,
        folded: bool,
    }
    let mut order: Vec<Placed> = Vec::with_capacity(sessions.len());
    fn emit(
        placed: Placed,
        children: &HashMap<usize, Vec<usize>>,
        is_collapsed: &[bool],
        order: &mut Vec<Placed>,
    ) {
        let (index, depth, section) = (placed.index, placed.depth, placed.section);
        let folded = placed.folded || is_collapsed[index];
        order.push(placed);
        if let Some(list) = children.get(&index) {
            let count = list.len();
            for (position, child) in list.iter().enumerate() {
                emit(
                    Placed {
                        index: *child,
                        depth: (depth + 1).min(MAX_DEPTH),
                        last: position + 1 == count,
                        section,
                        folded,
                    },
                    children,
                    is_collapsed,
                    order,
                );
            }
        }
    }
    for index in 0..sessions.len() {
        if parent_of[index].is_none() {
            emit(
                Placed {
                    index,
                    depth: 0,
                    last: false,
                    section: base_sections[index],
                    folded: false,
                },
                &children,
                &is_collapsed,
                &mut order,
            );
        }
    }

    let mut sessions: Vec<Option<SessionView>> = sessions.into_iter().map(Some).collect();
    let mut nested = Vec::with_capacity(order.len());
    let mut sections = Vec::with_capacity(order.len());
    for Placed {
        index,
        depth,
        last,
        section,
        folded,
    } in order
    {
        let Some(mut session) = sessions[index].take() else {
            continue;
        };
        session.nesting = RowNesting {
            depth,
            last_child: depth > 0 && last,
            thread_count: children
                .get(&index)
                .map_or(0, |list| u16::try_from(list.len()).unwrap_or(u16::MAX)),
            collapsed: is_collapsed[index],
            folded,
            ..RowNesting::default()
        };
        nested.push(session);
        sections.push(section);
    }
    (nested, sections)
}

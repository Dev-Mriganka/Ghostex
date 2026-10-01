//! Where a project move lands, from the writes [`plan_project_move`] made for it.
//!
//! SEE-ALSO: packages/gx-core/src/sidebar_view/project_drop_landing.rs.
//!
//! [`plan_project_move`]: super::plan_project_move

use serde_json::{json, Value};

use crate::project_docs::CollectionsDocument;
use crate::sidebar_view::{OrderKind, ProjectDropLanding, SidebarView};

use super::project_move::{ProjectMovePlan, ProjectWrite};

/// The landing of the row `moveGroup`, `moveCollection` or `moveToCollection` drags, or `None` when
/// the plan does nothing (a refusal is an empty plan) or the row is not drawn.
pub fn project_drop_landing(
    view: &SidebarView,
    collections_before: &CollectionsDocument,
    plan: &ProjectMovePlan,
    moved_kind: &str,
    moved_id: &str,
) -> Option<ProjectDropLanding> {
    if plan.writes.is_empty() {
        return None;
    }
    let mut group_order = None;
    let mut collections = None;
    for write in &plan.writes {
        match write {
            ProjectWrite::GroupOrder { group_ids } => group_order = Some(group_ids.as_slice()),
            ProjectWrite::EditCollections { document } => collections = Some(&document.state),
            _ => {}
        }
    }
    view.preview_project_drop(
        &collections_before.state,
        group_order,
        collections,
        moved_kind,
        moved_id,
    )
}

/// The project drop as the plan performs it: a drop on any project of a worktree family (the
/// parent and the worktrees drawn after it) aims at the parent, before it when the dragged row
/// comes from below the family and after the family when it comes from above, the same rule a
/// coordinator's tree follows for sessions (`SidebarViewModel::tree_drop_target`). A drop made by
/// a member of the family itself, and every other drop, is returned as it is.
pub fn project_drop_command(view: &SidebarView, command: &Value) -> Value {
    let text = |key: &str| command.get(key).and_then(Value::as_str);
    let (moved, target_key) = match (text("type"), text("targetKind")) {
        (Some("moveGroup"), _) => (("group", text("groupId")), "targetGroupId"),
        (Some("moveCollection"), Some("group")) => (("collection", text("sourceId")), "targetId"),
        _ => return command.clone(),
    };
    let (Some(moved_id), Some(target_id)) = (moved.1, text(target_key)) else {
        return command.clone();
    };
    let project = |group_id: &str| {
        view.group(group_id)
            .and_then(|group| group.core.project_context.as_ref())
    };
    let Some(target) = project(target_id) else {
        return command.clone();
    };
    let family = target
        .worktree
        .as_ref()
        .map_or(target.project_id.as_str(), |worktree| {
            worktree.parent_project_id.as_str()
        });
    let in_family = |group_id: &str| {
        project(group_id).is_some_and(|project| {
            project.project_id == family
                || project
                    .worktree
                    .as_ref()
                    .is_some_and(|worktree| worktree.parent_project_id == family)
        })
    };
    let members = view
        .groups
        .iter()
        .filter(|group| in_family(&group.core.group_id))
        .count();
    let Some(parent) = view.groups.iter().find(|group| {
        project(&group.core.group_id).is_some_and(|project| project.project_id == family)
    }) else {
        return command.clone();
    };
    if members < 2 || (moved.0 == "group" && in_family(moved_id)) {
        return command.clone();
    }
    // Every drawn row in order: a collection's row, then the projects inside it.
    let mut drawn: Vec<(&str, &str)> = Vec::new();
    for item in &view.order {
        match item.kind {
            OrderKind::Project => drawn.push(("group", &item.id)),
            OrderKind::Collection => {
                drawn.push(("collection", &item.id));
                if let Some(collection) = view
                    .collections
                    .iter()
                    .find(|collection| collection.collection_id == item.id)
                {
                    drawn.extend(collection.group_ids.iter().map(|id| ("group", id.as_str())));
                }
            }
        }
    }
    let index = |row: (&str, &str)| drawn.iter().position(|drawn| *drawn == row);
    let from_above = match (
        index((moved.0, moved_id)),
        index(("group", &parent.core.group_id)),
    ) {
        (Some(moved), Some(parent)) => moved < parent,
        _ => false,
    };
    let mut command = command.clone();
    command[target_key] = json!(parent.core.group_id);
    command["position"] = json!(if from_above { "after" } else { "before" });
    command
}

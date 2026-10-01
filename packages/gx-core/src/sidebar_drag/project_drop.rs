//! Where a project move lands, from the writes [`plan_project_move`] made for it.
//!
//! SEE-ALSO: packages/gx-core/src/sidebar_view/project_drop_landing.rs.
//!
//! [`plan_project_move`]: super::plan_project_move

use crate::project_docs::CollectionsDocument;
use crate::sidebar_view::{ProjectDropLanding, SidebarView};

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

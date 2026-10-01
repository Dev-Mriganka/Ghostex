//! A coordinator's tree in the sidebar: indented thread rows with a tree line, and the icon and badge on
//! the coordinator row. Visual only; the row itself stays the click, drag and menu target.
//!
//! SEE-ALSO: packages/gx-core/src/sidebar_view/threads.rs (the order and depth),
//! apps/desktop/src/app/gx_store/sidebar_snapshot.rs (`threadDepth`, `threadLast`, `coordinatorThreads`).

use gpui::prelude::FluentBuilder;
use gpui::{
    AnyElement, InteractiveElement as _, IntoElement, ParentElement,
    StatefulInteractiveElement as _, Styled, div, px, rgb,
};
use serde_json::Value;

use super::{appearance::SidebarAppearance, model::NativeSidebarSession};
use crate::app::helpers::*;

/// Indent per tree level; one agent icon plus the row gap, so a thread's icon sits under its
/// coordinator's title.
pub(crate) const THREAD_INDENT: f32 = 16.0;
/// The coordinator marker and the open-thread count.
const COORDINATOR_ICON: &str = "titlebar/users-group.svg";
const WAITING_COLOR: u32 = 0x95d7f6;
const COORDINATOR_ROW_ICON: &str = "titlebar/coordinator-crown.svg";
const SLEEPING_ICON: &str = "titlebar/moon.svg";
const DONE_ICON: &str = "titlebar/circle-check.svg";
const COORDINATOR_COLOR_DARK: u32 = 0xffffff;
const COORDINATOR_COLOR_LIGHT: u32 = 0x000000;

pub(crate) fn thread_depth(session: &NativeSidebarSession) -> f32 {
    session
        .details
        .get("threadDepth")
        .and_then(Value::as_u64)
        .unwrap_or(0) as f32
}

/// The tree line: from the top of the row down to the icon (the last thread) or through the row
/// (a thread with siblings below it), then across to the icon.
pub(crate) fn thread_connector(
    session: &NativeSidebarSession,
    appearance: &SidebarAppearance,
) -> Option<AnyElement> {
    let depth = thread_depth(session);
    if depth < 1.0 {
        return None;
    }
    let scale = appearance.scale;
    let last = session.details.get("threadLast").and_then(Value::as_bool) == Some(true);
    let color = chrome_color(0x4a4a4a, 0xc8c8c8);
    // Under the middle of the parent's 15px icon, which starts at the row's 5px inset.
    let x = (5.0 + 7.0 + (depth - 1.0) * THREAD_INDENT) * scale;
    let height = super::session_list::SESSION_HEIGHT * scale;
    let mid = height / 2.0;
    // The line starts right under the parent's icon, which sits centred in the row above.
    let rise = (mid - 7.5 * scale) + super::session_list::SESSION_SPACING * scale;
    Some(
        div()
            .absolute()
            .top(px(-rise))
            .left(px(x))
            .w(px((THREAD_INDENT - 5.0) * scale))
            .h(if last {
                px(rise + mid)
            } else {
                px(rise + height + super::session_list::SESSION_SPACING * scale)
            })
            .child(
                div()
                    .absolute()
                    .left_0()
                    .top_0()
                    .bottom_0()
                    .w(px(1.0 * scale))
                    .bg(color),
            )
            .child(
                div()
                    .absolute()
                    .left_0()
                    .top(px(rise + mid - 0.5 * scale))
                    .w(px((THREAD_INDENT - 6.0) * scale))
                    .h(px(1.0 * scale))
                    .bg(color),
            )
            .into_any_element(),
    )
}

pub(crate) fn is_coordinator(session: &NativeSidebarSession) -> bool {
    session
        .details
        .get("isCoordinator")
        .and_then(Value::as_bool)
        == Some(true)
}

/// The icon a coordinator row draws in place of its agent's logo.
///
/// CDXC:Coordinators 2026-10-01 DECISION:
/// User: "please give coordinator agents a different logo in the sidebar of the app (not the agent's app logo)", a cool SVG instead of the Claude icon. A crown, bold enough to read at the row's 13px, drawn white on dark themes and black on light ones the way the Codex logo adapts (user: "make the crown white, not purple"), with the row's usual focus and hover dimming; its threads keep their agent logos, and the crew icon with the open-thread count stays beside it.
pub(crate) fn coordinator_icon(appearance: &SidebarAppearance) -> AnyElement {
    titlebar_svg_icon(
        COORDINATOR_ROW_ICON,
        13.0 * appearance.scale,
        rgb(if appearance.light {
            COORDINATOR_COLOR_LIGHT
        } else {
            COORDINATOR_COLOR_DARK
        })
        .into(),
    )
    .into_any_element()
}

/// The coordinator row's marker: the crew icon and its count, tinted when a thread waits on someone
/// (light blue) or works (orange); while nothing works, the done and sleeping counts follow it.
///
/// CDXC:Coordinators 2026-09-30 WHY:
/// A coordinator looks like any other session of its agent otherwise, and its thread rows alone do not say which row they hang from once the list scrolls (or once the tree is folded). What the numbers mean is gx-core's `RowNesting::coordinator_badge`.
pub(crate) fn coordinator_badge(
    session: &NativeSidebarSession,
    appearance: &SidebarAppearance,
) -> Option<AnyElement> {
    if !is_coordinator(session) {
        return None;
    }
    let scale = appearance.scale;
    let threads = session.details.get("coordinatorThreads");
    let number = |key: &str| {
        threads
            .and_then(|threads| threads.get(key))
            .and_then(Value::as_u64)
            .unwrap_or(0)
    };
    let (count, done, sleeping) = (number("count"), number("done"), number("sleeping"));
    let tint = match threads
        .and_then(|threads| threads.get("tone"))
        .and_then(Value::as_str)
    {
        Some("waiting") => rgb(WAITING_COLOR).into(),
        Some("working") => rgb(super::status::WORKING_COLOR).into(),
        _ => appearance.muted,
    };
    let label = |value: u64, color: gpui::Hsla| {
        div()
            .text_size(px(11.5 * scale))
            .text_color(color)
            .child(value.to_string())
    };
    let tally = |icon: &'static str, value: u64| {
        div()
            .flex()
            .items_center()
            .gap(px(2.0 * scale))
            .child(titlebar_svg_icon(icon, 12.0 * scale, appearance.muted))
            .child(label(value, appearance.muted))
    };
    Some(
        div()
            .flex_shrink_0()
            .flex()
            .items_center()
            .gap(px(6.0 * scale))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(2.0 * scale))
                    .child(titlebar_svg_icon(COORDINATOR_ICON, 13.0 * scale, tint))
                    .when(count > 0, |badge| badge.child(label(count, tint))),
            )
            .when(sleeping > 0, |badge| {
                badge.child(tally(SLEEPING_ICON, sleeping))
            })
            .when(done > 0, |badge| badge.child(tally(DONE_ICON, done)))
            .into_any_element(),
    )
}

impl crate::GhostexGpuiApp {
    /// The fold chevron beside a coordinator's crown, on a coordinator with threads drawn under it:
    /// pointing right while folded, down while open, like a project's.
    pub(crate) fn render_coordinator_chevron(
        &self,
        session: &NativeSidebarSession,
        appearance: &SidebarAppearance,
        cx: &mut gpui::Context<Self>,
    ) -> Option<AnyElement> {
        let threads = session.details.get("coordinatorThreads")?;
        if threads.get("collapsible").and_then(Value::as_bool) != Some(true) {
            return None;
        }
        let collapsed = threads.get("collapsed").and_then(Value::as_bool) == Some(true);
        let scale = appearance.scale;
        let session_id = session.session_id.clone();
        Some(
            div()
                .id(gpui::SharedString::from(format!(
                    "native-coordinator-chevron-{session_id}"
                )))
                .role(gpui::Role::Button)
                .aria_label(if collapsed {
                    "Show threads"
                } else {
                    "Hide threads"
                })
                .flex_shrink_0()
                .size(px(14.0 * scale))
                .ml(px(-3.0 * scale))
                .flex()
                .items_center()
                .justify_center()
                .rounded(px(3.0 * scale))
                .hover(|chevron| chevron.bg(appearance.session_hover))
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(cx.listener(move |app, _, _, cx| {
                    cx.stop_propagation();
                    app.dispatch_native_sidebar_ui(
                        serde_json::json!({"type": "toggleCoordinator", "sessionId": session_id}),
                        cx,
                    );
                }))
                .child(
                    gpui::svg()
                        .path(crate::app::consts::COMMAND_ICON_CHEVRON_RIGHT)
                        .size(px(14.0 * scale))
                        .text_color(appearance.muted)
                        .with_transformation(gpui::Transformation::rotate(gpui::percentage(
                            if collapsed { 0.0 } else { 0.25 },
                        ))),
                )
                .into_any_element(),
        )
    }
}

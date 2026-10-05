//! A coordinator's Threads panel, pinned above the composer beside Tasks and Subagents: its threads
//! grouped by what they need, each row opening that thread. Groups, labels, order and the done fold
//! come from the core (packages/gx-chat-core/src/extras/coordinator_threads.rs).
//!
//! SEE-ALSO: apps/mobile/app/src/chat/native/cards/AgentPanels.tsx (`CoordinatorThreadsPanel`, the
//! phone's twin), apps/desktop/src/app/session_chat/host_actions.rs (`openCoordinatorThread`).

use super::{appearance::ChatAppearance, state::NativeChatView, transcript::text};
use crate::app::native_chat::cursor::ChatCursor as _;
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyElement, Context, InteractiveElement as _, IntoElement, ParentElement as _,
    StatefulInteractiveElement as _, Styled as _, div, px, rgb,
};
use serde_json::{Value, json};

/// The sidebar's colours for the same states (native_sidebar/status.rs), so a thread reads the same
/// in both places.
const WAITING_COLOR: u32 = 0x95d7f6;
const WORKING_COLOR: u32 = 0xc68a06;

impl NativeChatView {
    pub(super) fn render_coordinator_threads(
        &self,
        p: &ChatAppearance,
        cx: &Context<Self>,
    ) -> Option<AnyElement> {
        let panel = self.snapshot["coordinatorThreadsPanel"].clone();
        if !panel.is_object() {
            return None;
        }
        let s = p.scale;
        let open = panel["collapsed"] != true;
        let attention = panel["attention"] == true;
        let motion = self.disclosure_frame("coordinator-threads", open, cx);
        let header = self.panel_header(
            super::panel_card::PanelHeader {
                id: "chat-coordinator-threads-header",
                icon: "titlebar/users-group.svg",
                title: "Threads",
                meta: text(&panel, "meta"),
                open,
                has_body: open || motion.is_some(),
                toggle_label: if open { "Hide threads" } else { "Show threads" },
                trailing: attention.then(|| {
                    div()
                        .size(px(8.0 * s))
                        .rounded_full()
                        .flex_shrink_0()
                        .bg(rgb(WAITING_COLOR))
                        .into_any_element()
                }),
                command: json!({"type":"toggleCoordinatorThreads","open":!open}),
            },
            p,
            cx,
        );
        let mut body = Vec::new();
        if open || motion.is_some() {
            let mut rows = div()
                .id("chat-coordinator-threads-rows")
                .flex()
                .flex_col()
                .gap(px(2.0 * s))
                .max_h(px(360.0 * s))
                .overflow_y_scroll();
            for group in panel["groups"].as_array().into_iter().flatten() {
                rows = rows.child(
                    div()
                        .pt(px(4.0 * s))
                        .text_size(px(10.5 * s))
                        .text_color(p.card_muted)
                        .child(text(group, "label").to_uppercase()),
                );
                for row in group["rows"].as_array().into_iter().flatten() {
                    rows = rows.child(self.coordinator_thread_row(row, p, cx));
                }
            }
            body.push(rows.into_any_element());
            let done = text(&panel, "doneLabel");
            if !done.is_empty() {
                let expanded = panel["showDone"] == true;
                body.push(
                    div()
                        .id("chat-coordinator-threads-done")
                        .role(gpui::Role::Button)
                        .aria_label(done.clone())
                        .chat_cursor_pointer()
                        .text_size(px(12.0 * s))
                        .text_color(p.card_muted)
                        .hover(|style| style.text_color(p.foreground))
                        .child(done)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.invoke(
                                json!({"type":"toggleCoordinatorThreadsDone","expanded":!expanded}),
                                cx,
                            )
                        }))
                        .into_any_element(),
                );
            }
        }
        Some(
            div()
                .id("chat-coordinator-threads")
                .role(gpui::Role::Group)
                .aria_label("Coordinator threads")
                .w_full()
                .child(self.status_card_with_header_motion(
                    super::cards::CardBodyMotion {
                        key: "coordinator-threads",
                        frame: motion,
                        shut_body: false,
                        shut: !open,
                    },
                    header,
                    body,
                    Vec::new(),
                    p,
                ))
                .into_any_element(),
        )
    }

    fn coordinator_thread_row(
        &self,
        row: &Value,
        p: &ChatAppearance,
        cx: &Context<Self>,
    ) -> AnyElement {
        let s = p.scale;
        let state = row["state"].as_str().unwrap_or("finished");
        let marker = match state {
            "waiting" => div()
                .size(px(8.0 * s))
                .rounded_full()
                .bg(rgb(WAITING_COLOR))
                .into_any_element(),
            "working" => div()
                .size(px(8.0 * s))
                .rounded_full()
                .bg(rgb(WORKING_COLOR))
                .into_any_element(),
            "finished" => gpui::svg()
                .path("titlebar/circle-check.svg")
                .size(px(13.0 * s))
                .text_color(p.primary)
                .into_any_element(),
            "done" => gpui::svg()
                .path("titlebar/circle-check-filled.svg")
                .size(px(13.0 * s))
                .text_color(p.muted)
                .into_any_element(),
            _ => div()
                .size(px(8.0 * s))
                .rounded_full()
                .border(px(1.5 * s))
                .border_color(p.muted.opacity(0.7))
                .into_any_element(),
        };
        let title = text(row, "title");
        let detail = text(row, "detail");
        let branch = text(row, "branch");
        let tooltip = [title.as_str(), detail.as_str(), branch.as_str()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        let command = json!({
            "type": "openCoordinatorThread",
            "projectId": row["projectId"],
            "sessionId": row["sessionId"],
            "lifecycleState": row["lifecycleState"],
        });
        div()
            .id(gpui::SharedString::from(format!(
                "chat-coordinator-thread:{}",
                text(row, "key")
            )))
            .role(gpui::Role::Button)
            .aria_label(format!("Open thread {title}"))
            .flex()
            .items_center()
            .gap(px(8.0 * s))
            .w_full()
            .min_w_0()
            .px(px(4.0 * s))
            .py(px(3.0 * s))
            .rounded(px(5.0 * s))
            .text_size(px(12.0 * s))
            .chat_cursor_pointer()
            .hover(|style| style.bg(p.foreground.opacity(0.06)))
            .tooltip(move |window, cx| {
                gpui_component::tooltip::Tooltip::new(tooltip.clone()).build(window, cx)
            })
            .child(
                div()
                    .size(px(13.0 * s))
                    .flex()
                    .items_center()
                    .justify_center()
                    .flex_shrink_0()
                    .child(marker),
            )
            .child(
                div()
                    .flex_shrink_0()
                    .max_w(px(260.0 * s))
                    .truncate()
                    .text_color(if state == "done" {
                        p.card_muted
                    } else {
                        p.foreground
                    })
                    .child(title),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .text_color(p.card_muted)
                    .child(detail),
            )
            .when(!branch.is_empty(), |this| {
                this.child(
                    div()
                        .flex_shrink_0()
                        .max_w(px(160.0 * s))
                        .truncate()
                        .text_size(px(11.0 * s))
                        .text_color(p.muted)
                        .child(branch),
                )
            })
            .on_click(cx.listener(move |this, _, _, cx| this.invoke(command.clone(), cx)))
            .into_any_element()
    }
}

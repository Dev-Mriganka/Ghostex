//! Native GPUI Markdown table popup: the larger view of a table from a Markdown page (Settings >
//! Extensions READMEs and changelogs), opened by the React Markdown renderer's expand button.
//!
//! It draws the chat's own table preview (`table_preview_content` in
//! apps/desktop/src/app/native_chat/table_preview/render.rs) in the app's appearance, on the
//! native modal surface, which is frosted under window glass like the other native modals.
//! SEE-ALSO: apps/desktop/src/app/markdown_table_modal_lifecycle.rs (open, close, links).
use super::native_modal_kit::*;
use crate::app::native_chat::appearance::ChatAppearance;
use crate::app::native_chat::table_preview::table_preview_content;
use gpui::{
    App, Context, FocusHandle, InteractiveElement as _, IntoElement, KeyDownEvent,
    ParentElement as _, Render, ScrollHandle, Styled as _, Subscription, Window, div,
};
use std::rc::Rc;

pub(crate) enum MarkdownTableModalCommand {
    /// Escape, the close button, or a click outside the window.
    Close,
    /// A link in the table: closes the popup, then opens it where the app opens web links.
    OpenLink { href: String, external: bool },
}

pub(crate) type MarkdownTableModalHost = Rc<dyn Fn(MarkdownTableModalCommand, &mut App)>;

pub(crate) struct GpuiMarkdownTableModalWindow {
    host: MarkdownTableModalHost,
    palette: ModalPalette,
    source: String,
    focus_handle: FocusHandle,
    scroll: ScrollHandle,
    was_active: bool,
    _activation: Subscription,
}

impl GpuiMarkdownTableModalWindow {
    pub(crate) fn new(
        source: String,
        palette: ModalPalette,
        host: MarkdownTableModalHost,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);
        let activation = cx.observe_window_activation(window, |this: &mut Self, window, cx| {
            if window.is_window_active() {
                this.was_active = true;
            } else if this.was_active {
                (this.host)(MarkdownTableModalCommand::Close, cx);
            }
        });
        Self {
            host,
            palette,
            source,
            focus_handle,
            scroll: ScrollHandle::new(),
            was_active: window.is_window_active(),
            _activation: activation,
        }
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        if event.keystroke.key == "escape" {
            window.prevent_default();
            cx.stop_propagation();
            (self.host)(MarkdownTableModalCommand::Close, cx);
        }
    }
}

impl Render for GpuiMarkdownTableModalWindow {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // The chat's table look in the app's appearance, at the modal's own size rather than the
        // chat's zoom.
        let mut p = ChatAppearance::for_variant(self.palette.light);
        p.scale = 1.0;
        let link_view = cx.weak_entity();
        let close_view = cx.weak_entity();
        let [header, table] = table_preview_content(
            self.source.clone(),
            &p,
            &self.scroll,
            move |href, external, cx| {
                let href = href.to_string();
                let _ = link_view.update(cx, |this, cx| {
                    (this.host)(MarkdownTableModalCommand::OpenLink { href, external }, cx)
                });
            },
            move |cx| {
                let _ = close_view.update(cx, |this, cx| {
                    (this.host)(MarkdownTableModalCommand::Close, cx)
                });
            },
        );
        div()
            .id("ghostex-gpui-markdown-table-modal")
            .track_focus(&self.focus_handle)
            .size_full()
            .flex()
            .flex_col()
            .overflow_hidden()
            .bg(hsla(self.palette.surface))
            .font_family(p.font.clone())
            .text_color(p.foreground)
            .on_key_down(cx.listener(Self::on_key_down))
            .child(header)
            .child(table)
    }
}

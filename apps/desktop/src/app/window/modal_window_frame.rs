//! The frame every native app modal window draws: the modal itself, plus a round close button
//! floating in the window's top-right corner while the pointer is over the modal.
//!
//! CDXC:AppModal 2026-09-30 DECISION:
//! User: "i want to add a floating x button that appears on the top right corner floating on top of the corner circle bg but it should only appear when my mouse hovers the modal", "let's not make the modals close when i click away anymore", for "all the big modals that appear center of the app". This supersedes the 2026-09-27 click-away list (Rename Session, Rename Worktree, Delete Worktree closed when the main window became key again) and the focus-loss close of Quick Access, Browser History and the Markdown table and Mermaid viewers: no app modal closes on a click outside it now. The button runs the modal's own Escape close (`ModalCornerClose::close_from_corner`), so it cancels exactly what Escape cancels.
//! SEE-ALSO: apps/desktop/src/app/native_app_modal_lifecycle.rs and apps/gpui-web/src/app/web_host/modals.rs (the two openers that put every native modal in this frame).
use super::native_modal_kit::*;
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyView, App, Context, Entity, InteractiveElement as _, IntoElement, ParentElement as _,
    Render, StatefulInteractiveElement as _, Styled as _, Window, div, px,
};
use std::rc::Rc;

const FRAME_GROUP: &str = "app-modal-window-frame";
const ICON_CLOSE: &str = "modals/kit/x.svg";

pub(crate) struct ModalWindowFrame {
    content: AnyView,
    dismiss: Rc<dyn Fn(&mut Window, &mut App)>,
    shows_corner_close: Rc<dyn Fn(&App) -> bool>,
    palette: ModalPalette,
}

impl ModalWindowFrame {
    pub(crate) fn new<V: ModalCornerClose>(content: Entity<V>, palette: ModalPalette) -> Self {
        let dismiss_target = content.clone();
        let corner_close_target = content.clone();
        Self {
            content: content.into(),
            dismiss: Rc::new(move |window, cx| {
                dismiss_target.update(cx, |modal, cx| modal.close_from_corner(window, cx));
            }),
            shows_corner_close: Rc::new(move |cx| {
                corner_close_target.read(cx).shows_corner_close(cx)
            }),
            palette,
        }
    }

    fn corner_close(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;
        let hover = css_mix(p.foreground, 0.16, p.solid_surface);
        div()
            .id("app-modal-corner-close")
            .role(gpui::Role::Button)
            .aria_label("Close")
            .absolute()
            .top(px(MODAL_CORNER_CLOSE_INSET))
            .right(px(MODAL_CORNER_CLOSE_INSET))
            .size(px(MODAL_CORNER_CLOSE_SIZE))
            .flex()
            .items_center()
            .justify_center()
            .rounded_full()
            .border_1()
            .border_color(hsla(p.hairline))
            .bg(hsla(css_mix(p.foreground, 0.08, p.solid_surface)))
            .cursor_pointer()
            // Keeps the press from also landing on whatever the modal draws under the corner.
            .occlude()
            .opacity(0.0)
            .group_hover(FRAME_GROUP, |style| style.opacity(1.0))
            .hover(move |style| style.opacity(1.0).bg(hsla(hover)))
            .on_press(cx, move |this, window, cx| {
                cx.stop_propagation();
                (this.dismiss)(window, cx);
            })
            .child(modal_icon(ICON_CLOSE, 14.0, p.foreground))
    }
}

impl Render for ModalWindowFrame {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let show_close = (self.shows_corner_close)(cx);
        div()
            .id("app-modal-window-frame")
            .group(FRAME_GROUP)
            .relative()
            .size_full()
            .child(self.content.clone())
            .when(show_close, |this| this.child(self.corner_close(cx)))
    }
}

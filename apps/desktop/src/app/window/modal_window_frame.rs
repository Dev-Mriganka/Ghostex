//! The frame every native app modal window draws: the modal itself, plus a round close button
//! sitting on the window's top-right corner while the pointer is over the top of the modal.
//!
//! CDXC:AppModal 2026-10-04 DECISION:
//! User: "lets make it actually show on the top right corner when the user is at the top of the modal anywhere not just if near top right corner, so top 80px of top of the modal". The X stays ON the top-right corner and appears while the pointer is anywhere in the modal's top 80px, full width. This supersedes the 2026-10-02 "show the x only when hovering very close to the top right" rule; the rest of the 2026-10-02 and 2026-09-30 decisions stands: "the x needs to be ON the top right corner of the modals", and "let's not make the modals close when i click away anymore", for "all the big modals that appear center of the app". The 2026-09-30 decision superseded the 2026-09-27 click-away list (Rename Session, Rename Worktree, Delete Worktree closed when the main window became key again) and the focus-loss close of Quick Access, Browser History and the Markdown table and Mermaid viewers: no app modal closes on a click outside it now. The button runs the modal's own Escape close (`ModalCornerClose::close_from_corner`), so it cancels exactly what Escape cancels.
//! SEE-ALSO: apps/desktop/src/app/native_app_modal_lifecycle.rs and apps/gpui-web/src/app/web_host/modals.rs (the two openers that put every native modal in this frame).
use super::native_modal_kit::*;
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyView, App, Context, DispatchPhase, Entity, InteractiveElement as _, IntoElement,
    MouseExitEvent, MouseMoveEvent, ParentElement as _, Render, StatefulInteractiveElement as _,
    Styled as _, Window, canvas, div, px,
};
use std::rc::Rc;

const ICON_CLOSE: &str = "modals/kit/x.svg";

pub(crate) struct ModalWindowFrame {
    content: AnyView,
    dismiss: Rc<dyn Fn(&mut Window, &mut App)>,
    shows_corner_close: Rc<dyn Fn(&App) -> bool>,
    palette: ModalPalette,
    /// The pointer is within `MODAL_CORNER_CLOSE_REVEAL_HEIGHT` of the window's top edge.
    pointer_at_top: bool,
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
            pointer_at_top: false,
        }
    }

    fn set_pointer_at_top(&mut self, at_top: bool, cx: &mut Context<Self>) {
        if self.pointer_at_top != at_top {
            self.pointer_at_top = at_top;
            cx.notify();
        }
    }

    /**
     * Tracks whether the pointer is in the modal's top band. Window-wide listeners rather than an
     * element or group hover: the modal's own controls there (text fields, occluding buttons)
     * would otherwise swallow the moves, and a canvas registers no hitbox, so nothing under it
     * loses input.
     *
     * CDXC:AppModal 2026-10-04 WHY:
     * The tracker must be pinned to the frame's top-left (`inset_0`). An absolute element with no
     * insets sits at its static position, after the modal's content, so `bounds` started at the
     * window's bottom edge, no move inside the window ever counted as near the top, and the X
     * never appeared on any platform. The X is shown from this state alone, and the window's
     * mouse-exit event hides it once the pointer leaves through the top edge.
     */
    fn top_band_tracker(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let view = cx.weak_entity();
        canvas(
            |_, _, _| (),
            move |bounds, _, window, _| {
                let move_view = view.clone();
                window.on_mouse_event(move |event: &MouseMoveEvent, phase, _, cx| {
                    if phase != DispatchPhase::Capture {
                        return;
                    }
                    let position = event.position;
                    let at_top = bounds.contains(&position)
                        && f32::from(position.y - bounds.top())
                            <= MODAL_CORNER_CLOSE_REVEAL_HEIGHT;
                    let _ = move_view.update(cx, |this, cx| this.set_pointer_at_top(at_top, cx));
                });
                let exit_view = view.clone();
                window.on_mouse_event(move |_: &MouseExitEvent, phase, _, cx| {
                    if phase != DispatchPhase::Capture {
                        return;
                    }
                    let _ = exit_view.update(cx, |this, cx| this.set_pointer_at_top(false, cx));
                });
            },
        )
        .absolute()
        .inset_0()
    }

    /// Always in the tree (and the accessibility tree), drawn only while the pointer is in the
    /// top band, which contains the button, so a pointer on it always sees it.
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
            .opacity(if self.pointer_at_top { 1.0 } else { 0.0 })
            .when(self.pointer_at_top, |this| {
                this.hover(move |style| style.bg(hsla(hover)))
            })
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
            .relative()
            .size_full()
            .child(self.content.clone())
            .when(show_close, |this| {
                this.child(self.top_band_tracker(cx))
                    .child(self.corner_close(cx))
            })
    }
}

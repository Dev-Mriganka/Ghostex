//! What the image preview shows in place of a picture it cannot show.

use super::super::images::ChatImageFailure;
use super::super::{appearance::ChatAppearance, transcript::text};
use super::window::ImageViewerWindow;
use crate::app::native_chat::cursor::ChatCursor as _;
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyElement, Context, InteractiveElement as _, IntoElement, ParentElement as _,
    StatefulInteractiveElement as _, Styled as _, div, px, svg,
};
use serde_json::Value;

/// The card never grows past this, however wide the window.
const CARD_MAX_WIDTH: f32 = 560.0;
/// The air kept between the card and the window's edges on a narrow window.
const CARD_GUTTER: f32 = 24.0;

/**
 * The title and sentence for one failure reason.
 *
 * CDXC:SessionChat 2026-10-01 SEE-ALSO:
 * The reasons come from `image_read_failure_reason` in packages/gx-chat-core/src/transcript/images.rs
 * plus the renderer's own `unsupported`, `damaged` and `unavailable`; the phone draws the same words
 * in apps/mobile/app/src/chat/native/cards/ImageUnavailable.tsx.
 */
pub(in crate::app::native_chat) fn failure_copy(
    failure: &ChatImageFailure,
) -> (&'static str, String) {
    match failure.reason.as_str() {
        "missing" => (
            "Image not found",
            "The file was moved or deleted.".to_string(),
        ),
        "tooLarge" => (
            "Can't preview this image",
            "The file is empty or larger than 20 MB.".to_string(),
        ),
        "notImage" => (
            "Can't open this image",
            "The file isn't a recognized image.".to_string(),
        ),
        "unsupported" => (
            "Can't open this image",
            "This image format can't be shown here.".to_string(),
        ),
        "damaged" => (
            "Can't open this image",
            "The file looks damaged or incomplete.".to_string(),
        ),
        "unavailable" => (
            "Image unavailable",
            "There is no file or address to load it from.".to_string(),
        ),
        _ => (
            "Can't open this image",
            if failure.error.trim().is_empty() {
                "The file couldn't be read.".to_string()
            } else {
                failure.error.trim().to_string()
            },
        ),
    }
}

impl ImageViewerWindow {
    /// One labelled button in the card's action row.
    fn card_button(
        &self,
        id: &'static str,
        label: &'static str,
        icon: &'static str,
        p: &ChatAppearance,
        cx: &Context<Self>,
        action: impl Fn(&mut ImageViewerWindow, &mut Context<Self>) + 'static,
    ) -> AnyElement {
        div()
            .id(id)
            .role(gpui::Role::Button)
            .aria_label(label)
            .tab_index(0)
            .h(px(30.0))
            .px(px(12.0))
            .flex()
            .flex_shrink_0()
            .items_center()
            .gap(px(6.0))
            .rounded(px(8.0))
            .border_1()
            .border_color(p.control_border)
            .text_size(px(13.0))
            .text_color(p.foreground)
            .chat_cursor_pointer()
            .hover(|style| style.bg(p.input))
            .focus_visible(|style| style.border_color(p.ring))
            .child(
                svg()
                    .path(icon)
                    .size(px(14.0))
                    .flex_shrink_0()
                    .text_color(p.foreground),
            )
            .child(label)
            .on_click(cx.listener(move |this, _, _, cx| action(this, cx)))
            .into_any_element()
    }

    /**
     * A compact card centred in the preview: an icon, a title that says why, the file's name, and
     * its full path wrapping in small muted text, with the actions that can still help.
     *
     * CDXC:SessionChat 2026-10-01 DECISION:
     * User: a picture that cannot be shown no longer gets one window-wide line ("<path> could not
     * be shown here."); it wraps and shows better. The card is at most 560px wide, the title names
     * the reason (Image not found for a missing file, Can't open this image for one that is there
     * but unreadable), the path breaks anywhere so it never overflows, and it offers Copy path and,
     * only when the file exists, Open image and Show in Finder. Escape and a click outside still
     * close the preview.
     */
    pub(super) fn unavailable_card(
        &self,
        image: &Value,
        failure: &ChatImageFailure,
        completed: Option<&'static str>,
        viewport_width: gpui::Pixels,
        p: &ChatAppearance,
        cx: &Context<Self>,
    ) -> AnyElement {
        let (title, detail) = failure_copy(failure);
        let path = text(image, "path");
        let copy_path = text(image, "copyPath");
        let shown_path = if copy_path.is_empty() {
            path.clone()
        } else {
            copy_path.clone()
        };
        let name = shown_path
            .rsplit(['/', '\\'])
            .find(|segment| !segment.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| text(image, "label"));
        let openable = !path.is_empty() && failure.file_exists();
        let width = (f32::from(viewport_width) - CARD_GUTTER * 2.0).clamp(0.0, CARD_MAX_WIDTH);
        let surface = if p.light {
            gpui::white().opacity(0.96)
        } else {
            gpui::black().opacity(0.6)
        };
        let mut actions = div()
            .flex()
            .flex_wrap()
            .justify_center()
            .gap(px(8.0))
            .pt(px(4.0));
        if !copy_path.is_empty() {
            actions = actions.child(self.card_button(
                "chat-image-missing-copy-path",
                if completed == Some("Path copied") {
                    "Copied"
                } else {
                    "Copy path"
                },
                if completed == Some("Path copied") {
                    "titlebar/check.svg"
                } else {
                    "titlebar/copy.svg"
                },
                p,
                cx,
                |this, cx| this.chat.update(cx, |chat, cx| chat.copy_viewer_path(cx)),
            ));
        }
        if openable {
            actions = actions
                .child(self.card_button(
                    "chat-image-missing-open",
                    "Open image",
                    "titlebar/external-link.svg",
                    p,
                    cx,
                    |this, cx| {
                        this.chat
                            .update(cx, |chat, cx| chat.open_viewer_file(false, cx))
                    },
                ))
                .child(self.card_button(
                    "chat-image-missing-locate",
                    if cfg!(target_os = "macos") {
                        "Show in Finder"
                    } else {
                        "Show in folder"
                    },
                    "titlebar/folder-open.svg",
                    p,
                    cx,
                    |this, cx| {
                        this.chat
                            .update(cx, |chat, cx| chat.open_viewer_file(true, cx))
                    },
                ));
        }
        div()
            .id("chat-image-viewer-unavailable")
            .w(px(width))
            .flex()
            .flex_col()
            .items_center()
            .gap(px(8.0))
            .px(px(24.0))
            .py(px(22.0))
            .rounded(px(14.0))
            .border_1()
            .border_color(p.control_border)
            .bg(surface)
            .text_center()
            // Clicks inside the card are the card's; only the surround dismisses.
            .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_mouse_down(gpui::MouseButton::Right, |_, _, cx| cx.stop_propagation())
            .child(
                div()
                    .size(px(44.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(12.0))
                    .bg(p.input)
                    .child(
                        svg()
                            .path("titlebar/photo-off.svg")
                            .size(px(22.0))
                            .text_color(p.muted),
                    ),
            )
            .child(
                div()
                    .w_full()
                    .pt(px(2.0))
                    .text_size(px(15.0))
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(p.foreground)
                    .child(title),
            )
            .child(
                div()
                    .w_full()
                    .text_size(px(13.0))
                    .text_color(p.muted)
                    .child(detail),
            )
            .when(!name.is_empty(), |card| {
                card.child(
                    div()
                        .w_full()
                        .pt(px(4.0))
                        .text_size(px(13.0))
                        .font_weight(gpui::FontWeight::MEDIUM)
                        .text_color(p.foreground)
                        .child(name),
                )
            })
            .when(!shown_path.is_empty(), |card| {
                card.child(
                    div()
                        .w_full()
                        .px(px(10.0))
                        .py(px(8.0))
                        .rounded(px(8.0))
                        .bg(p.input)
                        .text_size(px(11.5))
                        .line_height(px(16.0))
                        .text_color(p.muted)
                        .child(shown_path.clone()),
                )
            })
            .when(!copy_path.is_empty() || openable, |card| {
                card.child(actions)
            })
            .into_any_element()
    }
}

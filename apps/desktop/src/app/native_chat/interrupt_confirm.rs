//! The "Press Escape again to interrupt" toast a first Escape raises while the core waits for the
//! confirming one (`interrupt` in `packages/gx-chat-core/src/composer/send.rs`).

use super::{appearance::ChatAppearance, state::NativeChatView};
use gpui::{AnyElement, FontWeight, IntoElement, ParentElement as _, Styled as _, div, px};

/// Gap between the toast and the scroll-to-bottom pill when both are up.
const PILL_GAP: f32 = 6.0;

impl NativeChatView {
    /// The toast, centred at the bottom of the conversation region, or `None` when no Escape is
    /// waiting. Visual only: it has no id and no handlers, so it registers no hitbox and the
    /// transcript under it keeps its clicks and scrolling.
    pub(super) fn render_interrupt_confirm(&self) -> Option<AnyElement> {
        let text = self.snapshot["interruptConfirm"].as_str()?.to_string();
        // Opaque even under window glass: the toast sits over transcript text and must read.
        let p = ChatAppearance::current(&self.snapshot);
        let s = p.scale;
        let (pill_shown, pill_height, pill_bottom) = self.scroll_bottom_pill_extent();
        let bottom = if pill_shown {
            pill_bottom + pill_height + PILL_GAP
        } else {
            pill_bottom
        };
        let outline = if p.light {
            gpui::black().opacity(0.08)
        } else {
            gpui::white().opacity(0.08)
        };
        Some(
            div()
                .absolute()
                .bottom(px(bottom * s))
                .w_full()
                .flex()
                .justify_center()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .h(px(28.0 * s))
                        .px(px(12.0 * s))
                        .rounded(px(8.0 * s))
                        .border_1()
                        .border_color(outline)
                        .bg(p.composer_background)
                        .shadow_md()
                        .text_color(p.primary)
                        .text_size(px(12.0 * s))
                        .font_weight(FontWeight::MEDIUM)
                        .whitespace_nowrap()
                        .child(text),
                )
                .into_any_element(),
        )
    }
}

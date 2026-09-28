//! Search by Prompt's colours: the Session Chat tokens the React page resolved (`.ghostex-find-scope`
//! in packages/core-ui/styles/find.css on the `plain-dark` / `plain-light` sidebar themes), and the
//! lifted palette packages/core-ui/styles/modals-glass.css gave it under window glass.
use crate::app::window::native_modal_kit::MODAL_UI_FONT;
use crate::app::window::native_modal_kit::{modal_rgba, rgba_of};
use gpui::{Rgba, SharedString};

#[derive(Clone, Copy)]
pub(crate) struct FindPalette {
    pub(crate) light: bool,
    pub(crate) background: Rgba,
    pub(crate) foreground: Rgba,
    pub(crate) muted: Rgba,
    /// `--border` and the `border/60` hairlines between the toolbar, list and bottom pane.
    pub(crate) border: Rgba,
    pub(crate) hairline: Rgba,
    pub(crate) accent: Rgba,
    /// The query chevron (`--primary`).
    pub(crate) primary: Rgba,
    pub(crate) popover: Rgba,
    pub(crate) popover_border: Rgba,
    /// An outline button's fill at rest and on hover.
    pub(crate) button: Rgba,
    pub(crate) button_hover: Rgba,
    /// The filter menu's search field (`input/30`) and its focus border and ring.
    pub(crate) field: Rgba,
    pub(crate) field_border: Rgba,
    pub(crate) field_ring: Rgba,
    pub(crate) destructive: Rgba,
    /// The matched/total pill.
    pub(crate) pill: Rgba,
    pub(crate) pill_outline: Rgba,
    pub(crate) pill_highlight: Rgba,
    /// Matched characters in a row's prompt.
    pub(crate) matched: Rgba,
    /// `text-amber-400` for the favorite star.
    pub(crate) favorite: Rgba,
}

impl FindPalette {
    /// `light` is the Session Chat theme (the React page's `theme` parameter); `glass` is window
    /// glass, which only lifts the dark palette.
    pub(crate) fn resolve(light: bool, glass: bool) -> Self {
        if light {
            let foreground = modal_rgba(0x262626, 1.0);
            return Self {
                light,
                background: modal_rgba(0xffffff, 1.0),
                foreground,
                muted: modal_rgba(0x636363, 1.0),
                border: modal_rgba(0x000000, 0.14),
                hairline: modal_rgba(0x000000, 0.084),
                accent: modal_rgba(0xe9e9e9, 1.0),
                primary: foreground,
                popover: modal_rgba(0xffffff, 1.0),
                popover_border: modal_rgba(0x000000, 0.12),
                button: modal_rgba(0xffffff, 1.0),
                button_hover: modal_rgba(0xf1f1f1, 1.0),
                field: modal_rgba(0x000000, 0.042),
                field_border: modal_rgba(0x9d9d9d, 1.0),
                field_ring: modal_rgba(0x9d9d9d, 0.2),
                destructive: modal_rgba(0xb91c1c, 1.0),
                pill: modal_rgba(0xffffff, 1.0),
                pill_outline: modal_rgba(0x000000, 0.08),
                pill_highlight: modal_rgba(0x000000, 0.0),
                matched: modal_rgba(0x8a5800, 1.0),
                favorite: modal_rgba(0xffb900, 1.0),
            };
        }
        let dark = Self {
            light,
            background: modal_rgba(0x0e0e0e, 1.0),
            foreground: modal_rgba(0xc8cdd5, 1.0),
            muted: modal_rgba(0x747b85, 1.0),
            border: modal_rgba(0xffffff, 0.11),
            hairline: modal_rgba(0xffffff, 0.066),
            accent: modal_rgba(0x262626, 1.0),
            primary: modal_rgba(0xe5e5e5, 1.0),
            popover: modal_rgba(0x0e0e0e, 1.0),
            popover_border: modal_rgba(0xffffff, 0.12),
            button: modal_rgba(0x000000, 0.0),
            button_hover: modal_rgba(0xffffff, 0.045),
            field: modal_rgba(0xffffff, 0.045),
            field_border: modal_rgba(0x737373, 1.0),
            field_ring: modal_rgba(0x737373, 0.2),
            destructive: modal_rgba(0xff6467, 1.0),
            pill: modal_rgba(0x141414, 1.0),
            pill_outline: modal_rgba(0xffffff, 0.05),
            pill_highlight: modal_rgba(0xffffff, 0.03),
            matched: modal_rgba(0xe3b341, 1.0),
            favorite: modal_rgba(0xffb900, 1.0),
        };
        if !glass {
            return dark;
        }
        Self {
            background: modal_rgba(0x2b2b2b, 1.0),
            muted: modal_rgba(0x9ca2ab, 1.0),
            border: modal_rgba(0xffffff, 0.13),
            hairline: modal_rgba(0xffffff, 0.078),
            accent: modal_rgba(0x3d3d3d, 1.0),
            popover: modal_rgba(0x313131, 1.0),
            pill: modal_rgba(0x383838, 1.0),
            pill_outline: modal_rgba(0xffffff, 0.10),
            ..dark
        }
    }

    /// `color-mix(in srgb, var(--foreground) N%, transparent)`.
    pub(crate) fn foreground_at(&self, alpha: f32) -> Rgba {
        rgba_of(self.foreground, alpha)
    }

    pub(crate) fn accent_at(&self, alpha: f32) -> Rgba {
        rgba_of(self.accent, alpha)
    }

    pub(crate) fn background_at(&self, alpha: f32) -> Rgba {
        rgba_of(self.background, alpha)
    }
}

/// The chat font setting the React page read (`--ghostex-find-font-family`), or the system UI font.
pub(crate) fn find_prompts_font_family(setting: &str) -> SharedString {
    let family = setting
        .split(',')
        .next()
        .unwrap_or_default()
        .trim()
        .trim_matches(|character| character == '"' || character == '\'');
    match family {
        "" | "system-ui" | "ui-sans-serif" | "sans-serif" | "-apple-system" => {
            SharedString::new_static(MODAL_UI_FONT)
        }
        family => SharedString::from(family.to_string()),
    }
}

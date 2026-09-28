//! The app modules the Docs files reach through `crate::app::…`, with stand-ins for the pieces
//! that belong to the rest of the app. Each `#[path]` include sits in a file of this folder so it
//! resolves from a directory that exists: macOS will not walk `..` through the missing
//! `src/bin/app/` an inline `mod app { … }` in the crate root would start from.

pub(crate) mod native_chat {
    pub(crate) mod fonts {
        pub(crate) const CHAT_MONO: &str = "JetBrainsMono Nerd Font";
    }
    pub(crate) mod markdown_style {
        use gpui_component::highlighter::HighlightTheme;
        use std::sync::{Arc, LazyLock};

        #[derive(serde::Deserialize)]
        struct CodeThemes {
            dark: HighlightTheme,
            light: HighlightTheme,
        }

        static THEMES: LazyLock<(Arc<HighlightTheme>, Arc<HighlightTheme>)> = LazyLock::new(|| {
            let themes: CodeThemes = serde_json::from_str(include_str!(
                "../../../../../packages/gx-chat-core/visual/code-theme.json"
            ))
            .expect("shared code theme");
            (Arc::new(themes.dark), Arc::new(themes.light))
        });

        pub(crate) fn highlight_theme(light: bool) -> Arc<HighlightTheme> {
            if light {
                THEMES.1.clone()
            } else {
                THEMES.0.clone()
            }
        }
    }
}
#[path = "helpers.rs"]
pub(crate) mod helpers;
#[path = "native_docs.rs"]
pub(crate) mod native_docs;
#[path = "window.rs"]
pub(crate) mod window;

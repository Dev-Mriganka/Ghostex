//! Whether a built-in extension (an entry of `GHOSTEX_OFFICIAL_EXTENSIONS`) is on, and what a
//! whole-feature entry takes with it when it is off: its Settings pages, its rows on other pages and
//! its hotkeys. The desktop, the GPUI web build, gx-core (Quick Access) and gxserver (`ghostex`
//! verbs, `ghostex settings`) all ask here, so one switch means the same thing everywhere.
//!
//! A whole-feature entry has `placement: "feature"` and lists what it owns:
//! `settingsPages` (Settings page ids), `settingKeys` (rows on other pages) and `hotkeys` (hotkey
//! ids). Adding another feature is one entry in `data/official_extensions.rs`; the readers below and
//! the Settings window pick it up without new code.
//!
//! CDXC:Extensions 2026-10-01 DECISION:
//! User: "We need to simplify the app." Actions, Open In and Spaces become built-in extensions with an on/off switch on Settings > Extensions. Turning one off disables the whole feature: its Settings pages and rows, its header button, its hotkeys, its Quick Access rows and menus, and its `ghostex` verbs (which say it is turned off). Its saved configuration is kept, so turning it back on restores everything. More features are expected to follow with one entry each.
//! SEE-ALSO: packages/settings-catalog/src/data/official_extensions.rs, apps/desktop/src/app/window/settings_modal/tabs/extensions/sections.rs, server/src/ghostex_cli/built_in_extensions.rs.

use crate::data::GHOSTEX_OFFICIAL_EXTENSIONS;
use crate::json::J;
use serde_json::{Map, Value};

/// The Actions feature (Start button, Settings > Actions, action hotkeys). The id predates the
/// rename and is kept because view scopes are stored under it.
pub const ACTIONS: &str = "quickActions";
/// The Open In feature (Open button, Settings > Open In, Open In menus).
pub const OPEN_IN: &str = "openIn";
/// Spaces (the sidebar's Space row, Space menus and Settings rows).
pub const SPACES: &str = "spaces";

fn entry(id: &str) -> Option<&'static J> {
    GHOSTEX_OFFICIAL_EXTENSIONS
        .as_array()
        .iter()
        .find(|entry| entry.get("id").and_then(J::as_str) == Some(id))
}

fn strings(entry: &'static J, key: &str) -> impl Iterator<Item = &'static str> {
    entry
        .get(key)
        .map(J::as_array)
        .unwrap_or(&[])
        .iter()
        .filter_map(J::as_str)
}

fn features() -> impl Iterator<Item = &'static J> {
    GHOSTEX_OFFICIAL_EXTENSIONS
        .as_array()
        .iter()
        .filter(|entry| entry.get("placement").and_then(J::as_str) == Some("feature"))
}

/// The setting that switches `id` on or off, and whether `true` means on (`settingsKeyEnables`)
/// rather than the usual inverted "hidden" key.
pub fn switch_key(id: &str) -> Option<(&'static str, bool)> {
    let entry = entry(id)?;
    let key = entry.get("settingsKey").and_then(J::as_str)?;
    Some((key, entry.get("settingsKeyEnables") == Some(&J::Bool(true))))
}

/// Whether built-in extension `id` is on, reading saved values through `read` and falling back to
/// the catalog default. An unknown id counts as on.
pub fn enabled_with(id: &str, read: impl Fn(&str) -> Option<bool>) -> bool {
    let Some((key, enables)) = switch_key(id) else {
        return true;
    };
    let value = read(key).unwrap_or_else(|| crate::default_value(key) == Some(&J::Bool(true)));
    value == enables
}

/// [`enabled_with`] over a settings object (the settings file or the desktop's snapshot).
pub fn enabled(settings: &Map<String, Value>, id: &str) -> bool {
    enabled_with(id, |key| settings.get(key).and_then(Value::as_bool))
}

/// [`enabled`] over any settings value; a missing or non-object value reads the defaults.
pub fn enabled_in_value(settings: Option<&Value>, id: &str) -> bool {
    enabled_with(id, |key| {
        settings
            .and_then(|settings| settings.get(key))
            .and_then(Value::as_bool)
    })
}

/// The whole-feature entry that owns Settings page `page_id`, if any.
pub fn feature_owning_page(page_id: &str) -> Option<&'static str> {
    features()
        .find(|entry| strings(entry, "settingsPages").any(|page| page == page_id))
        .and_then(|entry| entry.get("id").and_then(J::as_str))
}

/// The whole-feature entry that owns hotkey `hotkey_id`, if any.
pub fn feature_owning_hotkey(hotkey_id: &str) -> Option<&'static str> {
    features()
        .find(|entry| strings(entry, "hotkeys").any(|owned| owned == hotkey_id))
        .and_then(|entry| entry.get("id").and_then(J::as_str))
}

/// Every row (setting key) owned by a whole-feature extension that is off, for a Settings search
/// to leave out.
pub fn hidden_setting_keys_with(read: impl Fn(&str) -> Option<bool>) -> Vec<&'static str> {
    features()
        .filter(|entry| {
            entry
                .get("id")
                .and_then(J::as_str)
                .is_some_and(|id| !enabled_with(id, &read))
        })
        .flat_map(|entry| strings(entry, "settingKeys"))
        .collect()
}

/// Settings page `page_id` shows: no feature owns it, or its feature is on.
pub fn page_shown_with(page_id: &str, read: impl Fn(&str) -> Option<bool>) -> bool {
    feature_owning_page(page_id).is_none_or(|id| enabled_with(id, read))
}

/// Hotkey `hotkey_id` is listed and fires: no feature owns it, or its feature is on.
pub fn hotkey_shown_with(hotkey_id: &str, read: impl Fn(&str) -> Option<bool>) -> bool {
    feature_owning_hotkey(hotkey_id).is_none_or(|id| enabled_with(id, read))
}

/// The customer-facing name of built-in extension `id` (its card title).
pub fn title(id: &str) -> &'static str {
    entry(id)
        .and_then(|entry| entry.get("title").and_then(J::as_str))
        .unwrap_or("This feature")
}

/// The one sentence every surface shows when something belongs to a feature that is off.
pub fn turned_off_message(id: &str) -> String {
    format!(
        "{} is turned off. Turn it on in Settings > Extensions.",
        title(id)
    )
}

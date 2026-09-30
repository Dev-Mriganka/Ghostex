//! The Settings pages. Each page is an entity implementing `Render` and `SettingsPage`; the shell
//! creates it the first time its page opens (docs/2026-09-28/gpui-modals-migration/SETTINGS-ARCH.md).
pub(crate) mod about;
pub(crate) mod accounts;
pub(crate) mod actions;
pub(crate) mod agents;
pub(crate) mod debugging;
pub(crate) mod extensions;
pub(crate) mod general;
pub(crate) mod hotkeys;
pub(crate) mod integrations;
pub(crate) mod open_targets;
pub(crate) mod os_integration;
pub(crate) mod projects;
pub(crate) mod remote;
pub(crate) mod theme;

use super::model::SettingsTabId;
use super::store::SettingsStore;
use gpui::{AnyView, App, AppContext as _, Entity, Window};

/// Creates the view of page `tab`.
pub(crate) fn settings_tab_view(
    tab: SettingsTabId,
    store: &Entity<SettingsStore>,
    window: &mut Window,
    cx: &mut App,
) -> AnyView {
    match tab {
        SettingsTabId::General => cx
            .new(|cx| general::GeneralTab::new(store.clone(), window, cx))
            .into(),
        SettingsTabId::Remote => remote::remote_tab_view(store, window, cx),
        SettingsTabId::Projects => projects::projects_tab_view(store, window, cx),
        SettingsTabId::Agents => agents::agents_tab_view(store, window, cx),
        SettingsTabId::Actions => actions::actions_tab_view(store, window, cx),
        SettingsTabId::About => about::about_tab_view(store, cx),
        SettingsTabId::Debugging => debugging::debugging_tab_view(store, cx),
        SettingsTabId::Integrations => integrations::integrations_tab_view(store, cx),
        SettingsTabId::Hotkeys => hotkeys::hotkeys_tab_view(store, cx),
        SettingsTabId::Theme => theme::theme_tab_view(store, window, cx),
        SettingsTabId::OpenTargets => open_targets::open_targets_tab_view(store, window, cx),
        SettingsTabId::OsIntegration => os_integration::os_integration_tab_view(store, cx),
        SettingsTabId::Extensions => extensions::extensions_tab_view(store, window, cx),
        SettingsTabId::Accounts => accounts::accounts_tab_view(store, window, cx),
        // TAB-ARMS: one arm per page.
    }
}

//! The Agents page (packages/core-ui/settings-modal/tabs/agents.tsx): the Config card (Default
//! Prompt Agent, Title Generation Agent and its custom command, Agent approvals with the Skip
//! permissions? confirmation) and the Agents roster (session resume hooks toolbar, one
//! drag-to-reorder row per launcher with its hook status and CLI action, the expanded panel with
//! the agent CLI controls, hook, permission mode, default interface and agent actions), or the
//! agent editor in its place.
//!
//! Like the React tab panel, the page forgets its view state (open rows, the editor, CLI answers,
//! a dragged order) when another page is shown; hook status belongs to the modal and stays.
mod cli;
mod config;
mod editor;
mod logos;
mod model;
mod panel;
mod roster;
mod select;

use super::super::fields::{FieldStates, SettingsPage};
use super::super::model::SettingsTabId;
use super::super::page::{PageBlock, settings_page};
use super::super::rail::{rail_pages, render_no_matches};
use super::super::search::should_show_section;
use super::super::store::{SettingsStore, SettingsStoreEvent};
use gpui::{
    AnyView, App, AppContext as _, Context, Entity, FocusHandle, IntoElement, ParentElement as _,
    Render, SharedString, Styled as _, Window, div,
};
use serde_json::json;
use std::collections::HashMap;

/// The icon paths the page draws (Tabler icons in assets/modals/settings/).
mod icons {
    pub(super) const ALERT_TRIANGLE: &str = "modals/settings/alert-triangle.svg";
    pub(super) const CHEVRON_DOWN: &str = "modals/settings/chevron-down.svg";
    pub(super) const CIRCLE_CHECK_FILLED: &str = "modals/settings/circle-check-filled.svg";
    pub(super) const CIRCLE_X: &str = "modals/settings/circle-x.svg";
    pub(super) const CODE_DOTS: &str = "modals/settings/code-dots.svg";
    pub(super) const DOWNLOAD: &str = "modals/settings/download.svg";
    pub(super) const EXTERNAL_LINK: &str = "modals/settings/external-link.svg";
    pub(super) const GRIP_VERTICAL: &str = "modals/settings/grip-vertical.svg";
    pub(super) const INFO_CIRCLE: &str = "modals/settings/info-circle.svg";
    pub(super) const MESSAGE_CIRCLE: &str = "modals/settings/message-circle.svg";
    pub(super) const PENCIL: &str = "modals/settings/pencil.svg";
    pub(super) const PLUS: &str = "modals/settings/plus.svg";
    pub(super) const REFRESH: &str = "modals/settings/refresh.svg";
    pub(super) const SEARCH: &str = "modals/settings/search.svg";
    pub(super) const SELECTOR: &str = "modals/settings/selector.svg";
    pub(super) const TRASH: &str = "modals/settings/trash.svg";
    pub(super) const X: &str = "modals/settings/x.svg";
}

/// The anchor of the Agents roster section (the `agentHooks` deep link lands on it).
const ROSTER_ANCHOR: &str = "agentList";

/// Creates the Agents page view.
pub(crate) fn agents_tab_view(
    store: &Entity<SettingsStore>,
    window: &mut Window,
    cx: &mut App,
) -> AnyView {
    cx.new(|cx| AgentsTab::new(store.clone(), window, cx))
        .into()
}

pub(crate) struct AgentsTab {
    store: Entity<SettingsStore>,
    fields: FieldStates,
    /// The page is the one shown (`isActive`).
    active: bool,
    /// `agentHookStatusLoading` of the modal host: set when a hook request is posted, cleared when
    /// a complete `agentHookStatus` arrives.
    hook_status_loading: bool,
    /// Agent ids whose row is expanded (CDXC:AgentHooks 2026-08-28: every row starts collapsed).
    expanded: Vec<String>,
    /// `draftAgentIds`: the order after a drop, until the synced roster catches up.
    draft_agent_ids: Option<Vec<String>>,
    synced_agent_ids: Vec<String>,
    editor: Option<editor::AgentEditor>,
    /// The Skip permissions? confirmation is open.
    confirming_bypass: bool,
    confirm_focus: FocusHandle,
    cli: cli::CliModel,
    dropdowns: HashMap<SharedString, select::DropdownState>,
    /// `lastTargetedAgentsSectionRef`.
    last_targeted_section: Option<String>,
    /// The preview binary's page state was applied.
    preview_applied: bool,
    /// A dropdown to open on its next render (the preview binary's dropdown states).
    pending_open_dropdown: Option<String>,
}

impl AgentsTab {
    fn new(store: Entity<SettingsStore>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        cx.observe_in(&store, window, |page: &mut Self, _, window, cx| {
            page.sync_active(window, cx);
            cx.notify();
        })
        .detach();
        cx.subscribe(
            &store,
            |page: &mut Self, store, event: &SettingsStoreEvent, cx| {
                match event {
                    SettingsStoreEvent::HostPayload(kind) if kind == "agentHookStatus" => {}
                    _ => return,
                }
                {
                    // A partial post of the host's provider walk says `complete: false`.
                    let complete = store
                        .read(cx)
                        .host_payload("agentHookStatus")
                        .and_then(|payload| payload.get("complete"))
                        .and_then(serde_json::Value::as_bool)
                        != Some(false);
                    if complete {
                        page.hook_status_loading = false;
                    }
                    cx.notify();
                }
            },
        )
        .detach();
        let mut page = Self {
            store,
            fields: FieldStates::default(),
            active: false,
            hook_status_loading: false,
            expanded: Vec::new(),
            draft_agent_ids: None,
            synced_agent_ids: Vec::new(),
            editor: None,
            confirming_bypass: false,
            confirm_focus: cx.focus_handle(),
            cli: cli::CliModel::default(),
            dropdowns: HashMap::new(),
            last_targeted_section: None,
            preview_applied: false,
            pending_open_dropdown: None,
        };
        page.sync_active(window, cx);
        page
    }

    /// Follows the shown page: entering it asks for hook status (once per modal) and the CLI list;
    /// leaving it drops the page's view state, as the unmounted React tab panel did.
    fn sync_active(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let active = self.store.read(cx).active_tab() == SettingsTabId::Agents;
        if active == self.active {
            if active {
                self.follow_deep_link(cx);
            }
            return;
        }
        self.active = active;
        if !active {
            self.expanded.clear();
            self.draft_agent_ids = None;
            self.editor = None;
            self.confirming_bypass = false;
            self.cli_reset();
            self.dropdowns.clear();
            self.last_targeted_section = None;
            return;
        }
        // Like the React effects, the requests go out after the page is mounted.
        cx.spawn(async move |this, cx| {
            let _ = this.update(cx, |page, cx| {
                if !page.active {
                    return;
                }
                let has_status = page
                    .store
                    .read(cx)
                    .host_payload("agentHookStatus")
                    .is_some();
                if !has_status && !page.hook_status_loading {
                    page.request_hook_status(cx);
                }
                page.cli_list_refresh(cx);
            });
        })
        .detach();
        self.apply_preview_state(window, cx);
        self.follow_deep_link(cx);
    }

    /// `initialAgentsSection`: close an open editor first, then scroll the roster into view once
    /// per visit.
    fn follow_deep_link(&mut self, cx: &mut Context<Self>) {
        let Some(section) = self.store.read(cx).request().initial_agents_section.clone() else {
            return;
        };
        if self.last_targeted_section.as_deref() == Some(section.as_str()) {
            return;
        }
        if self.editor.is_some() {
            self.editor = None;
            cx.notify();
        }
        self.last_targeted_section = Some(section);
        self.store.update(cx, |store, cx| {
            store.scroll_to_section(SettingsTabId::Agents, ROSTER_ANCHOR, cx)
        });
    }

    /// `onRequestAgentHookStatus`.
    fn request_hook_status(&mut self, cx: &mut Context<Self>) {
        self.hook_status_loading = true;
        self.post(json!({ "type": "requestAgentHookStatus" }), cx);
    }

    /// `onInstallAgentHooks(agentIds)`; `None` installs every hook.
    fn install_hooks(&mut self, agent_ids: Option<Vec<String>>, cx: &mut Context<Self>) {
        self.hook_status_loading = true;
        self.post(
            json!({ "agentIds": agent_ids, "type": "installAgentHooks" }),
            cx,
        );
    }

    /// `onUninstallAgentHooks(agentIds)`; `None` removes every Ghostex hook.
    fn uninstall_hooks(&mut self, agent_ids: Option<Vec<String>>, cx: &mut Context<Self>) {
        self.hook_status_loading = true;
        self.post(
            json!({ "agentIds": agent_ids, "type": "uninstallAgentHooks" }),
            cx,
        );
    }

    fn post(&self, message: serde_json::Value, cx: &mut Context<Self>) {
        self.store
            .update(cx, |store, cx| store.post_message(message, cx));
    }

    fn save(&self, key: &str, value: serde_json::Value, cx: &mut Context<Self>) {
        self.store
            .update(cx, |store, cx| store.update_setting(key, value, cx));
    }

    /// The preview binary's page states (`preview_state`): open rows, the editor, the confirmation.
    fn apply_preview_state(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.preview_applied {
            return;
        }
        self.preview_applied = true;
        let Some(state) = self.store.read(cx).request().preview_state.clone() else {
            return;
        };
        match state.as_str() {
            "agents-expanded" => self.expanded = vec!["codex".into(), "claude".into()],
            "agents-clis" => {
                self.expanded = vec!["zcode".into(), "claude".into(), "pi".into(), "grok".into()]
            }
            "agents-cli-running" => self.expanded = vec!["gemini".into()],
            "agents-cli-failed" => self.expanded = vec!["grok".into()],
            "agents-editor-new" => self.open_editor(None, window, cx),
            "agents-editor-edit" => {
                let agents = model::agents_from_hud(self.store.read(cx).hud());
                if let Some(agent) = agents.into_iter().find(|agent| agent.agent_id == "codex") {
                    self.open_editor(Some(agent), window, cx);
                }
            }
            "agents-skip-confirm" => self.confirming_bypass = true,
            "agents-prompt-dropdown" => {
                self.pending_open_dropdown = Some("defaultPromptAgent".to_string())
            }
            "agents-type-dropdown" => {
                let agents = model::agents_from_hud(self.store.read(cx).hud());
                if let Some(agent) = agents.into_iter().find(|agent| agent.agent_id == "codex") {
                    self.open_editor(Some(agent), window, cx);
                }
                self.pending_open_dropdown = Some("agent-editor-type".to_string());
            }
            _ => {}
        }
    }
}

impl SettingsPage for AgentsTab {
    fn settings_store(&self) -> &Entity<SettingsStore> {
        &self.store
    }

    fn field_states(&mut self) -> &mut FieldStates {
        &mut self.fields
    }
}

impl Render for AgentsTab {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (p, search, matching_pages) = {
            let store = self.store.read(cx);
            let matching: Vec<SettingsTabId> = if store.is_searching() {
                rail_pages(store).into_iter().map(|page| page.tab).collect()
            } else {
                Vec::new()
            };
            (
                store.palette(),
                store.tab_search(SettingsTabId::Agents),
                matching,
            )
        };
        let mut blocks: Vec<PageBlock> = Vec::new();
        if search.tab.is_searching && !search.tab.has_visible() {
            let store = self.store.clone();
            blocks.push(PageBlock::plain(render_no_matches(
                &p,
                SettingsTabId::Agents,
                &matching_pages,
                move |tab, _window, cx| {
                    store.update(cx, |store, cx| store.set_active_tab(tab, cx));
                },
            )));
        }
        if self.editor.is_none() && should_show_section(&search.section("config"), true) {
            if let Some(section) = self.render_config(&p, &search, window, cx) {
                blocks.push(PageBlock::section("config", section));
            }
        }
        if self.editor.is_some() || should_show_section(&search.section("agentList"), true) {
            if let Some(section) = self.render_roster(&p, window, cx) {
                blocks.push(PageBlock::section(ROSTER_ANCHOR, section));
            }
        }
        let dialog = self.render_bypass_dialog(&p, window, cx);
        div()
            .size_full()
            .child(settings_page(
                &self.store,
                SettingsTabId::Agents,
                &p,
                blocks,
                cx,
            ))
            .children(dialog)
    }
}

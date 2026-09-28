//! The expanded panel of an Agents row (`settings-list-panel`): the agent CLI controls, the
//! session resume hook, Permission mode, Default interface (chat-capable agents only,
//! CDXC:AgentProviders 2026-08-27) and the Edit/Remove agent actions. Its rows sit inside the
//! list inset, so they drop their own side padding and divide with hairlines.
use super::super::super::super::native_modal_kit::*;
use super::super::super::fields::{
    ButtonSize, ButtonVariant, ROW_PADDING_X, RowSpec, SELECT_WIDTH, setting_row,
    settings_button_sized, settings_list_item, settings_select,
};
use super::super::super::palette::SettingsPalette;
use super::AgentsTab;
use super::icons;
use super::model::{
    AgentButton, HookStatusItem, accept_all_mode_options, hook_removable, inherit_value,
    preferred_interface_override_options, supports_accept_all, supports_chat_view,
};
use super::roster::hook_detail_icon;
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyElement, Context, IntoElement, ParentElement as _, SharedString, Styled as _, Window, div,
    px,
};
use gpui_component::{h_flex, v_flex};
use serde_json::{Map, Value, json};

/// A setting row or list item inside the panel: the row's own 20px sides are given back.
fn panel_child(element: AnyElement) -> AnyElement {
    div()
        .mx(px(-ROW_PADDING_X))
        .child(element)
        .into_any_element()
}

impl AgentsTab {
    /// `saveAgent` for a changed permission mode: the agent as it is with the new mode.
    fn save_agent_mode(&mut self, agent: &AgentButton, mode: String, cx: &mut Context<Self>) {
        let mut message = json!({
            "acceptAllMode": mode,
            "agentId": agent.agent_id,
            "command": agent.command.clone().unwrap_or_default(),
            "name": agent.name,
            "type": "saveSidebarAgent",
        });
        if let Some(icon) = &agent.icon {
            message["icon"] = json!(icon);
        }
        self.post(message, cx);
        self.editor = None;
        cx.notify();
    }

    /// CDXC:AgentProviders 2026-08-27 (agents.tsx): Inherit is an absent key, never a stored
    /// third value, so an untouched agent keeps following the global Default Agent View.
    fn set_interface_override(&mut self, agent_id: &str, value: String, cx: &mut Context<Self>) {
        let mut overrides: Map<String, Value> = self
            .store
            .read(cx)
            .value("preferredAgentInterfaceOverrides")
            .as_object()
            .cloned()
            .unwrap_or_default();
        if value == inherit_value() {
            overrides.remove(agent_id);
        } else {
            overrides.insert(agent_id.to_string(), json!(value));
        }
        self.save(
            "preferredAgentInterfaceOverrides",
            Value::Object(overrides),
            cx,
        );
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn render_agent_panel(
        &mut self,
        p: &SettingsPalette,
        agent: &AgentButton,
        hook_agent: Option<&str>,
        hook_status: Option<&HookStatusItem>,
        pending: bool,
        cli_agent: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let agent_id = agent.agent_id.clone();
        let loading = self.hook_status_loading;
        let mut children: Vec<AnyElement> = Vec::new();
        if let Some(controls) = self.render_cli_controls(p, cli_agent, window, cx) {
            children.push(controls);
        }
        if let Some(hook) = hook_agent {
            let hook_installed = hook_status.is_some_and(|status| status.status == "installed");
            let label = if hook_installed {
                "Reinstall"
            } else if hook_status.is_some_and(|status| status.status == "updateRequired") {
                "Update hook"
            } else {
                "Install hook"
            };
            let loading_reason: SharedString = "Hook status is being checked.".into();
            let install_hook = hook.to_string();
            let mut controls =
                h_flex()
                    .flex_wrap()
                    .justify_end()
                    .gap(px(8.0))
                    .child(settings_button_sized(
                        p,
                        SharedString::from(format!("agent-hook-install-{agent_id}")),
                        label,
                        Some(if hook_installed {
                            icons::REFRESH
                        } else {
                            icons::DOWNLOAD
                        }),
                        ButtonVariant::Outline,
                        ButtonSize::Sm,
                        loading,
                        Some(loading_reason.clone()),
                        move |page: &mut Self, _window, cx| {
                            page.install_hooks(Some(vec![install_hook.clone()]), cx);
                            cx.notify();
                        },
                        cx,
                    ));
            if hook_removable(hook_status) {
                let uninstall_hook = hook.to_string();
                controls = controls.child(settings_button_sized(
                    p,
                    SharedString::from(format!("agent-hook-uninstall-{agent_id}")),
                    "Uninstall hook",
                    Some(icons::TRASH),
                    ButtonVariant::Destructive,
                    ButtonSize::Sm,
                    loading,
                    Some(loading_reason),
                    move |page: &mut Self, _window, cx| {
                        page.uninstall_hooks(Some(vec![uninstall_hook.clone()]), cx);
                        cx.notify();
                    },
                    cx,
                ));
            }
            let detail = h_flex()
                .min_w_0()
                .items_center()
                .gap(px(6.0))
                .child(hook_detail_icon(
                    p,
                    hook_status,
                    pending,
                    &format!("agent-hook-detail-{agent_id}"),
                ))
                .child(
                    div()
                        .min_w_0()
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .child(
                            hook_status
                                .map(|status| status.detail.clone())
                                .unwrap_or_else(|| "Waiting for hook check".to_string()),
                        ),
                )
                .into_any_element();
            children.push(panel_child(settings_list_item(
                p,
                None,
                None,
                "Session resume hook",
                Some(detail),
                Some(controls.into_any_element()),
            )));
        }
        let accept_supported = supports_accept_all(&agent.agent_id, agent.icon.as_deref());
        let mode = agent
            .accept_all_mode
            .clone()
            .unwrap_or_else(|| "inherit".to_string());
        let mode_agent = agent.clone();
        let mode_select = settings_select(
            self,
            p,
            SharedString::from(format!("agent-permission-{agent_id}")),
            &accept_all_mode_options(),
            &mode,
            Some(SELECT_WIDTH),
            !accept_supported,
            Some("This agent doesn’t support approval policy changes.".into()),
            move |page: &mut Self, value, _window, cx| page.save_agent_mode(&mode_agent, value, cx),
            window,
            cx,
        );
        children.push(panel_child(setting_row(
            p,
            SharedString::from(format!("agent-permission-row-{agent_id}")),
            RowSpec::new("Permission mode")
                .description("How the agent handles approvals when Ghostex starts it."),
            None,
            mode_select,
            cx,
        )));
        if supports_chat_view(&agent.agent_id, agent.icon.as_deref()) {
            let (global, overrides) = {
                let store = self.store.read(cx);
                (
                    store.string("preferredAgentInterface"),
                    store.value("preferredAgentInterfaceOverrides"),
                )
            };
            let value = overrides
                .get(&agent_id)
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(inherit_value);
            let interface_agent = agent_id.clone();
            let select = settings_select(
                self,
                p,
                SharedString::from(format!("agent-interface-{agent_id}")),
                &preferred_interface_override_options(&global),
                &value,
                Some(SELECT_WIDTH),
                false,
                None,
                move |page: &mut Self, value, _window, cx| {
                    page.set_interface_override(&interface_agent, value, cx)
                },
                window,
                cx,
            );
            children.push(panel_child(setting_row(
                p,
                SharedString::from(format!("agent-interface-row-{agent_id}")),
                RowSpec::new("Default interface").description(
                    "Open this agent in Chat or Terminal, or follow the app-wide default.",
                ),
                None,
                select,
                cx,
            )));
        }
        let edit_agent = agent.clone();
        let delete_id = agent_id.clone();
        let actions = h_flex()
            .flex_wrap()
            .justify_end()
            .gap(px(8.0))
            .child(settings_button_sized(
                p,
                SharedString::from(format!("agent-edit-{agent_id}")),
                "Edit agent",
                Some(icons::PENCIL),
                ButtonVariant::Outline,
                ButtonSize::Sm,
                false,
                None,
                move |page: &mut Self, window, cx| {
                    page.open_editor(Some(edit_agent.clone()), window, cx);
                    cx.notify();
                },
                cx,
            ))
            .child(settings_button_sized(
                p,
                SharedString::from(format!("agent-delete-{agent_id}")),
                "Remove agent",
                Some(icons::TRASH),
                ButtonVariant::Destructive,
                ButtonSize::Sm,
                false,
                None,
                move |page: &mut Self, _window, cx| {
                    page.post(
                        json!({ "agentId": delete_id, "type": "deleteSidebarAgent" }),
                        cx,
                    );
                },
                cx,
            ));
        children.push(panel_child(settings_list_item(
            p,
            None,
            None,
            "Agent",
            None,
            Some(actions.into_any_element()),
        )));
        let hairline = hsla(p.hairline);
        v_flex()
            .w_full()
            .border_t_1()
            .border_color(hsla(css_fade(p.hairline, 0.7)))
            .children(children.into_iter().enumerate().map(|(index, child)| {
                div()
                    .w_full()
                    .when(index > 0, |this| this.border_t_1().border_color(hairline))
                    .child(child)
            }))
            .into_any_element()
    }
}

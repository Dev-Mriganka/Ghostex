//! The Agents roster card: the session resume hooks toolbar (CDXC:AgentHooks 2026-08-28: quiet
//! whole-set controls, a readiness chip and an info tooltip), one drag-to-reorder row per launcher
//! (`SettingsAgentRow`: grip, icon, name with the Chat View badge, command, hook status pill, CLI
//! action, inline hook install, disclosure), the empty state and the hook state folder; or the
//! agent editor in the card's place.
use super::super::super::super::native_modal_kit::*;
use super::super::super::fields::{
    ButtonSize, ButtonVariant, card_inset, reorder_handle, reorder_order, reorder_row,
    reorder_scroll_container, settings_button, settings_button_sized, settings_icon,
    settings_section, tooltip_text,
};
use super::super::super::model::SettingsTabId;
use super::super::super::palette::SettingsPalette;
use super::AgentsTab;
use super::cli::{ghost_icon_button, spinning_icon};
use super::icons;
use super::logos::{agent_icon_tile, muted_fill};
use super::model::{
    AgentButton, HookStatus, HookStatusItem, agents_from_hud, any_hook_removable, hook_agent_id,
    hook_status_text, hook_supported_agents, merge_ids, reconcile_draft_ids, reorder_request_id,
    supports_chat_view,
};
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyElement, ClickEvent, Context, Div, FontWeight, InteractiveElement as _, IntoElement,
    ParentElement as _, SharedString, StatefulInteractiveElement as _, Styled as _, Transformation,
    Window, div, px, radians, rgb,
};
use gpui_component::{h_flex, v_flex};
use serde_json::json;

const LIST: &str = "settings-agents";

/// The pill colours of a hook status (`getAgentHookStatusClassName` and the icon tints).
fn pill_colors(
    p: &SettingsPalette,
    status: Option<&HookStatusItem>,
    loading: bool,
) -> (gpui::Rgba, gpui::Rgba, gpui::Rgba) {
    let muted_pill = (muted_fill(p), p.muted, p.muted);
    if loading {
        return muted_pill;
    }
    let Some(status) = status else {
        return muted_pill;
    };
    let emerald = (
        css_fade(rgb(0x10b981), 0.1),
        if p.light {
            rgb(0x047857)
        } else {
            rgb(0x6ee7b7)
        },
        if p.light {
            rgb(0x047857)
        } else {
            rgb(0x34d399)
        },
    );
    let amber = (
        css_fade(rgb(0xf59e0b), 0.1),
        if p.light {
            rgb(0x92400e)
        } else {
            rgb(0xfcd34d)
        },
        if p.light {
            rgb(0x92400e)
        } else {
            rgb(0xfbbf24)
        },
    );
    match status.status.as_str() {
        "installed" => emerald,
        "updateRequired" | "cliMissing" => amber,
        "notRequired" => muted_pill,
        _ => (css_fade(p.destructive, 0.1), p.destructive, p.destructive),
    }
}

/// `AgentHookStatusIcon`.
fn hook_status_icon(
    status: Option<&HookStatusItem>,
    loading: bool,
    color: gpui::Rgba,
    id: &str,
) -> AnyElement {
    if loading {
        return spinning_icon(icons::REFRESH, 14.0, color, id);
    }
    let path = match status.map(|status| status.status.as_str()) {
        None | Some("notRequired") => icons::INFO_CIRCLE,
        Some("installed") => icons::CIRCLE_CHECK_FILLED,
        Some("updateRequired") | Some("cliMissing") => icons::ALERT_TRIANGLE,
        Some(_) => icons::CIRCLE_X,
    };
    settings_icon(path, 14.0, color)
        .flex_shrink_0()
        .into_any_element()
}

/// The hook status pill of a row header (`rounded-none px-2 py-1 text-[11px]`).
pub(super) fn hook_status_pill(
    p: &SettingsPalette,
    status: Option<&HookStatusItem>,
    loading: bool,
    id: &str,
) -> AnyElement {
    let (background, text, icon) = pill_colors(p, status, loading);
    h_flex()
        .flex_shrink_0()
        .items_center()
        .gap(px(6.0))
        .px(px(8.0))
        .py(px(4.0))
        .bg(hsla(background))
        .text_size(px(11.0))
        .line_height(px(15.7143))
        .text_color(hsla(text))
        .child(hook_status_icon(status, loading, icon, id))
        .child(hook_status_text(status, loading))
        .into_any_element()
}

/// The icon of a hook's detail line (`AgentHookStatusIcon` in the row panel).
pub(super) fn hook_detail_icon(
    p: &SettingsPalette,
    status: Option<&HookStatusItem>,
    loading: bool,
    id: &str,
) -> AnyElement {
    let (_, _, icon) = pill_colors(p, status, loading);
    hook_status_icon(status, loading, icon, id)
}

impl AgentsTab {
    /// The roster in display order (`orderedAgents`), reconciling the dragged order with the
    /// synced roster first (`reconcileDraftIds` on every roster change).
    pub(super) fn ordered_agents(&mut self, cx: &Context<Self>) -> Vec<AgentButton> {
        let agents = agents_from_hud(self.store.read(cx).hud());
        let synced: Vec<String> = agents.iter().map(|agent| agent.agent_id.clone()).collect();
        if synced != self.synced_agent_ids {
            self.draft_agent_ids = reconcile_draft_ids(self.draft_agent_ids.as_deref(), &synced);
            self.synced_agent_ids = synced.clone();
        }
        let order = match &self.draft_agent_ids {
            Some(draft) => merge_ids(draft, &synced),
            None => synced,
        };
        order
            .iter()
            .filter_map(|id| agents.iter().find(|agent| &agent.agent_id == id).cloned())
            .collect()
    }

    fn move_agent(&mut self, from: usize, to: usize, cx: &mut Context<Self>) {
        let ids: Vec<String> = self
            .ordered_agents(cx)
            .into_iter()
            .map(|agent| agent.agent_id)
            .collect();
        let next = super::super::super::fields::move_index(&ids, from, to);
        self.draft_agent_ids = Some(next.clone());
        self.post(
            json!({ "agentIds": next, "requestId": reorder_request_id(), "type": "syncSidebarAgentOrder" }),
            cx,
        );
        cx.notify();
    }

    fn toggle_expanded(&mut self, agent_id: &str, cx: &mut Context<Self>) {
        if let Some(position) = self.expanded.iter().position(|id| id == agent_id) {
            self.expanded.remove(position);
            self.cli_unmount(super::cli::CliSlot::Panel, agent_id);
        } else {
            self.expanded.push(agent_id.to_string());
        }
        cx.notify();
    }

    pub(super) fn render_roster(
        &mut self,
        p: &SettingsPalette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<Div> {
        if self.editor.is_some() {
            let rows = self.render_editor(p, window, cx);
            return settings_section(p, "Agent", None, None, rows);
        }
        let add = settings_button(
            p,
            "agents-add",
            "Add Agent",
            Some(icons::PLUS),
            ButtonVariant::Outline,
            false,
            None,
            |page: &mut Self, window, cx| {
                page.open_editor(None, window, cx);
                cx.notify();
            },
            cx,
        );
        let status = self
            .store
            .read(cx)
            .host_payload("agentHookStatus")
            .map(HookStatus::parse);
        let loading = self.hook_status_loading;
        let mut rows: Vec<AnyElement> =
            vec![self.render_hook_toolbar(p, status.as_ref(), loading, cx)];
        if let Some(message) = status
            .as_ref()
            .and_then(|status| status.error_message.clone())
        {
            rows.push(card_inset(
                div()
                    .text_size(px(13.0))
                    .text_color(hsla(p.destructive))
                    .child(message),
            ));
        }
        let agents = self.ordered_agents(cx);
        if agents.is_empty() {
            rows.push(card_inset(
                v_flex()
                    .w_full()
                    .items_center()
                    .justify_center()
                    .gap(px(8.0))
                    .text_center()
                    .child(
                        div()
                            .text_size(px(16.0))
                            .line_height(px(24.9))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(hsla(p.foreground))
                            .child("No agents configured"),
                    )
                    .child(
                        div()
                            .text_size(px(13.0))
                            .line_height(px(21.1))
                            .text_color(hsla(p.muted))
                            .child("Add an agent launcher to start new sessions."),
                    ),
            ));
        } else {
            let handle = self
                .store
                .update(cx, |store, _| store.scroll_handle(SettingsTabId::Agents));
            reorder_scroll_container(self, LIST, handle);
            let order = reorder_order(self, LIST, agents.len(), cx);
            let mut list = v_flex().w_full();
            for (slot, index) in order.iter().copied().enumerate() {
                let agent = agents[index].clone();
                let row =
                    self.render_agent_row(p, &agent, index, status.as_ref(), loading, window, cx);
                let wrapped = reorder_row(
                    self,
                    LIST,
                    index,
                    slot,
                    row,
                    |page: &mut Self, from, to, _window, cx| page.move_agent(from, to, cx),
                    cx,
                );
                list = list.child(
                    div()
                        .w_full()
                        .px(px(16.0))
                        .when(slot > 0, |this| {
                            this.border_t_1().border_color(hsla(p.hairline))
                        })
                        .child(wrapped),
                );
            }
            rows.push(list.into_any_element());
        }
        if let Some(status) = &status {
            rows.push(card_inset(
                div()
                    .w_full()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_ellipsis()
                    .text_size(px(13.0))
                    .line_height(px(18.5714))
                    .text_color(hsla(p.muted))
                    .child(format!("Hook state: {}", status.hook_state_directory)),
            ));
        }
        settings_section(p, "Agents", None, Some(add), rows)
    }

    fn render_hook_toolbar(
        &mut self,
        p: &SettingsPalette,
        status: Option<&HookStatus>,
        loading: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let supported = hook_supported_agents().len();
        let installed = status.map_or(0, |status| {
            status
                .agents
                .iter()
                .filter(|item| item.status == "installed")
                .count()
        });
        let update_required = status.map_or(0, |status| {
            status
                .agents
                .iter()
                .filter(|item| item.status == "updateRequired")
                .count()
        });
        let summary = match status {
            Some(status) if status.error_message.is_some() => "Unable to check hooks".to_string(),
            Some(_) if update_required > 0 => format!(
                "{installed}/{supported} hooks ready, {}",
                if update_required == 1 {
                    "1 needs update".to_string()
                } else {
                    format!("{update_required} need update")
                }
            ),
            Some(_) => format!("{installed}/{supported} hooks ready"),
            None if loading => "Checking hooks".to_string(),
            None => "Hook status not checked".to_string(),
        };
        let removable = any_hook_removable(status);
        let chip_border = css_fade(p.hairline, 0.7);
        let info = div()
            .id("agents-hooks-info")
            .flex_shrink_0()
            .mt(px(2.0))
            .tooltip(tooltip_text(
                "Install hooks so Ghostex can capture each agent's native session id and resume the exact conversation after sleep, reload, or app restart. Hooks write only session metadata into Ghostex's session-state files. The existing title-based restore path remains available when a hook has not captured an id yet.",
            ))
            .child(settings_icon(icons::INFO_CIRCLE, 16.0, p.muted));
        let loading_reason: SharedString = "Hook status is being checked.".into();
        let buttons = h_flex()
            .flex_shrink_0()
            .flex_wrap()
            .items_center()
            .justify_end()
            .gap(px(6.0))
            .child(settings_button_sized(
                p,
                "agents-hooks-install-all",
                if update_required > 0 {
                    "Update All"
                } else {
                    "Install All"
                },
                Some(icons::DOWNLOAD),
                ButtonVariant::Ghost,
                ButtonSize::Sm,
                loading,
                Some(loading_reason.clone()),
                |page: &mut Self, _window, cx| {
                    page.install_hooks(None, cx);
                    cx.notify();
                },
                cx,
            ))
            // CDXC:AgentHooks 2026-08-19-11:20 (agents.tsx): Uninstall All sits beside the install it undoes and stays disabled while status loads or no Ghostex hook is present.
            .child(settings_button_sized(
                p,
                "agents-hooks-uninstall-all",
                "Uninstall All",
                Some(icons::TRASH),
                ButtonVariant::Ghost,
                ButtonSize::Sm,
                loading || !removable,
                Some(if loading {
                    loading_reason.clone()
                } else {
                    "No Ghostex hooks are installed.".into()
                }),
                |page: &mut Self, _window, cx| {
                    page.uninstall_hooks(None, cx);
                    cx.notify();
                },
                cx,
            ))
            .child(settings_button_sized(
                p,
                "agents-hooks-refresh",
                "Refresh",
                Some(icons::REFRESH),
                ButtonVariant::Ghost,
                ButtonSize::Sm,
                loading,
                Some(loading_reason),
                |page: &mut Self, _window, cx| {
                    page.request_hook_status(cx);
                    cx.notify();
                },
                cx,
            ));
        card_inset(
            v_flex()
                .w_full()
                .gap(px(8.0))
                .child(
                    h_flex()
                        .w_full()
                        .min_w_0()
                        .items_start()
                        .gap(px(8.0))
                        .child(info)
                        .child(
                            div()
                                .min_w_0()
                                .text_size(px(13.0))
                                .line_height(px(20.0))
                                .text_color(hsla(p.muted))
                                .child("Session resume hooks let Ghostex capture each agent's native session id and resume the exact conversation."),
                        ),
                )
                .child(
                    h_flex()
                        .w_full()
                        .flex_wrap()
                        .items_center()
                        .justify_end()
                        .gap(px(8.0))
                        .child(
                            div()
                                .flex_shrink_0()
                                .px(px(8.0))
                                .py(px(4.0))
                                .rounded(px(6.0))
                                .border_1()
                                .border_color(hsla(chip_border))
                                .text_size(px(11.0))
                                .line_height(px(15.7143))
                                .text_color(hsla(p.muted))
                                .child(summary),
                        )
                        .child(buttons),
                ),
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn render_agent_row(
        &mut self,
        p: &SettingsPalette,
        agent: &AgentButton,
        index: usize,
        status: Option<&HookStatus>,
        loading: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let agent_id = agent.agent_id.clone();
        let hook_agent = hook_agent_id(agent);
        let supports_hooks = hook_agent.is_some();
        let hook_status = hook_agent
            .as_deref()
            .and_then(|hook| status.and_then(|status| status.item(hook)));
        let pending = loading && status.is_none();
        let expanded = self.expanded.contains(&agent_id);
        let cli_agent = super::model::default_agent_by_icon(agent.icon.as_deref())
            .map(|default| default.agent_id.clone())
            .unwrap_or_else(|| agent_id.clone());
        let cli_missing =
            self.cli_missing(&cli_agent, hook_status.map(|status| status.status.as_str()));
        let hook_installed = hook_status.is_some_and(|status| status.status == "installed");
        // A hook cannot be installed for a CLI that is not there; the row offers Install CLI instead.
        let show_inline_install = supports_hooks
            && !hook_installed
            && hook_status.is_none_or(|status| status.status != "notRequired")
            && !pending
            && !cli_missing;
        let show_cli_action = self.cli_row_action_shown(&cli_agent, cli_missing, cx);
        if !show_cli_action {
            self.cli_unmount(super::cli::CliSlot::Row, &cli_agent);
        }
        let name = agent.name.clone();
        let grip = reorder_handle(
            p,
            LIST,
            index,
            name.clone(),
            div()
                .size(px(28.0))
                .flex()
                .items_center()
                .justify_center()
                .rounded(px(MODAL_RADIUS_CONTROL))
                .hover(|this| {
                    this.bg(hsla(if p.light {
                        rgb(0xf1f1f1)
                    } else {
                        css_fade(rgb(0x262626), 0.5)
                    }))
                })
                .child(settings_icon(icons::GRIP_VERTICAL, 16.0, p.foreground))
                .into_any_element(),
        );
        let command = agent
            .command
            .as_deref()
            .map(str::trim)
            .filter(|command| !command.is_empty())
            .unwrap_or("Not configured")
            .to_string();
        let chat_badge = supports_chat_view(&agent.agent_id, agent.icon.as_deref()).then(|| {
            div()
                .id(SharedString::from(format!("agent-chat-badge-{agent_id}")))
                .flex_shrink_0()
                .size(px(16.0))
                .flex()
                .items_center()
                .justify_center()
                .tooltip(tooltip_text("Supports Chat View"))
                .child(settings_icon(
                    icons::MESSAGE_CIRCLE,
                    16.0,
                    css_fade(p.muted, 0.7),
                ))
        });
        let toggle_agent = agent_id.clone();
        let edit_button = h_flex()
            .id(SharedString::from(format!("agent-row-open-{agent_id}")))
            .flex_1()
            .min_w_0()
            .p(px(8.0))
            .gap(px(12.0))
            .items_center()
            .rounded(px(MODAL_RADIUS_CONTROL))
            .cursor_pointer()
            .on_click(cx.listener(move |page, _: &ClickEvent, _window, cx| {
                page.toggle_expanded(&toggle_agent, cx);
            }))
            .child(agent_icon_tile(agent.icon.as_deref(), p))
            .child(
                v_flex()
                    .flex_1()
                    .min_w_0()
                    .child(
                        h_flex()
                            .min_w_0()
                            .items_center()
                            .gap(px(6.0))
                            .child(
                                div()
                                    .min_w_0()
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis()
                                    .text_size(px(14.0))
                                    .line_height(px(20.0))
                                    .text_color(hsla(p.foreground))
                                    .child(name.clone()),
                            )
                            .children(chat_badge),
                    )
                    .child(
                        div()
                            .min_w_0()
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis()
                            .text_size(px(13.0))
                            .line_height(px(18.5714))
                            .text_color(hsla(p.muted))
                            .child(command),
                    ),
            );
        let pill = supports_hooks
            .then(|| hook_status_pill(p, hook_status, pending, &format!("agent-pill-{agent_id}")));
        let cli_action = show_cli_action
            .then(|| self.render_cli_row_action(p, &cli_agent, cli_missing, cx))
            .flatten();
        let install_label = if hook_installed {
            "Reinstall"
        } else if hook_status.is_some_and(|status| status.status == "updateRequired") {
            "Update hook"
        } else {
            "Install hook"
        };
        let inline_install = show_inline_install.then(|| {
            let hook = hook_agent.clone();
            settings_button_sized(
                p,
                SharedString::from(format!("agent-inline-install-{agent_id}")),
                install_label,
                Some(icons::DOWNLOAD),
                ButtonVariant::Outline,
                ButtonSize::Sm,
                loading,
                Some("Hook status is being checked.".into()),
                move |page: &mut Self, _window, cx| {
                    if let Some(hook) = hook.clone() {
                        page.install_hooks(Some(vec![hook]), cx);
                        cx.notify();
                    }
                },
                cx,
            )
        });
        let chevron_agent = agent_id.clone();
        let chevron_icon = settings_icon(icons::CHEVRON_DOWN, 16.0, p.foreground)
            .when(expanded, |icon| {
                icon.with_transformation(Transformation::rotate(radians(std::f32::consts::PI)))
            })
            .into_any_element();
        let chevron = ghost_icon_button(
            p,
            SharedString::from(format!("agent-row-chevron-{agent_id}")),
            chevron_icon,
            false,
            expanded,
            move |page: &mut Self, _window, cx| page.toggle_expanded(&chevron_agent, cx),
            cx,
        );
        let hover = p.raised_hover;
        let header = h_flex()
            .id(SharedString::from(format!("agent-row-{agent_id}")))
            .mx(px(-16.0))
            .px(px(16.0))
            .py(px(6.0))
            .min_h(px(56.0))
            .gap(px(10.0))
            .items_center()
            .hover(move |this| this.bg(hsla(hover)))
            .child(grip)
            .child(edit_button)
            .children(pill)
            .children(cli_action)
            .children(inline_install)
            .child(chevron);
        let mut row = v_flex().w_full().child(header);
        if expanded {
            row = row.child(self.render_agent_panel(
                p,
                agent,
                hook_agent.as_deref(),
                hook_status,
                pending,
                &cli_agent,
                window,
                cx,
            ));
        }
        row.into_any_element()
    }
}

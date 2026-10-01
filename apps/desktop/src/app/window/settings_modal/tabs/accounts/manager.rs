//! `AccountManager`, `DefaultAccountRow` and `AccountSetup` (accounts/manager.tsx (deleted 2026-10-01)) with
//! `PolicySettingRows` (accounts/policy-setting-rows.tsx (deleted 2026-10-01)): one section per provider with Connection
//! guide and Add account in its header, the sign-in in progress, the add-account setup, the saved
//! accounts (Automatic/Manual, star, expand into the editor), New session defaults, and the helper
//! tool rows.
use super::super::super::super::native_modal_kit::*;
use super::super::super::catalog::SettingOption;
use super::super::super::fields::{
    ListItemStatus, RowSpec, SizedButtonSize, SizedButtonVariant, icon, select_field, setting_row,
    settings_icon, settings_list_item, settings_section, settings_select, settings_sized_button,
    settings_square_button, switch_control, tooltip_text,
};
use super::super::super::palette::SettingsPalette;
use super::AccountsTab;
use super::data::{
    Account, AccountsState, POLICY_PRIORITY_OPTIONS, helper_label, new_session_rules,
    provider_label,
};
use super::widgets::{account_identity, account_logo, account_star, account_text};
use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyElement, ClickEvent, Context, FontWeight, InteractiveElement as _, IntoElement,
    ParentElement as _, SharedString, StatefulInteractiveElement as _, Styled as _, Window, div,
    px,
};
use gpui_component::{h_flex, v_flex};
use serde_json::{Value, json};

/// `AccountSetup`'s own state: the login it adds and the consent switch.
#[derive(Clone, Debug, Default)]
pub(crate) struct SetupDraft {
    pub(crate) selected: String,
    pub(crate) consent: bool,
}

/// `.gx-account-inset`: the row inset (14px 20px) around a form block in a card.
pub(crate) fn account_inset(content: AnyElement) -> AnyElement {
    div()
        .w_full()
        .px(px(20.0))
        .py(px(14.0))
        .child(content)
        .into_any_element()
}

/// The hover fill of a management row and the ghost fill of an expanded button.
fn ghost_fill(p: &SettingsPalette) -> gpui::Rgba {
    if p.light {
        gpui::rgb(0xf1f1f1)
    } else {
        css_fade(gpui::rgb(0x262626), 0.5)
    }
}

impl AccountsTab {
    /// One provider's section.
    pub(crate) fn render_provider_section(
        &mut self,
        p: &SettingsPalette,
        provider: &'static str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some(data) = self.client.read(cx).data.clone() else {
            return div().into_any_element();
        };
        let busy = self.client.read(cx).busy;
        let label = provider_label(provider);
        let accounts = data.registered(provider);
        let description = if accounts.is_empty() {
            format!(
                "{label} uses your current CLI login. No account switcher is needed to start sessions."
            )
        } else {
            format!(
                "{} saved {}. Uses {}.",
                accounts.len(),
                if accounts.len() == 1 {
                    "account"
                } else {
                    "accounts"
                },
                helper_label(provider)
            )
        };
        let adding = self.adding.as_deref() == Some(provider);
        let guide_button = settings_sized_button(
            p,
            SharedString::from(format!("accounts-{provider}-guide")),
            "Connection guide",
            Some("modals/settings/book.svg"),
            None,
            SizedButtonVariant::Ghost,
            SizedButtonSize::Default,
            false,
            None,
            move |page: &mut Self, window, cx| page.open_guide(provider.to_string(), window, cx),
            cx,
        );
        let add_button = {
            let button = settings_sized_button(
                p,
                SharedString::from(format!("accounts-{provider}-add")),
                "Add account",
                Some(icon::PLUS),
                None,
                SizedButtonVariant::Ghost,
                SizedButtonSize::Default,
                false,
                None,
                move |page: &mut Self, _window, cx| {
                    page.adding = if page.adding.as_deref() == Some(provider) {
                        None
                    } else {
                        Some(provider.to_string())
                    };
                    cx.notify();
                },
                cx,
            );
            // `aria-expanded:bg-muted`.
            div()
                .rounded(px(MODAL_RADIUS_CONTROL))
                .when(adding, |this| {
                    this.bg(hsla(if p.light {
                        gpui::rgb(0xf1f1f1)
                    } else {
                        gpui::rgb(0x27272a)
                    }))
                })
                .child(button)
                .into_any_element()
        };
        let actions = h_flex()
            .items_center()
            .gap(px(8.0))
            .child(guide_button)
            .child(add_button)
            .into_any_element();
        let mut rows: Vec<AnyElement> = Vec::new();
        let pending = self
            .pending_job
            .clone()
            .filter(|job| job["provider"] == provider);
        if let Some(job) = pending
            && !adding
            && self.editing.is_none()
        {
            let flow = self.render_connect_flow(
                p,
                format!("pending:{provider}"),
                provider,
                None,
                Some(job),
                window,
                cx,
            );
            rows.push(account_inset(flow));
        }
        if adding {
            rows.push(self.render_setup(p, provider, &data, window, cx));
        }
        if accounts.is_empty() {
            rows.push(settings_list_item(
                p,
                None,
                None,
                "Current CLI login",
                Some(
                    div()
                        .child("Optionally add your account to see usage and reset times in the sidebar and chat status lines.")
                        .into_any_element(),
                ),
                None,
            ));
        } else {
            rows.push(self.render_account_list(p, provider, &data, &accounts, busy, window, cx));
        }
        rows.extend(self.render_helper_tool_rows(p, provider, cx));
        settings_section(p, label, Some(description.into()), Some(actions), rows)
            .map(IntoElement::into_any_element)
            .unwrap_or_else(|| div().into_any_element())
    }

    /// The `settings-list-rows` of saved accounts and New session defaults.
    #[allow(clippy::too_many_arguments)]
    fn render_account_list(
        &mut self,
        p: &SettingsPalette,
        provider: &'static str,
        data: &AccountsState,
        accounts: &[Account],
        busy: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let hide = self.hide_emails(cx);
        let hairline = hsla(p.hairline);
        let mut items: Vec<AnyElement> = Vec::new();
        for account in accounts {
            items.push(self.render_saved_account(p, account, accounts, busy, hide, window, cx));
        }
        items.push(self.render_defaults_row(p, provider, data, accounts, busy, hide, window, cx));
        v_flex()
            .w_full()
            .children(items.into_iter().enumerate().map(|(index, item)| {
                div()
                    .w_full()
                    .when(index > 0, |this| this.border_t_1().border_color(hairline))
                    .child(item)
            }))
            .into_any_element()
    }

    /// One saved account: its management row and, while expanded, its editor.
    #[allow(clippy::too_many_arguments)]
    fn render_saved_account(
        &mut self,
        p: &SettingsPalette,
        account: &Account,
        accounts: &[Account],
        busy: bool,
        hide: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let id = account.id();
        let editing = self.editing.as_deref() == Some(id.as_str());
        let highlighted = self.highlighted.as_deref() == Some(id.as_str());
        let toggle = {
            let id = id.clone();
            move |page: &mut Self, _window: &mut Window, cx: &mut Context<Self>| {
                page.editing = if page.editing.as_deref() == Some(id.as_str()) {
                    // Closing saves what the focused field still holds; reopening starts fresh.
                    page.commit_editor(&id, cx);
                    page.editors.remove(&id);
                    None
                } else {
                    Some(id.clone())
                };
                cx.notify();
            }
        };
        let name = account.name();
        let secondary = if account.email() != name || account.usage_error().is_some() {
            Some(account.usage_error().unwrap_or_else(|| {
                if account.email().is_empty() {
                    "Saved login unavailable".to_string()
                } else {
                    account.email()
                }
            }))
        } else {
            None
        };
        let summary = {
            let toggle = toggle.clone();
            h_flex()
                .id(SharedString::from(format!("account-{id}-summary")))
                .flex_1()
                .min_w_0()
                .p(px(8.0))
                .gap(px(12.0))
                .items_center()
                .rounded(px(MODAL_RADIUS_CONTROL))
                .cursor_pointer()
                .on_click(
                    cx.listener(move |page, _: &ClickEvent, window, cx| toggle(page, window, cx)),
                )
                .child(account_identity(p, account))
                .child(
                    v_flex()
                        .flex_1()
                        .min_w_0()
                        .child(
                            div()
                                .overflow_hidden()
                                .whitespace_nowrap()
                                .text_ellipsis()
                                .text_size(px(14.0))
                                .line_height(px(20.0))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(hsla(p.foreground))
                                .child(account_text(&name, hide)),
                        )
                        .children(secondary.map(|text| {
                            div()
                                .overflow_hidden()
                                .whitespace_nowrap()
                                .text_ellipsis()
                                .text_size(px(13.0))
                                .line_height(px(18.57))
                                .text_color(hsla(p.muted))
                                .child(account_text(&text, hide))
                        })),
                )
        };
        let status: AnyElement = if account.status() == "ready" {
            let (label, tip) = if account.eligible() {
                (
                    "Automatic",
                    "When automatic account switching is enabled, Ghostex can switch to this account when another reaches its usage limit.",
                )
            } else {
                (
                    "Manual",
                    "Ghostex uses this account only when you select it. Automatic account switching skips it.",
                )
            };
            h_flex()
                .flex_shrink_0()
                .items_center()
                .gap(px(4.0))
                .whitespace_nowrap()
                .text_size(px(11.0))
                .line_height(px(15.71))
                .text_color(hsla(p.muted))
                .child(label)
                .child(
                    div()
                        .id(SharedString::from(format!("account-{id}-status-info")))
                        .size(px(13.0))
                        .tooltip(tooltip_text(tip))
                        .child(settings_icon(icon::INFO_CIRCLE, 13.0, p.muted)),
                )
                .into_any_element()
        } else {
            let id = id.clone();
            settings_sized_button(
                p,
                SharedString::from(format!("account-{id}-reconnect")),
                "Reconnect",
                None,
                None,
                SizedButtonVariant::Outline,
                SizedButtonSize::Sm,
                false,
                None,
                move |page: &mut Self, _window, cx| {
                    page.editing = Some(id.clone());
                    cx.notify();
                },
                cx,
            )
        };
        let star = {
            let account = account.clone();
            account_star(
                p,
                &account.clone(),
                busy,
                move |page: &mut Self, _window, cx| page.toggle_titlebar(&account, cx),
                cx,
            )
        };
        let chevron = settings_square_button(
            p,
            SharedString::from(format!("account-{id}-expand")),
            if editing {
                "modals/settings/chevron-up.svg"
            } else {
                icon::CHEVRON_DOWN
            },
            None,
            SizedButtonVariant::Ghost,
            28.0,
            None,
            false,
            None,
            toggle,
            cx,
        );
        let hover = ghost_fill(p);
        let row = h_flex()
            .id(SharedString::from(format!("account-{id}-row")))
            .w_full()
            .min_h(px(56.0))
            .px(px(16.0))
            .py(px(6.0))
            .gap(px(10.0))
            .items_center()
            .hover(move |this| this.bg(hsla(p.raised_hover)))
            .child(summary)
            .child(status)
            .child(star)
            .child(
                div()
                    .rounded(px(MODAL_RADIUS_CONTROL))
                    .when(editing, |this| this.bg(hsla(hover)))
                    .child(chevron),
            );
        let editor = editing.then(|| {
            div()
                .w_full()
                .px(px(16.0))
                .border_t_1()
                .border_color(hsla(css_fade(p.hairline, 0.7)))
                .child(self.render_account_editor(p, account, accounts, window, cx))
        });
        v_flex()
            .id(SharedString::from(format!("account-{id}")))
            .w_full()
            .border_1()
            .border_color(hsla(if highlighted {
                p.foreground
            } else {
                p.hairline
            }))
            .when(highlighted, |this| this.border_2())
            .bg(hsla(css_fade(
                if p.light {
                    gpui::rgb(0xf1f1f1)
                } else {
                    gpui::rgb(0x2a2a2a)
                },
                0.2,
            )))
            .child(row)
            .children(editor)
            .into_any_element()
    }

    /// `setTitlebar`, then `accountTitlebarChanged` for the sidebar's usage strip.
    fn toggle_titlebar(&mut self, account: &Account, cx: &mut Context<Self>) {
        let shown = !account.show_in_titlebar();
        let mut changed = account.raw.clone();
        changed["showInTitlebar"] = json!(shown);
        let store = self.store.clone();
        self.account_request(
            json!({ "operation": "setTitlebar", "id": account.id(), "shown": shown }),
            Some(Box::new(move |ok, cx| {
                if ok {
                    super::super::super::store::store_host_message(
                        &store,
                        json!({ "type": "accountTitlebarChanged", "machineId": "local", "account": changed }),
                        cx,
                    );
                }
            })),
            cx,
        );
    }

    /// New session defaults: its summary row and, while open, the default account and the
    /// auto-continue policy.
    #[allow(clippy::too_many_arguments)]
    fn render_defaults_row(
        &mut self,
        p: &SettingsPalette,
        provider: &'static str,
        data: &AccountsState,
        accounts: &[Account],
        busy: bool,
        hide: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let expanded = self.defaults_open.as_deref() == Some(provider);
        let default_account = data
            .default_account(provider)
            .and_then(|id| accounts.iter().find(|account| account.id() == id).cloned());
        let policy = data.defaults(provider);
        let policy_text = if policy["enabled"].as_bool() == Some(true) {
            if policy["atLimit"] == "wait" {
                "Wait for reset"
            } else {
                "Switch at a limit"
            }
        } else {
            "Auto-continue off"
        };
        let toggle = move |page: &mut Self, _window: &mut Window, cx: &mut Context<Self>| {
            page.defaults_open = if page.defaults_open.as_deref() == Some(provider) {
                None
            } else {
                Some(provider.to_string())
            };
            cx.notify();
        };
        let summary = h_flex()
            .id(SharedString::from(format!(
                "accounts-{provider}-defaults-summary"
            )))
            .flex_1()
            .min_w_0()
            .p(px(8.0))
            .items_center()
            .rounded(px(MODAL_RADIUS_CONTROL))
            .cursor_pointer()
            .on_click(cx.listener(move |page, _: &ClickEvent, window, cx| toggle(page, window, cx)))
            .child(
                v_flex()
                    .flex_1()
                    .min_w_0()
                    .child(
                        div()
                            .text_size(px(14.0))
                            .line_height(px(20.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(hsla(p.foreground))
                            .child("New session defaults"),
                    )
                    .child(
                        h_flex()
                            .min_w_0()
                            .items_center()
                            .gap(px(6.0))
                            .text_size(px(13.0))
                            .line_height(px(18.57))
                            .text_color(hsla(p.muted))
                            .children(
                                default_account
                                    .as_ref()
                                    .map(|account| account_logo(p, &account.provider(), 14.0)),
                            )
                            .child(account_text(
                                &default_account
                                    .as_ref()
                                    .map(Account::name)
                                    .unwrap_or_else(|| "Choose an account".into()),
                                hide,
                            ))
                            .child(format!("· {policy_text}")),
                    ),
            );
        let chevron = settings_square_button(
            p,
            SharedString::from(format!("accounts-{provider}-defaults-expand")),
            if expanded {
                "modals/settings/chevron-up.svg"
            } else {
                icon::CHEVRON_DOWN
            },
            None,
            SizedButtonVariant::Ghost,
            28.0,
            None,
            false,
            None,
            toggle,
            cx,
        );
        let hover = ghost_fill(p);
        let row = h_flex()
            .id(SharedString::from(format!(
                "accounts-{provider}-defaults-row"
            )))
            .w_full()
            .min_h(px(56.0))
            .px(px(16.0))
            .py(px(6.0))
            .gap(px(8.0))
            .items_center()
            .hover(move |this| this.bg(hsla(p.raised_hover)))
            .child(summary)
            .child(
                div()
                    .rounded(px(MODAL_RADIUS_CONTROL))
                    .when(expanded, |this| this.bg(hsla(hover)))
                    .child(chevron),
            );
        let panel = expanded.then(|| {
            let mut rows =
                vec![self.render_default_account_row(
                    p, provider, data, accounts, busy, hide, window, cx,
                )];
            rows.extend(self.render_policy_rows(p, provider, &policy, busy, window, cx));
            let hairline = hsla(p.hairline);
            // `.settings-list-panel > * { padding-inline: 0 }`: the rows give back their own
            // sides, and the panel's top border sits inside the 16px inset like the dividers.
            div().w_full().px(px(16.0)).child(
                v_flex()
                    .w_full()
                    .border_t_1()
                    .border_color(hsla(css_fade(p.hairline, 0.7)))
                    .children(rows.into_iter().enumerate().map(|(index, row)| {
                        div()
                            .w_full()
                            .when(index > 0, |this| this.border_t_1().border_color(hairline))
                            .child(
                                div()
                                    .mx(px(-super::super::super::fields::ROW_PADDING_X))
                                    .child(row),
                            )
                    })),
            )
        });
        v_flex()
            .w_full()
            .child(row)
            .children(panel)
            .into_any_element()
    }

    /// `DefaultAccountRow`: the automatic rules, then each saved account.
    #[allow(clippy::too_many_arguments)]
    fn render_default_account_row(
        &mut self,
        p: &SettingsPalette,
        provider: &'static str,
        data: &AccountsState,
        accounts: &[Account],
        busy: bool,
        hide: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let label = provider_label(provider);
        let choice = data.new_session_choice(provider);
        let value = if choice["rule"] == "pinned" {
            choice["id"].as_str().unwrap_or_default().to_string()
        } else {
            choice["rule"].as_str().unwrap_or("auto").to_string()
        };
        let rules = new_session_rules();
        let mut options: Vec<SettingOption> = rules
            .iter()
            .map(|(rule, label)| SettingOption {
                label: label.clone(),
                value: rule.clone(),
            })
            .collect();
        options.extend(accounts.iter().map(|account| SettingOption {
            label: account_text(&account.name(), hide),
            value: account.id(),
        }));
        let control = settings_select(
            self,
            p,
            SharedString::from(format!("accounts-{provider}-default-account")),
            &options,
            &value,
            Some(super::super::super::fields::SELECT_WIDTH),
            busy,
            Some("Accounts are being updated.".into()),
            move |page: &mut Self, next, _window, cx| {
                let rules = new_session_rules();
                let choice = if rules.iter().any(|(rule, _)| *rule == next) {
                    json!({ "rule": next })
                } else {
                    json!({ "rule": "pinned", "id": next })
                };
                page.account_request(
                    json!({ "operation": "defaultAccount", "provider": provider, "choice": choice }),
                    None,
                    cx,
                );
            },
            window,
            cx,
        );
        setting_row(
            p,
            SharedString::from(format!("accounts-{provider}-default-account-row")),
            RowSpec::new("Account for new sessions").description(format!(
                "Quick launch starts new {label} sessions with this account. The automatic rules only consider accounts set to Automatic: Auto weighs remaining limit against time to reset and picks the account that can absorb the most usage before any of its limits resets, Most limit remaining picks the account with the most limit left, Soonest reset the one whose limit resets first, Most used first keeps draining the account already in use, and Same as last session reuses the account of the last session. Existing sessions keep their saved settings."
            )),
            None,
            control,
            cx,
        )
    }

    /// `PolicySettingRows`.
    fn render_policy_rows(
        &mut self,
        p: &SettingsPalette,
        provider: &'static str,
        policy: &Value,
        busy: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Vec<AnyElement> {
        let enabled = policy["enabled"].as_bool() == Some(true);
        let inactive = busy || !enabled;
        let reason: SharedString = if busy {
            "Accounts are being updated.".into()
        } else {
            "Turn on Continue automatically first.".into()
        };
        let save = move |page: &mut Self, patch: (&'static str, Value), cx: &mut Context<Self>| {
            let Some(data) = page.client.read(cx).data.clone() else {
                return;
            };
            let mut next = data.defaults(provider);
            next[patch.0] = patch.1;
            page.account_request(
                json!({ "operation": "defaults", "provider": provider, "policy": next }),
                None,
                cx,
            );
        };
        let mut rows: Vec<AnyElement> = Vec::new();
        rows.push(setting_row(
            p,
            SharedString::from(format!("accounts-{provider}-policy-enabled")),
            RowSpec::new("Continue automatically").description(
                "Keep working when the account for a new session reaches its usage limit.",
            ),
            None,
            switch_control(
                p,
                SharedString::from(format!("accounts-{provider}-policy-enabled-switch")),
                enabled,
                busy,
                None,
                move |page: &mut Self, next, _window, cx| save(page, ("enabled", json!(next)), cx),
                cx,
            ),
            cx,
        ));
        let at_limit = policy["atLimit"].as_str().unwrap_or("wait").to_string();
        let limit_options = [
            ("wait", "Wait for reset"),
            ("switch", "Use another account"),
        ]
        .map(|(value, label)| SettingOption {
            label: label.into(),
            value: value.into(),
        });
        let segmented = super::super::super::fields::settings_segmented(
            p,
            &format!("accounts-{provider}-policy-limit"),
            &limit_options,
            Some(at_limit.as_str()),
            move |page: &mut Self, next, _window, cx| {
                if !inactive && (next == "wait" || next == "switch") {
                    save(page, ("atLimit", json!(next)), cx);
                }
            },
            cx,
        );
        rows.push(setting_row(
            p,
            SharedString::from(format!("accounts-{provider}-policy-limit-row")),
            RowSpec::new("When the account runs out").description(if at_limit == "wait" {
                "Pick up on this account when its usage resets."
            } else {
                "Use another eligible login for this model. Wait when every account is at its limit."
            }),
            None,
            div()
                .when(inactive, |this| this.opacity(0.5))
                .child(segmented)
                .into_any_element(),
            cx,
        ));
        if at_limit == "switch" {
            let options: Vec<SettingOption> = POLICY_PRIORITY_OPTIONS
                .iter()
                .map(|(value, label)| SettingOption {
                    label: label.to_string(),
                    value: value.to_string(),
                })
                .collect();
            let priority = policy["priority"]
                .as_str()
                .unwrap_or("soonestReset")
                .to_string();
            let control = settings_select(
                self,
                p,
                SharedString::from(format!("accounts-{provider}-policy-priority")),
                &options,
                &priority,
                Some(super::super::super::fields::SELECT_WIDTH),
                inactive,
                Some(reason.clone()),
                move |page: &mut Self, next, _window, cx| save(page, ("priority", json!(next)), cx),
                window,
                cx,
            );
            rows.push(setting_row(
                p,
                SharedString::from(format!("accounts-{provider}-policy-priority-row")),
                RowSpec::new("Account preference")
                    .description("Which eligible account Ghostex tries first."),
                None,
                control,
                cx,
            ));
        }
        rows.push(setting_row(
            p,
            SharedString::from(format!("accounts-{provider}-policy-retry")),
            RowSpec::new("Recover from temporary errors").description(
                "Retry after 5, 10, 20, 40, then every 60 minutes. Login and permission requests need your attention. Stop cancels recovery for the current task.",
            ),
            None,
            switch_control(
                p,
                SharedString::from(format!("accounts-{provider}-policy-retry-switch")),
                policy["retryErrors"].as_bool() == Some(true),
                inactive,
                Some(reason),
                move |page: &mut Self, next, _window, cx| save(page, ("retryErrors", json!(next)), cx),
                cx,
            ),
            cx,
        ));
        rows
    }

    /// `AccountSetup`: the Add a <provider> account group.
    fn render_setup(
        &mut self,
        p: &SettingsPalette,
        provider: &'static str,
        data: &AccountsState,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let hide = self.hide_emails(cx);
        let label = provider_label(provider);
        let helper = data.helper(provider);
        let available: Vec<Account> = data
            .accounts()
            .into_iter()
            .filter(|account| account.provider() == provider && !account.registered())
            .collect();
        let draft = self
            .setups
            .entry(provider.to_string())
            .or_insert_with(|| SetupDraft {
                selected: available
                    .iter()
                    .find(|account| account.status() == "ready")
                    .map(Account::id)
                    .unwrap_or_else(|| "new".into()),
                consent: false,
            })
            .clone();
        let close = settings_square_button(
            p,
            SharedString::from(format!("accounts-{provider}-setup-close")),
            icon::X,
            None,
            SizedButtonVariant::Ghost,
            28.0,
            None,
            false,
            None,
            |page: &mut Self, _window, cx| {
                page.adding = None;
                cx.notify();
            },
            cx,
        );
        let mut rows: Vec<AnyElement> = vec![settings_list_item(
            p,
            None,
            None,
            format!("Add a {label} account"),
            None,
            Some(close),
        )];
        let installed = helper
            .as_ref()
            .is_some_and(|helper| helper["installed"].as_bool() == Some(true));
        if !installed && helper.is_some() && self.helper_offers_install(provider) {
            let button = self.render_helper_install_button(p, provider, "setup", cx);
            rows.push(settings_list_item(
                p,
                None,
                None,
                format!("Install {}", helper_label(provider)),
                Some(
                    div()
                        .whitespace_normal()
                        .child(format!(
                            "To connect your account for usage stats, Ghostex installs {} on this computer, then continues here. This setup is optional; you can keep using your current CLI login.",
                            helper_label(provider)
                        ))
                        .into_any_element(),
                ),
                button,
            ));
        } else if !installed {
            if let Some(helper) = helper {
                rows.push(settings_list_item(
                    p,
                    None,
                    None,
                    format!("Install {}", helper_label(provider)),
                    Some(
                        div()
                            .whitespace_normal()
                            .child(format!(
                                "To connect your account for usage stats, install {} on this computer, then refresh accounts. This setup is optional; you can keep using your current CLI login.",
                                helper_label(provider)
                            ))
                            .into_any_element(),
                    ),
                    None,
                ));
                let command = helper["installCommand"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                rows.push(account_inset(self.copy_command_block(
                    p,
                    format!("setup-{provider}-install"),
                    &command,
                    cx,
                )));
            }
        } else {
            let account = available
                .iter()
                .find(|account| account.id() == draft.selected)
                .cloned();
            if !available.is_empty() {
                let mut options = vec![SettingOption {
                    label: "Sign in to a new account".into(),
                    value: "new".into(),
                }];
                options.extend(available.iter().map(|account| SettingOption {
                    label: account_text(
                        &if account.name().is_empty() {
                            account.email()
                        } else {
                            account.name()
                        },
                        hide,
                    ),
                    value: account.id(),
                }));
                rows.push(select_field(
                    self,
                    p,
                    if provider == "claude" {
                        "accounts-claude-setup-login"
                    } else {
                        "accounts-codex-setup-login"
                    },
                    RowSpec::new("Login to add"),
                    None,
                    &options,
                    &draft.selected,
                    None,
                    move |page: &mut Self, next, _window, cx| {
                        if let Some(draft) = page.setups.get_mut(provider) {
                            draft.selected = next;
                        }
                        cx.notify();
                    },
                    window,
                    cx,
                ));
            }
            match account.filter(|account| account.status() == "ready") {
                Some(account) => {
                    rows.push(setting_row(
                        p,
                        SharedString::from(format!("accounts-{provider}-setup-consent")),
                        RowSpec::new(format!("Share conversations between my {label} accounts"))
                            .description("Required before Ghostex adds the account."),
                        None,
                        switch_control(
                            p,
                            SharedString::from(format!("accounts-{provider}-setup-consent-switch")),
                            draft.consent,
                            false,
                            None,
                            move |page: &mut Self, next, _window, cx| {
                                if let Some(draft) = page.setups.get_mut(provider) {
                                    draft.consent = next;
                                }
                                cx.notify();
                            },
                            cx,
                        ),
                        cx,
                    ));
                    let busy = self.client.read(cx).busy;
                    let selector = account.selector();
                    let add = settings_sized_button(
                        p,
                        SharedString::from(format!("accounts-{provider}-setup-register")),
                        "Add account",
                        None,
                        None,
                        SizedButtonVariant::Default,
                        SizedButtonSize::Sm,
                        busy || !draft.consent,
                        None,
                        move |page: &mut Self, _window, cx| {
                            let this = cx.weak_entity();
                            page.account_request(
                                json!({ "operation": "register", "provider": provider, "selector": selector, "shareHistory": true }),
                                Some(Box::new(move |ok, cx| {
                                    if ok {
                                        let _ = this.update(cx, |page, cx| {
                                            page.adding = None;
                                            cx.notify();
                                        });
                                    }
                                })),
                                cx,
                            );
                        },
                        cx,
                    );
                    rows.push(settings_list_item(
                        p,
                        None,
                        None,
                        format!(
                            "Add {}",
                            account_text(
                                &if account.name().is_empty() {
                                    account.email()
                                } else {
                                    account.name()
                                },
                                hide
                            )
                        ),
                        None,
                        Some(add),
                    ));
                }
                account => {
                    let flow = self.render_connect_flow(
                        p,
                        format!("setup:{provider}:{}", draft.selected),
                        provider,
                        account,
                        None,
                        window,
                        cx,
                    );
                    rows.push(account_inset(flow));
                }
            }
        }
        let hairline = hsla(p.hairline);
        v_flex()
            .w_full()
            .children(rows.into_iter().enumerate().map(|(index, row)| {
                div()
                    .w_full()
                    .when(index > 1, |this| this.border_t_1().border_color(hairline))
                    .child(row)
            }))
            .into_any_element()
    }

    /// `CopyCommand` with its 1.8s check.
    pub(crate) fn copy_command_block(
        &mut self,
        p: &SettingsPalette,
        key: String,
        command: &str,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let copied = self
            .copied
            .as_ref()
            .is_some_and(|(copied, _)| *copied == key);
        let text = command.to_string();
        let copy_key = key.clone();
        super::widgets::copy_command(
            p,
            SharedString::from(key),
            command,
            copied,
            move |page: &mut Self, _window, cx| {
                super::super::super::store::store_copy_to_clipboard(&page.store, text.clone(), cx);
                let key = copy_key.clone();
                let reset = cx.spawn(async move |this, cx| {
                    cx.background_executor()
                        .timer(std::time::Duration::from_millis(1800))
                        .await;
                    let _ = this.update(cx, |page, cx| {
                        if page
                            .copied
                            .as_ref()
                            .is_some_and(|(copied, _)| *copied == key)
                        {
                            page.copied = None;
                            cx.notify();
                        }
                    });
                });
                page.copied = Some((copy_key.clone(), reset));
                cx.notify();
            },
            cx,
        )
    }

    pub(crate) fn status_list_item(
        p: &SettingsPalette,
        status: Option<ListItemStatus>,
        title: impl Into<SharedString>,
        detail: Option<String>,
        controls: Option<AnyElement>,
    ) -> AnyElement {
        settings_list_item(
            p,
            status,
            None,
            div().child(title.into()),
            detail.map(|detail| div().child(detail).into_any_element()),
            controls,
        )
    }
}

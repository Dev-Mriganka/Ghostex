//! The panel a click on the button (or Cmd/Alt+Ctrl+Shift+S) opens: the four capture actions over
//! the same Running Agents list the macOS menu bar dropdown shows.
//!
//! CDXC:GhostexCapture 2026-09-30 DECISION:
//! User: clicking the button shows "the same dropdown we show from the status bar in macos (below
//! it or above it depending on where this floating icon is shown)" plus the actions Screenshot an
//! area (A), Screenshot current app (Space), Screenshot full screen (F) and Write a prompt (T).
//! Idle sessions follow the menu bar rule (only if active in the past two hours, projects with
//! working or waiting sessions first), and clicking a session opens it in Ghostex.

use gpui::prelude::*;
use gpui::{
    AnyElement, App, Context, FocusHandle, KeyDownEvent, MouseButton, SharedString, Subscription,
    WeakEntity, Window, WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, div,
    px, rgb, rgba,
};

use super::model::*;
use super::placement;
use super::platform;
use crate::GhostexGpuiApp;
use crate::app::helpers::{GpuiStatusIndicatorSessionState, GpuiStatusIndicatorStatus};

/// `GhostexGpuiMenuBarStatusIdleSessionMaximumAge`.
const IDLE_SESSION_MAX_AGE_MS: i64 = 2 * 60 * 60 * 1000;

const PANEL_PAD: f32 = 10.0;
const ACTIONS_HEIGHT: f32 = 78.0;
const SEPARATOR_HEIGHT: f32 = 21.0;
const HEADING_HEIGHT: f32 = 22.0;
const PROJECT_TITLE_HEIGHT: f32 = 28.0;
const SESSION_ROW_HEIGHT: f32 = 30.0;
const PROJECT_GAP: f32 = 6.0;
const FOOTER_HEIGHT: f32 = 30.0;
const EMPTY_HEIGHT: f32 = 44.0;
const LIST_MAX_HEIGHT: f32 = 420.0;

#[derive(Clone)]
pub(crate) struct PanelSession {
    pub(crate) session_id: String,
    pub(crate) title: String,
    pub(crate) status: GpuiStatusIndicatorStatus,
    pub(crate) question: bool,
    pub(crate) trailing: String,
}

#[derive(Clone)]
pub(crate) struct PanelProject {
    pub(crate) project_id: String,
    pub(crate) title: String,
    pub(crate) sessions: Vec<PanelSession>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn parse_ms(value: Option<&str>) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value?)
        .ok()
        .map(|time| time.timestamp_millis())
}

fn relative_time(value: Option<&str>) -> String {
    let Some(at) = parse_ms(value) else {
        return String::new();
    };
    let minutes = ((now_ms() - at).max(0) / 60_000) as u64;
    match minutes {
        0 => "now".into(),
        1..=59 => format!("{minutes}m"),
        60..=1439 => format!("{}h", minutes / 60),
        _ => format!("{}d", minutes / 1440),
    }
}

fn is_waiting(session: &GpuiStatusIndicatorSessionState) -> bool {
    session.pending_question
        || matches!(
            session.status,
            GpuiStatusIndicatorStatus::Working | GpuiStatusIndicatorStatus::Attention
        )
}

impl GhostexGpuiApp {
    /// The Running Agents list: `-visibleProjects` of the menu bar dropdown.
    pub(crate) fn ghostex_capture_panel_projects(&self) -> Vec<PanelProject> {
        let now = now_ms();
        let mut active = Vec::new();
        let mut idle = Vec::new();
        for project in &self.sidebar_session_status_indicators.projects {
            let mut sessions: Vec<&GpuiStatusIndicatorSessionState> = project
                .sessions
                .iter()
                .filter(|session| {
                    is_waiting(session)
                        || parse_ms(session.last_active_at.as_deref())
                            .is_some_and(|at| now - at <= IDLE_SESSION_MAX_AGE_MS)
                })
                .collect();
            if sessions.is_empty() {
                continue;
            }
            sessions.sort_by_key(|session| session.order);
            let has_active = sessions.iter().any(|session| is_waiting(session));
            let entry = PanelProject {
                project_id: project.project_id.clone(),
                title: project.title.clone(),
                sessions: sessions
                    .into_iter()
                    .map(|session| PanelSession {
                        session_id: session.session_id.clone(),
                        title: session.title.clone(),
                        status: session.status,
                        question: session.pending_question,
                        trailing: if session.pending_question {
                            "asking".into()
                        } else if session.status == GpuiStatusIndicatorStatus::Working {
                            String::new()
                        } else {
                            relative_time(session.last_active_at.as_deref())
                        },
                    })
                    .collect(),
            };
            if has_active {
                active.push(entry);
            } else {
                idle.push(entry);
            }
        }
        active.extend(idle);
        active
    }

    fn ghostex_capture_panel_height(&self) -> f32 {
        let projects = self.ghostex_capture_panel_projects();
        let rows = if projects.is_empty() {
            EMPTY_HEIGHT
        } else {
            projects
                .iter()
                .map(|project| {
                    PROJECT_TITLE_HEIGHT
                        + project.sessions.len() as f32 * SESSION_ROW_HEIGHT
                        + PROJECT_GAP
                })
                .sum::<f32>()
                .min(LIST_MAX_HEIGHT)
        };
        PANEL_PAD * 2.0
            + ACTIONS_HEIGHT
            + SEPARATOR_HEIGHT
            + HEADING_HEIGHT
            + rows
            + SEPARATOR_HEIGHT
            + FOOTER_HEIGHT
            + 2.0
    }

    fn ghostex_capture_panel_target(&self, cx: &App) -> Option<gpui::Bounds<gpui::Pixels>> {
        let icon = self.ghostex_capture.icon.as_ref()?;
        let screen = placement::screen_at(icon.frame.center(), cx)
            .or_else(|| self.ghostex_capture_home(cx).map(|(screen, _)| screen))?;
        Some(placement::panel_frame(
            &screen,
            icon.frame,
            self.ghostex_capture_panel_height(),
        ))
    }

    pub(super) fn open_ghostex_capture_panel(&mut self, cx: &mut Context<Self>) {
        if self.ghostex_capture.panel.is_some() || self.ghostex_capture.panel_opening {
            return;
        }
        // A docked button slides out first so the panel lines up with the icon.
        self.ghostex_capture.panel_opening = true;
        self.sync_ghostex_capture_icon(cx);
        let Some(frame) = self.ghostex_capture_panel_target(cx) else {
            self.ghostex_capture.panel_opening = false;
            return;
        };
        let app = cx.weak_entity();
        App::defer(cx, move |cx| {
            let observed = app.clone();
            let result = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(frame)),
                    display_id: crate::app::window::popup_frame::display_at(frame.center(), cx),
                    titlebar: None,
                    focus: true,
                    show: true,
                    kind: if cfg!(target_os = "linux") {
                        crate::app::window::popup_frame::child_window_kind()
                    } else {
                        WindowKind::PopUp
                    },
                    window_decorations: crate::app::window::popup_frame::child_window_decorations(),
                    is_movable: false,
                    is_resizable: false,
                    is_minimizable: false,
                    app_id: crate::gpui_platform_window_app_id(),
                    icon: crate::gpui_platform_window_icon(),
                    window_background: WindowBackgroundAppearance::Transparent,
                    ..Default::default()
                },
                move |window, cx| {
                    window.set_background_corner_radius(px(12.0));
                    let focus = cx.focus_handle();
                    let view = cx.new(|cx| {
                        let observe = match observed.upgrade() {
                            Some(app) => cx.observe(&app, |_, _, cx| cx.notify()),
                            None => Subscription::new(|| {}),
                        };
                        let activation = cx.observe_window_activation(
                            window,
                            |view: &mut CapturePanelView, window, cx| {
                                if !window.is_window_active() {
                                    view.with_app(cx, |app, cx| {
                                        app.close_ghostex_capture_panel(cx)
                                    });
                                }
                            },
                        );
                        CapturePanelView {
                            app: observed.clone(),
                            focus: focus.clone(),
                            _observe: observe,
                            _activation: activation,
                        }
                    });
                    focus.focus(window, cx);
                    view
                },
            );
            let Some(app) = app.upgrade() else {
                return;
            };
            let Ok(handle) = result else {
                app.update(cx, |app, cx| {
                    app.ghostex_capture.panel_opening = false;
                    app.sync_ghostex_capture_icon(cx);
                });
                return;
            };
            if let Some(native) = handle
                .update(cx, |_, window, _| {
                    crate::app::helpers::cef_parent_native_view(window)
                        .ok()
                        .map(|view| view as usize)
                })
                .ok()
                .flatten()
            {
                platform::prepare_floating_window(native, true);
            }
            app.update(cx, |app, cx| {
                app.ghostex_capture.panel_opening = false;
                app.ghostex_capture.panel = Some(PanelWindow { handle });
                cx.notify();
            });
        });
    }

    pub(crate) fn close_ghostex_capture_panel(&mut self, cx: &mut Context<Self>) {
        let Some(panel) = self.ghostex_capture.panel.take() else {
            return;
        };
        let handle = panel.handle;
        App::defer(cx, move |cx| {
            let _ = handle.update(cx, |_, window, _| window.remove_window());
        });
        self.sync_ghostex_capture_icon(cx);
        cx.notify();
    }

    /// Keeps the open panel next to the button after the button moved.
    pub(super) fn sync_ghostex_capture_panel_frame(&mut self, cx: &mut Context<Self>) {
        if self.ghostex_capture.panel.is_none() {
            return;
        }
        // The panel is rebuilt where it belongs; it is cheap and avoids a second geometry path.
        self.close_ghostex_capture_panel(cx);
        self.open_ghostex_capture_panel(cx);
    }

    fn ghostex_capture_open_session(
        &mut self,
        project_id: String,
        session_id: String,
        cx: &mut Context<Self>,
    ) {
        self.close_ghostex_capture_panel(cx);
        self.dispatch_gpui_menu_bar_session_activation(&project_id, &session_id, cx);
        self.ghostex_capture_bring_ghostex_forward(cx);
    }

    /// Opens a session in Ghostex, the way a click on its sidebar row does.
    pub(super) fn open_ghostex_capture_session(
        &mut self,
        session: &ghostex_gx_core::SessionKey,
        cx: &mut Context<Self>,
    ) {
        self.gx_store_focus_activated_session(&session.to_sidebar_session_id(), cx);
        self.ghostex_capture_bring_ghostex_forward(cx);
    }

    pub(super) fn ghostex_capture_bring_ghostex_forward(&mut self, cx: &mut Context<Self>) {
        let main = self.main_window_handle;
        App::defer(cx, move |cx| {
            cx.activate(true);
            if let Some(main) = main {
                let _ = main.update(cx, |_, window, _| window.activate_window());
            }
        });
    }
}

pub(crate) struct CapturePanelView {
    app: WeakEntity<GhostexGpuiApp>,
    focus: FocusHandle,
    _observe: Subscription,
    _activation: Subscription,
}

impl CapturePanelView {
    fn with_app(
        &self,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut GhostexGpuiApp, &mut Context<GhostexGpuiApp>),
    ) {
        if let Some(app) = self.app.upgrade() {
            app.update(cx, f);
        }
    }

    fn run(&self, action: CaptureAction, cx: &mut Context<Self>) {
        self.with_app(cx, move |app, cx| {
            app.run_ghostex_capture_action(action, cx)
        });
    }
}

fn status_dot(session: &PanelSession) -> AnyElement {
    let (color, square) = if session.question {
        (0xf472b6, false)
    } else {
        match session.status {
            GpuiStatusIndicatorStatus::Working => (0xc68a06, true),
            GpuiStatusIndicatorStatus::Attention => (0x0093fe, false),
            GpuiStatusIndicatorStatus::Available => (0xd9d9d9, false),
        }
    };
    let dot = div().flex_none().bg(rgb(color));
    if square {
        dot.size(px(8.0)).rounded(px(1.0)).into_any_element()
    } else {
        dot.size(px(9.0)).rounded_full().into_any_element()
    }
}

fn action_button(
    id: &'static str,
    label: &'static str,
    key: &'static str,
    icon: AnyElement,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .flex_1()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(5.0))
        .h(px(ACTIONS_HEIGHT))
        .px(px(4.0))
        .rounded(px(9.0))
        .bg(rgb(0x1d1d1d))
        .border_1()
        .border_color(rgba(0xffffff14))
        .hover(|style| style.bg(rgb(0x232323)).border_color(rgba(0xffffff29)))
        .cursor_pointer()
        .child(icon)
        .child(
            div()
                .text_size(px(11.5))
                .text_color(rgb(0xe8e8e8))
                .text_center()
                .line_height(px(14.0))
                .child(label),
        )
        .child(
            div()
                .text_size(px(10.0))
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .text_color(rgb(0xe8e8e8))
                .px(px(5.0))
                .rounded(px(4.0))
                .border_1()
                .border_color(rgba(0xffffff29))
                .bg(rgb(0x222222))
                .child(key),
        )
}

fn action_icon(dashed: bool, round: bool, wide: bool) -> AnyElement {
    let mut icon = div()
        .w(px(if wide { 28.0 } else { 24.0 }))
        .h(px(18.0))
        .border(px(if wide { 2.0 } else { 1.5 }))
        .border_color(rgb(0x9a9a9a))
        .rounded(px(if round { 9.0 } else { 3.0 }));
    if dashed {
        icon = icon.border_dashed();
    }
    icon.into_any_element()
}

fn footer_button(id: &'static str, label: &'static str) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .flex_1()
        .h(px(FOOTER_HEIGHT))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(7.0))
        .border_1()
        .border_color(rgba(0xffffff14))
        .text_size(px(12.0))
        .text_color(rgb(0x9a9a9a))
        .hover(|style| style.bg(rgb(0x202020)).text_color(rgb(0xe8e8e8)))
        .cursor_pointer()
        .child(label)
}

fn separator() -> impl IntoElement {
    div()
        .h(px(SEPARATOR_HEIGHT))
        .flex()
        .items_center()
        .child(div().h(px(1.0)).w_full().bg(rgba(0xffffff14)))
}

impl CapturePanelView {
    fn render_actions(&self, has_draft: bool, cx: &mut Context<Self>) -> AnyElement {
        let mut prompt_tile = action_button(
            "ghostex-capture-prompt",
            "Write a prompt",
            "T",
            action_icon(false, true, false),
        )
        .relative()
        .on_click(cx.listener(|this, _, _, cx| this.run(CaptureAction::Prompt, cx)));
        if has_draft {
            prompt_tile = prompt_tile.child(
                div()
                    .id("ghostex-capture-continue-draft")
                    .absolute()
                    .top(px(4.0))
                    .right(px(4.0))
                    .size(px(22.0))
                    .rounded(px(6.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .bg(rgb(0x2a3a44))
                    .border_1()
                    .border_color(rgba(0x86d3f866))
                    .text_size(px(12.0))
                    .text_color(rgb(0x86d3f8))
                    .hover(|style| style.bg(rgb(0x33495a)))
                    .cursor_pointer()
                    .tooltip(|window, cx| {
                        gpui_component::tooltip::Tooltip::new("Continue your draft")
                            .build(window, cx)
                    })
                    .child("↩")
                    .on_click(cx.listener(|this, _, _, cx| {
                        cx.stop_propagation();
                        this.run(CaptureAction::ContinuePrompt, cx)
                    })),
            );
        }
        div()
            .flex()
            .gap(px(6.0))
            .child(
                action_button(
                    "ghostex-capture-area",
                    "Screenshot an area",
                    "A",
                    action_icon(true, false, false),
                )
                .on_click(cx.listener(|this, _, _, cx| this.run(CaptureAction::Area, cx))),
            )
            .child(
                action_button(
                    "ghostex-capture-app",
                    "Screenshot current app",
                    "Space",
                    action_icon(false, false, false),
                )
                .on_click(cx.listener(|this, _, _, cx| this.run(CaptureAction::CurrentApp, cx))),
            )
            .child(
                action_button(
                    "ghostex-capture-full-screen",
                    "Screenshot full screen",
                    "F",
                    action_icon(false, false, true),
                )
                .on_click(cx.listener(|this, _, _, cx| this.run(CaptureAction::FullScreen, cx))),
            )
            .child(prompt_tile)
            .into_any_element()
    }

    fn render_session_row(
        &self,
        project_id: String,
        session: PanelSession,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let session_id = session.session_id.clone();
        div()
            .id(SharedString::from(format!(
                "ghostex-capture-session-{}",
                session.session_id
            )))
            .h(px(SESSION_ROW_HEIGHT))
            .px(px(12.0))
            .flex()
            .items_center()
            .gap(px(10.0))
            .hover(|style| style.bg(rgb(0x202020)))
            .cursor_pointer()
            .child(status_dot(&session))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_ellipsis()
                    .text_size(px(13.0))
                    .text_color(rgb(0xb4b8c0))
                    .child(SharedString::from(session.title)),
            )
            .child(
                div()
                    .text_size(px(12.0))
                    .text_color(rgb(0x6b6b6b))
                    .child(SharedString::from(session.trailing)),
            )
            .on_click(cx.listener(move |this, _, _, cx| {
                let (project_id, session_id) = (project_id.clone(), session_id.clone());
                this.with_app(cx, move |app, cx| {
                    app.ghostex_capture_open_session(project_id, session_id, cx)
                });
            }))
            .into_any_element()
    }

    fn render_list(&self, projects: Vec<PanelProject>, cx: &mut Context<Self>) -> AnyElement {
        if projects.is_empty() {
            return div()
                .h(px(EMPTY_HEIGHT))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(13.0))
                .text_color(rgb(0x6b6b6b))
                .child("No running agents")
                .into_any_element();
        }
        let mut cards = Vec::new();
        for project in projects {
            let mut card = div()
                .flex()
                .flex_col()
                .rounded(px(8.0))
                .border_1()
                .border_color(rgba(0x3a3a3ab8))
                .bg(rgb(0x161616))
                .child(
                    div()
                        .h(px(PROJECT_TITLE_HEIGHT))
                        .px(px(12.0))
                        .flex()
                        .items_center()
                        .text_size(px(12.0))
                        .font_weight(gpui::FontWeight::SEMIBOLD)
                        .text_color(rgb(0xcfd2d8))
                        .child(SharedString::from(project.title.clone())),
                );
            for session in project.sessions {
                card = card.child(self.render_session_row(project.project_id.clone(), session, cx));
            }
            cards.push(card);
        }
        div()
            .id("ghostex-capture-agents")
            .max_h(px(LIST_MAX_HEIGHT))
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(PROJECT_GAP))
            .children(cards)
            .into_any_element()
    }

    fn render_footer(&self, cx: &mut Context<Self>) -> AnyElement {
        div()
            .flex()
            .gap(px(6.0))
            .child(
                footer_button("ghostex-capture-open", "Open Ghostex").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.with_app(cx, |app, cx| {
                            app.close_ghostex_capture_panel(cx);
                            app.ghostex_capture_bring_ghostex_forward(cx);
                        })
                    },
                )),
            )
            .child(
                footer_button("ghostex-capture-hide", "Hide button").on_click(cx.listener(
                    |this, _, _, cx| this.with_app(cx, |app, cx| app.hide_ghostex_capture(cx)),
                )),
            )
            .child(
                footer_button("ghostex-capture-restart", "Restart").on_click(cx.listener(
                    |_, _, _, cx| cx.dispatch_action(&crate::app::actions::RestartGhostexGpui),
                )),
            )
            .child(footer_button("ghostex-capture-quit", "Quit").on_click(
                cx.listener(|_, _, _, cx| {
                    cx.dispatch_action(&crate::app::actions::QuitGhostexGpui)
                }),
            ))
            .into_any_element()
    }
}

impl Render for CapturePanelView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (projects, has_draft) = self
            .app
            .upgrade()
            .map(|app| {
                let app = app.read(cx);
                (
                    app.ghostex_capture_panel_projects(),
                    app.ghostex_capture_has_draft(),
                )
            })
            .unwrap_or_default();
        let heading = div()
            .h(px(HEADING_HEIGHT))
            .px(px(4.0))
            .flex()
            .items_center()
            .justify_between()
            .text_size(px(11.0))
            .text_color(rgb(0x9a9a9a))
            .child("RUNNING AGENTS")
            .child("LOCAL + REMOTE");
        let actions = self.render_actions(has_draft, cx);
        let list = self.render_list(projects, cx);
        let footer = self.render_footer(cx);
        div()
            .id("ghostex-capture-panel")
            .track_focus(&self.focus)
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, _, cx| {
                let modifiers = event.keystroke.modifiers;
                if modifiers.platform || modifiers.control || modifiers.alt {
                    return;
                }
                let action = match event.keystroke.key.as_str() {
                    "a" => CaptureAction::Area,
                    "space" => CaptureAction::CurrentApp,
                    "f" => CaptureAction::FullScreen,
                    "t" => CaptureAction::Prompt,
                    "escape" => CaptureAction::TogglePanel,
                    _ => return,
                };
                cx.stop_propagation();
                this.run(action, cx);
            }))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .size_full()
            .flex()
            .flex_col()
            .p(px(PANEL_PAD))
            .rounded(px(12.0))
            .bg(rgb(0x161616))
            .border_1()
            .border_color(rgb(0x3a3a3a))
            .child(actions)
            .child(separator())
            .child(heading)
            .child(list)
            .child(separator())
            .child(footer)
    }
}

//! Closing a workspace window while another stays open. Closing the last one is a quit and keeps
//! the quit path (main.rs).
//!
//! CDXC:AppWindows 2026-10-01 WHY:
//! A closed window is gone for good (its slot is forgotten), so what only it held goes with it: its Commands panel and Terminal view shells are closed in gxserver rather than left running where no window shows them, and its Delayed Sends are cancelled. The window asks first when it holds either. Agent sessions are untouched: they live in gxserver and every window's sidebar lists them. Its terminals detach their zmx clients with terminal sync stopped, so the detach is not read as the sessions exiting (`GPUI_APP_QUIT_IN_PROGRESS` does the same for a quit).

use gpui::{AnyWindowHandle, App, Context, WeakEntity, Window};

use super::registry::several_workspace_windows_open;
use crate::*;

pub(super) fn install_workspace_window_close_handler(
    app: WeakEntity<GhostexGpuiApp>,
    window: &mut Window,
    cx: &mut App,
) {
    window.on_window_should_close(cx, move |window, cx| {
        app.update(cx, |app, cx| app.workspace_window_should_close(window, cx))
            .unwrap_or(true)
    });
}

impl GhostexGpuiApp {
    /// The user asked to close this window. Returns whether it closes now; `false` while the
    /// confirmation is up, which closes it itself when the user agrees.
    fn workspace_window_should_close(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if !several_workspace_windows_open() {
            return true;
        }
        let command_terminals = self.workspace_window_command_terminal_keys(window).len();
        let delayed_sends = self.agents_delayed_send_timers.len()
            + self.agents_send_when_stopped_watchers.len()
            + self.command_delayed_send_timers.len();
        if command_terminals == 0 && delayed_sends == 0 {
            self.prepare_workspace_window_close(window, cx);
            return true;
        }
        let mut losses = Vec::new();
        if command_terminals > 0 {
            losses.push(if command_terminals == 1 {
                "its Commands terminal will close".to_string()
            } else {
                format!("its {command_terminals} Commands terminals will close")
            });
        }
        if delayed_sends > 0 {
            losses.push(if delayed_sends == 1 {
                "its Delayed Send will be cancelled".to_string()
            } else {
                format!("its {delayed_sends} Delayed Sends will be cancelled")
            });
        }
        let detail = format!(
            "If you close this window, {}. Agent sessions keep running and stay in the sidebar of every window.",
            losses.join(" and ")
        );
        let answer = window.prompt(
            gpui::PromptLevel::Warning,
            "Close this window?",
            Some(&detail),
            &["Cancel", "Close Window"],
            cx,
        );
        let handle = gpui::Window::window_handle(window);
        cx.spawn(async move |this, cx| {
            if answer.await != Ok(1) {
                return;
            }
            let _ = handle.update(cx, |_, window, cx| {
                // Another window may have closed while the question was up.
                let _ = this.update(cx, |app, cx| {
                    if several_workspace_windows_open() {
                        app.prepare_workspace_window_close(window, cx);
                    }
                });
                window.remove_window();
            });
        })
        .detach();
        false
    }

    /// Closes the windows this one owns, closes its Commands shells, lets go of the app-wide work,
    /// its remote tunnels and its gxserver socket, and stops its terminal sync and its saves.
    fn prepare_workspace_window_close(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        for key in self.workspace_window_command_terminal_keys(window) {
            self.close_command_gxserver_session_in_background(key, cx);
        }
        self.workspace_window_closing = true;
        self.close_gpui_titlebar_popup(None, window, cx);
        self.close_floating_reveal(cx);
        if self.is_lead_window() {
            self.release_ghostex_capture(cx);
        }
        for handle in [
            self.app_modal_window.map(Into::into),
            self.app_toast_window.map(Into::into),
            self.titlebar_popup_window.map(Into::into),
            self.plugins_modal_window.map(Into::into),
            self.new_thread_picker_window.map(Into::into),
            self.native_app_modal
                .as_ref()
                .map(|modal| modal.window.into()),
        ]
        .into_iter()
        .flatten()
        {
            close_owned_window(handle, cx);
        }
        crate::app::window::frosted_host::hide_frosted_hosts_over(
            gpui::Window::window_handle(window),
            cx,
        );
        self.stop_all_gpui_remote_gxserver_connections();
        self.source_code_server_runtime.stop();
        self.gx_store_disconnect_for_window_close();
    }

    /// The gxserver sessions behind this window's Commands panel and Terminal view tabs: the live
    /// pane's and the ones parked for its other projects.
    fn workspace_window_command_terminal_keys(
        &self,
        window: &Window,
    ) -> Vec<GpuiLocalWorkspaceSessionKey> {
        let content_height = command_pane_content_height(window);
        let default_height = command_pane_default_height_px_from_shared_settings(
            &shared_settings::shared_sidebar_settings_snapshot(),
        );
        let mut keys = self
            .command_gxserver_session_mappings
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for pane in self.parked_command_panes_by_project.values() {
            if let Some(model) = command_pane_model_from_shell_state_with_default_height_px(
                pane,
                content_height,
                default_height,
            ) {
                keys.extend(
                    command_gxserver_session_mappings_from_command_model(&model).into_values(),
                );
            }
        }
        keys.sort_by(|left, right| {
            (&left.project_id, &left.session_id).cmp(&(&right.project_id, &right.session_id))
        });
        keys.dedup();
        keys
    }
}

fn close_owned_window(handle: AnyWindowHandle, cx: &mut App) {
    let _ = handle.update(cx, |_, window, _| window.remove_window());
}

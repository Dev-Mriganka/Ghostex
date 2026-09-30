//! `handle_gpui_app_modal_sidebar_command`: the switch over every `sidebarCommand` message the app's own modal windows send.

use std::time::Duration;

use gpui::ClipboardItem;
use gpui::Window;

use crate::app::helpers::*;
use crate::app::model::*;
use crate::*;

impl GhostexGpuiApp {
    pub(crate) fn handle_gpui_app_modal_sidebar_command(
        &mut self,
        message: serde_json::Value,
        window: &mut Window,
        cx: &mut gpui::Context<Self>,
    ) {
        let Some(command) = message
            .get("message")
            .and_then(serde_json::Value::as_object)
        else {
            return;
        };
        let Some(command_type) = command.get("type").and_then(serde_json::Value::as_str) else {
            return;
        };

        match command_type {
            "updateSettings" => {
                self.handle_gpui_app_modal_update_settings_message(
                    &serde_json::Value::Object(command.clone()),
                    cx,
                );
            }
            "updateSettingsPatch" => {
                self.handle_gpui_app_modal_update_settings_patch_message(
                    &serde_json::Value::Object(command.clone()),
                    cx,
                );
            }
            "openExternalUrl" => {
                self.receive_gpui_titlebar_resources_open_external_url_message(
                    &serde_json::Value::Object(command.clone()),
                );
            }
            "listAppIcons" => {
                self.handle_gpui_list_app_icons_message(cx);
            }
            "setAppIcon" => {
                self.handle_gpui_set_app_icon_message(
                    &serde_json::Value::Object(command.clone()),
                    cx,
                );
            }
            "pickAppIconFile" => {
                self.handle_gpui_pick_app_icon_file_message(cx);
            }
            "pickTerminalBackgroundImageFile" => {
                self.handle_gpui_pick_terminal_background_image_message(cx);
            }
            "pickWindowGlassImageFile" => {
                self.handle_gpui_pick_window_glass_image_message(
                    &serde_json::Value::Object(command.clone()),
                    cx,
                );
            }
            "pickWindowGlassVideoFile" => {
                self.handle_gpui_pick_window_glass_video_message(
                    &serde_json::Value::Object(command.clone()),
                    cx,
                );
            }
            "pickFirstLaunchProjectFolder" => {
                self.handle_gpui_pick_first_launch_project_folder_message(cx);
            }
            "firstLaunchCreateProjectSession" => {
                self.handle_gpui_first_launch_create_project_session_message(command, cx);
            }
            "revealAppIconsFolder" => {
                app_icon::reveal_icons_directory();
            }
            "saveRemoteMachinePassword" => {
                self.handle_gpui_save_remote_machine_password_message(command, cx);
            }
            "reconnectRemoteMachine" => {
                self.handle_gpui_reconnect_remote_machine_message(command, cx);
            }
            "probeRemoteGxserverInstall" => {
                self.handle_gpui_probe_remote_gxserver_install_message(command, cx);
            }
            "addProjectDialogRequest" => {
                self.handle_gpui_add_project_dialog_request_message(command, cx);
            }
            "pickReplacementProjectFolder" => {
                let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|project_id| gpui_remote_sidebar_project_id_allowed(project_id))
                    .map(str::to_string)
                else {
                    return;
                };
                self.handle_gpui_pick_replacement_project_folder_message(project_id, cx);
            }
            /*
            CDXC:SessionNotes 2026-08-24:
            The Session Note dialog's confirm. Like `removeProject`, this is a
            sidebar-owned write that happens to be issued from an app-modal
            window, so it is handed to the Rust store rather than acted
            on here: the store (gx_store/terminal_lifecycle/session_edits.rs) owns the
            gxserver call and the local/remote machine routing. Only the sidebar session id and the note text
            cross this boundary, and the note is never logged.
            */
            "setSessionNote" => {
                let Some(session_id) = command
                    .get("sessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|session_id| gpui_app_modal_sidebar_session_id_allowed(session_id))
                else {
                    return;
                };
                let Some(note) = command.get("note").and_then(serde_json::Value::as_str) else {
                    return;
                };
                let mut message = serde_json::json!({
                    "note": note,
                    "sessionId": session_id,
                    "type": "setSessionNote",
                });
                if let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|project_id| gpui_remote_sidebar_project_id_allowed(project_id))
                {
                    message["projectId"] = serde_json::json!(project_id);
                }
                self.dispatch_gpui_sidebar_host_message(message, cx);
            }
            /*
            CDXC:Spaces 2026-08-27:
            The New/Edit Space dialog's confirm and delete. Like `setSessionNote`
            this is a sidebar-owned write issued from an app-modal window, so it
            is not acted on here. Its owner was SidebarApp until 2026-09-21; the
            store applies it to the CURRENT Space document now
            (gx_store/space_editor.rs, see `CDXC:Spaces 2026-09-21`).
            */
            "sidebarSpaceEditorResult" => {
                self.forward_gpui_sidebar_space_editor_result_to_sidebar(command, cx);
            }
            /*
            CDXC:Sessions 2026-09-25 WHY:
            The Settings modal creates custom session tags from the app-modal
            host window, so its catalog write arrives here instead of from the
            sidebar page. It is bounded and then pushed from Rust
            (gx_store/custom_tags_sync.rs); supersedes the 2026-09-11 note that
            forwarded it to the sidebar runtime.
            */
            "updateCustomSessionTags" => {
                self.forward_gpui_custom_session_tags_update_to_sidebar(command, cx);
            }
            "confirmAgentHookLaunch" => {
                let bounded_text = |key: &str, max_len: usize| {
                    command
                        .get(key)
                        .and_then(serde_json::Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty() && value.len() <= max_len)
                };
                let Some(agent_id) = bounded_text("agentId", 128) else {
                    return;
                };
                let Some(hook_agent_id) = bounded_text("hookAgentId", 128) else {
                    return;
                };
                let Some(install_hooks) = command
                    .get("installHooks")
                    .and_then(serde_json::Value::as_bool)
                else {
                    return;
                };
                let mut message = serde_json::json!({
                    "agentId": agent_id,
                    "hookAgentId": hook_agent_id,
                    "installHooks": install_hooks,
                    "type": "confirmAgentHookLaunch",
                });
                if let Some(group_id) = bounded_text("groupId", 512) {
                    message["groupId"] = serde_json::json!(group_id);
                }
                if let Some(account_id) = bounded_text("accountId", 256) {
                    message["accountId"] = serde_json::json!(account_id);
                }
                self.dispatch_gpui_sidebar_host_message(message, cx);
            }
            "removeProject" => {
                let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|project_id| gpui_remote_sidebar_project_id_allowed(project_id))
                else {
                    return;
                };
                self.dispatch_gpui_sidebar_host_message(
                    serde_json::json!({
                        "projectId": project_id,
                        "type": "removeProject",
                    }),
                    cx,
                );
                self.close_gpui_app_modal_window_and_restore_command_focus(cx);
            }
            "requestProjectWorktrees"
            | "createProjectWorktree"
            | "confirmDeleteWorktree"
            | "confirmRenameWorktree"
            | "commitWorktreeBeforeDelete" => {
                self.forward_gpui_worktree_modal_command_to_sidebar(command_type, command, cx);
            }
            "confirmSidebarGitCommit"
            | "confirmSidebarGitDirectMerge"
            | "runSidebarGitMultipleCommits"
            | "openSidebarGitChangedFileDiff"
            | "openSidebarGitChangedFile"
            | "cancelSidebarGitCommit" => {
                self.forward_gpui_git_commit_modal_command_to_sidebar(command_type, command, cx);
            }
            "revealExportedTranscript" => {
                self.reveal_gpui_exported_transcript(cx);
            }
            "cancelExportSessionTranscript"
            | "startExportedTranscriptConversation"
            | "runExportSessionTranscript" => {
                self.forward_gpui_export_transcript_modal_command_to_sidebar(
                    command_type,
                    command,
                    cx,
                );
            }
            // CDXC:Onboarding 2026-09-15 DECISION:
            // The Tips dropdown's "Setup" button opens the Onboarding modal, the same one the automatic
            // first run opens (modals/modal_window.rs); the older setup modal was deleted on 2026-09-27. Quick Access's
            // Setup Ghostex row reaches this arm, so it must open the same modal as the native Tips header
            // action in titlebar/settings_and_action_state.rs.
            "openWorkspaceWelcome" => {
                self.open_gpui_app_modal_from_titlebar(GpuiAppModalKind::Onboarding, window, cx);
            }
            "runGhostexHotkeyAction" => {
                let Some(action_id) = command.get("actionId").and_then(serde_json::Value::as_str)
                else {
                    return;
                };
                // The New Thread picker is a native GPUI window, not an app-modal page.
                if action_id == "openNewThreadPalette" {
                    self.toggle_gpui_new_thread_picker(cx);
                    return;
                }
                if action_id == "createAgentSession" {
                    self.start_new_agent_session(cx);
                    return;
                }
                if gpui_focused_chat_hotkey_action_id(action_id) {
                    self.run_focused_chat_hotkey(action_id, window, cx);
                    return;
                }
                /*
                CDXC:FocusMode 2026-06-25-15:01:
                The shared command palette posts focused-session commands as `runGhostexHotkeyAction`. Handle command-pane Sleep/Wake/Close focused-session ids directly in GPUI before modal routing so command-palette rows operate on the shell-focused command tab instead of no-oping or trying to open another modal.

                CDXC:DelayedSend 2026-06-27-06:37:
                The shared Delayed Send row is also a focused-pane action, but native command terminals consume it through the command-panel titlebar default no-op. GPUI must consume the id before generic modal routing without opening the focused command-pane timer modal.

                CDXC:Sessions 2026-06-25-15:24:
                The shared Close After Done row is also a focused command-terminal action. In GPUI command panes it toggles the focused mounted command tab's terminal-scoped watcher before modal routing, matching native command-palette behavior without applying the timer to Agents, Browser, or project-editor focus.

                CDXC:CommandPane 2026-06-25-16:33:
                Rename Active Session is also a focused command-terminal action. When the command pane owns shell focus, open the shared Rename Session modal for the active command tab instead of falling through to unrelated app-modal commands.

                CDXC:CommandPalette 2026-06-25-17:32:
                The shared command palette sends focused-pane split/open/merge actions through the same `runGhostexHotkeyAction` bridge as focused-session actions. Route the supported GPUI pane actions to the existing shell hotkey helpers before modal routing so command-pane focus can create command splits and Browser opens without requiring a separate keybinding event.

                CDXC:CommandPalette 2026-06-26-07:24:
                Command-palette Create Session is ordinary focused hotkey behavior in GPUI. Dispatch it to the same Cmd+T helper before app-modal routing so command-pane focus and Agents-pane focus keep their existing source gates and placeholder semantics.

                CDXC:CommandPalette 2026-06-26-07:24:
                Shared workarea switch rows also arrive as hotkey actions. Route them before app-modal fallback through `switch_workarea_from_hotkey` so command-palette selection uses the same titlebar availability checks, no-wake lifecycle, focus target, Browser visibility, and persistence behavior as Option+1..5.

                CDXC:CommandPalette 2026-06-26-07:36:
                Command-palette focus-navigation rows are shell navigation, not app-modal commands. Route tab cycling and directional focus through the same GPUI keyboard helpers as direct hotkeys so command-pane, Agents, Browser, and project-editor focus keep their existing source gates and layout semantics.

                CDXC:CommandPalette 2026-06-26-10:04:
                Shared previous/next group focus is render-order navigation, not spatial arrow focus. Dispatch `focusPreviousGroup` and `focusNextGroup` directly through the existing render-order workspace traversal only from Agents-pane or command-pane focus so GPUI moves like native focusAdjacentGroup without adding numbered group slots, project jumps, or fallback guessing.

                CDXC:CommandPalette 2026-06-26-10:04:
                Command-palette Start Action 1-5 rows are positional titlebar Actions hotkeys. Dispatch them through the existing titlebar action index runner so GPUI executes the configured project action without adding renderer payloads containing command text, URLs, paths, or session data.

                CDXC:Sidebar 2026-06-26-10:04:
                `toggleSidebarCollapsed` is shell chrome, not a modal command. Route it before app-modal fallback so the command-palette row and Cmd+B hide or restore the GPUI sidebar and divider while preserving the expanded sidebar width.

                CDXC:CommandPalette 2026-09-21 WHY:
                Numbered session-slot rows (`focusSessionSlot1..9`) resolve against the drawn row order: the store resolves and focuses the Nth drawn row when its list is drawn (gx_store/sidebar_session_slot.rs), and with the switch off they are delegated to SidebarApp as nativeHotkey messages. Previous/Next Session walk the native sidebar's rows in Rust (gx_store/session_walk.rs), which supersedes their delegation of 2026-06-26-23:20. Previous/Next Tab in Pane stays on GPUI tab-cycle routing, and jump-to-project ids must not enter this bounce path because SidebarApp forwards those back to native.

                CDXC:Hotkeys 2026-09-21 WHY:
                Project jump rows resolve against the drawn project order. With the store's list drawn the store resolves and performs the whole jump (gx_store/sidebar_slot_jump.rs); with the switch off they still go to SidebarApp as the dedicated `gpuiProjectSlotHotkey` host message, never `nativeHotkey`, which SidebarApp would forward back to GPUI. Supersedes the 2026-06-26-23:42 note that SidebarApp always resolved them.
                */
                if self.run_gpui_terminal_toolbar_hotkey_action(action_id, window, cx) {
                    return;
                }
                if action_id == "openModelPicker" {
                    self.request_focused_session_model_picker(window, cx);
                    return;
                }
                if action_id == "toggleChatView" {
                    /*
                    CDXC:SessionChat 2026-07-31:
                    Chat View toggling must work while the terminal is hidden
                    behind the chat surface, so it resolves the focused Agents
                    session directly instead of requiring a focused terminal
                    view like the other toolbar actions.
                    */
                    gpui_component::Root::hide_tooltip(window, cx);
                    self.toggle_agents_session_chat_mode_for_focused_session(cx);
                    return;
                }
                if let Some(mode) = gpui_command_palette_switch_workarea_hotkey_mode(action_id) {
                    self.switch_workarea_from_hotkey(mode, window, cx);
                    return;
                }
                if let Some(index) = gpui_titlebar_view_hotkey_index(action_id) {
                    /*
                    CDXC:Hotkeys 2026-09-20 DECISION:
                    User (screen 07): "⌥1–9 jumps to a view ... Follows the order of the tabs in this
                    panel." So the numbers walk the open tab strip, and a number past the last tab
                    falls through to the view in that position in Settings' own order, which is what
                    opens a view that is not open yet. This supersedes the 2026-09-09 rule that they
                    followed the titlebar's displayed view list, because that list is gone.
                    */
                    let tabs = self.strip_view_tabs();
                    if let Some(mode) = tabs.get(index).copied() {
                        self.switch_workarea_from_hotkey(mode, window, cx);
                        return;
                    }
                    if let Some(item) = self.titlebar_mode_switcher_items().get(index) {
                        self.switch_workarea_from_hotkey(item.mode, window, cx);
                    }
                    return;
                }
                if let Some(action_index) = gpui_command_palette_action_slot_index(action_id) {
                    self.run_configured_gpui_titlebar_action_index(action_index, window, cx);
                    return;
                }
                if let Some(direction) =
                    navigation_history::navigation_history_hotkey_direction(action_id)
                {
                    /*
                    CDXC:Navigation 2026-08-19:
                    Back/Forward is shell navigation, not an app-modal command,
                    and it is owned by the navigation history controller
                    (navigation_history/controller.rs; the sidebar runtime until
                    2026-09-25): the keypress takes the exact same route as a
                    click on the titlebar arrows, unless a focused Browser pane
                    takes it (navigate_focused_browser_history).
                    */
                    if self.navigate_focused_browser_history(direction == "back", cx) {
                        return;
                    }
                    self.request_navigation_history_navigation(direction, cx);
                    return;
                }
                if let Some(command) =
                    notification_feed::notification_feed_hotkey_command(action_id)
                {
                    if command == "open" {
                        self.toggle_gpui_titlebar_notifications_popup(window, cx);
                    } else {
                        self.request_notification_feed_command(command, None, cx);
                    }
                    return;
                }
                if action_id == "toggleSidebarCollapsed" {
                    self.toggle_gpui_sidebar_collapsed(cx);
                    return;
                }
                if action_id == "toggleViewPanel" {
                    self.toggle_view_panel(window, cx);
                    return;
                }
                if action_id == "expandViewPanel" {
                    self.toggle_view_panel_maximized(cx);
                    return;
                }
                if action_id == "expandViewPanelFully" {
                    self.toggle_view_panel_fully_expanded(cx);
                    return;
                }
                if action_id == "openExtensions" {
                    self.open_gpui_settings_extensions_page(Some(window), cx);
                    return;
                }
                if action_id == "openGhostexHelp" {
                    self.show_gpui_titlebar_help_menu(window, cx);
                    return;
                }
                if action_id == "openFileInFiles" {
                    self.native_docs_open_file_prompt(window, cx);
                    return;
                }
                if let Some(tab_cycle_action) =
                    gpui_command_palette_tab_cycle_hotkey_action(action_id)
                {
                    self.cycle_focused_tab(tab_cycle_action.reverse(), window, cx);
                    return;
                }
                if let Some(direction) =
                    gpui_command_palette_adjacent_group_focus_direction(action_id)
                {
                    if gpui_command_palette_adjacent_group_focus_source_allowed(self.shell_focus)
                        && self.focus_workspace_direction_by_render_order(direction, window, cx)
                    {
                        cx.notify();
                    }
                    return;
                }
                if let Some(direction) =
                    WorkspaceFocusDirection::from_command_palette_directional_focus_action_id(
                        action_id,
                    )
                {
                    self.focus_workspace_direction(direction, window, cx);
                    return;
                }
                match gpui_focused_pane_hotkey_action(action_id) {
                    Some(GpuiFocusedPaneHotkeyAction::CreateSession) => {
                        self.add_terminal_placeholder_tab_from_hotkey(window, cx);
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::OpenCommandsPanel) => {
                        self.open_command_pane_from_command_palette(window, cx);
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::OpenBrowserPane) => {
                        self.add_browser_tab_from_hotkey(window, cx);
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::SplitSessionRight) => {
                        if let Some(session_id) = self.focused_agents_workspace_shell_session_id() {
                            self.split_existing_agents_session_right(session_id, cx);
                        }
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::SplitRight) => {
                        self.split_focused_terminal_from_hotkey(
                            FocusedTerminalSplitDirection::Right,
                            cx,
                        );
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::SplitDown) => {
                        self.split_focused_terminal_from_hotkey(
                            FocusedTerminalSplitDirection::Down,
                            cx,
                        );
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::MergeAllTabs) => {
                        self.merge_all_agents_tabs_from_hotkey(cx);
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::RotatePanesClockwise) => {
                        self.rotate_agents_panes_from_hotkey(cx);
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::RuntimeNoOp(runtime_action)) => {
                        match runtime_action {
                            GpuiFocusedPaneRuntimeAction::ForkSession => {
                                if let Some(shell_session_id) =
                                    self.focused_agents_workspace_shell_session_id()
                                {
                                    let _ = self.dispatch_gpui_workspace_terminal_runtime_action(
                                        "forkSession",
                                        shell_session_id,
                                        cx,
                                    );
                                }
                            }
                            GpuiFocusedPaneRuntimeAction::ReloadSession => {
                                if let Some(shell_session_id) =
                                    self.focused_agents_workspace_shell_session_id()
                                {
                                    let _ = self.dispatch_gpui_workspace_terminal_runtime_action(
                                        "fullReloadSession",
                                        shell_session_id,
                                        cx,
                                    );
                                }
                            }
                            GpuiFocusedPaneRuntimeAction::PopOutPane => {}
                        }
                        return;
                    }
                    Some(GpuiFocusedPaneHotkeyAction::CommandSession(command_action)) => {
                        match command_action {
                            GpuiCommandPaneFocusedSessionHotkeyAction::Rename => {
                                if !self.open_gpui_rename_session_modal_for_focused_command_pane(cx)
                                {
                                    let _ = self
                                        .open_gpui_rename_session_modal_for_focused_agents_session(
                                            cx,
                                        );
                                }
                            }
                            GpuiCommandPaneFocusedSessionHotkeyAction::DelayedSend => {
                                if !self.open_gpui_delayed_send_modal_for_focused_command_pane(cx) {
                                    let _ = self
                                        .open_gpui_delayed_send_modal_for_focused_agents_session(
                                            cx,
                                        );
                                }
                            }
                            GpuiCommandPaneFocusedSessionHotkeyAction::CloseAfterDone => {
                                if !self
                                    .toggle_gpui_command_close_after_done_for_focused_command_pane(
                                        cx,
                                    )
                                {
                                    let _ = self
                                        .toggle_gpui_close_after_done_for_focused_agents_session(
                                            cx,
                                        );
                                }
                            }
                            GpuiCommandPaneFocusedSessionHotkeyAction::Sleep => {
                                self.sleep_focused_command_pane_session(cx);
                            }
                            GpuiCommandPaneFocusedSessionHotkeyAction::Wake => {
                                self.wake_focused_command_pane_session(cx);
                            }
                            GpuiCommandPaneFocusedSessionHotkeyAction::Close => {
                                if focused_command_pane_close_target(
                                    self.shell_focus,
                                    &self.command_pane,
                                )
                                .is_some()
                                {
                                    self.close_focused_surface(window, cx);
                                }
                            }
                        }
                        return;
                    }
                    None => {}
                }
                if let Some(reverse) = gpui_sidebar_session_walk_hotkey_reverse(action_id) {
                    self.walk_native_sidebar_sessions(reverse, cx);
                    return;
                }
                if let Some(slot_number) =
                    gpui_command_palette_session_slot_hotkey_number(action_id)
                {
                    // The store resolves the Nth drawn row and focuses it as a click would
                    // (gx_store/sidebar_session_slot.rs). Nothing else is told: the page that used
                    // to answer `nativeHotkey` is deleted, and the message had no listener left.
                    self.gx_store_run_session_slot_hotkey(slot_number, cx);
                    return;
                }
                if let Some(slot_number) =
                    gpui_command_palette_project_slot_hotkey_number(action_id)
                {
                    // The store plans and performs the whole jump (gx_store/sidebar_slot_jump.rs).
                    // Nothing else is told, for the same reason as the session slot above.
                    self.gx_store_run_project_slot_hotkey(slot_number, cx);
                    return;
                }
                let Some(modal) = gpui_app_modal_kind_for_hotkey_action_id(action_id) else {
                    return;
                };
                let sidebar_state_message =
                    self.gpui_app_modal_sidebar_state_message_for_open(modal, cx);
                let mut open_message = modal.open_message();
                if modal.requires_sidebar_state() {
                    open_message["latestSidebarStateMessage"] = sidebar_state_message.clone();
                }
                self.open_gpui_app_modal_window(
                    modal,
                    open_message,
                    sidebar_state_message,
                    None,
                    cx,
                );
            }
            "refreshDaemonSessions" => {
                self.refresh_gpui_daemon_sessions_state_in_background(None, cx);
            }
            "savePinnedPrompt" => {
                self.handle_gpui_save_pinned_prompt_command(command, cx);
            }
            "renameSession" => {
                self.handle_gpui_rename_command_session_command(command, cx);
            }
            "scheduleDelayedSend" => {
                self.handle_gpui_schedule_delayed_send_command(command, cx);
            }
            "postponeDelayedSend" => {
                self.handle_gpui_postpone_delayed_send_command(command, cx);
            }
            "cancelDelayedSend" => {
                self.handle_gpui_cancel_delayed_send_command(command, cx);
            }
            "toggleCloseAfterDone" => {
                self.handle_gpui_toggle_close_after_done_command(command, cx);
            }
            "killDaemonSession" => {
                let project_id = command
                    .get("workspaceId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let session_id = command
                    .get("sessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let active_project_id = self.gpui_daemon_sessions_active_project_id();
                let focused_session_id = self.gpui_daemon_sessions_focused_session_id();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_close_daemon_session_and_refresh_state(
                            project_id,
                            session_id,
                            active_project_id.as_deref(),
                            focused_session_id.as_deref(),
                        )
                    },
                    cx,
                );
            }
            "killTerminalDaemon" => {
                let dispatched = self.dispatch_gpui_workspace_sleep_all_daemon_sessions(cx);
                self.refresh_gpui_daemon_sessions_state_in_background(
                    (!dispatched).then(|| {
                        "The sidebar runtime is not ready to stop local terminal sessions. The list was refreshed without changing daemon state.".to_string()
                    }),
                    cx,
                );
            }
            "requestGhostexCliStatus" => {
                self.run_gpui_app_modal_and_titlebar_status_task(
                    || gpui_ghostex_cli_status_message(None),
                    cx,
                );
            }
            "installGhostexCli" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallGhostexCli,
                    cx,
                );
            }
            "installBrowserControl" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallBrowserControl,
                    cx,
                );
            }
            "installBrowserUseSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallBrowserUseSkill,
                    cx,
                );
            }
            "installComputerUseSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallComputerUseSkill,
                    cx,
                );
            }
            "installCliSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallCliSkill,
                    cx,
                );
            }
            "installAgentsOrchestrationSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallAgentsOrchestrationSkill,
                    cx,
                );
            }
            "installManageBeadsSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallManageBeadsSkill,
                    cx,
                );
            }
            "installGenerateTitleSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallGenerateTitleSkill,
                    cx,
                );
            }
            "installMoveCodexSessionSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallMoveCodexSessionSkill,
                    cx,
                );
            }
            "installHelpSkill" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::InstallHelpSkill,
                    cx,
                );
            }
            "installCuaDriver" => {
                self.handle_gpui_cua_driver_install_or_update(window, cx);
            }
            "reinstallCuaDriver" => {
                self.handle_gpui_cua_driver_reinstall(window, cx);
            }
            "uninstallCuaDriver" => {
                self.handle_gpui_cua_driver_uninstall(window, cx);
            }
            "checkCuaDriverUpdate" => {
                self.check_gpui_cua_driver_update(cx);
            }
            "runManagedToolTerminalCommand" => {
                if let Some(tool_id) = command.get("toolId").and_then(serde_json::Value::as_str) {
                    self.run_managed_tool_terminal_command(tool_id.to_string(), window, cx);
                }
            }
            "uninstallBundledAgentSkills" => {
                self.run_gpui_ghostex_cli_settings_action(
                    GpuiGhostexCliSettingsAction::UninstallBundledAgentSkills,
                    cx,
                );
            }
            "uninstallBundledAgentSkill" => {
                if let Some(skill_name) = command
                    .get("skillId")
                    .and_then(serde_json::Value::as_str)
                    .and_then(gpui_bundled_agent_skill_name)
                {
                    self.run_gpui_ghostex_cli_settings_action(
                        GpuiGhostexCliSettingsAction::UninstallBundledAgentSkill(skill_name),
                        cx,
                    );
                }
            }
            "requestAgentHookStatus" => {
                let agent_ids = gpui_settings_command_ordered_agent_ids(command);
                self.run_gpui_progressive_agent_hook_status_task(agent_ids, cx);
            }
            "installAgentHooks" => {
                let agent_ids = gpui_settings_command_agent_ids(command);
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_agent_hook_status_message(
                            "/api/installAgentHooks",
                            agent_ids,
                            "Agent hook install failed.",
                        )
                    },
                    cx,
                );
            }
            "uninstallAgentHooks" => {
                let agent_ids = gpui_settings_command_agent_ids(command);
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_agent_hook_status_message(
                            "/api/uninstallAgentHooks",
                            agent_ids,
                            "Agent hook uninstall failed.",
                        )
                    },
                    cx,
                );
            }
            "requestOSIntegrationStatus" => {
                self.run_gpui_app_modal_sidebar_status_task(gpui_os_integration_status_message, cx);
            }
            "requestPluginSettingsStatus" => {
                self.request_plugin_settings_status(cx);
            }
            "reinstallPlugin" => {
                if let Some(plugin_id) = command.get("pluginId").and_then(serde_json::Value::as_str)
                {
                    self.reinstall_plugin_from_settings(plugin_id, cx);
                }
            }
            "uninstallPlugin" => {
                if let Some(plugin_id) = command.get("pluginId").and_then(serde_json::Value::as_str)
                {
                    self.uninstall_plugin_from_settings(plugin_id, cx);
                }
            }
            "setOSIntegrationDefaults" => {
                let target = command
                    .get("target")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_set_os_integration_defaults_status_message(target.as_deref()),
                    cx,
                );
            }
            "requestGhostexFolderStats" => {
                self.run_gpui_app_modal_sidebar_status_task(gpui_ghostex_folder_stats_message, cx);
            }
            "openGhostexFolder" => {
                self.open_gpui_ghostex_folder(cx);
            }
            "requestAgentsHubCatalog" => {
                /*
                CDXC:AgentLauncher 2026-06-24-12:26:
                Agents Hub catalog requests return metadata-only rows through the existing app-modal sidebarState path. File bodies stay out of the open/catalog message and are read only by requestAgentsHubFileContent after Rust validates the selected file against the generated Hub catalog.
                */
                self.run_gpui_app_modal_sidebar_status_task(gpui_agents_hub_catalog_message, cx);
            }
            "requestAgentsHubFileContent" => {
                let file_path = command
                    .get("filePath")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let request_id = command
                    .get("requestId")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_agents_hub_file_content_message(file_path, request_id),
                    cx,
                );
            }
            "saveAgentsHubFile" => {
                self.handle_gpui_save_agents_hub_file_command(command, cx);
            }
            "requestAgentSyncReport" => {
                /*
                CDXC:AgentSync 2026-09-16 WHY:
                Agent Sync scans, plans, and applies through the shared ghostex-agent-sync crate on the background executor, and the JSON it returns is posted to the Hub through the same sidebarState path as the catalog, so the tab needs no new bridge.
                */
                self.run_gpui_app_modal_sidebar_status_task(gpui_agent_sync_report_message, cx);
            }
            "requestAgentSyncPlan" => {
                let scope = command
                    .get("scope")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("all")
                    .to_string();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_agent_sync_plan_message(scope),
                    cx,
                );
            }
            "applyAgentSyncPlan" => {
                let scope = command
                    .get("scope")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("all")
                    .to_string();
                let groups: Vec<String> = command
                    .get("groups")
                    .and_then(serde_json::Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(serde_json::Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_agent_sync_apply_message(scope, groups),
                    cx,
                );
            }
            "openAgentsHubPathInFinder" => {
                self.open_gpui_agents_hub_path_in_finder(command, cx);
            }
            "openAgentsHubFileInBuiltInEditor" => {
                self.open_gpui_agents_hub_file_in_built_in_editor(command, window, cx);
            }
            "openGhosttySettingsDocs" => {
                self.open_gpui_trusted_url(
                    GPUI_GHOSTTY_SETTINGS_DOCS_URL,
                    "openGhosttySettingsDocs",
                    cx,
                );
            }
            "openAccessibilityPreferences" => {
                self.open_gpui_macos_system_settings_url(
                    GPUI_MACOS_ACCESSIBILITY_PREFERENCES_URL,
                    "openAccessibilityPreferences",
                    cx,
                );
            }
            "openScreenRecordingPreferences" => {
                self.open_gpui_macos_system_settings_url(
                    GPUI_MACOS_SCREEN_RECORDING_PREFERENCES_URL,
                    "openScreenRecordingPreferences",
                    cx,
                );
            }
            "openMacOSNotificationSettings" => {
                self.open_gpui_macos_system_settings_url(
                    GPUI_MACOS_NOTIFICATION_SETTINGS_URL,
                    "openMacOSNotificationSettings",
                    cx,
                );
            }
            "requestMacOSNotificationPermission" => {
                self.request_gpui_macos_notification_permission(cx);
            }
            "playCompletionSoundPreview" => {
                self.play_gpui_completion_sound_preview(
                    command.get("sound").and_then(serde_json::Value::as_str),
                    cx,
                );
            }
            "testAgentTaskCompletion" => {
                self.test_gpui_agent_task_completion(cx);
            }
            "applyRecommendedGhosttySettings" => {
                self.update_gpui_ghostty_visible_settings(
                    shared_settings::apply_recommended_ghostty_visible_settings,
                    shared_settings::apply_recommended_ghostty_config_file,
                    cx,
                );
            }
            "resetGhosttySettingsToDefault" => {
                self.update_gpui_ghostty_visible_settings(
                    shared_settings::reset_ghostty_visible_settings_to_defaults,
                    shared_settings::reset_ghostty_config_file_to_defaults,
                    cx,
                );
            }
            "openGhosttyConfigFile" => {
                self.open_gpui_ghostty_config_file(cx);
            }
            "runPortlessSettingsAdminAction" | "runPortlessSetupPromptAdminAction" => {
                self.handle_gpui_portless_admin_action_message(command, cx);
            }
            "setPortlessEnabled" => {
                self.handle_gpui_set_portless_enabled_message(command, cx);
            }
            "saveSidebarAgent" | "deleteSidebarAgent" | "syncSidebarAgentOrder" => {
                self.handle_gpui_sidebar_agent_metadata_command(command, cx);
            }
            "saveSidebarCommand"
            | "deleteSidebarCommand"
            | "syncSidebarCommandOrder"
            | "saveGlobalSidebarCommand"
            | "deleteGlobalSidebarCommand"
            | "syncGlobalSidebarCommandOrder" => {
                self.handle_gpui_sidebar_command_metadata_command(command, cx);
            }
            "setProjectWorktreeCommand" => {
                let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let Some(command_text) = command
                    .get("command")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                self.update_gpui_project_settings_metadata_in_background(
                    GpuiProjectSettingsMetadataUpdate::WorktreeCommand {
                        project_id,
                        command: command_text,
                    },
                    cx,
                );
            }
            "setProjectBeadsDisplayKey" => {
                let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let Some(display_key) = command
                    .get("displayKey")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                self.update_gpui_project_settings_metadata_in_background(
                    GpuiProjectSettingsMetadataUpdate::BeadsDisplayKey {
                        project_id,
                        display_key,
                    },
                    cx,
                );
            }
            "setProjectBeadsDirectory" => {
                let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let Some(directory) = command
                    .get("directory")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                self.update_gpui_project_settings_metadata_in_background(
                    GpuiProjectSettingsMetadataUpdate::BeadsDirectory {
                        project_id,
                        directory,
                    },
                    cx,
                );
            }
            "setProjectDocsDirectory" => {
                let Some(project_id) = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let Some(directory) = command
                    .get("directory")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                self.update_gpui_project_settings_metadata_in_background(
                    GpuiProjectSettingsMetadataUpdate::DocsDirectory {
                        project_id,
                        directory,
                    },
                    cx,
                );
            }
            "requestPreviousSessions" => {
                let request = gpui_previous_sessions_request_from_command(command);
                let remote_sources = self.connected_gpui_remote_previous_session_sources();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_previous_sessions_result_message(request, remote_sources),
                    cx,
                );
            }
            "requestSessionTranscriptSizes" => {
                let request = gpui_session_transcript_sizes_request_from_command(command);
                let remote_sources = self.connected_gpui_remote_previous_session_sources();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_session_transcript_sizes_result_message(request, remote_sources),
                    cx,
                );
            }
            "requestStashedPrompts" => {
                /*
                CDXC:SavedPrompts 2026-07-29:
                The Prompts modal loads stashed prompt-editor saves on demand
                through the local gxserver daemon. The answer is a transient
                `stashedPromptsResult` sidebarState payload the modal host
                forwards as a window message; prompt bodies stay inside that
                round trip and are never logged or stored by Rust.
                */
                let request_id = command
                    .get("requestId")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let project_id = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let include_recovery = command
                    .get("includeRecovery")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(true);
                let include_delivered = command
                    .get("includeDelivered")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(true);
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_stashed_prompts_result_message(
                            &request_id,
                            project_id.as_deref(),
                            include_recovery,
                            include_delivered,
                        )
                    },
                    cx,
                );
            }
            "saveStashedPrompt" => {
                let request_id = command
                    .get("requestId")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let Some(content) = command
                    .get("content")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let project_id = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let prompt_id = command
                    .get("promptId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let session_id = command
                    .get("sessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let tag_ids = command
                    .get("tagIds")
                    .and_then(serde_json::Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(serde_json::Value::as_str)
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                    });
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_save_stashed_prompt_result_message(
                            &request_id,
                            &content,
                            prompt_id.as_deref(),
                            project_id.as_deref(),
                            session_id.as_deref(),
                            tag_ids.as_deref(),
                        )
                    },
                    cx,
                );
            }
            "saveStashedPromptTag" => {
                /*
                CDXC:SavedPrompts 2026-08-23:
                Tag create/rename runs through the same local gxserver daemon as
                the prompts, and answers with the whole refreshed catalogue so
                the modal's rail cannot drift from what is stored.
                */
                let request_id = command
                    .get("requestId")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let Some(name) = command
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let color = command
                    .get("color")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let tag_id = command
                    .get("tagId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_save_stashed_prompt_tag_result_message(
                            &request_id,
                            &name,
                            color.as_deref(),
                            tag_id.as_deref(),
                        )
                    },
                    cx,
                );
            }
            "deleteStashedPromptTag" => {
                let request_id = command
                    .get("requestId")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let Some(tag_id) = command
                    .get("tagId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_delete_stashed_prompt_tag_result_message(&request_id, &tag_id),
                    cx,
                );
            }
            "setStashedPromptTags" => {
                let request_id = command
                    .get("requestId")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let Some(prompt_id) = command
                    .get("promptId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let tag_ids = command
                    .get("tagIds")
                    .and_then(serde_json::Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(serde_json::Value::as_str)
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                self.run_gpui_app_modal_sidebar_status_task(
                    move || {
                        gpui_set_stashed_prompt_tags_result_message(
                            &request_id,
                            &prompt_id,
                            &tag_ids,
                        )
                    },
                    cx,
                );
            }
            "deleteStashedPrompt" => {
                if let Some(prompt_id) = command
                    .get("promptId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                {
                    cx.background_executor()
                        .spawn(async move {
                            let _ = gpui_gxserver_rpc_result(
                                "/api/deleteStashedPrompt",
                                &serde_json::json!({ "promptId": prompt_id }),
                                Duration::from_secs(5),
                            );
                        })
                        .detach();
                }
            }
            "insertStashedPrompt" => {
                let Some(content) = command
                    .get("content")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                else {
                    return;
                };
                let session_id = command
                    .get("sessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let inserted = session_id.as_deref().is_some_and(|session_id| {
                    self.insert_stashed_prompt_into_agents_session(
                        session_id,
                        &content,
                        command
                            .get("promptId")
                            .and_then(serde_json::Value::as_str)
                            .is_some_and(|id| id.starts_with("recovered:")),
                        cx,
                    )
                });
                if !inserted {
                    /*
                    CDXC:SavedPrompts 2026-07-29:
                    When the originating terminal is gone (closed tab, sleeping
                    session, all-projects row from another project), fall back
                    to the clipboard and say so instead of silently dropping
                    the selected prompt.
                    */
                    gpui_copy_to_clipboard(ClipboardItem::new_string(content), cx);
                    self.dispatch_gpui_app_modal_toast(
                        "info",
                        "Prompt copied to clipboard",
                        "The session's terminal is not available for direct insert.",
                        cx,
                    );
                }
            }
            "requestRecentProjects" => {
                let machine_id = command
                    .get("machineId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let normalized_machine_id = machine_id
                    .as_deref()
                    .and_then(gpui_normalize_remote_machine_id);
                let remote_target = normalized_machine_id
                    .as_deref()
                    .and_then(|machine_id| self.gpui_remote_gxserver_request_target(machine_id));
                let machine_name = normalized_machine_id
                    .as_deref()
                    .and_then(gpui_remote_machine_name_from_settings);
                let request = GpuiRecentProjectsRequest {
                    machine_id,
                    machine_name,
                    remote_target,
                };
                self.run_gpui_app_modal_sidebar_status_task(
                    move || gpui_recent_projects_result_message(&request),
                    cx,
                );
            }
            "restoreRecentProject" => {
                self.handle_gpui_app_modal_recent_project_mutation(
                    GpuiRecentProjectMutation::Restore,
                    command,
                    cx,
                );
            }
            "closeProjectFromProjects" => {
                self.handle_gpui_app_modal_recent_project_mutation(
                    GpuiRecentProjectMutation::Close,
                    command,
                    cx,
                );
            }
            "focusRecentProject" => {
                if let Some(project_id) =
                    command.get("projectId").and_then(serde_json::Value::as_str)
                {
                    let _ = self.dispatch_gpui_menu_bar_project_activation(project_id, cx);
                }
            }
            "removeRecentProject" => {
                self.handle_gpui_app_modal_recent_project_mutation(
                    GpuiRecentProjectMutation::Remove,
                    command,
                    cx,
                );
            }
            "copyRecentProjectPath" | "openRecentProjectInFinder" | "openRecentProjectTerminal" => {
                self.handle_gpui_app_modal_recent_project_path_action(command_type, command, cx);
            }
            // CDXC:Navigation 2026-09-23 DECISION:
            // User: selecting a Quick Access session while chat is collapsed shows it floating at the side and keeps the chat collapsed.
            "focusSession" => {
                if let Some(session_id) = command
                    .get("sessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                {
                    if self.dispatch_gpui_command_palette_session_focus(&session_id, cx) {
                        // Dismiss Quick Access before giving the floating sessions pane focus.
                        self.close_gpui_quick_access_window(cx);
                        self.reveal_floating_sessions(cx);
                    }
                }
            }
            /*
            CDXC:SavedPrompts 2026-08-24:
            Saved Prompts rows carry the raw gxserver ids of the session they
            were stashed from plus that session's provider conversation id. The
            modal closes itself (like the Quick Access rows above), so this arm
            only hands the bounded selector to the Rust store
            (stashed_prompt_jump.rs, `gx_store_open_conversation`), which
            owns the present → restore → resume routing.
            */
            "jumpToStashedPromptSession" => {
                let project_id = command
                    .get("projectId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let session_id = command
                    .get("sessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let agent_session_id = command
                    .get("agentSessionId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                let _ = self.dispatch_gpui_stashed_prompt_session_jump(
                    project_id.as_deref(),
                    session_id.as_deref(),
                    agent_session_id.as_deref(),
                    cx,
                );
            }
            "runSidebarCommand" => {
                if let Some(command_id) = command
                    .get("commandId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                {
                    let run_mode = command
                        .get("runMode")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string);
                    let _ = self.dispatch_gpui_command_palette_run_sidebar_command(
                        &command_id,
                        run_mode.as_deref(),
                        cx,
                    );
                }
            }
            "restorePreviousSession" => {
                if let Some(history_id) = command
                    .get("historyId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                {
                    let remote_sources = self.connected_gpui_remote_previous_session_sources();
                    let background = cx.background_executor().clone();
                    cx.spawn(async move |this, cx| {
                        let restored = background
                            .spawn(async move {
                                gpui_restore_previous_session_from_history_id(
                                    &history_id,
                                    &remote_sources,
                                )
                            })
                            .await;
                        let Some(restored) = restored else {
                            return;
                        };
                        let _ = this.update(cx, |this, cx| {
                            match restored {
                                GpuiPreviousSessionRestoreResult::Local {
                                    project_id,
                                    session_id,
                                } => {
                                    /*
                                    CDXC:Sessions 2026-07-11:
                                    macOS restores a previous terminal by creating its
                                    replacement row and then running the normal attach
                                    sequence. A focus-only dispatch lets the presentation
                                    reconciler create a placeholder, but does not provide
                                    that placeholder with gxserver's resume/attach payload,
                                    leaving an empty shell. Start the same local attach path
                                    directly here, using the currently focused Agents pane
                                    as the restore placement target.
                                    */
                                    // The restored session opens in its agent's Default Agent View
                                    // (`CDXC:SessionChat 2026-09-30 DECISION` in session_chat_launch.rs).
                                    this.arm_default_view_chat_launch_intent(
                                        GpuiWorkspaceTerminalSessionKey::Local(
                                            GpuiLocalWorkspaceSessionKey {
                                                project_id: project_id.clone(),
                                                session_id: session_id.clone(),
                                            },
                                        ),
                                    );
                                    if let Some(focus_id) =
                                        gpui_combined_presentation_session_focus_id(
                                            &project_id,
                                            &session_id,
                                        )
                                    {
                                        let _ = this
                                            .dispatch_gpui_command_palette_session_focus(
                                                &focus_id,
                                                cx,
                                            );
                                    }
                                    let key = GpuiLocalWorkspaceSessionKey {
                                        project_id,
                                        session_id,
                                    };
                                    this.local_workspace_latest_focus_key = Some(key.clone());
                                    this.refresh_sidebar_gxserver_bootstrap_if_changed(cx);
                                    let requested_pane_id = this.agents_workspace.focused_pane;
                                    if this.focus_existing_gpui_local_workspace_terminal(&key, cx) {
                                        return;
                                    }
                                    let attach_intent = this.local_workspace_attach_intent_for_key(&key);
                                    if !this.local_workspace_attach_pending.insert(key.clone()) {
                                        return;
                                    }
                                    let background = cx.background_executor().clone();
                                    cx.spawn(async move |this, cx| {
                                        let prepare_key = key.clone();
                                        let result = background
                                            .spawn(async move {
                                                gpui_prepare_local_workspace_attach_terminal_plan(
                                                    &prepare_key,
                                                    attach_intent,
                                                )
                                            })
                                            .await;
                                        let _ = this.update(cx, |this, cx| {
                                            this.local_workspace_attach_pending.remove(&key);
                                            if this.local_workspace_latest_focus_key.as_ref()
                                                != Some(&key)
                                            {
                                                return;
                                            }
                                            match result {
                                                Ok(plan) => {
                                                    let _ = this
                                                        .open_gpui_local_workspace_terminal(
                                                            key,
                                                            plan,
                                                            requested_pane_id,
                                                            false,
                                                            cx,
                                                        );
                                                }
                                                Err(message) => this.dispatch_gpui_app_modal_toast(
                                                    "warning",
                                                    "Session restore unavailable",
                                                    message.as_str(),
                                                    cx,
                                                ),
                                            }
                                        });
                                    })
                                    .detach();
                                }
                                GpuiPreviousSessionRestoreResult::Remote {
                                    remote_machine_id,
                                    project_id,
                                    session_id,
                                } => {
                                    this.refresh_gpui_remote_gxserver_presentation_in_background(&remote_machine_id);
                                    let scoped_session_id = gpui_remote_scoped_session_id(
                                        remote_machine_id.as_str(),
                                        project_id.as_str(),
                                        session_id.as_str(),
                                    );
                                    if let Some(reference) =
                                        gpui_remote_attach_session_reference_from_project_id(
                                            scoped_session_id.as_str(),
                                        )
                                    {
                                        this.arm_default_view_chat_launch_intent(
                                            GpuiWorkspaceTerminalSessionKey::Remote(
                                                GpuiRemoteAttachSessionKey::from(&reference),
                                            ),
                                        );
                                    }
                                    this.handle_gpui_remote_session_native_action(
                                        GpuiSidebarNativeProjectPathActionMessage {
                                            action:
                                                GpuiSidebarNativeProjectPathAction::OpenRemoteSessionTerminal,
                                            file_path: None,
                                            preferred_interface:
                                                GpuiPreferredAgentInterface::Terminal,
                                            project_id: gpui_remote_scoped_session_id(
                                                remote_machine_id.as_str(),
                                                project_id.as_str(),
                                                session_id.as_str(),
                                            ),
                                            keep_view: false,
                                            target_id: None,
                                        },
                                        cx,
                                    );
                                }
                            }
                        });
                    })
                    .detach();
                }
            }
            "deletePreviousSession" => {
                if let Some(history_id) = command
                    .get("historyId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                {
                    let remote_sources = self.connected_gpui_remote_previous_session_sources();
                    let background = cx.background_executor().clone();
                    cx.spawn(async move |_this, _cx| {
                        background
                            .spawn(async move {
                                gpui_delete_previous_session_from_history_id(
                                    &history_id,
                                    &remote_sources,
                                );
                            })
                            .await;
                    })
                    .detach();
                }
            }
            command_type
                if crate::app::quick_access::commands::QUICK_ACCESS_COMMAND_ROW_TYPES
                    .contains(&command_type) =>
            {
                self.run_quick_access_command_row(command_type, command, window, cx);
            }
            "searchPreviousSessionsByText" => {
                /*
                CDXC:Sessions 2026-06-24-11:53:
                The shared Previous Sessions modal no longer renders Search by Text launch buttons, and GPUI does not yet have enough current-project launch authority here to recreate macOS's direct text-search terminal honestly. Keep the legacy command harmless and response-free instead of faking a terminal launch or claiming success.
                */
            }
            "postponePortlessSetupPrompt" | "cancelPortlessSetupPrompt" => {
                self.suppress_gpui_portless_setup_prompt_for_this_run();
                self.refresh_open_gpui_app_modal_sidebar_state_in_background(cx);
            }
            command_type if gpui_app_modal_unsupported_settings_command_noop(command_type) => {}
            command_type if self.gx_store_run_app_modal_create_command(command_type, cx) => {}
            _ => {}
        }
    }
}

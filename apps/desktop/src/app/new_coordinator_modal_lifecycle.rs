//! Open, close, and create for the native New Coordinator dialog.
//! SEE-ALSO: apps/desktop/src/app/window/new_coordinator_modal.rs (the window), apps/desktop/src/app/gx_store/create/coordinator.rs (the create), packages/gx-core/src/sidebar_actions/open.rs (the `coordinator` project action that opens it).
use crate::app::window::*;
use crate::*;

impl GhostexGpuiApp {
    /// Opens the dialog for the `newCoordinator` modal: `groupId` (the project's sidebar group,
    /// which names the machine too) and `projectName`. An open without a group is dropped.
    pub(crate) fn open_gpui_new_coordinator_modal(
        &mut self,
        message: &serde_json::Value,
        cx: &mut gpui::Context<Self>,
    ) {
        let text = |key: &str| {
            message
                .get(key)
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        let Some(group_id) = text("groupId") else {
            return;
        };
        let agents = self.gx_store_coordinator_agents();
        let config = NewCoordinatorModalConfig {
            project_name: text("projectName").unwrap_or_else(|| "this project".to_string()),
            agents,
            selected_agent: 0,
            palette: self.gpui_native_modal_palette(),
        };
        let host = self.native_app_modal_host(cx, move |app, command, cx| {
            if let NewCoordinatorModalCommand::Create {
                agent_id,
                name,
                goal,
                first_request,
                model,
                effort,
            } = command
            {
                app.gx_store_create_coordinator(
                    &group_id,
                    &agent_id,
                    &name,
                    &goal,
                    &first_request,
                    model.as_deref(),
                    effort.as_deref(),
                    cx,
                );
            }
            app.release_native_app_modal_window(GpuiAppModalKind::NewCoordinator, cx);
        });
        self.open_native_app_modal(
            GpuiAppModalKind::NewCoordinator,
            NEW_COORDINATOR_MODAL_WIDTH,
            NEW_COORDINATOR_MODAL_INITIAL_HEIGHT,
            move |window, cx| {
                cx.new(|cx| GpuiNewCoordinatorModalWindow::new(config, host, window, cx))
            },
            cx,
        );
    }
}

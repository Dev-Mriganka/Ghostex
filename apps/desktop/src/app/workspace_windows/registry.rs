//! The open workspace windows, oldest first, and the one of them that runs the app-wide work.
//!
//! CDXC:AppWindows 2026-10-01 WHY:
//! The app object was written as the only one, so the work that must happen once per process stays with one lead window: the menu bar status item, notification banners and completion sounds, the updater, Keep Awake's automatic holds, Ghostex Capture, the first-run and Portless prompts and the agent settings reconciliation. The first window leads; when the lead closes, the oldest remaining window takes the work over, and the app quits only when the last workspace window closes. A lead term, not a flag, marks the lead, so a closed lead whose app object is dropped late cannot unregister what its successor registered.

use std::cell::{Cell, RefCell};

use gpui::{AnyWindowHandle, App, Context, Entity, WeakEntity, Window, WindowId};

use super::slots::{forget_workspace_window_slot, persist_workspace_window_frame_now};
use crate::app::helpers::*;
use crate::*;

pub(super) struct WorkspaceWindow {
    pub(super) handle: AnyWindowHandle,
    pub(super) app: WeakEntity<GhostexGpuiApp>,
    /// Which saved layout, focus and frame files this window reads and writes (slots.rs).
    pub(super) slot: u32,
    /// The frame this window last reported, so a bounds callback that moved nothing (macOS sends
    /// them for key and order churn) is ignored, and so its slot's frame file can be written.
    pub(super) frame: Option<GpuiWindowFrameState>,
    /// The title last given to the window.
    pub(super) title: String,
}

thread_local! {
    pub(super) static WORKSPACE_WINDOWS: RefCell<Vec<WorkspaceWindow>> = const { RefCell::new(Vec::new()) };
    /// Bumped each time a window becomes the lead; only the window holding the current term leads.
    static LEAD_TERM: Cell<u64> = const { Cell::new(0) };
}

fn begin_lead_term() -> u64 {
    let term = LEAD_TERM.get() + 1;
    LEAD_TERM.set(term);
    term
}

/// What `on_window_closed` does after a window went away.
pub(crate) enum WorkspaceWindowClosed {
    /// Not a workspace window (a modal, toast or popup).
    NotWorkspace,
    /// The last workspace window closed: the app quits, and the window reopens at the next launch.
    Last,
    /// Other workspace windows are still open.
    OthersRemain,
}

pub(super) fn register_workspace_window(
    handle: AnyWindowHandle,
    app: WeakEntity<GhostexGpuiApp>,
    slot: u32,
    frame: Option<GpuiWindowFrameState>,
) {
    WORKSPACE_WINDOWS.with(|windows| {
        windows.borrow_mut().push(WorkspaceWindow {
            handle,
            app,
            slot,
            frame,
            title: String::new(),
        });
    });
}

/// The slots of the open windows, oldest first.
pub(super) fn open_workspace_window_slots() -> Vec<u32> {
    WORKSPACE_WINDOWS.with(|windows| windows.borrow().iter().map(|entry| entry.slot).collect())
}

/// The workspace window the user is in: the active window when it is one, else the lead, else
/// the oldest open one. Menu bar commands without a window of their own go here.
pub(crate) fn active_workspace_window(
    cx: &App,
) -> Option<(AnyWindowHandle, WeakEntity<GhostexGpuiApp>)> {
    let active = cx.active_window().map(|window| window.window_id());
    WORKSPACE_WINDOWS.with(|windows| {
        let windows = windows.borrow();
        let live = || windows.iter().filter(|entry| entry.app.upgrade().is_some());
        live()
            .find(|entry| Some(entry.handle.window_id()) == active)
            .or_else(|| {
                live().find(|entry| {
                    entry
                        .app
                        .upgrade()
                        .is_some_and(|app| app.read(cx).is_lead_window())
                })
            })
            .or_else(|| live().next())
            .map(|entry| (entry.handle, entry.app.clone()))
    })
}

/// The lead window, for the app-wide commands it owns (Check for Updates).
pub(crate) fn lead_workspace_window(
    cx: &App,
) -> Option<(AnyWindowHandle, WeakEntity<GhostexGpuiApp>)> {
    WORKSPACE_WINDOWS.with(|windows| {
        windows
            .borrow()
            .iter()
            .find(|entry| {
                entry
                    .app
                    .upgrade()
                    .is_some_and(|app| app.read(cx).is_lead_window())
            })
            .map(|entry| (entry.handle, entry.app.clone()))
    })
}

/// Every other open workspace window's app, for changes all windows must follow (a saved setting).
pub(crate) fn other_workspace_window_apps(except: gpui::EntityId) -> Vec<Entity<GhostexGpuiApp>> {
    WORKSPACE_WINDOWS.with(|windows| {
        windows
            .borrow()
            .iter()
            .filter(|entry| entry.app.entity_id() != except)
            .filter_map(|entry| entry.app.upgrade())
            .collect()
    })
}

/// Whether more than one workspace window is open.
pub(super) fn several_workspace_windows_open() -> bool {
    WORKSPACE_WINDOWS.with(|windows| windows.borrow().len() > 1)
}

/// The CEF demand signal starts the web runtime in every open window, so each creates the web views
/// it is waiting for once the runtime is ready (`cef::initialize` runs once).
pub(crate) fn request_cef_runtime_in_every_window(cx: &mut App) {
    let apps = WORKSPACE_WINDOWS.with(|windows| {
        windows
            .borrow()
            .iter()
            .map(|entry| entry.app.clone())
            .collect::<Vec<_>>()
    });
    for app in apps {
        let _ = app.update(cx, |app, cx| app.request_cef_runtime(cx));
    }
}

/// Names the window after its project, so Mission Control, the Dock menu and the Window menu
/// tell the windows apart. Called while the window draws, so the title is set on the next turn
/// rather than inside the draw; costs a comparison when nothing changed.
pub(crate) fn sync_workspace_window_title(window: &Window, project_name: &str, cx: &mut App) {
    let title = if project_name.is_empty() || project_name == TITLEBAR_PROJECT_LABEL_FALLBACK {
        TITLEBAR_PROJECT_LABEL_FALLBACK.to_string()
    } else {
        format!("{project_name} - {TITLEBAR_PROJECT_LABEL_FALLBACK}")
    };
    let window_id = gpui::Window::window_handle(window).window_id();
    let changed = WORKSPACE_WINDOWS.with(|windows| {
        let mut windows = windows.borrow_mut();
        let Some(entry) = windows
            .iter_mut()
            .find(|entry| entry.handle.window_id() == window_id)
        else {
            return false;
        };
        if entry.title == title {
            return false;
        }
        entry.title = title.clone();
        true
    });
    if changed {
        window.defer(cx, move |window, _| window.set_window_title(&title));
    }
}

/// A window closed. Forgets it when it was a workspace window: a window the user closed while
/// another stays open loses its saved slot, the last one keeps it for the next launch, and when
/// the closed window led, the oldest remaining one takes the app-wide work over.
pub(crate) fn workspace_window_closed(window_id: WindowId, cx: &mut App) -> WorkspaceWindowClosed {
    let (closed, remaining) = WORKSPACE_WINDOWS.with(|windows| {
        let mut windows = windows.borrow_mut();
        let closed = windows
            .iter()
            .position(|entry| entry.handle.window_id() == window_id)
            .map(|index| windows.remove(index));
        let remaining = windows
            .iter()
            .map(|entry| (entry.handle, entry.app.clone()))
            .collect::<Vec<_>>();
        (closed, remaining)
    });
    let Some(closed) = closed else {
        return WorkspaceWindowClosed::NotWorkspace;
    };
    if remaining.is_empty() {
        persist_workspace_window_frame_now(closed.slot, closed.frame.as_ref());
        return WorkspaceWindowClosed::Last;
    }
    let _ = closed
        .app
        .update(cx, |app, _| app.workspace_window_closing = true);
    forget_workspace_window_slot(closed.slot);
    let lead_remains = remaining.iter().any(|(_, app)| {
        app.upgrade()
            .is_some_and(|app| app.read(cx).is_lead_window())
    });
    if !lead_remains {
        for (handle, app) in remaining {
            let took_over = handle
                .update(cx, |_, window, cx| {
                    app.update(cx, |app, cx| app.take_over_app_wide_duties(window, cx))
                        .is_ok()
                })
                .unwrap_or(false);
            if took_over {
                break;
            }
        }
    }
    WorkspaceWindowClosed::OthersRemain
}

impl GhostexGpuiApp {
    /// Whether this window runs the app-wide work (see the module comment).
    pub(crate) fn is_lead_window(&self) -> bool {
        self.lead_window_term
            .is_some_and(|term| term == LEAD_TERM.get())
    }

    /// The lead term a new window starts with: a fresh one for the launch window, none otherwise.
    pub(crate) fn initial_lead_window_term(lead: bool) -> Option<u64> {
        lead.then(begin_lead_term)
    }

    /// Whether nothing else uses what this window's teardown would stop for the whole process:
    /// the app is quitting, or no other workspace window is open.
    pub(crate) fn is_last_workspace_window(&self) -> bool {
        if GPUI_APP_QUIT_IN_PROGRESS.load(std::sync::atomic::Ordering::Acquire) {
            return true;
        }
        let own = self.main_window_handle.map(|handle| handle.window_id());
        WORKSPACE_WINDOWS.with(|windows| {
            !windows
                .borrow()
                .iter()
                .any(|entry| Some(entry.handle.window_id()) != own && entry.app.upgrade().is_some())
        })
    }

    /// The process-wide callbacks only the lead receives: menu bar status item clicks, sidebar
    /// pointer crossings, notification clicks, Reduce Motion, power events, Sparkle and the
    /// operating system's URL and file opens.
    pub(crate) fn register_app_wide_callback_targets(&self, cx: &mut Context<Self>) {
        #[cfg(target_os = "macos")]
        {
            register_gpui_menu_bar_status_callback_target(cx.weak_entity(), cx.to_async());
            register_gpui_sidebar_pointer_callback_target(cx.weak_entity(), cx.to_async());
            register_gpui_session_attention_notification_callback_target(
                cx.weak_entity(),
                cx.to_async(),
            );
            register_gpui_accessibility_display_options_callback_target(
                cx.weak_entity(),
                cx.to_async(),
            );
            register_gpui_workspace_power_events_callback_target(cx.weak_entity(), cx.to_async());
            register_gpui_sparkle_updater_callback_target(cx.weak_entity(), cx.to_async());
            register_gpui_os_integration_callback_target(cx.weak_entity(), cx.to_async());
        }
        #[cfg(not(target_os = "macos"))]
        let _ = cx;
    }

    /// The lead closed and this is the oldest remaining window: it runs the app-wide work from now
    /// on. Its own layout, focus and frame were already saved to its own slot.
    fn take_over_app_wide_duties(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        self.lead_window_term = Some(begin_lead_term());
        self.register_app_wide_callback_targets(cx);
        self.initialize_ghostex_capture(cx);
        self.apply_gpui_menu_bar_status_item_state();
        self.sync_gpui_keep_awake_automation_from_current_settings(cx);
        // Sparkle starts once per process and answers the same again; this re-arms the periodic
        // availability probe the closed lead ran.
        self.start_gpui_updater(cx);
        cx.notify();
    }
}

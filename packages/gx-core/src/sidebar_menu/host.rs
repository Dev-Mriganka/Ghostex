//! The facts only the host knows that the menus read.
//!
//! Each one is named here so there is one list of what the menus still borrow from outside the
//! store. The agents and the Saved Actions come from the daemon's sidebar HUD, which moves into
//! the store with the session lifecycle (M5); the primary agent and the keep-awake runtime are
//! client storage; the bridge flag is the host's own capability.

use std::collections::BTreeMap;

/// One agent the launcher offers.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LauncherAgent {
    pub agent_id: String,
    pub name: String,
    pub icon: Option<String>,
}

/// One Saved Action that can sit on a project header.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HeaderCommand {
    pub command_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub show_on_project_row: bool,
}

/// One Open In target (an editor, the file manager), as the header Open In button lists it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MenuOpenTarget {
    pub target_id: String,
    pub label: String,
    pub icon: String,
}

/// Everything the menus read that is neither the store nor the settings.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MenuHost {
    /// The agents the launcher offers, in HUD order.
    pub agents: Vec<LauncherAgent>,
    /// The agent the user launched last.
    pub primary_agent_id: Option<String>,
    /// Saved Actions that apply to every project.
    pub global_commands: Vec<HeaderCommand>,
    /// Saved Actions by project id.
    pub project_commands: BTreeMap<String, Vec<HeaderCommand>>,
    /// The armed keep-awake duration, when one is running.
    pub keep_awake_minutes: Option<i64>,
    /// The selected machine tab is reachable: always true for the local daemon.
    pub machine_connected: bool,
    /// The visible Open In targets, in the header Open In button's order. Empty where the host
    /// cannot launch an app.
    pub open_targets: Vec<MenuOpenTarget>,
    /// The host is the desktop app, which can check for updates, restart and quit. False for a
    /// page in a browser.
    pub app_lifecycle: bool,
}

impl MenuHost {
    /// `agents.find(agentId === readPrimaryAgentLauncherId()) ?? agents[0]`.
    pub(crate) fn primary_agent(&self) -> Option<&LauncherAgent> {
        self.primary_agent_id
            .as_deref()
            .and_then(|agent_id| self.agents.iter().find(|agent| agent.agent_id == agent_id))
            .or_else(|| self.agents.first())
    }
}

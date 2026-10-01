use crate::data::*;
use crate::rows::{row, section, Page, Section};

pub(crate) fn page() -> Page {
    Page {
        id: "agents",
        title: "Agents",
        sections: vec![config(), agent_list()],
    }
}

pub(crate) fn config() -> Section {
    section(
        "config",
        "Config",
        vec![
            row("defaultPromptAgent", "Default Prompt Agent", "Choose the agent used by Git helper prompts, project board Start Work, and the default worktree first-prompt selection."),
            row("titleGenerationAgent", "Title Generation Agent", "Choose the headless agent Ghostex uses for first-prompt session title generation. Hover the info icon to see the exact command Ghostex sends.").options(SESSION_TITLE_GENERATION_AGENT_OPTIONS),
            row("customTitleCommand", "Custom Title Command", "Run this command with the title prompt on stdin. It should print only the title."),
            row("acceptAll", "Agent approvals", "Choose whether supported agents ask before editing files or running commands. Per-agent settings can override this default."),
        ],
    )
}

pub(crate) fn agent_list() -> Section {
    section(
        "agentList",
        "Agents",
        vec![
            row("addAgent", "Add Agent", "Add, reorder, edit, or delete agent launchers. Expand a row to install or update its CLI, check its version, and open installation docs.").options_of(DEFAULT_SIDEBAR_AGENTS, "name", "name"),
            row("agentResumeHooks", "Agent Hooks", "Agent resume hooks let Ghostex capture each agent's native session id and resume the exact conversation after sleep, reload, or app restart. Install a single agent's hook from its row, or install and remove every Ghostex-owned hook with Install All and Uninstall All.").options_of(AGENT_HOOK_SUPPORTED_DEFAULT_AGENTS, "name", "name"),
            row("preferredAgentInterfaceOverrides", "Default view per agent", "Agents that support Ghostex's Chat View are marked with a chat bubble and can open in Chat or Terminal regardless of the global Default Agent View. Inherit keeps following that global setting."),
        ],
    )
}

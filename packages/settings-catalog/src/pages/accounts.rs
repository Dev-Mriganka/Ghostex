use crate::rows::{row, section, Page, Section};

pub(crate) fn page() -> Page {
    Page {
        id: "accounts",
        title: "Accounts",
        sections: vec![accounts()],
    }
}

pub(crate) fn accounts() -> Section {
    section(
        "accounts",
        "Accounts",
        vec![
            row("accounts", "Accounts, usage stats and automatic continuation", "Current CLI login, Claude cswap, Codex xswap, update, reinstall or uninstall Claude Swap and Codex Swap, sidebar usage strip, status lines, usage limits and resets, account indicators, switching, hide emails, privacy, error recovery and retry settings."),
        ],
    )
}

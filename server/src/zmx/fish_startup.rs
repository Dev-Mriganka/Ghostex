use super::scripts::shell_quote;
use crate::platform::shell::PlatformShell;

/// CDXC:Terminal 2026-10-01 WHY:
/// Running a fish user's agent from the `/bin/zsh -lic` script shell gave it zsh's PATH, so agents installed where only config.fish looks (`~/.local/bin` for omp and claude) failed with "command not found" and the session opened on an empty fish prompt.
/// Launch it from fish's `--init-command`, after config.fish has run, so the agent sees the user's real PATH and the same fish survives the agent. The command still runs in the script shell as an interactive login shell (`zsh -lic`, as before this change) because launch commands and custom agent commands are POSIX syntax and may rely on aliases or variables from the user's zsh profiles; the agent therefore keeps everything it had before and only gains fish's PATH. It travels in an environment variable that fish removes before running it, so no quoting crosses the two shells.
/// SEE-ALSO: server/src/zmx/zsh_startup.rs starts zsh users' agents from the first precmd for the same reason.
pub(super) fn agent_shell_command(
    shell_path: &str,
    script_shell: &PlatformShell,
    setup: &str,
    agent_command: &str,
) -> String {
    let init_command = format!(
        "set -l ghostex_agent_command $GHOSTEX_AGENT_STARTUP_COMMAND; set -e GHOSTEX_AGENT_STARTUP_COMMAND; {} {} $ghostex_agent_command",
        shell_quote(&script_shell.executable),
        script_shell.command_flag(true),
    );
    format!(
        "{setup}\nexport GHOSTEX_AGENT_STARTUP_COMMAND={}\nexec {} -l -i -C {}",
        shell_quote(agent_command),
        shell_quote(shell_path),
        shell_quote(&init_command),
    )
}

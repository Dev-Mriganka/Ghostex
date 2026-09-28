use serde_json::{json, Value};
use std::{io::Read, path::Path};

/// CDXC:AgentHooks 2026-09-14 WHY:
/// Windows command hooks must read JSON from stdin directly; passing it through Windows PowerShell 5.1 native argv strips JSON quotes.
/// Installation still uses the existing explicit install and Codex trust flow.
pub(crate) fn command(agent: &str, notify_path: &Path) -> String {
    let executable = std::env::current_exe().unwrap_or_default();
    let quote = |text: &str| format!("'{}'", text.replace('\'', "''"));
    format!(
        "powershell.exe -NoLogo -NoProfile -Command \"& {} agent-hook-notify-native {} {}\"",
        quote(&executable.to_string_lossy()),
        quote(&notify_path.to_string_lossy()),
        quote(agent)
    )
}

pub(crate) fn notify(args: Vec<String>) -> anyhow::Result<()> {
    let script = std::fs::read_to_string(
        args.first()
            .ok_or_else(|| anyhow::anyhow!("Missing hook path"))?,
    )?;
    let directory = super::install::notify_hook_state_directory(&script)
        .ok_or_else(|| anyhow::anyhow!("Missing hook state directory"))?;
    let mut input = String::new();
    std::io::stdin()
        .take(1024 * 1024)
        .read_to_string(&mut input)?;
    let mut payload: Value = serde_json::from_str(&input)?;
    let agent = args.get(1).map(String::as_str).unwrap_or("codex");
    if let Some(object) = payload.as_object_mut() {
        object.entry("agent").or_insert_with(|| json!(agent));
    }
    let state = [
        "VSMUX_SESSION_STATE_FILE",
        "GHOSTEX_SESSION_STATE_FILE",
        "ghostex_SESSION_STATE_FILE",
    ]
    .into_iter()
    .find_map(|key| std::env::var(key).ok().filter(|value| !value.is_empty()))
    .unwrap_or_default();
    if std::env::var("GHOSTEX_INTERNAL_PROMPT_GENERATION").as_deref() != Ok("1")
        && std::env::var("GHOSTEX_INTERNAL_TITLE_GENERATION").as_deref() != Ok("1")
    {
        let _ = super::run_notify_hook(vec![
            state,
            payload.to_string(),
            directory.to_string_lossy().into_owned(),
        ]);
    }
    if agent != "antigravity" {
        if payload["hook_event_name"] == "Interrupt" {
            println!("{{}}");
        } else {
            println!("{{\"continue\":true}}");
        }
    }
    Ok(())
}

/// Resolved over the live registry PATH, so a CLI installed while gxserver runs is not reported missing.
pub(crate) fn resolve_command(command: &str) -> Option<String> {
    crate::platform::live_path::find(command, &[]).map(|path| path.to_string_lossy().into_owned())
}

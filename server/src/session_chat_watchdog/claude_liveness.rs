use super::*;

// ---------------------------------------------------------------------------
// Claude liveness evidence
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ClaudeAgentLiveness {
    Alive,
    Exited,
    /// No registry to read, so the question was never answered — say nothing.
    Unknown,
}

/*
CDXC:AgentScreenDetection 2026-08-19:
Every live Claude CLI keeps `~/.claude/sessions/<pid>.json` describing itself
(pid, sessionId, cwd, status). gxserver knows the session's agentSessionId, so a
matching record whose pid is gone — or no record at all on a machine that keeps
this registry — is the only hard evidence the server can get that the agent
process itself died, since zmx only knows whether the PANE exists.

`updatedAt` is deliberately NOT used as the freshness test: it is written on
status changes, not as a heartbeat, so a busy Claude routinely shows minutes of
"staleness" and a time-based rule would invent exits. The pid is the truth.

Bounded on purpose: read only at watchdog escalation, never in the fingerprint
loop or a frame path.
*/
pub(super) fn probe_claude_agent_liveness(
    agent: Option<&str>,
    agent_session_id: Option<&str>,
) -> ClaudeAgentLiveness {
    if !matches!(agent.map(str::trim), Some("claude" | "openclaude")) {
        return ClaudeAgentLiveness::Unknown;
    }
    let Some(agent_session_id) = agent_session_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return ClaudeAgentLiveness::Unknown;
    };
    let mut registry_seen = false;
    let mut scanned = 0usize;
    for directory in claude_session_registry_dirs() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            if scanned >= CLAUDE_REGISTRY_SCAN_LIMIT {
                break;
            }
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            scanned += 1;
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            let Ok(record) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let Some(pid) = record.get("pid").and_then(Value::as_u64) else {
                continue;
            };
            registry_seen = true;
            if record.get("sessionId").and_then(Value::as_str) != Some(agent_session_id) {
                continue;
            }
            return if claude_registry_process_alive(pid) {
                ClaudeAgentLiveness::Alive
            } else {
                ClaudeAgentLiveness::Exited
            };
        }
    }
    /*
    No record for our session. That only means "exited" for stock `claude`,
    whose registry we just proved this machine keeps: an `openclaude` fork may
    simply not write one, and the neighbouring stock entries would then frame it
    for an exit it never had.
    */
    if registry_seen && agent.map(str::trim) == Some("claude") {
        ClaudeAgentLiveness::Exited
    } else {
        ClaudeAgentLiveness::Unknown
    }
}

/// Mirrors `resume_lookup::claude_project_roots`: the default home plus every
/// `~/.claude-profiles/<profile>` Ghostex may have launched the agent under.
fn claude_session_registry_dirs() -> Vec<PathBuf> {
    let home = crate::resume_lookup::home_dir();
    let mut directories = vec![home.join(".claude").join("sessions")];
    if let Ok(profiles) = std::fs::read_dir(home.join(".claude-profiles")) {
        for profile in profiles.flatten() {
            directories.push(profile.path().join("sessions"));
        }
    }
    directories
}

fn claude_registry_process_alive(pid: u64) -> bool {
    #[cfg(unix)]
    {
        u32::try_from(pid).is_ok_and(crate::runtime::is_process_running)
    }
    // Nothing to check the pid against, so never claim the process is gone.
    #[cfg(not(unix))]
    {
        let _ = pid;
        true
    }
}

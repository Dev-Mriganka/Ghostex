use serde_json::{Map, Value};
use std::path::Path;

use super::read_text_from_map;

/// CDXC:Bots 2026-09-28 DECISION:
/// User: resuming a Hermes conversation started outside Ghostex passes `-p <profile>` for the store it came from, so it resumes under the right bot: `-p <profile>` for `HERMES_HOME/profiles/<profile>` and `-p default` for `HERMES_HOME` itself, since plain `hermes` follows the sticky profile `hermes profile use` sets.
/// Supersedes the 2026-09-26 rule that left the default profile's as `{cmd} --resume <id>`.
/// A command that already picks a profile (a bot project's `hermes -p <profile>`) is kept as it is.
pub(super) fn with_external_hermes_profile(
    agent_id: Option<&str>,
    command: String,
    runtime_settings: &Map<String, Value>,
) -> String {
    if agent_id != Some("hermes-agent") {
        return command;
    }
    let Some(home) = read_text_from_map(runtime_settings, "externalAgentHome") else {
        return command;
    };
    let profile = hermes_profile_name(Path::new(&home)).unwrap_or_else(|| "default".to_string());
    let picks_profile = command
        .split_whitespace()
        .any(|token| matches!(token, "-p" | "--profile") || token.starts_with("--profile="));
    if picks_profile {
        command
    } else {
        format!("{command} -p {profile}")
    }
}

/// The profile a Hermes store folder belongs to, when it is `…/profiles/<profile>` and the name is
/// a plain word that is safe to type unquoted.
fn hermes_profile_name(home: &Path) -> Option<String> {
    if home.parent()?.file_name()? != "profiles" {
        return None;
    }
    let profile = home.file_name()?.to_str()?;
    crate::bot_projects::is_bot_profile_name(profile).then(|| profile.to_string())
}

#[cfg(test)]
mod tests {
    use super::super::*;
    use serde_json::json;

    #[test]
    fn an_outside_hermes_session_resumes_under_its_profile() {
        let settings = normalize_agent_settings(None);
        let resume = |project: Value, home: &str| {
            let session = json!({
                "agentId": "hermes-agent",
                "runtimeSettings": {
                    "agentSessionId": "20260926_111001_e55ebd",
                    "externalSession": true,
                    "externalAgentHome": home,
                },
            });
            build_agent_resume_plan(&project, &session, &settings)["primaryCommand"].clone()
        };
        let harry = "/Users/me/.hermes/profiles/harry";
        let project = |launch_settings: Value| json!({ "path": harry, "customAgents": [], "launchSettings": launch_settings });
        let expected = json!("hermes -p harry --resume \"20260926_111001_e55ebd\"");
        assert_eq!(resume(project(json!({})), harry), expected);
        assert_eq!(
            resume(
                project(json!({ "isBot": true, "botProfile": "harry" })),
                harry
            ),
            expected,
            "a bot project's own -p is not repeated"
        );
        assert_eq!(
            resume(
                json!({ "path": "/Users/me/.hermes", "customAgents": [], "launchSettings": {} }),
                "/Users/me/.hermes",
            ),
            json!("hermes -p default --resume \"20260926_111001_e55ebd\""),
        );
    }
}

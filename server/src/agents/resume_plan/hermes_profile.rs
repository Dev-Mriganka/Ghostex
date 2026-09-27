use serde_json::{Map, Value};
use std::path::Path;

use super::read_text_from_map;

/// CDXC:Bots 2026-09-26 DECISION:
/// User: resuming a Hermes conversation started outside Ghostex passes `-p <profile>` when its store is a profile's (`HERMES_HOME/profiles/<profile>`), so it resumes under the right bot; the default profile's stays `{cmd} --resume <id>`.
/// A command that already picks a profile (a bot project's `hermes -p <profile>`) is kept as it is.
pub(super) fn with_external_hermes_profile(
    agent_id: Option<&str>,
    command: String,
    runtime_settings: &Map<String, Value>,
) -> String {
    if agent_id != Some("hermes-agent") {
        return command;
    }
    let Some(profile) = read_text_from_map(runtime_settings, "externalAgentHome")
        .and_then(|home| hermes_profile_name(Path::new(&home)))
    else {
        return command;
    };
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
            json!("hermes --resume \"20260926_111001_e55ebd\""),
        );
    }
}

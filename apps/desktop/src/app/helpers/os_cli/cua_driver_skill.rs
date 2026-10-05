//! The cua-driver skill: Trycua's own agent skill pack, installed and removed by the
//! `cua-driver skills` verbs of the driver Settings already manages.

use std::{path::PathBuf, time::Duration};

use crate::app::helpers::*;

/// `cua-driver skills install` and `update` download the pack from GitHub Releases.
const CUA_DRIVER_SKILLS_TIMEOUT: Duration = Duration::from_secs(180);

/// The local copy `cua-driver skills install` keeps before linking it into each agent.
fn gpui_cua_driver_skill_pack_path() -> PathBuf {
    gpui_home_dir()
        .join(".cua-driver")
        .join("skills")
        .join("cua-driver")
}

fn gpui_run_cua_driver_skills(args: &[&str]) -> Result<(), String> {
    let Some(cua_driver_path) = gpui_cua_driver_executable_path() else {
        return Err(
            "The cua-driver command was not found. Install Fast Computer & Browser Use first."
                .to_string(),
        );
    };
    match gpui_run_command_with_timeout(&cua_driver_path, args, CUA_DRIVER_SKILLS_TIMEOUT) {
        Ok(true) => Ok(()),
        Ok(false) => Err(format!(
            "cua-driver {} did not finish successfully. Current integration status was refreshed.",
            args.join(" ")
        )),
        Err(_) => Err(format!(
            "cua-driver {} could not be started. Current integration status was refreshed.",
            args.join(" ")
        )),
    }
}

/// CDXC:AgentSkills 2026-10-05 WHY:
/// `cua-driver skills install` never replaces a pack it already fetched, so a pack left from an older driver is refreshed with `skills update`, which re-fetches it for the installed driver version and relinks every agent.
pub(crate) fn gpui_install_cua_driver_skill() -> Result<String, String> {
    let refresh = gpui_is_file(&gpui_cua_driver_skill_pack_path().join("SKILL.md"));
    gpui_run_cua_driver_skills(&["skills", if refresh { "update" } else { "install" }])?;
    if gpui_cua_driver_skill_path().is_none() {
        return Err(
            "cua-driver finished, but no agent skills folder links the Cua Driver skill yet. Current integration status was refreshed."
                .to_string(),
        );
    }
    Ok(if refresh {
        "Cua Driver skill updated to match the installed driver.".to_string()
    } else {
        "Cua Driver skill installed for every detected agent.".to_string()
    })
}

pub(crate) fn gpui_uninstall_cua_driver_skill() -> Result<String, String> {
    gpui_run_cua_driver_skills(&["skills", "uninstall"])?;
    Ok(
        "Cua Driver skill removed from your agents. You can install it again from Settings."
            .to_string(),
    )
}

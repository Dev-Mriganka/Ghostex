use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::LazyLock,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Definition {
    pub agent_id: String,
    pub binary: String,
    pub mise_tool: Option<String>,
    pub npm_package: Option<String>,
    #[serde(default)]
    pub npm_flags: Vec<String>,
    pub package_managers: Option<Vec<String>>,
    pub brew_formula: Option<String>,
    #[serde(default)]
    pub brew_cask: bool,
    pub winget_id: Option<String>,
    pub native: Option<Native>,
    pub version_args: Option<Vec<String>>,
    #[serde(default)]
    pub install_dirs: InstallDirs,
    pub latest_version: Option<LatestVersion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Native {
    install: String,
    update: Option<String>,
    windows_install: Option<String>,
    /// Variables the official installer and updater need, such as `CODEX_NON_INTERACTIVE`.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Lowercase, `/`-separated path fragments that only this agent's official installer produces.
    #[serde(default)]
    path_markers: Vec<String>,
}

/// Folders the official installer puts the binary in, `~` and `%VAR%` expanded. An installer that does not
/// add its folder to PATH (Claude's) still leaves a CLI Ghostex can find, and put on PATH.
#[derive(Default, Deserialize)]
pub(crate) struct InstallDirs {
    #[serde(default)]
    windows: Vec<String>,
    #[serde(default)]
    unix: Vec<String>,
}

/// Where the newest published version is read: a plain-text version, or one field of a JSON reply.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LatestVersion {
    pub url: String,
    pub json_field: Option<String>,
}

impl Definition {
    pub(crate) fn install_dirs(&self, home: &Path) -> Vec<PathBuf> {
        let dirs = if cfg!(windows) {
            &self.install_dirs.windows
        } else {
            &self.install_dirs.unix
        };
        dirs.iter()
            .filter_map(|dir| expand_dir(dir, home))
            .collect()
    }

    pub(crate) fn native_env(&self) -> BTreeMap<String, String> {
        self.native
            .as_ref()
            .map(|native| native.env.clone())
            .unwrap_or_default()
    }
}

fn expand_dir(template: &str, home: &Path) -> Option<PathBuf> {
    let mut text = template.to_string();
    if let Some(rest) = text.strip_prefix("~/") {
        text = format!("{}/{rest}", home.to_string_lossy());
    }
    while let Some(start) = text.find('%') {
        let end = start + 1 + text[start + 1..].find('%')?;
        let value = std::env::var(&text[start + 1..end]).ok()?;
        text.replace_range(start..=end, &value);
    }
    let path = if cfg!(windows) {
        PathBuf::from(text.replace('/', "\\"))
    } else {
        PathBuf::from(text)
    };
    path.is_absolute().then_some(path)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Method {
    pub id: String,
    pub label: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
}

pub(crate) static CATALOG: LazyLock<Vec<Definition>> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../packages/shared/agent-cli-catalog.json"
    ))
    .expect("valid bundled CLI catalog")
});

pub(crate) fn methods(
    definition: &Definition,
    executable: Option<&str>,
    home: &Path,
    mise_installation: Option<&super::mise::Installation>,
) -> Vec<Method> {
    let installed = executable.is_some();
    let mut methods = Vec::new();
    let mise_tool = mise_installation
        .and_then(|installation| installation.tool.clone())
        .or_else(|| definition.mise_tool.clone())
        .or_else(|| {
            definition
                .npm_package
                .as_ref()
                .map(|package| format!("npm:{package}"))
        });
    if let Some(tool) = mise_tool {
        methods.push(Method {
            id: "mise".into(),
            label: "mise".into(),
            command: super::mise::command(
                &tool,
                mise_installation.is_some_and(|installation| installation.tool.is_some()),
            ),
            unavailable_reason: missing_command("mise", home),
        });
    }
    if let Some(native) = &definition.native {
        let install = if cfg!(windows) {
            native.windows_install.as_deref()
        } else {
            Some(native.install.as_str())
        };
        if let Some(install) = install {
            // The self-updater runs by the installed binary's own path, so a CLI whose installer never put
            // its folder on PATH (Claude's) can still update.
            let command = match (executable, native.update.as_deref()) {
                (Some(path), Some(update)) => update
                    .strip_prefix(definition.binary.as_str())
                    .filter(|rest| rest.is_empty() || rest.starts_with(' '))
                    .map(|rest| {
                        let invoke = if cfg!(windows) { "& " } else { "" };
                        format!("{invoke}{}{rest}", super::process::quote(path))
                    })
                    .unwrap_or_else(|| update.to_string()),
                _ => install.to_string(),
            };
            let unavailable_reason = if command.starts_with("curl ") {
                missing_command("curl", home)
            } else if installed && command.starts_with(definition.binary.as_str()) {
                missing_command(&definition.binary, home)
            } else {
                None
            };
            methods.push(Method {
                id: "native".into(),
                label: "Official installer".into(),
                command,
                unavailable_reason,
            });
        }
    }
    if let Some(package) = &definition.npm_package {
        let managers = definition
            .package_managers
            .clone()
            .unwrap_or_else(|| vec!["npm".into(), "bun".into(), "pnpm".into()]);
        for manager in managers {
            let verb = if manager == "pnpm" { "add" } else { "install" };
            let flags = if manager == "npm" && !definition.npm_flags.is_empty() {
                format!("{} ", definition.npm_flags.join(" "))
            } else {
                String::new()
            };
            methods.push(Method {
                id: manager.clone(),
                label: manager.clone(),
                command: format!("{manager} {verb} -g {flags}{package}@latest"),
                unavailable_reason: missing_command(&manager, home),
            });
        }
    }
    if !cfg!(windows) {
        if let Some(formula) = &definition.brew_formula {
            let installed_formula = executable.and_then(brew_package);
            let formula = installed_formula
                .as_deref()
                .filter(|name| {
                    name.starts_with(&format!(
                        "{}@",
                        formula.rsplit('/').next().unwrap_or(formula)
                    ))
                })
                .unwrap_or(formula);
            let verb = if installed { "upgrade" } else { "install" };
            let cask = if definition.brew_cask { "--cask " } else { "" };
            methods.push(Method {
                id: "brew".into(),
                label: "Homebrew".into(),
                command: format!("brew {verb} {cask}{formula}"),
                unavailable_reason: missing_command("brew", home),
            });
        }
    }
    if cfg!(windows) {
        if let Some(package) = &definition.winget_id {
            let verb = if installed { "upgrade" } else { "install" };
            methods.push(Method {
                id: "winget".into(),
                label: "WinGet".into(),
                command: format!("winget {verb} --id {package} --exact --disable-interactivity"),
                unavailable_reason: missing_command("winget", home),
            });
        }
    }
    methods
}

/// Prerequisites (npm, curl, brew, winget, mise) come from the shared 60 second probe cache: a list of every
/// agent asks for the same few tools many times over.
fn missing_command(command: &str, home: &Path) -> Option<String> {
    (!crate::agent_hooks::probing::command_exists(command, home))
        .then(|| format!("Install {command} on this computer first."))
}

fn brew_package(path: &str) -> Option<String> {
    let path = std::fs::canonicalize(path)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let (_, rest) = path
        .split_once("/caskroom/")
        .or_else(|| path.split_once("/cellar/"))?;
    let name = rest.split('/').next()?;
    (!name.is_empty()
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"@._-+".contains(&byte)))
    .then(|| name.to_string())
}

/// CDXC:AgentProviders 2026-09-14 WHY:
/// A global npm install can leave a second CLI behind a Homebrew or native binary on PATH.
/// Resolve symlinks before choosing an updater; unknown and source installations require an explicit method selection.
pub(crate) fn detected_method(path: &str, definition: &Definition) -> Option<String> {
    if super::mise::looks_managed(path) {
        // Unresolved shims must not offer a native self-updater that would modify mise's installation.
        return Some("manual".into());
    }
    let real = std::fs::canonicalize(path).unwrap_or_else(|_| path.into());
    let normalized = real.to_string_lossy().replace('\\', "/").to_lowercase();
    let original = path.replace('\\', "/").to_lowercase();
    if normalized.contains("/winget/") || original.contains("/winget/") {
        return Some("winget".into());
    }
    if normalized.contains("/scoop/")
        || original.contains("/scoop/")
        || normalized.contains("/nix/store/")
    {
        return Some("manual".into());
    }
    if normalized.contains("/cellar/") || normalized.contains("/caskroom/") {
        return definition.brew_formula.as_ref().map(|_| "brew".into());
    }
    if definition.npm_package.is_some() {
        if original.contains("/.bun/") || normalized.contains("/.bun/") {
            return Some("bun".into());
        }
        if original.contains("/pnpm/") || normalized.contains("/pnpm/") {
            return Some("pnpm".into());
        }
        if normalized.contains("/node_modules/")
            || (cfg!(windows) && original.contains("/appdata/roaming/npm/"))
        {
            return Some("npm".into());
        }
    }
    if let Some(native) = &definition.native {
        if native.path_markers.iter().any(|marker| {
            normalized.contains(marker.as_str()) || original.contains(marker.as_str())
        }) {
            return Some("native".into());
        }
    }
    if definition.native.is_some()
        && [
            "/.local/",
            "/.claude/",
            "/.cursor/",
            "/.grok/",
            "/.factory/",
            "/.amp/",
            "/.opencode/",
            "/.hermes/",
            "/.kiro/",
            "/agy/",
        ]
        .iter()
        .any(|part| normalized.contains(part) || original.contains(part))
    {
        return Some("native".into());
    }
    None
}

//! Settings > Accounts keeps Claude Swap (cswap) and Codex Swap (xswap) current: installed and
//! latest versions, and Update, Reinstall and Uninstall run here so every client (desktop, web,
//! a remote computer's Settings) gets the same answer.

use super::{helpers, model::Provider, store};
use crate::{domain::DomainStateError, server::AppState};
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Mutex,
    time::{Duration, Instant},
};

const CODEX_SWAP_REPOSITORY: &str = "https://github.com/maddada/codex-swap";
const CODEX_SWAP_FORMULA: &str = "maddada/tap/codex-swap";
const LATEST_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const OUTPUT_LIMIT: usize = 4000;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Action {
    Update,
    Reinstall,
    Uninstall,
}
impl Action {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "update" => Some(Self::Update),
            "reinstall" => Some(Self::Reinstall),
            "uninstall" => Some(Self::Uninstall),
            _ => None,
        }
    }
    fn id(self) -> &'static str {
        match self {
            Self::Update => "update",
            Self::Reinstall => "reinstall",
            Self::Uninstall => "uninstall",
        }
    }
}

/// How the helper on this computer was installed, read from where its executable lives.
enum InstallMethod {
    Uv(PathBuf),
    Pipx(PathBuf),
    Homebrew(PathBuf),
    Cargo { cargo: PathBuf, root: PathBuf },
    WindowsInstaller(PathBuf),
    Unknown,
}
impl InstallMethod {
    fn id(&self) -> &'static str {
        match self {
            Self::Uv(_) => "uv",
            Self::Pipx(_) => "pipx",
            Self::Homebrew(_) => "homebrew",
            Self::Cargo { .. } => "cargo",
            Self::WindowsInstaller(_) => "windowsInstaller",
            Self::Unknown => "unknown",
        }
    }
    /// The program and arguments that perform `action` with the tool that owns the install.
    fn command(&self, action: Action) -> Option<(PathBuf, Vec<String>)> {
        let args = |list: &[&str]| list.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
        match (self, action) {
            (Self::Uv(uv), Action::Update) => {
                Some((uv.clone(), args(&["tool", "upgrade", "claude-swap"])))
            }
            (Self::Uv(uv), Action::Reinstall) => Some((
                uv.clone(),
                args(&["tool", "install", "--force", "--reinstall", "claude-swap"]),
            )),
            (Self::Uv(uv), Action::Uninstall) => {
                Some((uv.clone(), args(&["tool", "uninstall", "claude-swap"])))
            }
            (Self::Pipx(pipx), action) => Some((
                pipx.clone(),
                args(&[
                    match action {
                        Action::Update => "upgrade",
                        Action::Reinstall => "reinstall",
                        Action::Uninstall => "uninstall",
                    },
                    "claude-swap",
                ]),
            )),
            (Self::Homebrew(brew), action) => Some((
                brew.clone(),
                args(&[
                    match action {
                        Action::Update => "upgrade",
                        Action::Reinstall => "reinstall",
                        Action::Uninstall => "uninstall",
                    },
                    CODEX_SWAP_FORMULA,
                ]),
            )),
            (Self::Cargo { cargo, root }, Action::Update | Action::Reinstall) => {
                let mut list = args(&[
                    "install",
                    "--git",
                    CODEX_SWAP_REPOSITORY,
                    "--locked",
                    "--force",
                    "--root",
                ]);
                list.push(root.to_string_lossy().into_owned());
                Some((cargo.clone(), list))
            }
            (Self::Cargo { cargo, root }, Action::Uninstall) => {
                let mut list = args(&["uninstall", "codex-swap", "--root"]);
                list.push(root.to_string_lossy().into_owned());
                Some((cargo.clone(), list))
            }
            // xswap's own upgrade runs the official Windows installer into the same folder.
            (Self::WindowsInstaller(xswap), Action::Update | Action::Reinstall) => {
                Some((xswap.clone(), args(&["upgrade"])))
            }
            (Self::WindowsInstaller(_), Action::Uninstall) | (Self::Unknown, _) => None,
        }
    }
}

fn install_method(home: &Path, provider: Provider, executable: &Path) -> InstallMethod {
    let resolved = executable
        .canonicalize()
        .unwrap_or_else(|_| executable.to_path_buf());
    let normalized = resolved.to_string_lossy().replace('\\', "/").to_lowercase();
    match provider {
        Provider::Claude => {
            let uv = helpers::executable(home, "uv");
            if normalized.contains("/uv/tools/claude-swap/") {
                if let Some(uv) = uv {
                    return InstallMethod::Uv(uv);
                }
            }
            if normalized.contains("/pipx/venvs/claude-swap/") {
                if let Some(pipx) = helpers::executable(home, "pipx") {
                    return InstallMethod::Pipx(pipx);
                }
            }
            // uv copies its tool shims on Windows instead of linking them, so ask uv where its tools live.
            if let Some(uv) = uv {
                let tool_dir = crate::platform::process::background_command(&uv)
                    .args(["tool", "dir"])
                    .stdin(Stdio::null())
                    .output()
                    .ok()
                    .filter(|output| output.status.success())
                    .map(|output| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()));
                if tool_dir.is_some_and(|dir| dir.join("claude-swap").is_dir()) {
                    return InstallMethod::Uv(uv);
                }
            }
            InstallMethod::Unknown
        }
        Provider::Codex => {
            let Some(root) = resolved
                .parent()
                .filter(|bin| bin.ends_with("bin"))
                .and_then(Path::parent)
            else {
                return windows_installer(&resolved);
            };
            if root
                .parent()
                .is_some_and(|path| path.ends_with("Cellar/codex-swap"))
                && root.join("INSTALL_RECEIPT.json").is_file()
            {
                if let Some(brew) = helpers::executable(home, "brew") {
                    return InstallMethod::Homebrew(brew);
                }
            }
            let cargo_registered = std::fs::read_to_string(root.join(".crates.toml"))
                .ok()
                .and_then(|contents| contents.parse::<toml_edit::DocumentMut>().ok())
                .is_some_and(|receipt| {
                    receipt
                        .get("v1")
                        .and_then(toml_edit::Item::as_table)
                        .is_some_and(|packages| {
                            packages.iter().any(|(package, binaries)| {
                                package.starts_with("codex-swap ")
                                    && binaries.as_array().is_some_and(|binaries| {
                                        binaries
                                            .iter()
                                            .any(|binary| binary.as_str() == Some("xswap"))
                                    })
                            })
                        })
                });
            if cargo_registered {
                if let Some(cargo) = helpers::executable(home, "cargo") {
                    return InstallMethod::Cargo {
                        cargo,
                        root: root.to_path_buf(),
                    };
                }
            }
            windows_installer(&resolved)
        }
    }
}

fn windows_installer(xswap: &Path) -> InstallMethod {
    if cfg!(windows)
        && xswap.parent().is_some_and(|dir| {
            dir.ends_with("Programs/codex-swap") || dir.ends_with("Programs\\codex-swap")
        })
    {
        InstallMethod::WindowsInstaller(xswap.to_path_buf())
    } else {
        InstallMethod::Unknown
    }
}

fn installed_version(executable: &Path) -> Option<String> {
    let output = crate::platform::process::background_command(executable)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())?;
    version_in(&String::from_utf8_lossy(&output.stdout))
}

fn version_in(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(|token| token.trim_start_matches('v'))
        .find(|token| token.starts_with(|c: char| c.is_ascii_digit()) && token.contains('.'))
        .map(str::to_string)
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .split(['.', '-', '+'])
        .map_while(|part| part.parse::<u64>().ok())
        .collect()
}

static LATEST: Mutex<Option<HashMap<&'static str, (Instant, Result<String, String>)>>> =
    Mutex::new(None);

/// The newest published release: PyPI for claude-swap, GitHub releases for codex-swap. Cached for
/// six hours; `fresh` is the Settings "check again" click.
fn latest_version(provider: Provider, fresh: bool) -> Result<String, String> {
    let key = provider.helper();
    if !fresh {
        let cache = LATEST.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((at, answer)) = cache.as_ref().and_then(|cache| cache.get(key)) {
            if at.elapsed() < LATEST_TTL {
                return answer.clone();
            }
        }
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build();
    let answer = match provider {
        Provider::Claude => agent
            .get("https://pypi.org/pypi/claude-swap/json")
            .call()
            .ok()
            .and_then(|response| response.into_json::<Value>().ok())
            .and_then(|value| {
                value
                    .pointer("/info/version")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            }),
        Provider::Codex => agent
            .get("https://api.github.com/repos/maddada/codex-swap/releases/latest")
            .set("Accept", "application/vnd.github+json")
            .set("User-Agent", "Ghostex")
            .call()
            .ok()
            .and_then(|response| response.into_json::<Value>().ok())
            .and_then(|value| {
                value
                    .get("tag_name")
                    .and_then(Value::as_str)
                    .and_then(version_in)
            }),
    }
    .ok_or_else(|| {
        "Couldn't reach the release server. Check your connection and try again.".to_string()
    });
    LATEST
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get_or_insert_with(HashMap::new)
        .insert(key, (Instant::now(), answer.clone()));
    answer
}

struct Job {
    action: Action,
    status: &'static str,
    output: String,
    error: Option<String>,
    finished_at: Option<String>,
}
static JOBS: Mutex<Option<HashMap<&'static str, Job>>> = Mutex::new(None);

fn job_view(provider: Provider) -> Value {
    JOBS.lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .and_then(|jobs| jobs.get(provider.helper()))
        .map_or(Value::Null, |job| {
            json!({"action":job.action.id(),"status":job.status,"output":job.output,"error":job.error,"finishedAt":job.finished_at})
        })
}

fn tool_view(home: &Path, provider: Provider, fresh: bool) -> Value {
    let job = job_view(provider);
    let running = job.get("status").and_then(Value::as_str) == Some("running");
    let Some(executable) = helpers::executable(home, provider.helper()) else {
        return json!({"provider":provider,"installed":false,"actions":[],"job":job});
    };
    let method = install_method(home, provider, &executable);
    let actions: Vec<&str> = [Action::Update, Action::Reinstall, Action::Uninstall]
        .into_iter()
        .filter(|action| method.command(*action).is_some())
        .map(Action::id)
        .collect();
    // A running update replaces the binary under us; its version is read again once it finishes.
    let version = (!running).then(|| installed_version(&executable)).flatten();
    let latest = latest_version(provider, fresh);
    let update_available = match (&version, &latest) {
        (Some(current), Ok(latest)) => Some(version_parts(latest) > version_parts(current)),
        _ => None,
    };
    json!({
        "provider": provider,
        "installed": true,
        "path": executable,
        "installMethod": method.id(),
        "actions": actions,
        "version": version,
        "latestVersion": latest.as_ref().ok(),
        "updateAvailable": update_available,
        "checkError": latest.err(),
        "job": job,
    })
}

fn response(home: &Path, fresh: bool) -> Value {
    let tools: Vec<Value> = std::thread::scope(|scope| {
        let tasks: Vec<_> = [Provider::Claude, Provider::Codex]
            .into_iter()
            .map(|provider| scope.spawn(move || tool_view(home, provider, fresh)))
            .collect();
        tasks
            .into_iter()
            .filter_map(|task| task.join().ok())
            .collect()
    });
    json!({"accounts":[],"helpers":[],"defaults":{"claude":{},"codex":{}},"defaultAccounts":{},"newSessionAccounts":{},"helperTools":tools})
}

/// CDXC:AgentProviders 2026-09-28 DECISION:
/// User: Settings > Accounts updates, reinstalls and uninstalls Claude Swap and Codex Swap with icon buttons and tooltips, and checks for their updates the way the Trycua row does.
/// Each action runs through the tool that owns the install (uv or pipx for cswap; Homebrew, Cargo with its original `--root`, or the Windows installer for xswap), read from where the executable lives, so an update replaces the copy Ghostex actually runs instead of adding a second one. An install Ghostex cannot place offers no actions rather than guessing a command. Uninstall removes only the program: saved logins and shared conversations stay.
pub(crate) fn dispatch(
    state: &AppState,
    params: &Map<String, Value>,
) -> Result<Value, DomainStateError> {
    let home = state.paths.home_dir.clone();
    let operation = params
        .get("operation")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let fresh = params.get("fresh").and_then(Value::as_bool) == Some(true);
    match operation {
        "helperStatus" => Ok(response(&home, fresh)),
        "helperAction" => {
            let provider: Provider =
                serde_json::from_value(params.get("provider").cloned().unwrap_or_default())
                    .map_err(|_| DomainStateError::bad_request("Choose Claude or Codex."))?;
            let action = params
                .get("action")
                .and_then(Value::as_str)
                .and_then(Action::parse)
                .ok_or_else(|| {
                    DomainStateError::bad_request("Choose update, reinstall or uninstall.")
                })?;
            let executable = helpers::executable(&home, provider.helper())
                .ok_or_else(|| DomainStateError::bad_request("This helper isn't installed."))?;
            let (program, args) = install_method(&home, provider, &executable)
                .command(action)
                .ok_or_else(|| {
                    DomainStateError::bad_request(
                        "Ghostex can't manage this install. Use the tool you installed it with.",
                    )
                })?;
            {
                let mut jobs = JOBS.lock().unwrap_or_else(|e| e.into_inner());
                let jobs = jobs.get_or_insert_with(HashMap::new);
                if jobs
                    .get(provider.helper())
                    .is_some_and(|job| job.status == "running")
                {
                    return Err(DomainStateError::bad_request(
                        "This helper is already being changed.",
                    ));
                }
                jobs.insert(
                    provider.helper(),
                    Job {
                        action,
                        status: "running",
                        output: String::new(),
                        error: None,
                        finished_at: None,
                    },
                );
            }
            let path = std::env::join_paths(helpers::search_dirs(&home)).map_err(store::error)?;
            std::thread::spawn(move || {
                let result = crate::platform::process::background_command(&program)
                    .args(&args)
                    .env("PATH", path)
                    .env("HOMEBREW_NO_ENV_HINTS", "1")
                    .env("NONINTERACTIVE", "1")
                    .stdin(Stdio::null())
                    .output();
                let (status, output, error) = match result {
                    Ok(output) => {
                        let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
                        text.push_str(&String::from_utf8_lossy(&output.stderr));
                        let text = text.trim().to_string();
                        let tail = text
                            .char_indices()
                            .rev()
                            .nth(OUTPUT_LIMIT)
                            .map_or(text.as_str(), |(index, _)| &text[index..])
                            .to_string();
                        if output.status.success() {
                            ("complete", tail, None)
                        } else {
                            let last = tail
                                .lines()
                                .rev()
                                .find(|line| !line.trim().is_empty())
                                .unwrap_or_default()
                                .to_string();
                            (
                                "failed",
                                tail,
                                Some(if last.is_empty() {
                                    format!("The command exited with {}.", output.status)
                                } else {
                                    last
                                }),
                            )
                        }
                    }
                    Err(error) => (
                        "failed",
                        String::new(),
                        Some(format!("Couldn't start {}: {error}", program.display())),
                    ),
                };
                let mut jobs = JOBS.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(job) = jobs
                    .get_or_insert_with(HashMap::new)
                    .get_mut(provider.helper())
                {
                    job.status = status;
                    job.output = output;
                    job.error = error;
                    job.finished_at = Some(chrono::Utc::now().to_rfc3339());
                }
            });
            Ok(response(&home, false))
        }
        _ => Err(DomainStateError::bad_request(
            "Unknown account helper operation.",
        )),
    }
}

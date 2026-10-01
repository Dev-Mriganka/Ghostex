//! The Windows half of the start: native PowerShell and Windows driven from WSL.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::Start;
use crate::bail;
use crate::util::{self, bun, env_trimmed, output, root, Log, Res};

pub fn powershell(is_wsl: bool) -> &'static str {
    if is_wsl {
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    } else {
        "powershell.exe"
    }
}

pub fn system_executable(name: &str, is_wsl: bool) -> String {
    if is_wsl {
        format!("/mnt/c/Windows/System32/{name}.exe")
    } else {
        format!("{name}.exe")
    }
}

pub struct InstallPaths {
    pub host_path: String,
    pub windows_path: String,
}

/// CDXC:Build 2026-09-28 WHY:
/// Windows reads GHOSTEX_INSTALL_DIR, not the generic INSTALL_DIR that Linux honours: toolchains and shells set INSTALL_DIR for their own use, and inheriting it would silently move the Windows install (macOS ignores it for the same reason). Under WSL the value may be a Windows path (`D:/Ghostex/build/local`) or a WSL path.
pub fn resolve_install_paths(is_wsl: bool) -> Res<InstallPaths> {
    if let Some(configured) = env_trimmed("GHOSTEX_INSTALL_DIR") {
        let looks_windows = configured.starts_with("\\\\")
            || (configured.len() >= 3
                && configured.as_bytes()[0].is_ascii_alphabetic()
                && configured.as_bytes()[1] == b':'
                && matches!(configured.as_bytes()[2], b'\\' | b'/'));
        if is_wsl && looks_windows {
            let windows_path = configured.replace('/', "\\");
            return Ok(InstallPaths {
                host_path: wslpath("-u", &windows_path)?,
                windows_path,
            });
        }
        let host_path = std::path::absolute(&configured)?.display().to_string();
        let windows_path = if is_wsl {
            wslpath("-w", &host_path)?
        } else {
            host_path.clone()
        };
        return Ok(InstallPaths {
            host_path,
            windows_path,
        });
    }
    let out = output(Command::new(powershell(is_wsl)).current_dir(root()).args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$dir = $env:ProgramW6432; if (-not $dir) { $dir = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles) }; $dir",
    ]))?;
    let windows_path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() || windows_path.is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        bail!(
            "{}",
            if stderr.is_empty() {
                "Windows did not report its Program Files directory.".to_string()
            } else {
                stderr
            }
        );
    }
    if !is_wsl {
        return Ok(InstallPaths {
            host_path: windows_path.clone(),
            windows_path,
        });
    }
    Ok(InstallPaths {
        host_path: wslpath("-u", &windows_path)?,
        windows_path,
    })
}

fn wslpath(flag: &str, path: &str) -> Res<String> {
    let out = output(
        Command::new("wslpath")
            .arg(flag)
            .arg(path)
            .current_dir(root()),
    )?;
    let converted = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() || converted.is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        bail!(
            "{}",
            if stderr.is_empty() {
                format!("Could not convert {path} with wslpath {flag}.")
            } else {
                stderr
            }
        );
    }
    Ok(converted)
}

/// The path Windows sees for a path on this host (a WSL path becomes `\\wsl.localhost\...` or `C:\...`).
pub fn windows_path_for_host_path(host_path: &Path, is_wsl: bool) -> Res<String> {
    if !is_wsl {
        return Ok(host_path.display().to_string());
    }
    wslpath("-w", &host_path.display().to_string())
}

fn windows_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    }
}

/// The WSL2 gxserver runtime and the code-server Source runtime a Windows build bundles.
pub struct RuntimeArchives {
    require_wsl_runtime: bool,
    explicit_gxserver_archive: bool,
    explicit_code_server_archive: bool,
    gxserver_archive: PathBuf,
    code_server_archive: PathBuf,
    code_server_component_version: String,
    code_server_download_tag: String,
    code_server_archive_name: String,
    app_version: String,
}

impl RuntimeArchives {
    pub fn resolve(require_wsl_runtime: bool) -> Res<Self> {
        let arch = windows_arch();
        let package: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(root().join("package.json"))?)?;
        let app_version = package
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        // The code-server component identity is release tooling (JavaScript until the release port); its CLI prints the names the release published.
        let identity = output(&mut bun([
            "tooling/release-gpui/code-server-component-identity.mjs",
            "--root",
            ".dependencies/code-server",
            "--platform",
            &format!("linux-{arch}"),
            "--github-output",
        ]))?;
        if !identity.status.success() {
            bail!(
                "Could not resolve the code-server component identity: {}",
                String::from_utf8_lossy(&identity.stderr).trim()
            );
        }
        let identity = String::from_utf8_lossy(&identity.stdout).into_owned();
        let field = |key: &str| {
            identity
                .lines()
                .find_map(|line| line.strip_prefix(&format!("{key}=")).map(str::to_string))
                .ok_or_else(|| format!("code-server-component-identity.mjs printed no {key}"))
        };
        let explicit_gxserver = env_trimmed("GHOSTEX_WINDOWS_WSL_GXSERVER_ARCHIVE");
        let explicit_code_server = env_trimmed("GHOSTEX_WINDOWS_WSL_CODE_SERVER_ARCHIVE");
        let code_server_archive_name = field("archive_name")?;
        // CDXC:PlatformSupport 2026-08-09:
        // The gxserver release asset keeps the same filename across Ghostex releases, so an architecture-only cache could reuse a stale runtime from an earlier release. Scope the cache to the immutable Ghostex release tag so a version can only consume the WSL runtime published with that version.
        let gxserver_archive = match &explicit_gxserver {
            Some(path) => std::path::absolute(path)?,
            None => root()
                .join("build/runtime-artifacts")
                .join(format!("ghostex-{app_version}"))
                .join(arch)
                .join(format!("gxserver-linux-{arch}.tar.gz")),
        };
        let code_server_archive = match &explicit_code_server {
            Some(path) => std::path::absolute(path)?,
            None => root()
                .join("build/runtime-artifacts")
                .join(arch)
                .join(&code_server_archive_name),
        };
        Ok(Self {
            require_wsl_runtime,
            explicit_gxserver_archive: explicit_gxserver.is_some(),
            explicit_code_server_archive: explicit_code_server.is_some(),
            gxserver_archive,
            code_server_archive,
            code_server_component_version: field("component_version")?,
            code_server_download_tag: field("download_tag")?,
            code_server_archive_name,
            app_version,
        })
    }

    pub fn build_environment(&self, is_wsl: bool, verbose: bool) -> Vec<(String, String)> {
        let mut environment = vec![
            (
                "GHOSTEX_WINDOWS_ARCH".to_string(),
                windows_arch().to_string(),
            ),
            (
                "GHOSTEX_WINDOWS_REQUIRE_WSL_RUNTIME".into(),
                if self.require_wsl_runtime { "1" } else { "0" }.into(),
            ),
            (
                "GHOSTEX_WINDOWS_WSL_GXSERVER_ARCHIVE".into(),
                if self.require_wsl_runtime || self.explicit_gxserver_archive {
                    self.gxserver_archive.display().to_string()
                } else {
                    String::new()
                },
            ),
            (
                "GHOSTEX_WINDOWS_WSL_CODE_SERVER_ARCHIVE".into(),
                self.code_server_archive.display().to_string(),
            ),
            (
                "GHOSTEX_CODE_SERVER_COMPONENT_VERSION".into(),
                self.code_server_component_version.clone(),
            ),
        ];
        if is_wsl && !verbose {
            environment.push((
                "GHOSTEX_WINDOWS_BUILD_PROGRESS_PATH".into(),
                format!("/proc/{}/fd/1", std::process::id()),
            ));
        }
        environment
    }

    /// CDXC:PlatformSupport 2026-09-22 WHY:
    /// The gxserver runtime is a public release asset, so it is fetched straight from the release download URL. `gh release download` was used here before, but the GitHub CLI refuses to run unauthenticated and answers 401 whenever its stored token has expired, which blocked the start on a machine that never needed GitHub credentials to build the app.
    pub fn ensure_downloaded(&self, log: &Log) -> Res {
        if (self.require_wsl_runtime || self.explicit_gxserver_archive)
            && !self.gxserver_archive.exists()
        {
            if self.explicit_gxserver_archive {
                bail!(
                    "GHOSTEX_WINDOWS_WSL_GXSERVER_ARCHIVE does not exist: {}",
                    self.gxserver_archive.display()
                );
            }
            fs::create_dir_all(
                self.gxserver_archive
                    .parent()
                    .expect("archive has a parent"),
            )?;
            log.step(&format!(
                "Downloading the Ghostex {} WSL2 runtime...",
                self.app_version
            ));
            let name = self
                .gxserver_archive
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            util::download(
                &format!(
                    "https://github.com/maddada/Ghostex/releases/download/v{}/{name}",
                    self.app_version
                ),
                &self.gxserver_archive,
            )?;
        }
        let sidecar = PathBuf::from(format!("{}.sha256", self.code_server_archive.display()));
        let has_archive = self.code_server_archive.exists();
        let has_sidecar = sidecar.exists();
        if has_archive != has_sidecar {
            bail!(
                "The cached WSL2 Source runtime must contain both {} and its filename-bound .sha256 sidecar.",
                self.code_server_archive_name
            );
        }
        if !has_archive {
            if self.explicit_code_server_archive {
                bail!(
                    "GHOSTEX_WINDOWS_WSL_CODE_SERVER_ARCHIVE and its filename-bound .sha256 sidecar must exist: {}",
                    self.code_server_archive.display()
                );
            }
            fs::create_dir_all(
                self.code_server_archive
                    .parent()
                    .expect("archive has a parent"),
            )?;
            log.step(&format!(
                "Downloading the Ghostex WSL2 Source runtime {}...",
                self.code_server_component_version
            ));
            let repository = components_repo()?;
            let base = format!(
                "https://github.com/{repository}/releases/download/{}",
                self.code_server_download_tag
            );
            util::download(
                &format!("{base}/{}", self.code_server_archive_name),
                &self.code_server_archive,
            )?;
            util::download(
                &format!("{base}/{}.sha256", self.code_server_archive_name),
                &sidecar,
            )?;
        }
        Ok(())
    }
}

/// The public repository on-demand components are published to (GHOSTEX_COMPONENTS_REPO overrides it); release tooling owns the name.
fn components_repo() -> Res<String> {
    let out = output(&mut bun(["tooling/release-gpui/components-repo.mjs"]))?;
    if !out.status.success() {
        bail!("{}", String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

impl Start {
    /// CDXC:PlatformSupport 2026-09-18:
    /// Local Windows development can be driven entirely by the WSL bash launcher. Query the product-specific image names with tasklist instead of using a PowerShell CIM pipeline; no other application ships these executable names, and taskkill closes each matching process before the staged directory is replaced.
    /// Supersedes the 2026-08-02 two-name list, which omitted ghostex-gpui-runtime.exe. An installed release runs Ghostex.exe only as the CEF-free bootstrap; the long-lived app is the runtime it launches. Killing just the bootstrap and the CEF helpers left the runtime alive, and it respawned its helpers faster than the exit wait polled, so every start failed with "Ghostex did not exit". GhostexEditor.exe is bundled under resources/ and holds open handles inside the install directory, which Windows will not let the installer replace.
    pub fn windows_app_pids(&self) -> Vec<String> {
        let mut pids = Vec::new();
        for image in [
            "Ghostex.exe",
            "ghostex-gpui-runtime.exe",
            "ghostex-gpui-cef-helper.exe",
            "GhostexEditor.exe",
        ] {
            let Some(out) = util::stdout_if_ok(
                Command::new(system_executable("tasklist", self.is_wsl)).args([
                    "/FI",
                    &format!("IMAGENAME eq {image}"),
                    "/FO",
                    "CSV",
                    "/NH",
                ]),
            ) else {
                continue;
            };
            for line in out.lines() {
                // "Ghostex.exe","1234",...
                let mut fields = line.split("\",\"");
                let (Some(first), Some(pid)) = (fields.next(), fields.next()) else {
                    continue;
                };
                if first.starts_with('"')
                    && first.len() > 1
                    && !pid.is_empty()
                    && pid.bytes().all(|b| b.is_ascii_digit())
                {
                    pids.push(pid.to_string());
                }
            }
        }
        pids
    }

    /// CDXC:PlatformSupport 2026-09-18 WHY:
    /// Kill each app process by pid without taskkill /T, the same per-pid close macOS does. The runtime is the parent of gxserver.exe, and gxserver parents live wmx.exe terminal sessions, so a tree kill ended every agent running in those sessions. Every app process is already named in windows_app_pids, so the tree walk was never needed to reach the CEF helpers.
    pub fn terminate_windows_pids(&self, pids: &[String], force: bool) {
        for pid in pids {
            let mut kill = Command::new(system_executable("taskkill", self.is_wsl));
            kill.args(["/PID", pid]);
            if force {
                kill.arg("/F");
            }
            let _ = output(&mut kill);
        }
    }

    pub fn install_windows_app(&self) -> Res {
        let installed = self.windows_installed_app_path.clone().unwrap_or_default();
        self.log
            .step(&format!("Installing {} to {installed}...", self.app_name));
        self.log
            .detail("The default Program Files location requires administrator approval.");
        let installer = root().join("tooling").join("install-windows-gpui.ps1");
        let out = output(
            Command::new(powershell(self.is_wsl))
                .current_dir(root())
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                ])
                .arg(windows_path_for_host_path(&installer, self.is_wsl)?)
                .arg("-StagedAppPath")
                .arg(windows_path_for_host_path(&self.app_path, self.is_wsl)?)
                .arg("-InstallDir")
                .arg(&installed),
        )?;
        print!("{}", String::from_utf8_lossy(&out.stdout));
        eprint!("{}", String::from_utf8_lossy(&out.stderr));
        if !out.status.success() {
            bail!(
                "The Windows Ghostex installer failed with exit code {}.",
                out.status.code().unwrap_or(1)
            );
        }
        if !self.installed_app_path.join("Ghostex.exe").exists() {
            bail!("The installed Ghostex executable is missing at {installed}\\Ghostex.exe.");
        }
        self.log
            .detail("Installed app and Start Menu shortcut are ready.");
        Ok(())
    }

    pub fn launch_windows_app(&self) -> Res {
        let executable = self.installed_app_path.join("Ghostex.exe");
        let mut launch = Command::new(&executable);
        launch.current_dir(&self.installed_app_path);
        if self.opts.profile {
            launch.arg("--profile");
        }
        launch
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const DETACHED_PROCESS: u32 = 0x0000_0008;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
            launch.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            launch.process_group(0);
        }
        let child = launch
            .spawn()
            .map_err(|error| util::spawn_error(&launch, error))?;
        println!("Launched {} (pid {}).", executable.display(), child.id());
        Ok(())
    }

    /// CDXC:ServerDaemon 2026-09-23 WHY:
    /// A previous daemon's shutdown could remove its replacement's runtime metadata while the replacement still owned its listening socket. Discover Windows listeners from the exact installed, staged, or managed CLI package executable's process, and retain that endpoint through shutdown polling; metadata disappearance is not proof the server stopped. This supersedes discovery solely from runtime/server.json.
    pub fn windows_gxserver_endpoints(&self) -> Res<Vec<(String, Option<u64>)>> {
        let data_dir = crate::gxserver::explicit_ghostex_home().unwrap_or_else(|| {
            crate::gxserver::local_app_data()
                .join("Ghostex")
                .join("Data")
        });
        let script = r#"
$ErrorActionPreference = 'Stop'
$serverPaths = ConvertFrom-Json -InputObject $env:GHOSTEX_START_SERVER_PATHS
$servers = @(Get-Process gxserver -ErrorAction SilentlyContinue | Where-Object { $_.Path -in $serverPaths })
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
@($servers | ForEach-Object {
  $serverProcess = $_
  $listeners | Where-Object { $_.OwningProcess -eq $serverProcess.Id -and $_.LocalAddress -eq '127.0.0.1' } | ForEach-Object {
    @{ pid = $serverProcess.Id; port = $_.LocalPort }
  }
}) | ConvertTo-Json -Compress
"#;
        let server_paths: Vec<String> = [&self.installed_app_path, &self.app_path]
            .iter()
            .map(|dir| {
                dir.join("resources")
                    .join("native")
                    .join("gxserver.exe")
                    .display()
                    .to_string()
            })
            .chain(std::iter::once(
                data_dir
                    .join("gxserver")
                    .join("package")
                    .join("bin")
                    .join("gxserver.exe")
                    .display()
                    .to_string(),
            ))
            .collect();
        let out = output(
            Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .env(
                    "GHOSTEX_START_SERVER_PATHS",
                    serde_json::to_string(&server_paths)?,
                ),
        )?;
        if !out.status.success() {
            bail!(
                "Could not inspect Windows gxserver listeners: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let parsed: serde_json::Value =
            serde_json::from_str(if text.is_empty() { "[]" } else { &text })?;
        let records = match parsed {
            serde_json::Value::Array(items) => items,
            other => vec![other],
        };
        Ok(records
            .iter()
            .filter_map(|record| {
                let port = record.get("port")?.as_u64()?;
                Some((
                    format!("http://127.0.0.1:{port}"),
                    record.get("pid").and_then(|p| p.as_u64()),
                ))
            })
            .collect())
    }
}

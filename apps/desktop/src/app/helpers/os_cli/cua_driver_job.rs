//! The Trycua install, update, reinstall or uninstall job the desktop app runs in the background,
//! and the progress fields it adds to the `ghostexCliStatus` payload.

use std::{
    io::Read,
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

const OUTPUT_LIMIT: usize = 16 * 1024;
const JOB_TIMEOUT: Duration = Duration::from_secs(20 * 60);

#[derive(Clone)]
struct CuaDriverJob {
    operation: &'static str,
    status: &'static str,
    output: String,
    error: Option<String>,
}

static JOB: Mutex<Option<CuaDriverJob>> = Mutex::new(None);
/// The last full `ghostexCliStatus` payload, so progress updates can repeat it with the job
/// fields refreshed instead of re-running every probe each second.
static LAST_STATUS: Mutex<Option<serde_json::Value>> = Mutex::new(None);

pub(crate) fn gpui_cua_driver_job_running() -> bool {
    JOB.lock()
        .ok()
        .and_then(|job| job.as_ref().map(|job| job.status == "running"))
        .unwrap_or(false)
}

/// `cuaDriverJob` in the status payload (`SidebarGhostexCliStatusMessage`).
pub(crate) fn gpui_cua_driver_job_json() -> serde_json::Value {
    JOB.lock()
        .ok()
        .and_then(|job| job.clone())
        .map_or(serde_json::Value::Null, |job| {
            serde_json::json!({
                "operation": job.operation,
                "status": job.status,
                "output": job.output,
                "error": job.error,
            })
        })
}

/// Adds the Trycua job, install plan and /Applications check to a `ghostexCliStatus` payload and
/// remembers it for progress updates.
pub(crate) fn gpui_decorate_ghostex_cli_status(payload: &mut serde_json::Value) {
    payload["cuaDriverJob"] = gpui_cua_driver_job_json();
    payload["cuaDriverInstallPlan"] = serde_json::json!(gpui_cua_driver_install_plan());
    payload["cuaDriverApplicationsBlockedReason"] = gpui_cua_driver_applications_blocked_reason()
        .map_or(serde_json::Value::Null, |reason| serde_json::json!(reason));
    if let Ok(mut last) = LAST_STATUS.lock() {
        *last = Some(payload.clone());
    }
}

/// The last status with the job's current progress, for the once-a-second refresh while it runs.
pub(crate) fn gpui_cua_driver_progress_status_payload() -> serde_json::Value {
    let mut payload = LAST_STATUS
        .lock()
        .ok()
        .and_then(|last| last.clone())
        .unwrap_or_else(|| serde_json::json!({ "type": "ghostexCliStatus" }));
    payload["cuaDriverJob"] = gpui_cua_driver_job_json();
    payload
}

/// Tooltip for Install and Reinstall: exactly what one click runs.
pub(crate) fn gpui_cua_driver_install_plan() -> String {
    if cfg!(target_os = "windows") {
        "Runs Trycua's official installer from cua.ai (irm https://cua.ai/driver/install.ps1 | iex) in the background. Windows shows one administrator prompt to let Trycua start with Windows; you can decline it.".to_string()
    } else if cfg!(target_os = "macos") {
        "Runs Trycua's official installer from cua.ai (curl -fsSL https://cua.ai/driver/install.sh | bash) in the background; it puts CuaDriver.app in /Applications and starts it. No password needed; macOS then asks you to allow Accessibility and Screen Recording.".to_string()
    } else {
        "Runs Trycua's official installer from cua.ai (curl -fsSL https://cua.ai/driver/install.sh | bash) in the background. No password needed.".to_string()
    }
}

/// macOS: why Install cannot run, when this account cannot write /Applications.
pub(crate) fn gpui_cua_driver_applications_blocked_reason() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let path = std::ffi::CString::new("/Applications").ok()?;
        // SAFETY: `path` is a valid NUL-terminated C string for the duration of the call.
        let writable = unsafe { libc::access(path.as_ptr(), libc::W_OK) } == 0;
        if !writable {
            return Some("Trycua's installer copies CuaDriver.app into /Applications, which this account can't change. Sign in as an administrator, or ask one to install Trycua.".to_string());
        }
    }
    None
}

/// Registers a running job, or refuses when one is already running.
pub(crate) fn gpui_begin_cua_driver_job(operation: &'static str) -> Result<(), String> {
    let mut job = JOB.lock().map_err(|error| error.to_string())?;
    if job.as_ref().is_some_and(|job| job.status == "running") {
        return Err("Trycua is already being installed or changed. Wait for it to finish.".into());
    }
    *job = Some(CuaDriverJob {
        operation,
        status: "running",
        output: String::new(),
        error: None,
    });
    Ok(())
}

fn append(chunk: &str) {
    if let Ok(mut job) = JOB.lock() {
        if let Some(job) = job.as_mut() {
            job.output.push_str(chunk);
            if job.output.len() > OUTPUT_LIMIT {
                let mut start = job.output.len() - OUTPUT_LIMIT;
                while !job.output.is_char_boundary(start) {
                    start += 1;
                }
                job.output.drain(..start);
            }
        }
    }
}

pub(crate) fn gpui_finish_cua_driver_job(result: &Result<(), String>) {
    if let Ok(mut job) = JOB.lock() {
        if let Some(job) = job.as_mut() {
            job.status = if result.is_ok() {
                "succeeded"
            } else {
                "failed"
            };
            job.error = result.as_ref().err().cloned();
        }
    }
}

/// The program and arguments that run `script` headless: bash on macOS and Linux, Windows
/// PowerShell 5.1 (every Windows has it) with the process-scoped execution-policy bypass the
/// official installers ask for.
fn job_command(script: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; {script}"
            ),
        ]);
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new("/bin/bash");
        command.args(["-c", &format!("set -o pipefail; {script}")]);
        use std::os::unix::process::CommandExt;
        command.process_group(0);
        command
    }
}

/// Runs `script` to completion, streaming its output into the job. Blocking.
pub(crate) fn gpui_run_cua_driver_job_script(script: &str) -> Result<(), String> {
    let mut child = job_command(script)
        .env("NO_COLOR", "1")
        .env("TERM", "dumb")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the Trycua installer: {error}"))?;
    let readers = [
        child.stdout.take().map(drain),
        child.stderr.take().map(drain),
    ];
    let deadline = Instant::now() + JOB_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                #[cfg(unix)]
                // SAFETY: signals only the process group this job started.
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
                let _ = child.kill();
                let _ = child.wait();
                return Err("The Trycua installer did not finish within 20 minutes.".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(250)),
            Err(error) => return Err(error.to_string()),
        }
    };
    for reader in readers.into_iter().flatten() {
        let _ = reader.join();
    }
    if status.success() {
        Ok(())
    } else {
        let last = JOB
            .lock()
            .ok()
            .and_then(|job| {
                job.as_ref().and_then(|job| {
                    job.output
                        .lines()
                        .rev()
                        .map(str::trim)
                        .find(|line| !line.is_empty())
                        .map(str::to_string)
                })
            })
            .unwrap_or_else(|| format!("The installer exited with {status}."));
        Err(last)
    }
}

fn drain(mut pipe: impl Read + Send + 'static) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        while let Ok(read) = pipe.read(&mut buffer) {
            if read == 0 {
                break;
            }
            append(&String::from_utf8_lossy(&buffer[..read]));
        }
    })
}

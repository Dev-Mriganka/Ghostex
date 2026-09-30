//! The UI scale the Linux app runs at. The whole app is an X11 client (see
//! `force_gpui_x11_backend_for_windowed_cef` in `main.rs`), so under a Wayland compositor it
//! runs on XWayland, where nothing in X11 carries the scale the user picked.

use std::env;
use std::sync::OnceLock;

const GPUI_X11_SCALE_FACTOR: &str = "GPUI_X11_SCALE_FACTOR";

static PINNED_SCALE_FACTOR: OnceLock<f32> = OnceLock::new();

/// CDXC:PlatformSupport 2026-09-30 WHY:
/// Without `Xft.dpi`, GPUI's X11 client derives its scale from the monitor's physical size (RandR millimetres), so a 1920x1080 14-inch panel on Omarchy/Hyprland came out at 1.5x and the chat, sidebar and Settings were far larger than every other app. Under XWayland Ghostex therefore picks the scale itself: `Xft.dpi` when the desktop publishes one (GNOME, KDE; GPUI and Chromium both read it), otherwise Hyprland's monitor scale when `xwayland:force_zero_scaling` hands X clients native pixels (so Ghostex matches the rest of the desktop), otherwise `GDK_SCALE`, otherwise 1.0, and never the physical-size guess. XWayland is detected from the X server's `XWAYLAND` extension, not `WAYLAND_DISPLAY`: session launchers (uwsm, systemd units) can start the app without that variable, which silently left it at 1.5x (superseding the 2026-09-29 version, which keyed on `WAYLAND_DISPLAY`). An explicit `GPUI_X11_SCALE_FACTOR` still wins.
/// SEE-ALSO: `append_platform_command_line_switches` in `cef/linux_x11.rs` gives Chromium the same scale.
pub(crate) fn pin_gpui_x11_scale_factor() {
    if env::var(GPUI_X11_SCALE_FACTOR).is_ok_and(|value| !value.trim().is_empty()) {
        return;
    }
    let Some(server) = XServerScaleHints::read() else {
        return;
    };
    if !server.xwayland || server.has_xft_dpi {
        return;
    }
    let scale = hyprland_xwayland_scale()
        .or_else(|| {
            env::var("GDK_SCALE")
                .ok()
                .and_then(|value| parse_scale(&value))
        })
        .unwrap_or(1.0);
    let _ = PINNED_SCALE_FACTOR.set(scale);
    // SAFETY: called from main() before GPUI starts background threads or framework-owned
    // environment readers, so no concurrent environment access is possible.
    unsafe { env::set_var(GPUI_X11_SCALE_FACTOR, scale.to_string()) };
}

/// The scale `pin_gpui_x11_scale_factor` chose, when it chose one.
pub(crate) fn pinned_scale_factor() -> Option<f32> {
    PINNED_SCALE_FACTOR.get().copied()
}

fn parse_scale(value: &str) -> Option<f32> {
    value
        .trim()
        .parse::<f32>()
        .ok()
        .filter(|scale| scale.is_finite() && *scale > 0.0)
}

struct XServerScaleHints {
    xwayland: bool,
    /// Whether the root window's `RESOURCE_MANAGER` string (what `xrdb` loads) sets `Xft.dpi`,
    /// the value GPUI's X11 client reads first.
    has_xft_dpi: bool,
}

impl XServerScaleHints {
    fn read() -> Option<Self> {
        use x11rb::connection::{Connection as _, RequestConnection as _};
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

        let (connection, screen_index) = x11rb::connect(None).ok()?;
        let root = connection.setup().roots.get(screen_index)?.root;
        let xwayland = connection
            .extension_information("XWAYLAND")
            .ok()
            .flatten()
            .is_some();
        let has_xft_dpi = connection
            .get_property(
                false,
                root,
                AtomEnum::RESOURCE_MANAGER,
                AtomEnum::STRING,
                0,
                u32::MAX / 4,
            )
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .is_some_and(|reply| {
                String::from_utf8_lossy(&reply.value).lines().any(|line| {
                    line.split_once(':').is_some_and(|(key, value)| {
                        key.trim() == "Xft.dpi" && !value.trim().is_empty()
                    })
                })
            });
        Some(Self {
            xwayland,
            has_xft_dpi,
        })
    }
}

/// The focused monitor's scale when Hyprland shows X clients at native pixels
/// (`xwayland:force_zero_scaling`). Without that option Hyprland scales X clients itself, so the
/// app must stay at 1.0 and this returns nothing.
fn hyprland_xwayland_scale() -> Option<f32> {
    let force_zero_scaling = hyprland_request("j/getoption xwayland:force_zero_scaling")?;
    let enabled = force_zero_scaling
        .get("bool")
        .and_then(serde_json::Value::as_bool)
        .or_else(|| {
            force_zero_scaling
                .get("int")
                .and_then(serde_json::Value::as_i64)
                .map(|value| value != 0)
        })?;
    if !enabled {
        return None;
    }
    let monitors = hyprland_request("j/monitors")?;
    let monitors = monitors.as_array()?;
    let scale_of = |monitor: &serde_json::Value| {
        monitor
            .get("scale")
            .and_then(serde_json::Value::as_f64)
            .map(|scale| scale as f32)
            .filter(|scale| scale.is_finite() && *scale > 0.0)
    };
    monitors
        .iter()
        .find(|monitor| {
            monitor
                .get("focused")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        })
        .and_then(scale_of)
        .or_else(|| monitors.iter().find_map(scale_of))
}

fn hyprland_request(request: &str) -> Option<serde_json::Value> {
    use std::io::{Read as _, Write as _};
    use std::time::Duration;

    let signature = env::var("HYPRLAND_INSTANCE_SIGNATURE").ok()?;
    let runtime_dir = env::var_os("XDG_RUNTIME_DIR")?;
    let socket = std::path::Path::new(&runtime_dir)
        .join("hypr")
        .join(signature)
        .join(".socket.sock");
    let mut stream = std::os::unix::net::UnixStream::connect(socket).ok()?;
    let timeout = Some(Duration::from_millis(500));
    stream.set_read_timeout(timeout).ok()?;
    stream.set_write_timeout(timeout).ok()?;
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).ok()?;
    serde_json::from_slice(&response).ok()
}

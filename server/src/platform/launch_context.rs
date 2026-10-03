use std::{io, os::windows::io::AsRawHandle, ptr};

use serde_json::{json, Value};
use windows_sys::Win32::{
    Security::{
        EqualSid, IsTokenRestricted, TokenGroups, TokenSessionId, WinNetworkSid,
        SID_AND_ATTRIBUTES, TOKEN_GROUPS,
    },
    System::Threading::{
        GetCurrentProcess, GetProcessMitigationPolicy, ProcessRedirectionTrustPolicy,
    },
};

use super::standard_user::{current_process_token, token_information, well_known_sid};

/// What a customer reads in gxserver's log when the server runs somewhere its agents are limited.
const LAUNCH_CONTEXT_WARNING: &str = "started from an SSH/background session; agents started here cannot use junction-based tools (codex, cua-driver). Quit Ghostex & BG Service and reopen Ghostex to fix.";

/// CDXC:PlatformSupport 2026-10-03 WHY: A gxserver started by a remote `ghostex` call over SSH runs in session 0 with a network-logon token, and on 2026-10-02 it also carried the RedirectionGuard mitigation (EnforceRedirectionTrust). Every wmx session, agent and build under it inherits that, so junction-based tools on PATH (Codex, cua-driver) cannot run and zig aborts the libghostty-vt build (see `zig_build_path_without_untrusted_mount_points` in apps/desktop/build.rs). Nothing showed how the server had been started, so startup logs one warning with these facts when any of them is off, and nothing otherwise.
pub(crate) fn launch_context_warning_details() -> Option<Value> {
    let token = current_process_token().ok()?;
    let session_id = token_session_id(&token).ok();
    let network_logon = token_has_network_logon(&token).ok();
    let restricted = unsafe { IsTokenRestricted(token.as_raw_handle()) } != 0;
    let redirection_trust_enforced = redirection_trust_enforced().ok();
    let off = session_id == Some(0)
        || network_logon == Some(true)
        || redirection_trust_enforced == Some(true);
    off.then(|| {
        json!({
            "warning": LAUNCH_CONTEXT_WARNING,
            "windowsSessionId": session_id,
            "networkLogon": network_logon,
            "restrictedToken": restricted,
            "redirectionTrustEnforced": redirection_trust_enforced,
        })
    })
}

fn token_session_id(token: &std::os::windows::io::OwnedHandle) -> io::Result<u32> {
    let buffer = token_information(token, TokenSessionId)?;
    Ok(buffer[0] as u32)
}

fn token_has_network_logon(token: &std::os::windows::io::OwnedHandle) -> io::Result<bool> {
    let groups = token_information(token, TokenGroups)?;
    let groups = unsafe {
        let header = groups.as_ptr().cast::<TOKEN_GROUPS>();
        std::slice::from_raw_parts(
            ptr::addr_of!((*header).Groups).cast::<SID_AND_ATTRIBUTES>(),
            (*header).GroupCount as usize,
        )
    };
    let network = well_known_sid(WinNetworkSid)?;
    Ok(groups
        .iter()
        .any(|group| unsafe { EqualSid(group.Sid, network.as_ptr().cast_mut().cast()) } != 0))
}

fn redirection_trust_enforced() -> io::Result<bool> {
    // PROCESS_MITIGATION_REDIRECTION_TRUST_POLICY: bit 0 is EnforceRedirectionTrust.
    let mut flags: u32 = 0;
    let queried = unsafe {
        GetProcessMitigationPolicy(
            GetCurrentProcess(),
            ProcessRedirectionTrustPolicy,
            ptr::from_mut(&mut flags).cast(),
            std::mem::size_of::<u32>(),
        )
    };
    if queried == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(flags & 1 != 0)
}

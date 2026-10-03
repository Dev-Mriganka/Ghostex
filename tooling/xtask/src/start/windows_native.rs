//! The Win32 calls the native Windows start makes directly instead of through PowerShell or CIM.

use std::ffi::{c_void, OsString};
use std::os::windows::ffi::OsStringExt;

const AF_INET: u32 = 2;
const TCP_TABLE_OWNER_PID_LISTENER: u32 = 3;
const NO_ERROR: u32 = 0;
const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
/// MIB_TCPROW_OWNER_PID: state, local address, local port, remote address, remote port, owning pid.
const TCP_ROW_WORDS: usize = 6;

#[link(name = "iphlpapi")]
extern "system" {
    fn GetExtendedTcpTable(
        table: *mut c_void,
        size: *mut u32,
        order: i32,
        address_family: u32,
        table_class: u32,
        reserved: u32,
    ) -> u32;
}

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit_handle: i32, pid: u32) -> *mut c_void;
    fn QueryFullProcessImageNameW(
        process: *mut c_void,
        flags: u32,
        name: *mut u16,
        size: *mut u32,
    ) -> i32;
    fn CloseHandle(handle: *mut c_void) -> i32;
    fn ProcessIdToSessionId(pid: u32, session_id: *mut u32) -> i32;
}

/// The (owning pid, port) of every IPv4 TCP listener bound to 127.0.0.1.
pub fn loopback_listeners() -> std::io::Result<Vec<(u32, u16)>> {
    let mut buffer: Vec<u32> = Vec::new();
    let mut size = 0u32;
    loop {
        let table = if buffer.is_empty() {
            std::ptr::null_mut()
        } else {
            buffer.as_mut_ptr().cast()
        };
        match unsafe {
            GetExtendedTcpTable(
                table,
                &mut size,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        } {
            NO_ERROR if !buffer.is_empty() => break,
            // The table can grow between the size query and the read, so ask again until it fits.
            NO_ERROR | ERROR_INSUFFICIENT_BUFFER => {
                buffer = vec![0; (size as usize).div_ceil(4).max(1)];
            }
            code => return Err(std::io::Error::from_raw_os_error(code as i32)),
        }
    }
    let entries = buffer[0] as usize;
    let rows = buffer[1..].chunks_exact(TCP_ROW_WORDS).take(entries);
    Ok(rows
        .filter(|row| row[1].to_ne_bytes() == [127, 0, 0, 1])
        .map(|row| (row[5], u16::from_be(row[2] as u16)))
        .collect())
}

/// The full Win32 path of a process's executable, or None when it has exited or this token may not query it.
pub fn process_image_path(pid: u32) -> Option<String> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return None;
    }
    let mut name = vec![0u16; 32 * 1024];
    let mut length = name.len() as u32;
    let queried =
        unsafe { QueryFullProcessImageNameW(process, 0, name.as_mut_ptr(), &mut length) } != 0;
    unsafe { CloseHandle(process) };
    queried.then(|| {
        OsString::from_wide(&name[..length as usize])
            .to_string_lossy()
            .into_owned()
    })
}

/// The Windows session this process runs in (0 is the services session, which has no desktop).
pub fn current_session_id() -> std::io::Result<u32> {
    let mut session_id = 0u32;
    if unsafe { ProcessIdToSessionId(std::process::id(), &mut session_id) } == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(session_id)
}

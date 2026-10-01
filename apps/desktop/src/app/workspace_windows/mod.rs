//! Ghostex's workspace windows: the ones the app reopens at launch and the ones File > New Window
//! opens. `registry.rs` tracks the open windows and which one runs the app-wide work, `slots.rs`
//! keeps each window's saved layout, focus and frame apart, `open.rs` opens a window, `close.rs`
//! closes one while others stay open, and `routing.rs` decides which window a click, a command or
//! an app-wide change reaches.

mod close;
mod open;
mod registry;
mod routing;
mod slots;

pub(crate) use open::*;
pub(crate) use registry::*;
pub(crate) use slots::*;

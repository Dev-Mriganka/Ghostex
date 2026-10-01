//! Ghostex's workspace windows: the ones the app reopens at launch and the ones File > New Window
//! opens. `registry.rs` tracks the open windows and which one runs the app-wide work, `slots.rs`
//! keeps each window's saved layout, focus and frame apart, `open.rs` opens a window and `close.rs`
//! closes one while others stay open.

mod close;
mod open;
mod registry;
mod slots;

pub(crate) use open::*;
pub(crate) use registry::*;
pub(crate) use slots::*;

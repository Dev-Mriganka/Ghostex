//! Coordinators: one agent session the user talks to, which starts, briefs and supervises thread
//! sessions and reports back. The supervisor's clock is `server/coordinator_runtime.rs`.

mod brief;
mod create;
mod endpoint;
mod panel;
mod presentation;
mod records;
mod role;
mod state;

pub use brief::*;
pub use create::*;
pub use endpoint::*;
pub use panel::*;
pub use presentation::*;
pub use records::*;
pub use role::*;
pub use state::*;

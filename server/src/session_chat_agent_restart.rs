//! CDXC:SessionChat 2026-09-29 WHY:
//! Codex exits to the shell after "Update now", after /logout and when it crashes, and the chat could only say it was no longer running and point at the terminal, where a new user had to know to type a resume command. Restart puts the session to sleep and wakes it, the same cycle the sidebar uses, so the agent comes back on its own conversation with the resume command Ghostex already keeps for it.

use serde_json::{Map, Value};

use crate::domain::{DomainRepository, DomainStateError};
use crate::server::AppState;
use crate::session_chat_notice::{
    classify_session_chat_terminal_notice, SESSION_CHAT_NOTICE_AGENT_EXITED,
};
use crate::session_chat_send::resolve_session_chat_send_target;
use crate::storage::open_gxserver_database;

fn invalid(message: impl Into<String>) -> DomainStateError {
    DomainStateError {
        code: "invalidState",
        message: message.into(),
    }
}

/// Restarts the agent of a session whose agent has exited to the shell. The screen is read again first: a
/// card left over from before the agent came back must not restart a running conversation.
pub(crate) async fn restart(
    state: &AppState,
    params: &Map<String, Value>,
) -> Result<(), DomainStateError> {
    let state = state.clone();
    let params = params.clone();
    tokio::task::spawn_blocking(move || {
        let target = resolve_session_chat_send_target(&state, &params, "restartAgent")?;
        let db =
            open_gxserver_database(&state.paths).map_err(|error| invalid(error.to_string()))?;
        let repository = DomainRepository::new(&db, &state.metadata.server_id);
        let screen = crate::zmx::read_zmx_session_history_capture(
            &repository,
            &target.project_id,
            &target.session_id,
        )
        .map_err(|_| invalid("Could not read the terminal. Nothing was restarted."))?;
        let agent = crate::session_chat_composer::session_chat_composer_agent_id(&target.session);
        let exited = classify_session_chat_terminal_notice(agent.as_deref(), &screen.text)
            .is_some_and(|notice| notice.kind == SESSION_CHAT_NOTICE_AGENT_EXITED);
        if !exited {
            return Err(invalid(
                "The agent is running in this terminal again, so it was not restarted.",
            ));
        }
        let session = repository
            .get_session(&target.project_id, &target.session_id)?
            .ok_or_else(|| invalid("This session no longer exists."))?;
        crate::accounts::endpoint::cycle(&state, &repository, &session, "/api/sleepSession")?;
        crate::accounts::endpoint::cycle(&state, &repository, &session, "/api/wakeSession")
    })
    .await
    .map_err(|error| invalid(error.to_string()))?
}

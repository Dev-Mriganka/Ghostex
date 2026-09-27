//! The chat transcript as the embedded window's content.
//!
//! The desktop's own chat renderer and chat host (`packages/gpui-mobile/chat`, crate
//! `ghostex-gpui-mobile-chat`) in transcript-only mode: React Native draws the composer below it and
//! drives the chat through the commands here; the transcript reports back through the events.
//!
//! Start config keys (besides the host's own): `baseUrl` and `authToken` (gxserver), `projectId`
//! and `sessionId` (the chat to open first, optional), `lightAppearance`, `reduceMotion`,
//! `settings` (the desktop's settings object, optional).
//!
//! Commands (`{"type": ...}`):
//! - `openSession {projectId, sessionId}`, `closeSession`
//! - `setDraft {text}` as the user types, `saveDraft` when the field loses focus
//! - `send {text, mode?: "send"|"queue"|"compact", id?}` answers `sendResult {id, outcome, reason}`
//! - `action {action}`: any other core action (`interrupt`, `composerScroll`, `answerQuestion`, ...)
//! - `scrollToEnd`, `scrollBy {delta}` (logical px, positive shows older rows)
//! - `setEndpoint {baseUrl, authToken}`, `setAppearance {light}`, `installSettings {settings}`
//! - `forwardSnapshots {enabled}`: also send the whole document on every change (`snapshot`)
//! - `state`: answers `state {session, summary, rowCount}`
//!
//! Events: `summary {summary}` on every change of the composer-side state, `hostAction {action,
//! message}` (open a link or file, ...), `toast {message, error}`, `snapshot {snapshot}` when
//! forwarded. Copies arrive as the host's `copy {text}` (every GPUI clipboard write).

use std::path::PathBuf;

use ghostex_gpui_mobile_chat::{
    self as chat, ChatInit, ChatTranscript, ChatTranscriptEvent, SendMode, SendOutcome, SessionRef,
};
use gpui::{App, Entity, Window};
use serde_json::{Value, json};

use crate::{EventSink, HostConfig, RootContent};

pub(crate) fn build(
    window: &mut Window,
    cx: &mut App,
    config: &HostConfig,
    events: EventSink,
) -> RootContent {
    chat::init(
        cx,
        ChatInit {
            data_dir: chat_data_dir(config),
            base_url: config.str("baseUrl").unwrap_or_default().to_string(),
            auth_token: config.str("authToken").unwrap_or_default().to_string(),
            light_appearance: config.bool("lightAppearance").unwrap_or(false),
            reduce_motion: config.bool("reduceMotion").unwrap_or(false),
            settings: config
                .raw
                .get("settings")
                .and_then(Value::as_object)
                .cloned(),
            client_name: "gpui-mobile-poc".to_string(),
            ..Default::default()
        },
    );
    // The chat's copies go through GPUI's clipboard, which the platform hands to the host
    // (`runtime::start`), so no chat-specific clipboard handler is installed.

    let transcript = chat::open_transcript(
        window,
        cx,
        config.str("projectId").unwrap_or_default(),
        config.str("sessionId").unwrap_or_default(),
    );
    cx.subscribe(&transcript, move |_, event, _| forward(event, events))
        .detach();
    let root = chat::root_view(transcript.clone(), window, cx);

    RootContent {
        view: root.into(),
        on_command: Box::new(move |command, window, cx| {
            handle(&transcript, command, window, cx, events)
        }),
    }
}

/// The chat's client storage lives in its own folder of the app's files directory.
fn chat_data_dir(config: &HostConfig) -> PathBuf {
    let dir = config.files_dir.join("chat");
    if let Err(error) = std::fs::create_dir_all(&dir) {
        log::error!("could not create {}: {error}", dir.display());
    }
    dir
}

fn forward(event: &ChatTranscriptEvent, events: EventSink) {
    match event {
        ChatTranscriptEvent::Summary(summary) => {
            events.emit(json!({"type": "summary", "summary": summary}));
        }
        ChatTranscriptEvent::HostAction { action, message } => {
            events.emit(json!({"type": "hostAction", "action": action, "message": message}));
        }
        ChatTranscriptEvent::Toast { message, error } => {
            events.emit(json!({"type": "toast", "message": message, "error": error}));
        }
        ChatTranscriptEvent::Snapshot(snapshot) => {
            events.emit(json!({"type": "snapshot", "snapshot": &**snapshot}));
        }
    }
}

fn handle(
    transcript: &Entity<ChatTranscript>,
    command: &Value,
    window: &mut Window,
    cx: &mut App,
    events: EventSink,
) -> bool {
    let text = |key: &str| command[key].as_str().unwrap_or_default().to_string();
    match command["type"].as_str().unwrap_or_default() {
        "openSession" => {
            let session = SessionRef::new(text("projectId"), text("sessionId"));
            transcript.update(cx, |transcript, cx| transcript.open_session(session, cx));
        }
        "closeSession" => transcript.update(cx, |transcript, cx| transcript.close_session(cx)),
        "setDraft" => {
            let draft = text("text");
            transcript.update(cx, |transcript, cx| transcript.set_draft(&draft, cx));
        }
        "saveDraft" => transcript.update(cx, |transcript, cx| transcript.save_draft(cx)),
        "send" => {
            let mode = match command["mode"].as_str() {
                Some("queue") => SendMode::Queue,
                Some("compact") => SendMode::Compact,
                _ => SendMode::Send,
            };
            let body = text("text");
            let outcome = transcript.update(cx, |transcript, cx| {
                transcript.send_text(&body, mode, window, cx)
            });
            let reason = match &outcome {
                SendOutcome::Blocked(reason) => Some(reason.clone()),
                _ => None,
            };
            events.emit(json!({
                "type": "sendResult",
                "id": command.get("id").cloned().unwrap_or(Value::Null),
                "outcome": outcome_name(&outcome),
                "reason": reason,
            }));
        }
        "action" => {
            let action = command["action"].clone();
            if !action.is_object() {
                return false;
            }
            transcript.update(cx, |transcript, cx| transcript.dispatch_action(action, cx));
        }
        "scrollToEnd" => transcript.update(cx, |transcript, cx| transcript.scroll_to_end(cx)),
        "scrollBy" => {
            let delta = command["delta"].as_f64().unwrap_or(0.0) as f32;
            transcript.update(cx, |transcript, cx| transcript.scroll_by(delta, cx));
        }
        "setEndpoint" => chat::set_endpoint(&text("baseUrl"), &text("authToken")),
        "setAppearance" => {
            chat::set_light_appearance(cx, command["light"].as_bool().unwrap_or(false));
        }
        "installSettings" => {
            let settings = command["settings"].as_object().cloned().unwrap_or_default();
            chat::install_settings(cx, settings);
        }
        "forwardSnapshots" => {
            let enabled = command["enabled"].as_bool().unwrap_or(false);
            transcript.update(cx, |transcript, _| transcript.set_forward_snapshots(enabled));
        }
        "state" => {
            let transcript = transcript.read(cx);
            events.emit(json!({
                "type": "state",
                "session": transcript.session(),
                "summary": transcript.summary(cx),
                "rowCount": transcript.row_count(cx),
            }));
        }
        _ => return false,
    }
    true
}

fn outcome_name(outcome: &SendOutcome) -> &'static str {
    match outcome {
        SendOutcome::Sent => "sent",
        SendOutcome::CommandCompleted => "commandCompleted",
        SendOutcome::NoSession => "noSession",
        SendOutcome::NotReady => "notReady",
        SendOutcome::Empty => "empty",
        SendOutcome::Pending => "pending",
        SendOutcome::Blocked(_) => "blocked",
        SendOutcome::CannotQueue => "cannotQueue",
    }
}

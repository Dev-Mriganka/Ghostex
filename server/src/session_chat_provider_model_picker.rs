//! CDXC:SessionChat 2026-09-09 DECISION:
//! User: Cursor, Grok Build and Antigravity support the quick picker, and Grok's models and efforts change directly from chat.
//! CDXC:SessionChat 2026-09-09 WHY:
//! Grok accepts `/model <label> <effort>` and Antigravity accepts a flattened model-effort id.
//! Cursor opens its filtered picker while /model is still being typed; Enter already confirms the model, so edit parameters before sending it.
//! Cursor's parameter editor must be read before every step so changing effort preserves Context, Thinking and Fast.
//! All three run inside the serialized send worker and confirm the footer before releasing the durable selection.

use super::*;
use crate::session_chat_composer::{
    detect_session_chat_composer_readiness, session_chat_composer_input, SessionChatComposerState,
};
use crate::session_chat_send::{
    build_session_chat_paste_bytes, capture_session_terminal_text_vt, AGENT_TUI_CLEAR_INPUT_LINE,
};

fn option_agent(provider: &str) -> SessionChatOptionAgent {
    match provider {
        "cursor" => SessionChatOptionAgent::Cursor,
        "grok" => SessionChatOptionAgent::Grok,
        "antigravity" => SessionChatOptionAgent::Antigravity,
        _ => unreachable!("validated picker provider"),
    }
}

fn applied(screen: &str, plan: &CodexPickerPlan) -> bool {
    if detect_session_chat_composer_readiness(Some(&plan.provider), screen, None).state
        != SessionChatComposerState::Ready
    {
        return false;
    }
    detect_session_chat_selection(option_agent(&plan.provider), screen).is_some_and(|selection| {
        selection
            .model
            .as_ref()
            .is_some_and(|value| value.value == plan.model)
            && (plan.effort.is_empty()
                || selection
                    .effort
                    .as_ref()
                    .is_some_and(|value| value.value == plan.effort))
    })
}

fn cursor_model_row(screen: &str, label: &str) -> Option<String> {
    let lines = screen_lines(screen);
    let title = lines.iter().rposition(|line| {
        line.starts_with("Models matching \"") || line.starts_with("Available models")
    })?;
    let row = lines[title + 1..]
        .iter()
        .find_map(|line| line.strip_prefix('→').map(str::trim))?;
    (row == label
        || row
            .strip_prefix(label)
            .is_some_and(|rest| rest.starts_with(' ')))
    .then(|| row.to_string())
}

#[derive(PartialEq)]
struct ParameterRow {
    section: String,
    label: String,
    focused: bool,
    selected: bool,
}

fn cursor_parameters(screen: &str, label: &str) -> Option<Vec<ParameterRow>> {
    let lines = screen_lines(screen);
    let title = lines
        .iter()
        .rposition(|line| line.starts_with(label) && line.contains("Edit Parameters"))?;
    let mut section = String::new();
    let mut rows = Vec::new();
    for line in &lines[title + 1..] {
        let focused = line.starts_with('→');
        let text = line.trim_start_matches('→').trim();
        if matches!(text, "Context" | "Effort" | "Reasoning") {
            section = text.to_string();
        } else if let Some(marker) = text
            .chars()
            .next()
            .filter(|ch| matches!(ch, '○' | '●' | '◯' | '◉'))
        {
            rows.push(ParameterRow {
                section: section.clone(),
                label: text[marker.len_utf8()..]
                    .trim()
                    .trim_end_matches('✓')
                    .trim()
                    .to_string(),
                focused,
                selected: matches!(marker, '●' | '◉'),
            });
        }
    }
    (!rows.is_empty()).then_some(rows)
}

/// Whether the input box holds exactly `command`. A plain capture cannot tell Hermes' italic
/// placeholder from typed text, so the other readings compare against the command instead.
fn hermes_input_is(composer_agent: &str, screen: &str, command: &str) -> bool {
    session_chat_composer_input(composer_agent, screen)
        .is_some_and(|input| collapse_spaces(&input.text) == command)
}

/// The command left the input box and the status bar names the requested model.
fn hermes_applied(
    composer_agent: &str,
    screen: &str,
    plan: &CodexPickerPlan,
    command: &str,
) -> bool {
    !hermes_input_is(composer_agent, screen, command)
        && detect_session_chat_selection(SessionChatOptionAgent::Hermes, screen).is_some_and(
            |selection| {
                selection.model.is_some_and(|model| {
                    crate::session_chat_hermes_status::hermes_status_bar_shows(
                        &model.value,
                        &plan.model,
                    )
                })
            },
        )
}

/// Every refusal Hermes printed on screen (`✗ <reason>`), oldest first.
fn hermes_refusals(screen: &str) -> Vec<String> {
    screen_lines(screen)
        .into_iter()
        .filter_map(|line| {
            line.strip_prefix('\u{2717}')
                .map(|reason| reason.trim().to_string())
        })
        .collect()
}

impl PickerDriver<'_> {
    /// CDXC:AgentProviders 2026-09-26 WHY:
    /// Hermes never prints its reasoning effort and never echoes a typed `/model` line, so an
    /// effort-only change cannot be recognised as already applied: the command is always typed, and
    /// it counts once the input is taken and the status bar names the model. Delivery is verified
    /// before Enter, so a switch that does not show within the step (Hermes refused the model, or
    /// asks in the terminal to confirm an expensive one) is final instead of retried: retyping the
    /// same command cannot change Hermes' answer.
    async fn drive_hermes(&self, plan: &CodexPickerPlan) -> Result<(), DomainStateError> {
        if !plan.effort.is_empty()
            && !crate::session_chat_hermes_status::HERMES_PICKER_EFFORTS
                .contains(&plan.effort.as_str())
        {
            return Err(invalid_params(
                "Hermes' model picker offers low, medium and high.",
            ));
        }
        let mut command = format!("/model {}", plan.model);
        if let Some(provider) = &plan.hermes_provider {
            command.push_str(&format!(" --provider {provider}"));
        }
        if !plan.effort.is_empty() {
            command.push_str(&format!(" --reasoning {}", plan.effort));
        }
        // The composer table spells the agent `hermes-agent`.
        let composer_agent =
            crate::agents::identity::normalize_agent_id(Some(&plan.provider)).unwrap_or_default();
        let screen = capture_session_terminal_text_vt(self.zmx_name)
            .await
            .ok_or_else(|| session_not_running("Waiting for the agent's terminal."))?;
        if (self.cancelled)()
            || detect_session_chat_composer_readiness(Some(&plan.provider), &screen, None).state
                != SessionChatComposerState::Ready
        {
            return Err(agent_busy(
                "Waiting for Hermes to accept the model command.",
            ));
        }
        // A VT capture, so the italic placeholder reads as empty.
        if !session_chat_composer_input(&composer_agent, &screen)
            .is_some_and(|input| input.is_empty())
        {
            return Err(agent_busy(
                "Waiting for the terminal input to be sent or cleared.",
            ));
        }
        let refused_before = hermes_refusals(&screen).len();
        let result = async {
            self.write(&build_session_chat_paste_bytes(&command))
                .await?;
            self.wait_for("type model command", |screen| {
                hermes_input_is(&composer_agent, screen, &command).then_some(())
            })
            .await?;
            self.write(CODEX_SUBMIT).await?;
            let outcome = self
                .wait_for("applied model", |screen| {
                    if hermes_applied(&composer_agent, screen, plan, &command) {
                        return Some(Ok(()));
                    }
                    hermes_refusals(screen)
                        .into_iter()
                        .skip(refused_before)
                        .last()
                        .map(Err)
                })
                .await;
            match outcome {
                Ok(Ok(())) => Ok(()),
                Ok(Err(reason)) => Err(unsupported_selection(format!(
                    "Hermes did not switch to {}: {reason}",
                    plan.model
                ))),
                Err(error) if error.code == "timeout" => Err(unsupported_selection(format!(
                    "Hermes did not switch to {}. Check its terminal for a question or an error.",
                    plan.model
                ))),
                Err(error) => Err(error),
            }
        }
        .await;
        if result.is_err() && !(self.cancelled)() {
            if let Some(screen) = self.capture().await {
                if hermes_input_is(&composer_agent, &screen, &command) {
                    // Hermes' verified clear: one Ctrl+C, only while a draft is on screen.
                    let _ = crate::session_chat_send::clear_session_chat_composer(
                        self.project_id,
                        self.session_id,
                        self.zmx_name,
                        self.source,
                        &plan.provider,
                        self.cancelled,
                    )
                    .await;
                }
            }
        }
        result
    }

    async fn drive_provider(&self, plan: &CodexPickerPlan) -> Result<(), DomainStateError> {
        let row = crate::agent_model_catalog::catalog_model(&plan.provider, &plan.model)
            .ok_or_else(|| invalid_params("The model is not in this server's catalog."))?;
        let efforts = row
            .get("efforts")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid_params("The model's effort catalog is missing."))?;
        if !plan.effort.is_empty()
            && !efforts
                .iter()
                .any(|value| value.as_str() == Some(&plan.effort))
        {
            return Err(invalid_params("This model does not support that effort."));
        }
        let label = row
            .get("pickerLabel")
            .or_else(|| row.get("label"))
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_params("The model label is missing."))?;
        let command = match plan.provider.as_str() {
            "cursor" => format!("/model {label}"),
            "grok" => format!(
                "/model {label}{}",
                if plan.effort.is_empty() {
                    String::new()
                } else {
                    format!(" {}", plan.effort)
                }
            ),
            "antigravity" => format!(
                "/model {}{}",
                plan.model,
                if plan.effort.is_empty() {
                    String::new()
                } else {
                    format!("-{}", plan.effort)
                }
            ),
            _ => return Err(invalid_params("Unsupported model picker provider.")),
        };
        let screen = capture_session_terminal_text_vt(self.zmx_name)
            .await
            .ok_or_else(|| session_not_running("Waiting for the agent's terminal."))?;
        if applied(&screen, plan) {
            return Ok(());
        }
        if (self.cancelled)()
            || detect_session_chat_composer_readiness(Some(&plan.provider), &screen, None).state
                != SessionChatComposerState::Ready
        {
            return Err(agent_busy(
                "Waiting for the agent to accept the model command.",
            ));
        }
        if !session_chat_composer_input(&plan.provider, &screen)
            .is_some_and(|input| input.is_empty())
        {
            return Err(agent_busy(
                "Waiting for the terminal input to be sent or cleared.",
            ));
        }
        let mut opened_cursor = false;
        let result = async {
            self.write(&build_session_chat_paste_bytes(&command))
                .await?;
            if plan.provider == "cursor" {
                self.wait_for("Cursor model row", |screen| cursor_model_row(screen, label))
                    .await?;
                opened_cursor = true;
                if !plan.effort.is_empty() {
                    self.write("\t").await?;
                    let mut rows = self
                        .wait_for("Cursor parameters", |screen| {
                            cursor_parameters(screen, label)
                        })
                        .await?;
                    let effort_label = if plan.effort == "none" {
                        "None"
                    } else {
                        effort_row_label(&plan.effort).unwrap_or(&plan.effort)
                    };
                    loop {
                        let target = rows
                            .iter()
                            .position(|row| {
                                matches!(row.section.as_str(), "Effort" | "Reasoning")
                                    && row.label.eq_ignore_ascii_case(effort_label)
                            })
                            .ok_or_else(|| {
                                invalid_params("Cursor did not offer the requested effort.")
                            })?;
                        let current = rows.iter().position(|row| row.focused).ok_or_else(|| {
                            agent_busy("Cursor's focused parameter could not be read.")
                        })?;
                        if current == target {
                            break;
                        }
                        let next = if target > current {
                            current + 1
                        } else {
                            current - 1
                        };
                        self.write(if target > current { "\x1b[B" } else { "\x1b[A" })
                            .await?;
                        rows = self
                            .wait_for("Cursor parameter focus", |screen| {
                                let updated = cursor_parameters(screen, label)?;
                                (updated.get(next).is_some_and(|row| row.focused))
                                    .then_some(updated)
                            })
                            .await?;
                    }
                    // Space selects only this enum value. Escape returns to the model list; Enter applies it.
                    self.write(" ").await?;
                    self.wait_for("Cursor effort selection", |screen| {
                        cursor_parameters(screen, label)?
                            .iter()
                            .any(|row| {
                                row.focused
                                    && row.selected
                                    && row.label.eq_ignore_ascii_case(effort_label)
                            })
                            .then_some(())
                    })
                    .await?;
                    self.write("\x1b").await?;
                    self.wait_for("Cursor model row", |screen| cursor_model_row(screen, label))
                        .await?;
                }
            } else {
                self.wait_for("type model command", |screen| {
                    session_chat_composer_input(&plan.provider, screen)
                        .is_some_and(|input| collapse_spaces(&input.text) == command)
                        .then_some(())
                })
                .await?;
            }
            self.write(CODEX_SUBMIT).await?;
            self.wait_for("applied model and effort", |screen| {
                applied(screen, plan).then_some(())
            })
            .await
        }
        .await;
        if result.is_err() && !(self.cancelled)() {
            if opened_cursor {
                for _ in 0..2 {
                    let Some(screen) = self.capture().await else {
                        break;
                    };
                    if cursor_parameters(&screen, label).is_none()
                        && cursor_model_row(&screen, label).is_none()
                    {
                        break;
                    }
                    let _ = self.write("\x1b").await;
                    tokio::time::sleep(Duration::from_millis(PICKER_CANCEL_SETTLE_MS)).await;
                }
            }
            if let Some(screen) = self.capture().await {
                if session_chat_composer_input(&plan.provider, &screen)
                    .is_some_and(|input| collapse_spaces(&input.text) == command)
                {
                    let _ = self.write(AGENT_TUI_CLEAR_INPUT_LINE).await;
                }
            }
        }
        result
    }
}

pub(crate) async fn run_provider_model_picker_job(
    project_id: &str,
    session_id: &str,
    zmx_name: &str,
    source: &str,
    job_id: u64,
    cancelled: &(dyn Fn() -> bool + Send + Sync),
) {
    let plan = picker_jobs()
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(&job_id).map(|job| job.plan.clone()));
    let Some(plan) = plan else {
        return;
    };
    let driver = PickerDriver {
        project_id,
        session_id,
        zmx_name,
        source,
        cancelled,
    };
    let outcome = if plan.provider == "hermes" {
        driver.drive_hermes(&plan).await
    } else {
        driver.drive_provider(&plan).await
    };
    if let Err(error) = &outcome {
        log_picker(
            LogLevel::Error,
            "sessionChatProviderModelPickFailed",
            json!({
                "projectId": project_id, "sessionId": session_id, "provider": plan.provider,
                "model": plan.model, "effort": plan.effort, "code": error.code,
            }),
            Some(error.message.clone()),
        );
    }
    if let Ok(mut jobs) = picker_jobs().lock() {
        if let Some(job) = jobs.get_mut(&job_id) {
            job.outcome = Some(outcome);
        }
    }
}

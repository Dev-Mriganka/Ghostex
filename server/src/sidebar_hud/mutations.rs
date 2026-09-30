use super::*;

pub fn create_sidebar_hud_settings_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let target = required_trimmed_param(params, "target")?;
    let operation = required_trimmed_param(params, "operation")?;
    match (target.as_str(), operation.as_str()) {
        ("agent", "save") => sidebar_agent_save_mutation(projects, params),
        ("agent", "delete") => sidebar_agent_delete_mutation(projects, params),
        ("agent", "order") => sidebar_agent_order_mutation(projects, params),
        ("command", "save") => sidebar_command_save_mutation(projects, params),
        ("command", "delete") => sidebar_command_delete_mutation(projects, params),
        ("command", "order") => sidebar_command_order_mutation(projects, params),
        ("globalCommand", "save") => global_sidebar_command_save_mutation(params),
        ("globalCommand", "delete") => global_sidebar_command_delete_mutation(params),
        ("globalCommand", "order") => global_sidebar_command_order_mutation(params),
        _ => Err(DomainStateError::bad_request(
            "Unsupported sidebar Settings mutation.",
        )),
    }
}

fn sidebar_agent_save_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let name = required_trimmed_param(params, "name")?;
    let command = required_trimmed_param(params, "command")?;
    let requested_agent_id = optional_trimmed_param(params, "agentId");
    let requested_icon = params
        .get("icon")
        .and_then(Value::as_str)
        .and_then(strict_sidebar_agent_icon)
        .map(str::to_string);
    let accept_all_mode = sidebar_agent_accept_all_mode_update(params)?;
    let (stored_agents, stored_order) = sidebar_agent_state_from_projects(projects);
    let current_agent_ids = sidebar_button_ids(
        &sidebar_agent_buttons_from_state(&stored_agents, &stored_order),
        "agentId",
    );
    let selected_default_agent_id = requested_icon
        .as_deref()
        .and_then(default_sidebar_agent_by_icon)
        .map(|agent| agent.agent_id);
    let should_restore_hidden_default = requested_agent_id.is_none()
        && selected_default_agent_id
            .map(|agent_id| !is_sidebar_agent_visible(&stored_agents, agent_id))
            .unwrap_or(false);
    let agent_id = requested_agent_id
        .or_else(|| {
            should_restore_hidden_default
                .then_some(selected_default_agent_id)
                .flatten()
                .map(str::to_string)
        })
        .unwrap_or_else(|| create_custom_sidebar_agent_id(&name));
    let existing_index = stored_agents
        .iter()
        .position(|agent| agent.agent_id == agent_id);
    let previous_agent = existing_index.and_then(|index| stored_agents.get(index));
    let default_agent = default_sidebar_agent_by_id(&agent_id);
    let next_agent = StoredSidebarAgent {
        accept_all_mode: match accept_all_mode {
            SidebarAgentAcceptAllModeUpdate::Preserve => previous_agent
                .and_then(|agent| agent.accept_all_mode.as_ref())
                .cloned(),
            SidebarAgentAcceptAllModeUpdate::Set(mode) => mode,
        },
        agent_id: agent_id.clone(),
        command,
        hidden: false,
        icon: requested_icon
            .or_else(|| {
                previous_agent
                    .and_then(|agent| agent.icon.as_ref())
                    .cloned()
            })
            .or_else(|| default_agent.map(|agent| agent.icon.to_string())),
        name,
    };
    let mut next_agents = stored_agents.clone();
    if let Some(existing_index) = existing_index {
        next_agents[existing_index] = next_agent;
    } else {
        next_agents.push(next_agent);
    }
    let next_order = if existing_index.is_some()
        || stored_order.iter().any(|candidate| candidate == &agent_id)
        || is_default_sidebar_agent_id(&agent_id)
    {
        stored_order
    } else {
        let mut next_order = current_agent_ids;
        next_order.push(agent_id);
        next_order
    };
    sidebar_agent_projects_mutation(projects, next_agents, next_order, params)
}

fn sidebar_agent_delete_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let agent_id = required_trimmed_param(params, "agentId")?;
    let (stored_agents, stored_order) = sidebar_agent_state_from_projects(projects);
    if !is_default_sidebar_agent_id(&agent_id) {
        let next_agents = stored_agents
            .into_iter()
            .filter(|agent| agent.agent_id != agent_id)
            .collect::<Vec<_>>();
        let next_order = stored_order
            .into_iter()
            .filter(|candidate| candidate != &agent_id)
            .collect::<Vec<_>>();
        return sidebar_agent_projects_mutation(projects, next_agents, next_order, params);
    }
    let Some(default_agent) = default_sidebar_agent_by_id(&agent_id) else {
        return sidebar_agent_projects_mutation(projects, stored_agents, stored_order, params);
    };
    let existing_index = stored_agents
        .iter()
        .position(|agent| agent.agent_id == agent_id);
    let previous_agent = existing_index.and_then(|index| stored_agents.get(index));
    let next_agent = StoredSidebarAgent {
        accept_all_mode: None,
        agent_id: default_agent.agent_id.to_string(),
        command: previous_agent
            .map(|agent| agent.command.clone())
            .unwrap_or_else(|| default_agent.command.to_string()),
        hidden: true,
        icon: previous_agent
            .and_then(|agent| agent.icon.as_ref())
            .cloned()
            .or_else(|| Some(default_agent.icon.to_string())),
        name: previous_agent
            .map(|agent| agent.name.clone())
            .unwrap_or_else(|| default_agent.name.to_string()),
    };
    let mut next_agents = stored_agents.clone();
    if let Some(existing_index) = existing_index {
        next_agents[existing_index] = next_agent;
    } else {
        next_agents.push(next_agent);
    }
    let next_order = stored_order
        .into_iter()
        .filter(|candidate| candidate != &agent_id)
        .collect::<Vec<_>>();
    sidebar_agent_projects_mutation(projects, next_agents, next_order, params)
}

fn sidebar_agent_order_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let agent_ids = normalized_string_order(params.get("agentIds"));
    let (stored_agents, stored_order) = sidebar_agent_state_from_projects(projects);
    let current_agent_ids = sidebar_button_ids(
        &sidebar_agent_buttons_from_state(&stored_agents, &stored_order),
        "agentId",
    );
    let mut next_order = agent_ids
        .into_iter()
        .filter(|agent_id| {
            current_agent_ids
                .iter()
                .any(|candidate| candidate == agent_id)
        })
        .collect::<Vec<_>>();
    for agent_id in current_agent_ids {
        if !next_order.iter().any(|candidate| candidate == &agent_id) {
            next_order.push(agent_id);
        }
    }
    let item_ids = sidebar_button_ids(
        &sidebar_agent_buttons_from_state(&stored_agents, &next_order),
        "agentId",
    );
    let mut mutation =
        sidebar_agent_projects_mutation(projects, stored_agents, next_order, params)?;
    mutation.item_ids = Some(item_ids);
    Ok(mutation)
}

fn sidebar_agent_projects_mutation(
    projects: &[Value],
    agents: Vec<StoredSidebarAgent>,
    order: Vec<String>,
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let custom_agents = stored_sidebar_agents_value(&agents);
    let custom_agent_order = string_array_value(&order);
    let mut updates = Vec::new();
    for project in projects.iter().filter_map(Value::as_object) {
        let Some(project_id) = trimmed_json_string_field(project, "projectId") else {
            continue;
        };
        let mut update = Map::new();
        update.insert(
            "projectId".to_string(),
            Value::String(project_id.to_string()),
        );
        update.insert("customAgents".to_string(), custom_agents.clone());
        update.insert("customAgentOrder".to_string(), custom_agent_order.clone());
        updates.push(SidebarHudProjectMutation {
            params: update,
            project_id: project_id.to_string(),
        });
    }
    if updates.is_empty() {
        return Err(DomainStateError::bad_request(
            "No project metadata is available for sidebar agent mutation.",
        ));
    }
    Ok(SidebarHudSettingsMutation {
        global_command_update: None,
        hud_active_project_id: optional_trimmed_param(params, "activeProjectId"),
        item_ids: None,
        updates,
    })
}

fn sidebar_command_save_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let command_scope = sidebar_command_scope(projects, params)?;
    let mut state = sidebar_command_state(command_scope.owner_project);
    let current_command_ids = sidebar_button_ids(
        &sidebar_command_buttons_from_state(
            &state.commands,
            &state.order,
            &state.deleted_default_command_ids,
        ),
        "commandId",
    );
    let command_id = optional_trimmed_param(params, "commandId")
        .unwrap_or_else(create_custom_sidebar_command_id);
    let next_command = stored_sidebar_command_from_save_params(params, command_id.clone())?;
    reject_duplicate_sidebar_command_title(
        &next_command,
        &state.commands,
        &state.order,
        &state.deleted_default_command_ids,
    )?;
    let existing_index = state
        .commands
        .iter()
        .position(|command| command.command_id == command_id);
    if let Some(existing_index) = existing_index {
        state.commands[existing_index] = next_command;
    } else {
        state.commands.push(next_command);
    }
    state.order = if existing_index.is_some()
        || state.order.iter().any(|candidate| candidate == &command_id)
        || is_default_sidebar_command_id(&command_id)
    {
        state.order
    } else if current_command_ids
        .iter()
        .any(|candidate| candidate == &command_id)
    {
        current_command_ids
    } else {
        let mut next_order = current_command_ids;
        next_order.push(command_id.clone());
        next_order
    };
    if is_default_sidebar_command_id(&command_id) {
        state
            .deleted_default_command_ids
            .retain(|candidate| candidate != &command_id);
    }
    sidebar_command_project_mutation(command_scope, state)
}

fn sidebar_command_delete_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let command_scope = sidebar_command_scope(projects, params)?;
    let command_id = required_trimmed_param(params, "commandId")?;
    let mut state = sidebar_command_state(command_scope.owner_project);
    state
        .commands
        .retain(|command| command.command_id != command_id);
    state.order.retain(|candidate| candidate != &command_id);
    if is_default_sidebar_command_id(&command_id)
        && !state
            .deleted_default_command_ids
            .iter()
            .any(|candidate| candidate == &command_id)
    {
        state.deleted_default_command_ids.push(command_id);
    }
    sidebar_command_project_mutation(command_scope, state)
}

fn sidebar_command_order_mutation(
    projects: &[Value],
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let command_scope = sidebar_command_scope(projects, params)?;
    let mut state = sidebar_command_state(command_scope.owner_project);
    let current_command_ids = sidebar_button_ids(
        &sidebar_command_buttons_from_state(
            &state.commands,
            &state.order,
            &state.deleted_default_command_ids,
        ),
        "commandId",
    );
    let mut next_order = normalized_string_order(params.get("commandIds"))
        .into_iter()
        .filter(|command_id| {
            current_command_ids
                .iter()
                .any(|candidate| candidate == command_id)
        })
        .collect::<Vec<_>>();
    for command_id in current_command_ids {
        if !next_order.iter().any(|candidate| candidate == &command_id) {
            next_order.push(command_id);
        }
    }
    state.order = next_order;
    let item_ids = sidebar_button_ids(
        &sidebar_command_buttons_from_state(
            &state.commands,
            &state.order,
            &state.deleted_default_command_ids,
        ),
        "commandId",
    );
    let mut mutation = sidebar_command_project_mutation(command_scope, state)?;
    mutation.item_ids = Some(item_ids);
    Ok(mutation)
}

/*
CDXC:AgentLauncher 2026-08-01-16:00:
Project and Global Actions accept the exact same action definition from
Settings — only ownership differs — so both saves validate through one path.
Splitting the validation would let the two lists drift into accepting different
action shapes, which is how a Global Action that mobile cannot run gets saved.
*/
fn stored_sidebar_command_from_save_params(
    params: &Map<String, Value>,
    command_id: String,
) -> Result<StoredSidebarCommand, DomainStateError> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let icon = params
        .get("icon")
        .and_then(Value::as_str)
        .and_then(sidebar_command_icon)
        .map(str::to_string);
    if name.is_empty() && icon.is_none() {
        return Err(DomainStateError::bad_request(
            "Sidebar action mutations require a name or icon.",
        ));
    }
    let action_type = match params.get("actionType").and_then(Value::as_str) {
        Some("browser") => "browser",
        Some("terminal") => "terminal",
        _ => {
            return Err(DomainStateError::bad_request(
                "Unsupported sidebar action type.",
            ));
        }
    };
    let command_text = optional_trimmed_param(params, "command");
    let url = optional_trimmed_param(params, "url");
    if action_type == "browser" && url.is_none() {
        return Err(DomainStateError::bad_request(
            "Browser sidebar actions require a URL.",
        ));
    }
    if action_type == "terminal" && command_text.is_none() {
        return Err(DomainStateError::bad_request(
            "Terminal sidebar actions require a command.",
        ));
    }
    Ok(StoredSidebarCommand {
        action_type,
        close_terminal_on_exit: action_type == "terminal"
            && params
                .get("closeTerminalOnExit")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        command: (action_type == "terminal")
            .then_some(command_text)
            .flatten(),
        is_default: is_default_sidebar_command_id(&command_id),
        command_id,
        icon,
        links: if action_type == "terminal" {
            normalized_sidebar_command_links(params.get("links"))
        } else {
            Vec::new()
        },
        name,
        play_completion_sound: action_type == "terminal"
            && params
                .get("playCompletionSound")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        show_on_project_row: params
            .get("showOnProjectRow")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        url: (action_type == "browser").then_some(url).flatten(),
    })
}

/*
CDXC:AgentLauncher 2026-08-01-16:00:
Global Action mutations never read or write project rows, so they do not resolve
a command scope, an owner project, or a worktree parent the way Project Action
mutations must. The repository owns ordering and the stored list; these arms only
validate the intent and hand it over.
*/
fn global_sidebar_command_save_mutation(
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    let command_id = optional_trimmed_param(params, "commandId")
        .unwrap_or_else(create_custom_sidebar_command_id);
    /*
    The four default actions (dev/build/test/setup) are project-scoped, so their
    ids are reserved and a Global Action may never claim one. Rejecting at save
    is what makes that hold on BOTH paths: the read projection recomputes
    is_default from the id itself, so a stored Global Action called "dev" would
    come back marked as a default however it was written. Rejecting here also
    keeps global and project ids from colliding on the reserved names, which a
    run-by-id selector could not otherwise tell apart.
    */
    if is_default_sidebar_command_id(&command_id) {
        return Err(DomainStateError::bad_request(
            "Global actions cannot use a built-in action id.",
        ));
    }
    let mut next_command = stored_sidebar_command_from_save_params(params, command_id.clone())?;
    next_command.is_default = false;
    Ok(SidebarHudSettingsMutation {
        global_command_update: Some(GlobalSidebarCommandUpdate::Save {
            command_id,
            definition: sidebar_command_button_value(&next_command),
        }),
        hud_active_project_id: optional_trimmed_param(params, "activeProjectId"),
        item_ids: None,
        updates: Vec::new(),
    })
}

fn global_sidebar_command_delete_mutation(
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    Ok(SidebarHudSettingsMutation {
        global_command_update: Some(GlobalSidebarCommandUpdate::Delete {
            command_id: required_trimmed_param(params, "commandId")?,
        }),
        hud_active_project_id: optional_trimmed_param(params, "activeProjectId"),
        item_ids: None,
        updates: Vec::new(),
    })
}

fn global_sidebar_command_order_mutation(
    params: &Map<String, Value>,
) -> Result<SidebarHudSettingsMutation, DomainStateError> {
    Ok(SidebarHudSettingsMutation {
        global_command_update: Some(GlobalSidebarCommandUpdate::Order {
            command_ids: normalized_string_order(params.get("commandIds")),
        }),
        hud_active_project_id: optional_trimmed_param(params, "activeProjectId"),
        item_ids: None,
        updates: Vec::new(),
    })
}

import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { requestJson, assertErrorEnvelope } from './run-compat-io.mjs';
import { PROTOCOL_VERSION } from './run-compat-context.mjs';
import { recordObservation, normalizeExchange, normalizeValue } from './run-compat-fixtures.mjs';

/*
CDXC:RepoStructure 2026-06-16-10:00:
Phase 6 compatibility covers agent settings, launch/resume planning, rename/title/status ingestion, hook setup surfaces, and log privacy through public RPCs on the explicit dev port. Record stable metadata-only projections so fixtures do not include prompts, terminal titles, hook payload bodies, or local absolute paths.
*/
export async function runPhase6AgentChecks({ homeDir, observations, paths, token }) {
  const workspaceDir = path.join(homeDir, 'workspace');
  const projectDir = path.join(workspaceDir, 'phase6-project');
  await mkdir(projectDir, { recursive: true });

  const readSettings = await requestJson('/api/readAgentSettings', {
    body: { params: {}, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(readSettings.status, 200);
  assert.equal(readSettings.body.result.isPersisted, false);
  assert.equal(readSettings.body.result.settings.agentAcceptAllEnabled, true);
  assert.equal(readSettings.body.result.settings.defaultPromptAgentId, 'codex');
  recordObservation(
    observations,
    'phase6ReadDefaultAgentSettings',
    normalizeValue(
      {
        isPersisted: readSettings.body.result.isPersisted,
        settings: readSettings.body.result.settings,
      },
      homeDir
    )
  );

  const updateSettingsOff = await requestJson('/api/updateAgentSettings', {
    body: {
      params: { agentAcceptAllEnabled: false, defaultPromptAgentId: ' claude ' },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(updateSettingsOff.status, 200);
  assert.equal(updateSettingsOff.body.result.settings.agentAcceptAllEnabled, false);
  assert.equal(updateSettingsOff.body.result.settings.defaultPromptAgentId, 'claude');
  recordObservation(
    observations,
    'phase6UpdateAgentSettingsOff',
    normalizeValue(updateSettingsOff.body.result, homeDir)
  );

  const createProject = await requestJson('/api/createProject', {
    body: {
      params: {
        customAgents: [{ agentId: 'codex', command: 'codex', name: 'Codex' }],
        name: 'Phase 6 Agents',
        path: projectDir,
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(createProject.status, 200);
  const project = createProject.body.result.project;

  const launchPlanOff = await requestJson('/api/readAgentLaunchPlan', {
    body: {
      params: { agentId: 'codex', projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(launchPlanOff.status, 200);
  assert.equal(launchPlanOff.body.result.plan.command, 'codex');
  assert.equal(launchPlanOff.body.result.plan.startupTextDisposition, 'queueAfterTerminalReady');
  recordObservation(
    observations,
    'phase6LaunchPlanSettingsOff',
    normalizeValue(launchPlanOff.body.result.plan, homeDir)
  );

  const updateSettingsOn = await requestJson('/api/updateAgentSettings', {
    body: {
      params: { agentAcceptAllEnabled: true },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(updateSettingsOn.status, 200);

  const launchPlanOn = await requestJson('/api/readAgentLaunchPlan', {
    body: {
      params: { agentId: 'codex', projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(launchPlanOn.status, 200);
  assert.equal(launchPlanOn.body.result.plan.command, 'codex --yolo');
  recordObservation(observations, 'phase6LaunchPlanSettingsOn', normalizeValue(launchPlanOn.body.result.plan, homeDir));

  const terminalSession = await requestJson('/api/createSession', {
    body: {
      params: {
        kind: 'terminal',
        lifecycleState: 'running',
        projectId: project.projectId,
        title: 'Phase 6 Terminal',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(terminalSession.status, 200);
  const terminal = terminalSession.body.result.session;

  const renameTerminal = await requestJson('/api/requestSessionRename', {
    body: {
      params: {
        projectId: project.projectId,
        sessionId: terminal.sessionId,
        title: 'Phase 6 Terminal Renamed',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(renameTerminal.status, 200);
  assert.equal(renameTerminal.body.result.changed, true);
  assert.equal(renameTerminal.body.result.pendingAgentMetadata, false);
  assert.equal(renameTerminal.body.result.session.title, 'Phase 6 Terminal Renamed');
  recordObservation(
    observations,
    'phase6RenameTerminal',
    normalizeValue(
      {
        changed: renameTerminal.body.result.changed,
        pendingAgentMetadata: renameTerminal.body.result.pendingAgentMetadata,
        reason: renameTerminal.body.result.reason,
        title: renameTerminal.body.result.session.title,
        titleSource: renameTerminal.body.result.session.runtimeSettings.titleSource,
      },
      homeDir
    )
  );

  const forkRejected = await requestJson('/api/forkSession', {
    body: {
      params: { projectId: project.projectId, sessionId: terminal.sessionId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(forkRejected.status, 400);
  assertErrorEnvelope(forkRejected.body, 'badRequest');
  recordObservation(
    observations,
    'phase6ForkTerminalRejected',
    normalizeExchange(
      {
        request: {
          body: {
            params: { projectId: project.projectId, sessionId: terminal.sessionId },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/forkSession',
          token: '<bearer>',
        },
        response: forkRejected,
      },
      homeDir
    )
  );

  const agentSessionId = '12345678-1234-1234-1234-123456789abc';
  const createAgent = await requestJson('/api/createSession', {
    body: {
      params: {
        agentId: 'codex',
        kind: 'agent',
        launchSettings: {
          agentLaunchPlan: {
            agentCommand: 'codex',
            command: 'codex --yolo',
            startupText: ' codex --yolo\r',
            startupTextDisposition: 'queueAfterTerminalReady',
          },
        },
        lifecycleState: 'running',
        projectId: project.projectId,
        runtimeSettings: {
          agentCommand: 'codex',
          agentName: 'codex',
          agentSessionId,
          launchAgentId: 'codex',
          titleSource: 'placeholder',
        },
        title: 'Codex Session',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(createAgent.status, 200);
  const agent = createAgent.body.result.session;

  const resumePlan = await requestJson('/api/readAgentResumePlan', {
    body: {
      params: { projectId: project.projectId, sessionId: agent.sessionId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(resumePlan.status, 200);
  assert.equal(resumePlan.body.result.plan.agentId, 'codex');
  assert.equal(resumePlan.body.result.plan.runtimeCommand, 'codex --yolo');
  assert.equal(resumePlan.body.result.plan.startupTextDisposition, 'queueAfterTerminalReady');
  recordObservation(
    observations,
    'phase6ResumePlan',
    normalizeValue(
      {
        agentId: resumePlan.body.result.plan.agentId,
        hasCopyCommand: typeof resumePlan.body.result.plan.copyCommand === 'string',
        hasPrimaryCommand: typeof resumePlan.body.result.plan.primaryCommand === 'string',
        runtimeCommand: resumePlan.body.result.plan.runtimeCommand,
        startupTextDisposition: resumePlan.body.result.plan.startupTextDisposition,
      },
      homeDir
    )
  );

  const renameAgent = await requestJson('/api/requestSessionRename', {
    body: {
      params: {
        agentName: 'codex',
        projectId: project.projectId,
        sessionId: agent.sessionId,
        title: 'Phase 6 Agent Rename',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(renameAgent.status, 200);
  assert.equal(renameAgent.body.result.pendingAgentMetadata, true);
  recordObservation(
    observations,
    'phase6RenameAgentPending',
    normalizeValue(
      {
        changed: renameAgent.body.result.changed,
        pendingAgentMetadata: renameAgent.body.result.pendingAgentMetadata,
        reason: renameAgent.body.result.reason,
        pendingStatus: renameAgent.body.result.session.runtimeSettings.pendingAgentTitleRequestStatus,
        shouldSendAgentRenameCommand: renameAgent.body.result.shouldSendAgentRenameCommand,
      },
      homeDir
    )
  );

  const genericAgent = await requestJson('/api/createSession', {
    body: {
      params: {
        agentId: 'codex',
        kind: 'agent',
        lifecycleState: 'running',
        projectId: project.projectId,
        runtimeSettings: {
          agentCommand: 'codex',
          agentName: 'codex',
          launchAgentId: 'codex',
          titleSource: 'placeholder',
        },
        title: 'Codex Session',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(genericAgent.status, 200);
  let generic = genericAgent.body.result.session;

  const ingestedAgentSessionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const ingestState = await requestJson('/api/ingestSessionStateEvent', {
    body: {
      params: {
        agentName: 'codex',
        agentSessionId: ingestedAgentSessionId,
        firstUserMessage: 'phase6 first prompt must not be logged',
        projectId: project.projectId,
        sessionId: generic.sessionId,
        title: 'Phase 6 Ingested Title',
        titleSource: 'user',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(ingestState.status, 200);
  generic = ingestState.body.result.session;
  assert.equal(generic.runtimeSettings.agentSessionId, ingestedAgentSessionId);
  recordObservation(
    observations,
    'phase6IngestSessionState',
    normalizeValue(
      {
        changed: ingestState.body.result.changed,
        reason: ingestState.body.result.reason,
        agentId: generic.agentId,
        agentSessionIdPresent: typeof generic.runtimeSettings.agentSessionId === 'string',
        title: generic.title,
        titleSource: generic.runtimeSettings.titleSource,
      },
      homeDir
    )
  );

  const capturedId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const terminalTitle = await requestJson('/api/ingestTerminalTitleEvent', {
    body: {
      params: {
        agentName: 'codex',
        projectId: project.projectId,
        rawTitle: capturedId,
        sessionId: generic.sessionId,
        sessionPersistenceProvider: 'zmx',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(terminalTitle.status, 200);
  assert.equal(terminalTitle.body.result.agentSessionId, capturedId);
  generic = terminalTitle.body.result.session;
  recordObservation(
    observations,
    'phase6TerminalTitleCapture',
    normalizeValue(
      {
        agentSessionIdCaptured: terminalTitle.body.result.agentSessionId === capturedId,
        activity: terminalTitle.body.result.activity.activity,
        changed: terminalTitle.body.result.changed,
        previousActivity: terminalTitle.body.result.previousActivity,
        reason: terminalTitle.body.result.reason,
      },
      homeDir
    )
  );

  const activityWorking = await requestJson('/api/updateAgentActivity', {
    body: {
      params: {
        activity: 'working',
        agentName: 'codex',
        nowMs: 1781604000000,
        projectId: project.projectId,
        sessionId: generic.sessionId,
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(activityWorking.status, 200);
  assert.equal(activityWorking.body.result.activity.activity, 'working');
  generic = activityWorking.body.result.session;
  recordObservation(
    observations,
    'phase6UpdateAgentActivity',
    normalizeValue(
      {
        activity: activityWorking.body.result.activity.activity,
        enteredAttention: activityWorking.body.result.enteredAttention,
        previousActivity: activityWorking.body.result.previousActivity,
        lastActiveAt: generic.lastActiveAt,
      },
      homeDir
    )
  );

  const hookAttention = await requestJson('/api/ingestAgentHookEvent', {
    body: {
      params: {
        agentName: 'codex',
        eventName: 'PermissionRequest',
        projectId: project.projectId,
        sessionId: generic.sessionId,
        statusUpdatedAt: '2026-06-16T10:01:00.000Z',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(hookAttention.status, 200);
  assert.equal(hookAttention.body.result.activity.activity, 'attention');
  generic = hookAttention.body.result.session;
  recordObservation(
    observations,
    'phase6IngestAgentHookEvent',
    normalizeValue(
      {
        activity: hookAttention.body.result.activity.activity,
        changed: hookAttention.body.result.changed,
        enteredAttention: hookAttention.body.result.enteredAttention,
        previousActivity: hookAttention.body.result.previousActivity,
        reason: hookAttention.body.result.reason,
        sessionActivity: generic.runtimeSettings.agentActivity.activity,
      },
      homeDir
    )
  );

  const currentRuntimeSettings = { ...generic.runtimeSettings, gxserverFirstPromptAutoTitleStatus: 'running' };
  const markAutoTitleRunning = await requestJson('/api/updateSession', {
    body: {
      params: {
        projectId: project.projectId,
        runtimeSettings: currentRuntimeSettings,
        sessionId: generic.sessionId,
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(markAutoTitleRunning.status, 200);
  const cancelAutoTitle = await requestJson('/api/cancelFirstPromptAutoTitle', {
    body: {
      params: {
        projectId: project.projectId,
        reason: 'escape',
        sessionId: generic.sessionId,
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(cancelAutoTitle.status, 200);
  assert.equal(cancelAutoTitle.body.result.changed, true);
  assert.equal(cancelAutoTitle.body.result.previousStatus, 'running');
  recordObservation(
    observations,
    'phase6CancelFirstPromptAutoTitle',
    normalizeValue(
      {
        changed: cancelAutoTitle.body.result.changed,
        previousStatus: cancelAutoTitle.body.result.previousStatus,
        reason: cancelAutoTitle.body.result.reason,
        status: cancelAutoTitle.body.result.session.runtimeSettings.gxserverFirstPromptAutoTitleStatus,
      },
      homeDir
    )
  );

  const hookStatus = await requestJson('/api/readAgentHookStatus', {
    body: {
      params: { agentIds: ['qoder'], autoUpgradeInstalled: false },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(hookStatus.status, 200);
  assert.equal(hookStatus.body.result.type, 'agentHookStatus');
  assert.equal(hookStatus.body.result.agents.length, 1);
  recordObservation(
    observations,
    'phase6ReadAgentHookStatus',
    normalizeValue(
      {
        agentId: hookStatus.body.result.agents[0].agentId,
        cliCommand: hookStatus.body.result.agents[0].cliCommand,
        hasNotifyHookPath: typeof hookStatus.body.result.notifyHookPath === 'string',
        status: hookStatus.body.result.agents[0].status,
        type: hookStatus.body.result.type,
      },
      homeDir
    )
  );

  const hookInstall = await requestJson('/api/installAgentHooks', {
    body: {
      params: { agentIds: ['qoder'] },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(hookInstall.status, 200);
  assert.ok(hookInstall.body.result.installedPaths.length >= 1);
  recordObservation(
    observations,
    'phase6InstallAgentHooks',
    normalizeValue(
      {
        installedPathCount: hookInstall.body.result.installedPaths.length,
        notifyHookInstalled: hookInstall.body.result.installedPaths.includes(hookInstall.body.result.notifyHookPath),
        type: hookInstall.body.result.type,
      },
      homeDir
    )
  );

  let logText = '';
  try {
    logText = await readFile(paths.logFile, 'utf8');
  } catch {}
  assert.equal(logText.includes('phase6 first prompt must not be logged'), false);
  assert.equal(logText.includes('Phase 6 Ingested Title'), false);
  assert.equal(logText.includes(capturedId), false);
  recordObservation(observations, 'phase6LogPrivacy', {
    rawPromptLogged: false,
    rawTitleLogged: false,
    rawAgentSessionIdLogged: false,
  });
}

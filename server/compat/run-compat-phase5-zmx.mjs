import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requestJson, assertErrorEnvelope, assertSuccessEnvelope } from './run-compat-io.mjs';
import {
  PROTOCOL_VERSION,
  GXSERVER_ZMX_HISTORY_STDOUT_LIMIT_BYTES,
  GXSERVER_ZMX_SEND_TEXT_LIMIT_BYTES,
} from './run-compat-context.mjs';
import { resolveCompatShell, escapeRegExp } from './run-compat-target.mjs';
import { recordObservation, normalizeExchange, normalizeValue } from './run-compat-fixtures.mjs';

/*
CDXC:RepoStructure 2026-06-15-18:06:
Phase 5 compatibility must exercise real public lifecycle and session-I/O endpoints on the explicit dev port without stopping the packaged daemon on 58744. Keep observations metadata-only and normalize repo/home paths because zmx command strings include Ghostex-managed artifact paths and per-run auth-token locations.
*/
export async function runPhase5ZmxChecks({ homeDir, observations, token }) {
  const workspaceDir = path.join(homeDir, 'workspace');
  const projectDir = path.join(workspaceDir, 'phase5-project');
  await mkdir(projectDir, { recursive: true });
  const liveSessions = [];
  const rememberLive = (projectId, sessionId) => {
    liveSessions.push({ projectId, sessionId });
  };
  const forgetLive = (projectId, sessionId) => {
    const index = liveSessions.findIndex(
      (session) => session.projectId === projectId && session.sessionId === sessionId
    );
    if (index >= 0) {
      liveSessions.splice(index, 1);
    }
  };

  const createProject = await requestJson('/api/createProject', {
    body: {
      params: { name: 'Phase 5 Zmx', path: projectDir },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(createProject.status, 200);
  const project = createProject.body.result.project;

  const createSession = await requestJson('/api/createSession', {
    body: {
      params: {
        lifecycleState: 'unknown',
        projectId: project.projectId,
        title: 'Phase 5 Terminal',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(createSession.status, 200);
  const session = createSession.body.result.session;

  try {
    const attach = await requestJson('/api/attachSessionMetadata', {
      body: {
        params: {
          projectId: project.projectId,
          promptEditor: 'monaco',
          sessionId: session.sessionId,
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(attach.status, 200);
    assertSuccessEnvelope(attach.body);
    assert.equal(attach.body.result.attach.provider, 'zmx');
    assert.match(
      attach.body.result.attach.attachCommand,
      new RegExp(`^${escapeRegExp(resolveCompatShell())} -l?c `, 'u')
    );
    assert.match(attach.body.result.attach.attachCommand, /--prompt-editor=monaco/u);
    recordObservation(
      observations,
      'phase5AttachMetadata',
      normalizeValue(
        {
          attachCommand: attach.body.result.attach.attachCommand,
          persistenceSessionCreated: attach.body.result.attach.persistenceSessionCreated,
          providerState: attach.body.result.attach.providerState.lifecycleState,
          startupTextDisposition: attach.body.result.attach.startupTextDisposition,
          zmxName: attach.body.result.attach.zmxName,
        },
        homeDir
      )
    );

    const start = await requestJson('/api/startSessionProvider', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(start.status, 200);
    assertSuccessEnvelope(start.body);
    assert.equal(start.body.result.started, true);
    assert.equal(start.body.result.providerState.lifecycleState, 'exists');
    assert.equal(start.body.result.session.lifecycleState, 'running');
    rememberLive(project.projectId, session.sessionId);
    recordObservation(
      observations,
      'phase5StartPlainProvider',
      normalizeValue(
        {
          providerState: start.body.result.providerState.lifecycleState,
          started: start.body.result.started,
          startupTextDisposition: start.body.result.startupTextDisposition,
          zmxName: start.body.result.zmxName,
        },
        homeDir
      )
    );

    const probe = await requestJson('/api/probeSessionProvider', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(probe.status, 200);
    assert.equal(probe.body.result.providerState.lifecycleState, 'exists');
    recordObservation(
      observations,
      'phase5ProbeExists',
      normalizeValue(
        {
          providerState: probe.body.result.providerState.lifecycleState,
          sessionLifecycleState: probe.body.result.session.lifecycleState,
          zmxName: probe.body.result.providerState.zmxName,
        },
        homeDir
      )
    );

    const read = await requestJson('/api/readSessionText', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(read.status, 200);
    assert.equal(read.body.result.limitBytes, GXSERVER_ZMX_HISTORY_STDOUT_LIMIT_BYTES);
    assert.equal(typeof read.body.result.text, 'string');
    recordObservation(
      observations,
      'phase5ReadSessionText',
      normalizeValue(
        {
          limitBytes: read.body.result.limitBytes,
          provider: read.body.result.provider,
          source: read.body.result.source,
          textIsString: typeof read.body.result.text === 'string',
          truncated: read.body.result.truncated,
          ...(read.body.result.truncatedReason ? { truncatedReason: read.body.result.truncatedReason } : {}),
          zmxName: read.body.result.zmxName,
        },
        homeDir
      )
    );

    const sendText = await requestJson('/api/sendSessionText', {
      body: {
        params: {
          projectId: project.projectId,
          sessionId: session.sessionId,
          text: 'printf phase5-text',
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(sendText.status, 200);
    assert.equal(sendText.body.result.textBytes, Buffer.byteLength('printf phase5-text'));
    assert.equal(sendText.body.result.textLength, 'printf phase5-text'.length);
    recordObservation(
      observations,
      'phase5SendSessionText',
      normalizeValue(
        {
          exitCode: sendText.body.result.exitCode,
          provider: sendText.body.result.provider,
          textBytes: sendText.body.result.textBytes,
          textLength: sendText.body.result.textLength,
          zmxName: sendText.body.result.zmxName,
        },
        homeDir
      )
    );

    const sendEnter = await requestJson('/api/sendSessionEnter', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(sendEnter.status, 200);
    assert.equal(sendEnter.body.result.textBytes, 1);
    recordObservation(
      observations,
      'phase5SendSessionEnter',
      normalizeValue(
        {
          exitCode: sendEnter.body.result.exitCode,
          textBytes: sendEnter.body.result.textBytes,
          textLength: sendEnter.body.result.textLength,
        },
        homeDir
      )
    );

    const sendMessage = await requestJson('/api/sendSessionMessage', {
      body: {
        params: {
          projectId: project.projectId,
          sessionId: session.sessionId,
          submit: false,
          text: 'printf phase5-message',
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(sendMessage.status, 200);
    assert.equal(sendMessage.body.result.submit, false);
    recordObservation(
      observations,
      'phase5SendSessionMessage',
      normalizeValue(
        {
          exitCode: sendMessage.body.result.exitCode,
          submit: sendMessage.body.result.submit,
          textBytes: sendMessage.body.result.textBytes,
          textLength: sendMessage.body.result.textLength,
        },
        homeDir
      )
    );

    const focus = await requestJson('/api/focusSession', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(focus.status, 503);
    assertErrorEnvelope(focus.body, 'dependencyUnavailable');
    recordObservation(
      observations,
      'phase5FocusWithoutRenderer',
      normalizeExchange(
        {
          request: {
            body: {
              params: { projectId: project.projectId, sessionId: session.sessionId },
              protocolVersion: PROTOCOL_VERSION,
            },
            method: 'POST',
            path: '/api/focusSession',
            token: '<bearer>',
          },
          response: focus,
        },
        homeDir
      )
    );

    const targetlessMessage = await requestJson('/api/sendSessionMessage', {
      body: {
        params: { agentId: 'codex', text: 'phase5 visible message' },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(targetlessMessage.status, 503);
    assertErrorEnvelope(targetlessMessage.body, 'dependencyUnavailable');
    recordObservation(
      observations,
      'phase5TargetlessMessageWithoutRenderer',
      normalizeExchange(
        {
          request: {
            body: {
              params: { agentId: 'codex', text: '<message>' },
              protocolVersion: PROTOCOL_VERSION,
            },
            method: 'POST',
            path: '/api/sendSessionMessage',
            token: '<bearer>',
          },
          response: targetlessMessage,
        },
        homeDir
      )
    );

    const sleep = await requestJson('/api/sleepSession', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(sleep.status, 200);
    assert.equal(sleep.body.result.kill.killed, true);
    assert.equal(sleep.body.result.session.lifecycleState, 'sleeping');
    forgetLive(project.projectId, session.sessionId);
    recordObservation(
      observations,
      'phase5SleepSession',
      normalizeValue(
        {
          killed: sleep.body.result.kill.killed,
          providerState: sleep.body.result.session.providerState.lifecycleState,
          sessionLifecycleState: sleep.body.result.session.lifecycleState,
          zmxName: sleep.body.result.kill.zmxName,
        },
        homeDir
      )
    );

    const wake = await requestJson('/api/wakeSession', {
      body: {
        params: { projectId: project.projectId, sessionId: session.sessionId, startupText: '' },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(wake.status, 200);
    assert.equal(wake.body.result.attach.providerState.lifecycleState, 'missing');
    assert.equal(wake.body.result.session.lifecycleState, 'running');
    recordObservation(
      observations,
      'phase5WakeSession',
      normalizeValue(
        {
          providerState: wake.body.result.attach.providerState.lifecycleState,
          sessionLifecycleState: wake.body.result.session.lifecycleState,
          startupTextDisposition: wake.body.result.attach.startupTextDisposition,
          zmxName: wake.body.result.attach.zmxName,
        },
        homeDir
      )
    );

    const restart = await requestJson('/api/startSessionProvider', {
      body: {
        params: {
          projectId: project.projectId,
          sessionId: session.sessionId,
          startupText: 'printf phase5-startup',
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(restart.status, 200);
    assert.equal(restart.body.result.started, true);
    assert.equal(restart.body.result.startupTextDisposition, 'queueAfterTerminalReady');
    rememberLive(project.projectId, session.sessionId);
    recordObservation(
      observations,
      'phase5RestartWithStartupText',
      normalizeValue(
        {
          providerState: restart.body.result.providerState.lifecycleState,
          started: restart.body.result.started,
          startupTextDisposition: restart.body.result.startupTextDisposition,
        },
        homeDir
      )
    );

    const transition = await requestJson('/api/transitionSession', {
      body: {
        params: { action: 'close', projectId: project.projectId, sessionId: session.sessionId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(transition.status, 200);
    assert.equal(transition.body.result.action, 'close');
    assert.equal(transition.body.result.transition.kill.killed, true);
    assert.equal(transition.body.result.session.lifecycleState, 'stopped');
    forgetLive(project.projectId, session.sessionId);
    recordObservation(
      observations,
      'phase5TransitionClose',
      normalizeValue(
        {
          action: transition.body.result.action,
          killed: transition.body.result.transition.kill.killed,
          providerState: transition.body.result.session.providerState.lifecycleState,
          sessionLifecycleState: transition.body.result.session.lifecycleState,
        },
        homeDir
      )
    );

    const oversized = await requestJson('/api/sendSessionText', {
      body: {
        params: {
          projectId: project.projectId,
          sessionId: session.sessionId,
          text: 'x'.repeat(GXSERVER_ZMX_SEND_TEXT_LIMIT_BYTES + 1),
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(oversized.status, 400);
    assertErrorEnvelope(oversized.body, 'badRequest');
    recordObservation(
      observations,
      'phase5OversizedSendRejected',
      normalizeExchange(
        {
          request: {
            body: {
              params: {
                projectId: project.projectId,
                sessionId: session.sessionId,
                text: `<${GXSERVER_ZMX_SEND_TEXT_LIMIT_BYTES + 1} chars>`,
              },
              protocolVersion: PROTOCOL_VERSION,
            },
            method: 'POST',
            path: '/api/sendSessionText',
            token: '<bearer>',
          },
          response: oversized,
        },
        homeDir
      )
    );
  } finally {
    for (const live of [...liveSessions]) {
      await requestJson('/api/killSession', {
        body: {
          params: { projectId: live.projectId, sessionId: live.sessionId },
          protocolVersion: PROTOCOL_VERSION,
        },
        method: 'POST',
        token,
      }).catch(() => undefined);
      forgetLive(live.projectId, live.sessionId);
    }
  }
}

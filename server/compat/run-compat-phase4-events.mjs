import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  requestJson,
  assertErrorEnvelope,
  assertSuccessEnvelope,
  openEventSocket,
  nextWebSocketEvent,
  observeWebSocketEvent,
} from './run-compat-io.mjs';
import { recordObservation, normalizeExchange, normalizeValue } from './run-compat-fixtures.mjs';
import { PROTOCOL_VERSION } from './run-compat-context.mjs';

/*
CDXC:RepoStructure 2026-06-15-09:55:
Phase 4 compatibility exercises the event hub through the public WebSocket and HTTP contracts. Keep the suite on the explicit dev port so packaged Ghostex can keep 58744, and compare only metadata-safe presentation and renderer-command envelopes.
*/
export async function runPhase4EventChecks({ homeDir, observations, token }) {
  const workspaceDir = path.join(homeDir, 'workspace');
  const projectDir = path.join(workspaceDir, 'phase4-project');
  await mkdir(projectDir, { recursive: true });

  const socket = await openEventSocket(token);
  try {
    const snapshotPromise = nextWebSocketEvent(socket, 'presentationSnapshot');
    socket.send(
      JSON.stringify({
        clientId: 'phase4-client',
        lastRevision: 0,
        type: 'subscribePresentation',
      })
    );
    const snapshot = await snapshotPromise;
    assert.equal(snapshot.clientId, 'phase4-client');
    assert.equal(snapshot.revision, snapshot.snapshot.revision);
    assert.deepEqual(snapshot.snapshot.projects, []);
    recordObservation(observations, 'phase4PresentationSnapshot', normalizeValue(snapshot, homeDir));

    const handledPromise = nextWebSocketEvent(socket, 'apiRequestHandled');
    const listSessions = await requestJson('/api/listSessions', {
      body: { params: {}, protocolVersion: PROTOCOL_VERSION },
      method: 'POST',
      token,
    });
    assert.equal(listSessions.status, 200);
    const handled = await handledPromise;
    assert.equal(handled.path, '/api/listSessions');
    recordObservation(observations, 'phase4ApiRequestHandled', normalizeValue(handled, homeDir));

    const rendererUnavailable = await requestJson('/api/dispatchRendererCommand', {
      body: {
        params: {
          action: 'toggleSidebarCollapsed',
          payload: {},
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(rendererUnavailable.status, 503);
    assertErrorEnvelope(rendererUnavailable.body, 'dependencyUnavailable');
    recordObservation(
      observations,
      'phase4RendererUnavailable',
      normalizeExchange(
        {
          request: {
            body: {
              params: {
                action: 'toggleSidebarCollapsed',
                payload: {},
              },
              protocolVersion: PROTOCOL_VERSION,
            },
            method: 'POST',
            path: '/api/dispatchRendererCommand',
            token: '<bearer>',
          },
          response: rendererUnavailable,
        },
        homeDir
      )
    );

    const rendererSnapshotPromise = nextWebSocketEvent(socket, 'presentationSnapshot');
    socket.send(
      JSON.stringify({
        clientId: 'phase4-renderer',
        rendererCommands: true,
        type: 'subscribePresentation',
      })
    );
    await rendererSnapshotPromise;

    const commandPromise = nextWebSocketEvent(socket, 'rendererCommand');
    const rendererResponsePromise = requestJson('/api/dispatchRendererCommand', {
      body: {
        params: {
          action: 'toggleSidebarCollapsed',
          payload: { source: 'phase4' },
          timeoutMs: 1000,
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    const commandEvent = await commandPromise;
    assert.equal(commandEvent.command.action, 'toggleSidebarCollapsed');
    assert.deepEqual(commandEvent.command.payload, { source: 'phase4' });
    assert.equal(typeof commandEvent.command.commandId, 'string');
    socket.send(
      JSON.stringify({
        commandId: commandEvent.command.commandId,
        ok: true,
        result: { ok: true, toggled: true },
        type: 'rendererCommandResult',
      })
    );
    const rendererResponse = await rendererResponsePromise;
    assert.equal(rendererResponse.status, 200);
    assert.deepEqual(rendererResponse.body.result, { ok: true, toggled: true });
    recordObservation(
      observations,
      'phase4RendererCommand',
      normalizeValue(
        {
          event: commandEvent,
          response: rendererResponse,
        },
        homeDir
      )
    );

    /*
    CDXC:StateSync 2026-06-22-04:30:
    Renderer command subscriptions are ordered like TypeScript's WebSocket set. A later renderer-capable subscription must not steal commands from the first open renderer client, otherwise native command ownership can flip when secondary clients subscribe.
    */
    const secondRendererSocket = await openEventSocket(token);
    try {
      const secondRendererSnapshotPromise = nextWebSocketEvent(secondRendererSocket, 'presentationSnapshot');
      secondRendererSocket.send(
        JSON.stringify({
          clientId: 'phase4-renderer-later',
          rendererCommands: true,
          type: 'subscribePresentation',
        })
      );
      await secondRendererSnapshotPromise;

      const firstRendererCommandPromise = observeWebSocketEvent(socket, 'rendererCommand', 500);
      const laterRendererCommandPromise = observeWebSocketEvent(secondRendererSocket, 'rendererCommand', 500);
      const orderedRendererResponsePromise = requestJson('/api/dispatchRendererCommand', {
        body: {
          params: {
            action: 'toggleSidebarCollapsed',
            payload: { source: 'phase4-ordered-renderer' },
            timeoutMs: 3000,
          },
          protocolVersion: PROTOCOL_VERSION,
        },
        method: 'POST',
        token,
      });
      const firstRendererCommand = await firstRendererCommandPromise;
      if (firstRendererCommand.event) {
        socket.send(
          JSON.stringify({
            commandId: firstRendererCommand.event.command.commandId,
            ok: true,
            result: { ok: true, ordered: true },
            type: 'rendererCommandResult',
          })
        );
      }
      const laterRendererCommand = await laterRendererCommandPromise;
      if (!firstRendererCommand.event && laterRendererCommand.event) {
        secondRendererSocket.send(
          JSON.stringify({
            commandId: laterRendererCommand.event.command.commandId,
            ok: true,
            result: { ok: true, ordered: true },
            type: 'rendererCommandResult',
          })
        );
      }
      const orderedRendererResponse = await orderedRendererResponsePromise;
      assert.ok(
        firstRendererCommand.event,
        firstRendererCommand.error?.message ?? 'First renderer subscriber did not receive the command.'
      );
      assert.ok(
        !laterRendererCommand.event,
        'Later renderer subscriber unexpectedly received the command before the first subscriber.'
      );
      assert.equal(orderedRendererResponse.status, 200);
      assert.deepEqual(orderedRendererResponse.body.result, { ok: true, ordered: true });
    } finally {
      secondRendererSocket.close();
    }

    const projectAddedPromise = nextWebSocketEvent(socket, 'presentationDelta');
    const createProject = await requestJson('/api/createProject', {
      body: {
        params: {
          name: 'Phase 4 Events',
          path: projectDir,
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(createProject.status, 200);
    assertSuccessEnvelope(createProject.body);
    const project = createProject.body.result.project;
    const projectAdded = await projectAddedPromise;
    assert.equal(projectAdded.delta.type, 'projectAdded');
    assert.equal(projectAdded.delta.project.projectId, project.projectId);
    assert.equal(projectAdded.delta.domainProject.projectId, project.projectId);
    recordObservation(observations, 'phase4ProjectAddedDelta', normalizeValue(projectAdded, homeDir));

    const sessionChangedPromise = nextWebSocketEvent(socket, 'presentationDelta');
    const createSession = await requestJson('/api/createSession', {
      body: {
        params: {
          kind: 'terminal',
          lifecycleState: 'running',
          projectId: project.projectId,
          providerState: { lifecycleState: 'exists', provider: 'zmx' },
          title: 'Phase 4 Session',
        },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(createSession.status, 200);
    const session = createSession.body.result.session;
    const sessionChanged = await sessionChangedPromise;
    assert.equal(sessionChanged.delta.type, 'sessionPresentationChanged');
    assert.equal(sessionChanged.delta.session.sessionId, session.sessionId);
    recordObservation(observations, 'phase4SessionChangedDelta', normalizeValue(sessionChanged, homeDir));

    const projectRemovedPromise = nextWebSocketEvent(socket, 'presentationDelta');
    const removeProject = await requestJson('/api/removeProject', {
      body: {
        params: { projectId: project.projectId },
        protocolVersion: PROTOCOL_VERSION,
      },
      method: 'POST',
      token,
    });
    assert.equal(removeProject.status, 200);
    const projectRemoved = await projectRemovedPromise;
    assert.deepEqual(projectRemoved.delta, {
      projectId: project.projectId,
      type: 'projectRemoved',
    });
    recordObservation(observations, 'phase4ProjectRemovedDelta', normalizeValue(projectRemoved, homeDir));
  } finally {
    socket.close();
  }

  const revisionProjectDir = path.join(workspaceDir, 'phase4-revision-project');
  await mkdir(revisionProjectDir, { recursive: true });
  const revisionProject = await requestJson('/api/createProject', {
    body: {
      params: { name: 'Phase 4 Revision', path: revisionProjectDir },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(revisionProject.status, 200);
  const revisionProjectId = revisionProject.body.result.project.projectId;
  const snapshotBefore = await requestJson('/api/readPresentationSnapshot', {
    body: { params: {}, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(snapshotBefore.status, 200);
  const revisionBefore = Number(snapshotBefore.body.result.snapshot.revision);
  const revisionSession = await requestJson('/api/createSession', {
    body: {
      params: {
        lifecycleState: 'running',
        projectId: revisionProjectId,
        providerState: { lifecycleState: 'exists', provider: 'zmx' },
        title: 'Revision Without Clients',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(revisionSession.status, 200);
  const snapshotAfter = await requestJson('/api/readPresentationSnapshot', {
    body: { params: {}, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(snapshotAfter.status, 200);
  const revisionAfter = Number(snapshotAfter.body.result.snapshot.revision);
  assert.ok(revisionAfter > revisionBefore);
  recordObservation(
    observations,
    'phase4RevisionWithoutClients',
    normalizeValue(
      {
        revisionAdvanced: true,
      },
      homeDir
    )
  );
}

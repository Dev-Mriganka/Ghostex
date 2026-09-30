import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requestJson, assertSuccessEnvelope } from './run-compat-io.mjs';
import { PROTOCOL_VERSION } from './run-compat-context.mjs';
import { recordObservation, normalizeExchange } from './run-compat-fixtures.mjs';

/*
CDXC:RepoStructure 2026-06-14-22:52:
Phase 3 compatibility must exercise durable project/session state and read-only presentation inventory through public RPC endpoints, not Rust internals. Keep the fixture metadata-only and path-normalized so it can compare TypeScript and Rust without leaking user workspace names or terminal content.
*/
export async function runPhase3DomainChecks({ homeDir, observations, token }) {
  const workspaceDir = path.join(homeDir, 'workspace');
  const projectDir = path.join(workspaceDir, 'phase3-project');
  const addedProjectDir = path.join(workspaceDir, 'added-project');
  await mkdir(projectDir, { recursive: true });
  await mkdir(addedProjectDir, { recursive: true });

  const createProject = await requestJson('/api/createProject', {
    body: {
      params: {
        identityIcon: { color: 'blue', kind: 'emoji', value: 'G' },
        isPinned: true,
        name: 'Phase 3 Compat',
        path: projectDir,
        runtimeSettings: { defaultSurface: 'workspace' },
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(createProject.status, 200);
  assertSuccessEnvelope(createProject.body);
  const project = createProject.body.result.project;
  assert.match(project.projectId, /^P\d[a-z0-9]{3}$/u);
  assert.equal(project.name, 'Phase 3 Compat');
  assert.equal(project.path, projectDir);
  recordObservation(
    observations,
    'phase3CreateProject',
    normalizeExchange(
      {
        request: {
          body: {
            params: {
              identityIcon: { color: 'blue', kind: 'emoji', value: 'G' },
              isPinned: true,
              name: 'Phase 3 Compat',
              path: projectDir,
              runtimeSettings: { defaultSurface: 'workspace' },
            },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/createProject',
          token: '<bearer>',
        },
        response: createProject,
      },
      homeDir
    )
  );

  const updateProject = await requestJson('/api/updateProject', {
    body: {
      params: {
        customAgentOrder: ['codex'],
        customAgents: [{ id: 'codex', name: 'Codex' }],
        isFavorite: true,
        name: 'Phase 3 Compat Updated',
        projectId: project.projectId,
        worktree: { branch: 'main', rootPath: projectDir },
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(updateProject.status, 200);
  assertSuccessEnvelope(updateProject.body);
  assert.equal(updateProject.body.result.project.name, 'Phase 3 Compat Updated');
  assert.equal(updateProject.body.result.project.isFavorite, true);
  recordObservation(
    observations,
    'phase3UpdateProject',
    normalizeExchange(
      {
        request: {
          body: {
            params: {
              customAgentOrder: ['codex'],
              customAgents: [{ id: 'codex', name: 'Codex' }],
              isFavorite: true,
              name: 'Phase 3 Compat Updated',
              projectId: project.projectId,
              worktree: { branch: 'main', rootPath: projectDir },
            },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/updateProject',
          token: '<bearer>',
        },
        response: updateProject,
      },
      homeDir
    )
  );

  const addProjectPath = await requestJson('/api/addProjectPath', {
    body: {
      params: { path: addedProjectDir },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(addProjectPath.status, 200);
  assertSuccessEnvelope(addProjectPath.body);
  const addedProject = addProjectPath.body.result.project;
  assert.match(addedProject.projectId, /^P\d[a-z0-9]{3}$/u);
  assert.equal(addedProject.path, addedProjectDir);
  recordObservation(
    observations,
    'phase3AddProjectPath',
    normalizeExchange(
      {
        request: {
          body: { params: { path: addedProjectDir }, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/addProjectPath',
          token: '<bearer>',
        },
        response: addProjectPath,
      },
      homeDir
    )
  );

  const terminalSession = await requestJson('/api/createSession', {
    body: {
      params: {
        cwd: projectDir,
        kind: 'terminal',
        launchSettings: { surface: 'workspace' },
        lifecycleState: 'running',
        projectId: project.projectId,
        providerState: { lifecycleState: 'exists', provider: 'zmx' },
        runtimeSettings: { terminalTitle: 'Shell Title' },
        sessionTag: 'research',
        sidebarOrder: 2000,
        title: 'Terminal One',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(terminalSession.status, 200);
  assertSuccessEnvelope(terminalSession.body);
  const terminal = terminalSession.body.result.session;
  assert.match(terminal.sessionId, /^G\d[a-z0-9]{3}$/u);
  assert.equal(terminal.projectId, project.projectId);
  assert.equal(terminal.title, 'Terminal One');
  recordObservation(
    observations,
    'phase3CreateSession',
    normalizeExchange(
      {
        request: {
          body: {
            params: {
              cwd: projectDir,
              kind: 'terminal',
              launchSettings: { surface: 'workspace' },
              lifecycleState: 'running',
              projectId: project.projectId,
              providerState: { lifecycleState: 'exists', provider: 'zmx' },
              runtimeSettings: { terminalTitle: 'Shell Title' },
              sessionTag: 'research',
              sidebarOrder: 2000,
              title: 'Terminal One',
            },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/createSession',
          token: '<bearer>',
        },
        response: terminalSession,
      },
      homeDir
    )
  );

  const agentSession = await requestJson('/api/createAgentSession', {
    body: {
      params: {
        agentId: 'codex',
        cwd: projectDir,
        launchSettings: { surface: 'workspace' },
        projectId: project.projectId,
        runtimeSettings: {
          agentName: 'Codex',
          agentSessionId: 'agent-session-1',
          firstUserMessage: 'Summarize the project.',
        },
        sidebarOrder: 1000,
        title: 'Codex Agent',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(agentSession.status, 200);
  assertSuccessEnvelope(agentSession.body);
  const agent = agentSession.body.result.session;
  assert.match(agent.sessionId, /^G\d[a-z0-9]{3}$/u);
  assert.equal(agent.kind, 'agent');
  assert.equal(agent.agentId, 'codex');
  recordObservation(
    observations,
    'phase3CreateAgentSession',
    normalizeExchange(
      {
        request: {
          body: {
            params: {
              agentId: 'codex',
              cwd: projectDir,
              launchSettings: { surface: 'workspace' },
              projectId: project.projectId,
              runtimeSettings: {
                agentName: 'Codex',
                agentSessionId: 'agent-session-1',
                firstUserMessage: 'Summarize the project.',
              },
              sidebarOrder: 1000,
              title: 'Codex Agent',
            },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/createAgentSession',
          token: '<bearer>',
        },
        response: agentSession,
      },
      homeDir
    )
  );

  const updateSession = await requestJson('/api/updateSession', {
    body: {
      params: {
        isPinned: true,
        lifecycleState: 'sleeping',
        projectId: project.projectId,
        runtimeSettings: { terminalTitle: 'Shell Title Updated' },
        sessionId: terminal.sessionId,
        title: 'Terminal One Updated',
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(updateSession.status, 200);
  assertSuccessEnvelope(updateSession.body);
  assert.equal(updateSession.body.result.session.title, 'Terminal One Updated');
  recordObservation(
    observations,
    'phase3UpdateSession',
    normalizeExchange(
      {
        request: {
          body: {
            params: {
              isPinned: true,
              lifecycleState: 'sleeping',
              projectId: project.projectId,
              runtimeSettings: { terminalTitle: 'Shell Title Updated' },
              sessionId: terminal.sessionId,
              title: 'Terminal One Updated',
            },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/updateSession',
          token: '<bearer>',
        },
        response: updateSession,
      },
      homeDir
    )
  );

  const updateOrder = await requestJson('/api/updateSessionOrder', {
    body: {
      params: {
        projectId: project.projectId,
        sessionIds: [agent.sessionId, terminal.sessionId],
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(updateOrder.status, 200);
  assertSuccessEnvelope(updateOrder.body);
  assert.equal(updateOrder.body.result.sessions.length, 2);
  recordObservation(
    observations,
    'phase3UpdateSessionOrder',
    normalizeExchange(
      {
        request: {
          body: {
            params: {
              projectId: project.projectId,
              sessionIds: [agent.sessionId, terminal.sessionId],
            },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/updateSessionOrder',
          token: '<bearer>',
        },
        response: updateOrder,
      },
      homeDir
    )
  );

  const listProjects = await requestJson('/api/listProjects', {
    body: { params: {}, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(listProjects.status, 200);
  assertSuccessEnvelope(listProjects.body);
  assert.equal(listProjects.body.result.projects.length, 2);
  recordObservation(
    observations,
    'phase3ListProjects',
    normalizeExchange(
      {
        request: {
          body: { params: {}, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/listProjects',
          token: '<bearer>',
        },
        response: listProjects,
      },
      homeDir
    )
  );

  const listSessions = await requestJson('/api/listSessions', {
    body: { params: { projectId: project.projectId }, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(listSessions.status, 200);
  assertSuccessEnvelope(listSessions.body);
  assert.equal(listSessions.body.result.sessions.length, 2);
  recordObservation(
    observations,
    'phase3ListSessions',
    normalizeExchange(
      {
        request: {
          body: { params: { projectId: project.projectId }, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/listSessions',
          token: '<bearer>',
        },
        response: listSessions,
      },
      homeDir
    )
  );

  const projectStatus = await requestJson('/api/readProjectStatus', {
    body: { params: { projectId: project.projectId }, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(projectStatus.status, 200);
  assertSuccessEnvelope(projectStatus.body);
  assert.equal(projectStatus.body.result.sessions.length, 2);
  recordObservation(
    observations,
    'phase3ReadProjectStatus',
    normalizeExchange(
      {
        request: {
          body: { params: { projectId: project.projectId }, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/readProjectStatus',
          token: '<bearer>',
        },
        response: projectStatus,
      },
      homeDir
    )
  );

  const snapshot = await requestJson('/api/readPresentationSnapshot', {
    body: { params: {}, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(snapshot.status, 200);
  assertSuccessEnvelope(snapshot.body);
  assert.equal(snapshot.body.result.snapshot.projects.length, 2);
  assert.equal(snapshot.body.result.snapshot.sessions.length, 2);
  recordObservation(
    observations,
    'phase3ReadPresentationSnapshot',
    normalizeExchange(
      {
        request: {
          body: { params: {}, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/readPresentationSnapshot',
          token: '<bearer>',
        },
        response: snapshot,
      },
      homeDir
    )
  );

  const search = await requestJson('/api/searchSessions', {
    body: {
      params: { limit: 10, projectId: project.projectId, query: 'Terminal One Updated' },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(search.status, 200);
  assertSuccessEnvelope(search.body);
  assert.equal(search.body.result.results.length, 1);
  recordObservation(
    observations,
    'phase3SearchSessions',
    normalizeExchange(
      {
        request: {
          body: {
            params: { limit: 10, projectId: project.projectId, query: 'Terminal One Updated' },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/searchSessions',
          token: '<bearer>',
        },
        response: search,
      },
      homeDir
    )
  );

  const removeSession = await requestJson('/api/removeSession', {
    body: {
      params: { projectId: project.projectId, sessionId: terminal.sessionId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(removeSession.status, 200);
  assertSuccessEnvelope(removeSession.body);
  recordObservation(
    observations,
    'phase3RemoveSession',
    normalizeExchange(
      {
        request: {
          body: {
            params: { projectId: project.projectId, sessionId: terminal.sessionId },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/removeSession',
          token: '<bearer>',
        },
        response: removeSession,
      },
      homeDir
    )
  );

  const removeProject = await requestJson('/api/removeProject', {
    body: {
      params: { projectId: addedProject.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(removeProject.status, 200);
  assertSuccessEnvelope(removeProject.body);
  recordObservation(
    observations,
    'phase3RemoveProject',
    normalizeExchange(
      {
        request: {
          body: { params: { projectId: addedProject.projectId }, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/removeProject',
          token: '<bearer>',
        },
        response: removeProject,
      },
      homeDir
    )
  );
}

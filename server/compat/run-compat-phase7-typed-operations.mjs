import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requestJson, assertErrorEnvelope } from './run-compat-io.mjs';
import { PROTOCOL_VERSION } from './run-compat-context.mjs';
import { recordObservation, normalizeExchange, normalizeValue } from './run-compat-fixtures.mjs';
import { createGitSetupEnv, runCommand } from './run-compat-target.mjs';

export async function runPhase7TypedOperationChecks({ homeDir, observations, paths, runOptions, token }) {
  const workspaceDir = path.join(homeDir, 'workspace');
  const projectDir = path.join(workspaceDir, 'phase7-project');
  const cloneParentDir = path.join(workspaceDir, 'clone-parent');
  await mkdir(projectDir, { recursive: true });
  await mkdir(cloneParentDir, { recursive: true });
  await writeFile(path.join(projectDir, 'file.txt'), 'one\ntwo\n');
  await runGit(['init'], projectDir, homeDir, runOptions);
  await runGit(['config', 'user.email', 'compat@example.invalid'], projectDir, homeDir, runOptions);
  await runGit(['config', 'user.name', 'Compat'], projectDir, homeDir, runOptions);

  const createProject = await requestJson('/api/createProject', {
    body: {
      params: {
        gitConfig: {},
        name: 'Phase 7 Project',
        path: projectDir,
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(createProject.status, 200);
  const project = createProject.body.result.project;

  const gitStatus = await requestJson('/api/runGitAction', {
    body: {
      params: { action: 'status', projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(gitStatus.status, 200);
  assert.equal(gitStatus.body.result.action, 'status');
  assert.equal(gitStatus.body.result.command.executable, 'git');
  recordObservation(
    observations,
    'phase7RunGitStatus',
    normalizeValue(
      {
        action: gitStatus.body.result.action,
        args: gitStatus.body.result.command.args,
        exitCode: gitStatus.body.result.exitCode,
        stdoutHasFile: gitStatus.body.result.stdout.includes('file.txt'),
      },
      homeDir
    )
  );

  const lineCount = await requestJson('/api/runGitAction', {
    body: {
      params: { action: 'countFileLines', filePaths: ['file.txt'], projectPath: projectDir },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(lineCount.status, 200);
  assert.equal(lineCount.body.result.stdout, '2');
  assert.equal(lineCount.body.result.command, undefined);
  recordObservation(observations, 'phase7RunGitCountFileLines', normalizeValue(lineCount.body.result, homeDir));

  const commitPlan = await requestJson('/api/runGitAction', {
    body: {
      params: {
        action: 'commit',
        messageBody: 'private body',
        messageSubject: 'private subject',
        noVerify: true,
        projectId: project.projectId,
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(commitPlan.status, 200);
  assert.deepEqual(commitPlan.body.result.command.args, ['commit', '--no-verify', '-F', '<stdin>']);
  recordObservation(
    observations,
    'phase7RunGitCommitRedaction',
    normalizeValue(
      {
        action: commitPlan.body.result.action,
        command: commitPlan.body.result.command,
        exitCodeType: typeof commitPlan.body.result.exitCode,
        stderrLoggedSubject: commitPlan.body.result.stderr.includes('private subject'),
        stdoutLoggedSubject: commitPlan.body.result.stdout.includes('private subject'),
      },
      homeDir
    )
  );

  const ghVersion = await requestJson('/api/runGitHubAction', {
    body: {
      params: { action: 'version', projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(ghVersion.status, 200);
  assert.equal(ghVersion.body.result.stdout, 'gh version 2.0.0 (compat)');
  recordObservation(
    observations,
    'phase7RunGitHubVersion',
    normalizeValue(
      {
        action: ghVersion.body.result.action,
        args: ghVersion.body.result.command.args,
        exitCode: ghVersion.body.result.exitCode,
        stdout: ghVersion.body.result.stdout,
      },
      homeDir
    )
  );

  const worktreeExists = await requestJson('/api/runWorktreeAction', {
    body: {
      params: {
        action: 'pathExists',
        projectId: project.projectId,
        worktreePath: path.join(workspaceDir, 'phase7-project-copy'),
      },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(worktreeExists.status, 200);
  assert.equal(worktreeExists.body.result.stdout, 'false');
  recordObservation(observations, 'phase7RunWorktreePathExists', normalizeValue(worktreeExists.body.result, homeDir));

  const worktreeList = await requestJson('/api/runWorktreeAction', {
    body: {
      params: { action: 'list', projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(worktreeList.status, 200);
  assert.equal(worktreeList.body.result.action, 'list');
  recordObservation(
    observations,
    'phase7RunWorktreeList',
    normalizeValue(
      {
        action: worktreeList.body.result.action,
        exitCode: worktreeList.body.result.exitCode,
        worktreeCount: Array.isArray(worktreeList.body.result.worktrees)
          ? worktreeList.body.result.worktrees.length
          : 0,
      },
      homeDir
    )
  );

  const setupNoop = await requestJson('/api/runProjectSetupCommand', {
    body: {
      params: { action: 'worktreeSetupCommand', projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(setupNoop.status, 200);
  assert.equal(setupNoop.body.result.command, undefined);
  recordObservation(observations, 'phase7RunProjectSetupNoop', normalizeValue(setupNoop.body.result, homeDir));

  const beadsStorage = await requestJson('/api/runBeadsAction', {
    body: {
      params: { action: 'storageExists', projectBoardScope: true, projectId: project.projectId },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(beadsStorage.status, 200);
  assert.equal(beadsStorage.body.result.stdout, 'false');
  recordObservation(observations, 'phase7RunBeadsStorageExists', normalizeValue(beadsStorage.body.result, homeDir));

  const scopeRejected = await requestJson('/api/runGitAction', {
    body: {
      params: { action: 'status', projectPath: path.join(workspaceDir, 'unregistered') },
      protocolVersion: PROTOCOL_VERSION,
    },
    method: 'POST',
    token,
  });
  assert.equal(scopeRejected.status, 404);
  assertErrorEnvelope(scopeRejected.body, 'notFound');
  recordObservation(
    observations,
    'phase7TypedScopeRejected',
    normalizeExchange(
      {
        request: {
          body: {
            params: { action: 'status', projectPath: path.join(workspaceDir, 'unregistered') },
            protocolVersion: PROTOCOL_VERSION,
          },
          method: 'POST',
          path: '/api/runGitAction',
          token: '<bearer>',
        },
        response: scopeRejected,
      },
      homeDir
    )
  );

  const cloneParams = {
    branchName: 'main',
    cloneMainOnly: true,
    destinationFolderName: 'phase7-clone',
    parentPath: cloneParentDir,
    repositoryInput: 'gh repo clone factory-ai/ghostex',
    shallowClone: true,
  };
  const clonePreview = await requestJson('/api/previewRepositoryClone', {
    body: { params: cloneParams, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(clonePreview.status, 200);
  assert.equal(clonePreview.body.result.preview.cloneUrl, 'https://github.com/factory-ai/ghostex.git');
  assert.equal(clonePreview.body.result.preview.destinationExists, false);
  recordObservation(
    observations,
    'phase7PreviewRepositoryClone',
    normalizeValue(
      {
        branchName: clonePreview.body.result.preview.branchName,
        cloneMainOnly: clonePreview.body.result.preview.cloneMainOnly,
        cloneUrl: clonePreview.body.result.preview.cloneUrl,
        destinationExists: clonePreview.body.result.preview.destinationExists,
        destinationFolderName: clonePreview.body.result.preview.destinationFolderName,
        repositoryName: clonePreview.body.result.preview.repositoryName,
        shallowClone: clonePreview.body.result.preview.shallowClone,
      },
      homeDir
    )
  );

  const cloneStart = await requestJson('/api/startRepositoryClone', {
    body: { params: cloneParams, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(cloneStart.status, 200);
  assert.equal(cloneStart.body.result.job.state, 'running');
  const cloneJob = await waitForRepositoryCloneJob(cloneStart.body.result.job.jobId, token);
  assert.equal(cloneJob.state, 'completed');
  assert.equal(cloneJob.projectPath, path.join(cloneParentDir, 'phase7-clone'));
  recordObservation(
    observations,
    'phase7StartRepositoryClone',
    normalizeValue(
      {
        completed: cloneJob.state === 'completed',
        exitCode: cloneJob.exitCode,
        hasProject: Boolean(cloneJob.project?.projectId),
        message: cloneJob.message,
        projectPath: cloneJob.projectPath,
        stdout: cloneJob.stdout,
      },
      homeDir
    )
  );

  const existingPreview = await requestJson('/api/previewRepositoryClone', {
    body: { params: cloneParams, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(existingPreview.status, 200);
  assert.equal(existingPreview.body.result.preview.destinationExists, true);
  const existingStart = await requestJson('/api/startRepositoryClone', {
    body: { params: cloneParams, protocolVersion: PROTOCOL_VERSION },
    method: 'POST',
    token,
  });
  assert.equal(existingStart.status, 400);
  assertErrorEnvelope(existingStart.body, 'badRequest');
  recordObservation(
    observations,
    'phase7CloneExistingRejected',
    normalizeExchange(
      {
        request: {
          body: { params: cloneParams, protocolVersion: PROTOCOL_VERSION },
          method: 'POST',
          path: '/api/startRepositoryClone',
          token: '<bearer>',
        },
        response: existingStart,
      },
      homeDir
    )
  );

  let logText = '';
  try {
    logText = await readFile(paths.logFile, 'utf8');
  } catch {}
  assert.equal(logText.includes('private subject'), false);
  assert.equal(logText.includes('factory-ai/ghostex'), false);
  assert.equal(logText.includes('phase7-clone'), false);
  assert.equal(logText.includes(cloneParentDir), false);
  recordObservation(observations, 'phase7LogPrivacy', {
    clonePathLogged: false,
    cloneUrlLogged: false,
    commitSubjectLogged: false,
  });
}

async function runGit(args, cwd, homeDir, runOptions) {
  const result = await runCommand(process.env.GXSERVER_COMPAT_REAL_GIT || '/usr/bin/git', args, {
    cwd,
    env: createGitSetupEnv(homeDir, runOptions),
    timeoutMs: 20_000,
  });
  assert.equal(result.exitCode, 0, result.stderr);
  return result;
}

async function waitForRepositoryCloneJob(jobId, token) {
  const deadline = Date.now() + 10_000;
  let latest;
  while (Date.now() < deadline) {
    const response = await requestJson('/api/readRepositoryCloneJob', {
      body: { params: { jobId }, protocolVersion: PROTOCOL_VERSION },
      method: 'POST',
      token,
    });
    assert.equal(response.status, 200);
    latest = response.body.result.job;
    if (latest.state !== 'running') {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for repository clone job. Latest: ${JSON.stringify(latest)}`);
}

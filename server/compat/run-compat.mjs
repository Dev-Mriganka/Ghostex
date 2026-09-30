#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PRODUCT,
  PROTOCOL_VERSION,
  LOCAL_HOST,
  JSON_BODY_LIMIT_BYTES,
  options,
  printUsage,
} from './run-compat-context.mjs';
import { runPhase3DomainChecks } from './run-compat-phase3-domain.mjs';
import { runPhase4EventChecks } from './run-compat-phase4-events.mjs';
import { runPhase5ZmxChecks } from './run-compat-phase5-zmx.mjs';
import { runPhase6AgentChecks } from './run-compat-phase6-agents.mjs';
import { runPhase7TypedOperationChecks } from './run-compat-phase7-typed-operations.mjs';
import {
  prepareCompatSandbox,
  resolveTarget,
  readTargetVersion,
  runTargetCommand,
  createTargetEnv,
  collectChildOutput,
  getGxserverPaths,
  assertCompatTargetEnv,
  assertCompatSandboxContained,
} from './run-compat-target.mjs';
import {
  waitForFileText,
  waitForServerReady,
  requestJson,
  assertErrorEnvelope,
  assertSuccessEnvelope,
  assertAuthenticatedHealth,
  assertRuntimeFiles,
  assertRuntimeMetadataRemoved,
  readEventStreamReady,
  waitForProcessExit,
  isTcpPortAvailable,
} from './run-compat-io.mjs';
import {
  recordObservation,
  normalizeExchange,
  normalizeValue,
  updateOrCompareFixture,
} from './run-compat-fixtures.mjs';

if (options.help) {
  printUsage();
  process.exit(0);
}

await main(options);

async function main(runOptions) {
  if (!['phase0', 'phase3', 'phase4', 'phase5', 'phase6', 'phase7'].includes(runOptions.suite)) {
    throw new Error(`Unsupported suite: ${runOptions.suite}`);
  }

  const target = resolveTarget(runOptions);
  if (!(await isTcpPortAvailable(runOptions.port))) {
    if (runOptions.skipIfPortBusy) {
      console.log(`SKIP gxserver-rs compat ${runOptions.suite}: ${LOCAL_HOST}:${runOptions.port} is already in use.`);
      return;
    }
    throw new Error(
      `${LOCAL_HOST}:${runOptions.port} is already in use; stop the current gxserver on the selected port before running the compatibility harness.`
    );
  }

  const homeDir = await mkdtemp(path.join(tmpdir(), 'gxserver-rs-phase0-home-'));
  const paths = getGxserverPaths(homeDir);
  const childOutput = { stderr: '', stdout: '' };
  let child;
  let stoppedByControlEndpoint = false;
  let targetEnv;
  let version;

  const observations = {
    schemaVersion: 1,
    suite: runOptions.suite,
    tests: [],
  };

  try {
    await prepareCompatSandbox(homeDir, runOptions);
    targetEnv = createTargetEnv(homeDir, runOptions);
    assertCompatTargetEnv(targetEnv, homeDir);
    version = await readTargetVersion(target, runOptions.timeoutMs, targetEnv);

    child = spawn(target.command, target.foregroundArgs, {
      cwd: target.cwd,
      env: targetEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    collectChildOutput(child, childOutput);

    const token = (await waitForFileText(paths.authTokenFile, runOptions.timeoutMs, child, childOutput)).trim();
    assert.match(token, /^[A-Za-z0-9_-]{32,}$/u);
    await waitForServerReady(token, runOptions.timeoutMs, child, childOutput);

    const minimalHealth = await requestJson('/api/health', { method: 'GET' });
    assert.equal(minimalHealth.status, 200);
    assert.deepEqual(minimalHealth.body, {
      ok: true,
      product: PRODUCT,
      protocolVersion: PROTOCOL_VERSION,
      version,
    });
    recordObservation(
      observations,
      'minimalHealth',
      normalizeExchange(
        {
          request: { method: 'GET', path: '/api/health' },
          response: minimalHealth,
        },
        homeDir
      )
    );

    const unauthorizedRpc = await requestJson('/api/listSessions', { method: 'POST' });
    assert.equal(unauthorizedRpc.status, 401);
    assertErrorEnvelope(unauthorizedRpc.body, 'unauthorized');
    recordObservation(
      observations,
      'unauthorizedRpc',
      normalizeExchange(
        {
          request: { method: 'POST', path: '/api/listSessions' },
          response: unauthorizedRpc,
        },
        homeDir
      )
    );

    const methodGate = await requestJson('/api/listSessions', {
      method: 'GET',
      protocolVersion: PROTOCOL_VERSION,
      token,
    });
    assert.equal(methodGate.status, 405);
    assertErrorEnvelope(methodGate.body, 'methodNotAllowed');
    recordObservation(
      observations,
      'methodGate',
      normalizeExchange(
        {
          request: { method: 'GET', path: '/api/listSessions', protocolVersion: PROTOCOL_VERSION },
          response: methodGate,
        },
        homeDir
      )
    );

    const missingProtocol = await requestJson('/api/listSessions', { method: 'POST', token });
    assert.equal(missingProtocol.status, 426);
    assertErrorEnvelope(missingProtocol.body, 'protocolMismatch');
    assert.match(missingProtocol.body.message, /Update Ghostex and gxserver/u);
    recordObservation(
      observations,
      'missingProtocol',
      normalizeExchange(
        {
          request: { method: 'POST', path: '/api/listSessions', token: '<bearer>' },
          response: missingProtocol,
        },
        homeDir
      )
    );

    const wrongProtocol = await requestJson('/api/listSessions', {
      method: 'POST',
      protocolVersion: 999,
      token,
    });
    assert.equal(wrongProtocol.status, 426);
    assertErrorEnvelope(wrongProtocol.body, 'protocolMismatch');
    recordObservation(
      observations,
      'wrongProtocol',
      normalizeExchange(
        {
          request: { method: 'POST', path: '/api/listSessions', protocolVersion: 999, token: '<bearer>' },
          response: wrongProtocol,
        },
        homeDir
      )
    );

    const bodyProtocolRpc = await requestJson('/api/listSessions', {
      body: { params: {}, protocolVersion: PROTOCOL_VERSION },
      method: 'POST',
      token,
    });
    assert.equal(bodyProtocolRpc.status, 200);
    assertSuccessEnvelope(bodyProtocolRpc.body);
    assert.deepEqual(bodyProtocolRpc.body.result.sessions, []);
    recordObservation(
      observations,
      'bodyProtocolRpc',
      normalizeExchange(
        {
          request: {
            body: { params: {}, protocolVersion: PROTOCOL_VERSION },
            method: 'POST',
            path: '/api/listSessions',
            token: '<bearer>',
          },
          response: bodyProtocolRpc,
        },
        homeDir
      )
    );

    const oversizedBody = {
      params: { padding: 'x'.repeat(JSON_BODY_LIMIT_BYTES) },
      protocolVersion: PROTOCOL_VERSION,
    };
    const oversizedRpc = await requestJson('/api/listSessions', {
      body: oversizedBody,
      method: 'POST',
      protocolVersion: PROTOCOL_VERSION,
      token,
    });
    assert.equal(oversizedRpc.status, 413);
    assertErrorEnvelope(oversizedRpc.body, 'badRequest');
    assert.match(oversizedRpc.body.message, /JSON RPC limit/u);
    recordObservation(
      observations,
      'jsonBodyLimit',
      normalizeExchange(
        {
          request: {
            body: { params: { padding: `<${JSON_BODY_LIMIT_BYTES} chars>` }, protocolVersion: PROTOCOL_VERSION },
            method: 'POST',
            path: '/api/listSessions',
            protocolVersion: PROTOCOL_VERSION,
            token: '<bearer>',
          },
          response: oversizedRpc,
        },
        homeDir
      )
    );

    const authenticatedHealth = await requestJson('/api/health/server', {
      method: 'GET',
      protocolVersion: PROTOCOL_VERSION,
      token,
    });
    assert.equal(authenticatedHealth.status, 200);
    assertAuthenticatedHealth(authenticatedHealth.body, version);
    await assertRuntimeFiles(paths, token);
    recordObservation(
      observations,
      'authenticatedHealth',
      normalizeExchange(
        {
          request: { method: 'GET', path: '/api/health/server', protocolVersion: PROTOCOL_VERSION, token: '<bearer>' },
          response: authenticatedHealth,
        },
        homeDir
      )
    );

    const eventStreamReady = await readEventStreamReady(token);
    assert.equal(eventStreamReady.rawEndsWithNewline, true);
    assert.equal(eventStreamReady.body.type, 'eventStreamReady');
    assert.equal(eventStreamReady.body.protocolVersion, PROTOCOL_VERSION);
    assert.equal(eventStreamReady.body.serverId, authenticatedHealth.body.serverId);
    recordObservation(observations, 'eventStreamReady', normalizeValue(eventStreamReady, homeDir));

    const cliStatus = await runTargetCommand(target, target.statusArgs, targetEnv, runOptions.timeoutMs);
    assert.equal(cliStatus.exitCode, 0, cliStatus.stderr);
    const statusBody = JSON.parse(cliStatus.stdout);
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.product, PRODUCT);
    assert.equal(statusBody.state, 'running');
    assert.equal(statusBody.health.port, runOptions.port);
    recordObservation(
      observations,
      'cliStatusRunning',
      normalizeValue(
        {
          exitCode: cliStatus.exitCode,
          stdoutJson: statusBody,
        },
        homeDir
      )
    );

    if (runOptions.suite === 'phase3') {
      await runPhase3DomainChecks({ homeDir, observations, token });
    }
    if (runOptions.suite === 'phase4') {
      await runPhase4EventChecks({ homeDir, observations, token });
    }
    if (runOptions.suite === 'phase5') {
      await runPhase5ZmxChecks({ homeDir, observations, token });
    }
    if (runOptions.suite === 'phase6') {
      await runPhase6AgentChecks({ homeDir, observations, paths, token });
    }
    if (runOptions.suite === 'phase7') {
      await runPhase7TypedOperationChecks({ homeDir, observations, paths, runOptions, token });
    }

    const controlStop = await requestJson('/api/control/stop', {
      body: { protocolVersion: PROTOCOL_VERSION },
      method: 'POST',
      token,
    });
    assert.equal(controlStop.status, 200);
    assertSuccessEnvelope(controlStop.body);
    assert.deepEqual(controlStop.body.result, {});
    recordObservation(
      observations,
      'controlStop',
      normalizeExchange(
        {
          request: {
            body: { protocolVersion: PROTOCOL_VERSION },
            method: 'POST',
            path: '/api/control/stop',
            token: '<bearer>',
          },
          response: controlStop,
        },
        homeDir
      )
    );

    stoppedByControlEndpoint = true;
    await waitForProcessExit(child, runOptions.timeoutMs, childOutput);
    await assertRuntimeMetadataRemoved(paths);

    const stoppedStatus = await runTargetCommand(target, target.statusArgs, targetEnv, runOptions.timeoutMs);
    assert.equal(stoppedStatus.exitCode, 0, stoppedStatus.stderr);
    const stoppedStatusBody = JSON.parse(stoppedStatus.stdout);
    assert.equal(stoppedStatusBody.ok, true);
    assert.equal(stoppedStatusBody.product, PRODUCT);
    assert.notEqual(stoppedStatusBody.state, 'running');
    recordObservation(
      observations,
      'cliStatusStopped',
      normalizeValue(
        {
          exitCode: stoppedStatus.exitCode,
          stdoutJson: stoppedStatusBody,
        },
        homeDir
      )
    );

    await assertCompatSandboxContained(homeDir, runOptions);
    await updateOrCompareFixture(runOptions, observations);
    console.log(`gxserver-rs compat ${runOptions.suite} passed for ${target.name}.`);
  } finally {
    if (child && child.exitCode === null) {
      if (!stoppedByControlEndpoint) {
        child.kill('SIGTERM');
      }
      await waitForProcessExit(child, 2_000, childOutput).catch(async () => {
        child.kill('SIGKILL');
        await waitForProcessExit(child, 2_000, childOutput).catch(() => undefined);
      });
    }
    if (runOptions.keepHome) {
      console.log(`Kept isolated HOME at ${homeDir}`);
    } else {
      await rm(homeDir, { force: true, recursive: true });
    }
  }
}

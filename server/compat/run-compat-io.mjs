import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { readFile, stat } from 'node:fs/promises';
import {
  PRODUCT,
  PROTOCOL_VERSION,
  PROTOCOL_HEADER,
  LOCAL_HOST,
  CURRENT_MIGRATION_VERSION,
  EXPECTED_MIGRATIONS,
  EXPECTED_CAPABILITIES,
  options,
} from './run-compat-context.mjs';

function hasNetworkLookingArg(args) {
  return (
    Array.isArray(args) &&
    args.some((arg) => /^(?:https?|ssh):\/\//iu.test(String(arg)) || /^git@[^:]+:/iu.test(String(arg)))
  );
}

export async function waitForFileText(filePath, timeoutMs, child, output) {
  return await waitFor(
    async () => {
      assertChildStillUseful(child, output);
      try {
        return await readFile(filePath, 'utf8');
      } catch {
        return undefined;
      }
    },
    timeoutMs,
    `Timed out waiting for ${filePath}.`
  );
}

export async function waitForServerReady(token, timeoutMs, child, output) {
  await waitFor(
    async () => {
      assertChildStillUseful(child, output);
      try {
        const response = await requestJson('/api/health/server', {
          method: 'GET',
          protocolVersion: PROTOCOL_VERSION,
          token,
        });
        return response.status === 200 ? true : undefined;
      } catch {
        return undefined;
      }
    },
    timeoutMs,
    'Timed out waiting for authenticated gxserver health.'
  );
}

async function waitFor(callback, timeoutMs, errorMessage) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value !== undefined) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error(errorMessage);
}

function assertChildStillUseful(child, output) {
  if (child.exitCode !== null) {
    throw new Error(
      `gxserver foreground exited early with code ${child.exitCode}.\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`
    );
  }
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJson(pathname, requestOptions) {
  const headers = {};
  if (requestOptions.token) {
    headers.authorization = `Bearer ${requestOptions.token}`;
  }
  if (requestOptions.protocolVersion !== undefined) {
    headers[PROTOCOL_HEADER] = String(requestOptions.protocolVersion);
  }
  if (requestOptions.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(compatHttpUrl(pathname), {
    body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
    headers,
    method: requestOptions.method,
  });
  const text = await response.text();
  return {
    body: text.trim() ? JSON.parse(text) : undefined,
    headers: Object.fromEntries(response.headers.entries()),
    status: response.status,
  };
}

function compatHttpUrl(pathname) {
  assert.equal(typeof pathname, 'string');
  assert.equal(pathname.startsWith('/'), true, 'compat HTTP requests must use local absolute paths');
  assert.equal(pathname.startsWith('//'), false, 'compat HTTP requests must not use protocol-relative URLs');
  const url = new URL(pathname, `http://${LOCAL_HOST}:${options.port}`);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, LOCAL_HOST);
  assert.equal(url.port, String(options.port));
  return url;
}

function compatWebSocketUrl(pathname, query) {
  const url = compatHttpUrl(pathname);
  url.protocol = 'ws:';
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

export function assertErrorEnvelope(body, error) {
  assert.equal(body.ok, false);
  assert.equal(body.product, PRODUCT);
  assert.equal(body.error, error);
  assert.equal(body.protocolVersion, PROTOCOL_VERSION);
  assert.equal(typeof body.message, 'string');
  assert.equal(typeof body.requestId, 'string');
}

export function assertSuccessEnvelope(body) {
  assert.equal(body.ok, true);
  assert.equal(body.product, PRODUCT);
  assert.equal(body.protocolVersion, PROTOCOL_VERSION);
  assert.equal(typeof body.requestId, 'string');
  assert.equal(typeof body.result, 'object');
}

export function assertAuthenticatedHealth(body, version) {
  assert.equal(body.ok, true);
  assert.equal(body.product, PRODUCT);
  assert.equal(body.protocolVersion, PROTOCOL_VERSION);
  assert.equal(body.version, version);
  assert.equal(body.port, options.port);
  assert.equal(typeof body.pid, 'number');
  assert.match(body.serverId, /^S\d+[a-z0-9]+$/u);
  assert.match(body.startedAt, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(typeof body.buildIdentity, 'string');
  assert.deepEqual(body.capabilities, EXPECTED_CAPABILITIES);
  assert.equal(body.listeners.local.enabled, true);
  assert.equal(body.listeners.local.host, LOCAL_HOST);
  assert.equal(body.listeners.local.kind, 'local');
  assert.equal(body.listeners.local.port, options.port);
  assert.equal(body.listeners.remote.enabled, false);
  assert.equal(body.listeners.remote.host, '0.0.0.0');
  assert.equal(body.listeners.remote.kind, 'remote');
  assert.equal(body.listeners.remote.port, 58745);
  assert.equal(body.migration.currentVersion, CURRENT_MIGRATION_VERSION);
  assert.deepEqual(body.migration.appliedMigrations, EXPECTED_MIGRATIONS);
  assert.equal(Array.isArray(body.tools), true);
}

export async function assertRuntimeFiles(paths, token) {
  assert.equal((await readFile(paths.authTokenFile, 'utf8')).trim(), token);
  assert.equal(pathMode(await stat(paths.authDir)), 0o700);
  assert.equal(pathMode(await stat(paths.authTokenFile)), 0o600);
  await assertFileExists(paths.configFile);
  await assertFileExists(paths.identityFile);
  await assertFileExists(paths.logsDir);
  await assertFileExists(paths.runtimeMetadataFile);
  await assertFileExists(paths.stateDbFile);
  await assertFileExists(paths.zmxDir);
  const runtimeMetadata = JSON.parse(await readFile(paths.runtimeMetadataFile, 'utf8'));
  assert.equal(runtimeMetadata.port, options.port);
  assert.equal(runtimeMetadata.protocolVersion, PROTOCOL_VERSION);
}

async function assertFileExists(filePath) {
  await stat(filePath);
}

function pathMode(stats) {
  return stats.mode & 0o777;
}

export async function assertRuntimeMetadataRemoved(paths) {
  try {
    await stat(paths.runtimeMetadataFile);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  throw new Error(`${paths.runtimeMetadataFile} still exists after control stop.`);
}

export async function readEventStreamReady(token) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is unavailable. Use Node 22 or newer.');
  }
  const url = compatWebSocketUrl('/api/events', {
    authToken: token,
    protocolVersion: PROTOCOL_VERSION,
  });
  const socket = new WebSocket(url);
  try {
    const text = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for eventStreamReady.')), 5_000);
      socket.addEventListener(
        'message',
        async (event) => {
          clearTimeout(timeout);
          try {
            resolve(await webSocketDataToText(event.data));
          } catch (error) {
            reject(error);
          }
        },
        { once: true }
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('gxserver event WebSocket failed.'));
        },
        { once: true }
      );
    });
    return {
      body: JSON.parse(text.trim()),
      rawEndsWithNewline: text.endsWith('\n'),
    };
  } finally {
    socket.close();
  }
}

export async function openEventSocket(token) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is unavailable. Use Node 22 or newer.');
  }
  const url = compatWebSocketUrl('/api/events', {
    authToken: token,
    protocolVersion: PROTOCOL_VERSION,
  });
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('gxserver event WebSocket failed.')), { once: true });
  });
  const ready = await nextWebSocketEvent(socket, 'eventStreamReady');
  assert.equal(ready.type, 'eventStreamReady');
  assert.equal(ready.protocolVersion, PROTOCOL_VERSION);
  return socket;
}

export async function nextWebSocketEvent(socket, type, timeoutMs = 5_000) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for WebSocket event ${type}.`));
    }, timeoutMs);
    async function onMessage(event) {
      let parsed;
      try {
        parsed = JSON.parse((await webSocketDataToText(event.data)).trim());
      } catch (error) {
        clearTimeout(timeout);
        socket.removeEventListener('message', onMessage);
        reject(error);
        return;
      }
      if (parsed.type !== type) {
        return;
      }
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      resolve(parsed);
    }
    socket.addEventListener('message', onMessage);
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        socket.removeEventListener('message', onMessage);
        reject(new Error('gxserver event WebSocket failed.'));
      },
      { once: true }
    );
  });
}

export async function observeWebSocketEvent(socket, type, timeoutMs) {
  try {
    return { event: await nextWebSocketEvent(socket, type, timeoutMs) };
  } catch (error) {
    return { error };
  }
}

async function webSocketDataToText(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  if (data && typeof data.arrayBuffer === 'function') {
    return Buffer.from(await data.arrayBuffer()).toString('utf8');
  }
  return String(data);
}

export async function waitForProcessExit(child, timeoutMs, output) {
  if (child.exitCode !== null) {
    return;
  }
  let timeout;
  try {
    await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for gxserver foreground exit.\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function isTcpPortAvailable(port) {
  const server = createServer();
  return await new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, LOCAL_HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

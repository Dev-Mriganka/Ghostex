import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot, releaseTimeouts, releasePhaseNames, ReleaseError } from './release-ghostex-config.mjs';

export function logStep(message) {
  console.log(`\n==> ${message}`);
}

export function run(command, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = { ...process.env, ...(options.env ?? {}) };
  const stdio = options.stdio ?? 'inherit';
  const timeoutMs = options.timeoutMs;

  console.log(`$ ${command}`);

  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, {
      cwd,
      env,
      shell: true,
      stdio,
    });
    const timeout = timeoutMs
      ? setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill('SIGTERM');
          reject(new ReleaseError(`Command timed out after ${timeoutMs}ms: ${command}`));
        }, timeoutMs)
      : null;

    let stdout = '';
    let stderr = '';

    if (stdio === 'pipe') {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const detail = stderr || stdout;
        reject(new ReleaseError(`Command failed (${code}): ${command}${detail ? `\n${detail}` : ''}`));
      }
    });
  });
}

export async function capture(command, options = {}) {
  const result = await run(command, { ...options, stdio: 'pipe' });
  return result.stdout.trim();
}

function formatElapsedSeconds(startedAt) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export async function runWithHeartbeat(command, options = {}) {
  const {
    label = 'command',
    timeoutMs = releaseTimeouts.notaryArchMs,
    heartbeatMs = releaseTimeouts.heartbeatMs,
    cwd = repoRoot,
    env = process.env,
  } = options;
  const startedAt = Date.now();
  const timeoutMinutes = Math.max(1, Math.round(timeoutMs / 60_000));
  console.log(`${label}: starting (timeout ${timeoutMinutes} min)`);

  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(command, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const heartbeat = setInterval(() => {
      console.log(`${label}: still running (${formatElapsedSeconds(startedAt)} elapsed)...`);
    }, heartbeatMs);
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      clearInterval(heartbeat);
      reject(
        new ReleaseError(`${label} timed out after ${formatElapsedSeconds(startedAt)} (${timeoutMinutes} min limit).`)
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (code === 0) {
        console.log(`${label}: finished in ${formatElapsedSeconds(startedAt)}`);
        resolve(stdout.trim());
      } else {
        const detail = stderr || stdout;
        reject(
          new ReleaseError(
            `${label} failed (${code}) after ${formatElapsedSeconds(startedAt)}: ${command}${detail ? `\n${detail}` : ''}`
          )
        );
      }
    });
  });
}

export function assertReleaseWithinOverallBudget(startedAt, stepLabel) {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs > releaseTimeouts.overallMs) {
    throw new ReleaseError(
      `Release exceeded the overall ${Math.round(releaseTimeouts.overallMs / 60_000)} minute budget during ${stepLabel}.`
    );
  }
}

function releaseStatePath(version) {
  return path.join(repoRoot, 'build', 'release-state', `v${version}.json`);
}

async function loadReleaseState(version) {
  try {
    const state = JSON.parse(await readFile(releaseStatePath(version), 'utf8'));
    return state && typeof state === 'object' && state.version === version ? state : null;
  } catch {
    return null;
  }
}

async function saveReleaseState(state) {
  const statePath = releaseStatePath(state.version);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function loadOrCreateReleaseState(version, buildVersion, options) {
  const existing = await loadReleaseState(version);
  if (options.fromPhase || options.onlyPhase) {
    if (!existing) {
      throw new ReleaseError(
        `--from/--only need an existing state file at ${releaseStatePath(version)}, but none was found for ${version}.`
      );
    }
    const targetPhase = options.fromPhase ?? options.onlyPhase;
    const targetIndex = releasePhaseNames.indexOf(targetPhase);
    for (const phaseName of releasePhaseNames.slice(0, targetIndex)) {
      if (existing.phases?.[phaseName]?.status !== 'completed') {
        throw new ReleaseError(
          `Cannot resume from ${targetPhase}: earlier phase ${phaseName} is not recorded as completed in ${releaseStatePath(version)}.`
        );
      }
    }
    // Re-run the target phase (and later phases for --from) even if a prior
    // attempt recorded them, so a failed publication can be repaired.
    const resetFrom = options.onlyPhase ? [targetPhase] : releasePhaseNames.slice(targetIndex);
    for (const phaseName of resetFrom) {
      if (existing.phases?.[phaseName]) {
        delete existing.phases[phaseName];
      }
    }
    return existing;
  }
  if (existing && Object.values(existing.phases ?? {}).some((phase) => phase.status === 'completed')) {
    console.warn(
      `Found prior release state at ${releaseStatePath(version)}; completed phases will be skipped. Use --from <phase> to redo a phase.`
    );
    return existing;
  }
  return { buildVersion, phases: {}, startedAt: new Date().toISOString(), version };
}

export async function runReleasePhase(state, name, options, fn) {
  const recorded = state.phases[name];
  if (recorded?.status === 'completed') {
    logStep(`Phase ${name} (skipped: already completed in ${formatPhaseDuration(recorded.durationMs)})`);
    return recorded.outputs ?? {};
  }
  if (options.onlyPhase && options.onlyPhase !== name) {
    if (recorded?.status !== 'completed') {
      logStep(`Phase ${name} (skipped by --only ${options.onlyPhase})`);
    }
    return recorded?.outputs ?? {};
  }
  logStep(`Phase ${name}`);
  const startedAt = Date.now();
  state.phases[name] = { startedAt: new Date(startedAt).toISOString(), status: 'running' };
  await saveReleaseState(state);
  try {
    const outputs = (await fn()) ?? {};
    state.phases[name] = {
      durationMs: Date.now() - startedAt,
      outputs,
      startedAt: new Date(startedAt).toISOString(),
      status: 'completed',
    };
    await saveReleaseState(state);
    console.log(`Phase ${name} finished in ${formatPhaseDuration(Date.now() - startedAt)}.`);
    return outputs;
  } catch (error) {
    state.phases[name] = {
      durationMs: Date.now() - startedAt,
      error: String(error?.message ?? error).slice(0, 4000),
      startedAt: new Date(startedAt).toISOString(),
      status: 'failed',
    };
    await saveReleaseState(state);
    throw error;
  }
}

function formatPhaseDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return '-';
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function printPhaseTimingSummary(state) {
  const rows = releasePhaseNames.map((name) => ({ name, phase: state.phases[name] })).filter((row) => row.phase);
  if (rows.length === 0) {
    return;
  }
  logStep('Phase timing summary');
  let totalMs = 0;
  for (const { name, phase } of rows) {
    totalMs += phase.durationMs ?? 0;
    console.log(
      `  ${name.padEnd(22)} ${formatPhaseDuration(phase.durationMs).padStart(9)}  ${phase.status}${phase.error ? ` (${phase.error.split('\n')[0].slice(0, 100)})` : ''}`
    );
  }
  console.log(`  ${'total'.padEnd(22)} ${formatPhaseDuration(totalMs).padStart(9)}`);
  console.log(`  State file: ${releaseStatePath(state.version)}`);
}

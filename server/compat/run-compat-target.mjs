import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  LOCAL_HOST,
  DEFAULT_LOCAL_PORT,
  DEV_PORT_ENV,
  COMPAT_USER,
  COMPAT_SAFE_SYSTEM_PATHS,
  gxserverRsRoot,
  repoRoot,
} from './run-compat-context.mjs';

/*
CDXC:RepoStructure 2026-06-16-00:49:
Phase 7 compatibility exercises typed Git/GitHub/worktree/Beads operations and repository clone jobs through public RPCs on the explicit dev port. Use isolated repositories and stubbed clone/GitHub tools so the suite never reaches the network, never shells against arbitrary user paths, and can compare TypeScript and Rust without touching the packaged daemon on 58744.

CDXC:RepoStructure 2026-06-22-09:47:
Compat fixture generation must be safe to run on developer machines. Build the target process environment from an explicit allowlist, keep HOME/TMP/XDG/Git config under the temp home, and make command shims fail closed so old TypeScript fixtures and new Rust comparisons cannot inherit real tokens, proxy settings, SSH sockets, user profile paths, or network-capable Git/GitHub/agent commands.

CDXC:RepoStructure 2026-06-22-10:01:
Area 36 privacy applies to persistent compat artifacts too. Tool invocation JSONL should keep only metadata booleans and counts, never raw argv, cwd, clone destinations, paths, URLs, command text, environment values, or secrets.
*/
export async function prepareCompatSandbox(homeDir, runOptions) {
  const sandboxPaths = getCompatSandboxPaths(homeDir);
  await mkdir(sandboxPaths.tmpDir, { recursive: true });
  await mkdir(sandboxPaths.xdgCacheHome, { recursive: true });
  await mkdir(sandboxPaths.xdgConfigHome, { recursive: true });
  await mkdir(sandboxPaths.xdgDataHome, { recursive: true });
  await mkdir(sandboxPaths.gitTemplateDir, { recursive: true });
  await mkdir(sandboxPaths.toolStubDir, { recursive: true });
  await writeFile(sandboxPaths.gitConfigFile, '', { mode: 0o600 });
  await prepareCompatToolStubs(homeDir, runOptions, sandboxPaths);
  runOptions.sandboxPaths = sandboxPaths;
}

async function prepareCompatToolStubs(homeDir, runOptions, sandboxPaths) {
  const realGit = process.env.GXSERVER_COMPAT_REAL_GIT || '/usr/bin/git';
  if (!path.isAbsolute(realGit)) {
    throw new Error('GXSERVER_COMPAT_REAL_GIT must be an absolute path when set.');
  }
  const nodeShebang = `#!${process.execPath}`;
  await writeFile(
    path.join(sandboxPaths.toolStubDir, 'git'),
    `${nodeShebang}
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const homeDir = fs.realpathSync.native(${JSON.stringify(homeDir)});
const invocationLog = ${JSON.stringify(sandboxPaths.invocationLogFile)};
const realGit = process.env.GXSERVER_COMPAT_REAL_GIT || ${JSON.stringify(realGit)};
const args = process.argv.slice(2);
function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
function fail(message) {
  process.stderr.write(message + "\\n");
  process.exit(2);
}
function record(extra = {}) {
  fs.appendFileSync(invocationLog, JSON.stringify({
    argCount: args.length,
    cwdInsideHome: isInside(homeDir, process.cwd()),
    hasNetworkLookingArg: args.some((arg) => /^(?:https?|ssh):\\/\\//i.test(String(arg)) || /^git@[^:]+:/i.test(String(arg))),
    tool: "git",
    ...extra,
  }) + "\\n");
}
const cwd = fs.realpathSync.native(process.cwd());
if (!isInside(homeDir, cwd)) {
  fail("compat git cwd escaped temp HOME");
}
if (args.some((arg, index) => index > 0 && /^(?:https?|ssh):\\/\\//i.test(arg))) {
  if (args[0] !== "clone") {
    fail("compat git blocked network-looking argument outside clone");
  }
}
if (args[0] === "clone") {
  const destination = args[args.length - 1];
  const absolute = path.resolve(cwd, destination);
  if (!isInside(homeDir, absolute) || absolute === homeDir) {
    fail("compat git clone destination escaped temp HOME");
  }
  record({ destinationInsideHome: isInside(homeDir, absolute), intercepted: true });
  fs.mkdirSync(absolute, { recursive: true });
  fs.writeFileSync(path.join(absolute, "README.md"), "compat clone\\n");
  process.stdout.write("compat clone ok\\n");
  process.exit(0);
}
const allowed = new Set([
  "--version",
  "commit\\u0000--no-verify\\u0000-F\\u0000-",
  "status\\u0000--short\\u0000--branch",
  "worktree\\u0000list\\u0000--porcelain",
]);
const joined = args.join("\\u0000");
if (!allowed.has(joined)) {
  fail("compat git blocked unsupported args: " + args.join(" "));
}
record({ delegated: true });
const result = cp.spawnSync(realGit, args, {
  env: process.env,
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(result.status ?? 1);
`,
    { mode: 0o755 }
  );
  await writeFile(
    path.join(sandboxPaths.toolStubDir, 'gh'),
    `${nodeShebang}
const fs = require("node:fs");
const path = require("node:path");
const homeDir = fs.realpathSync.native(${JSON.stringify(homeDir)});
const invocationLog = ${JSON.stringify(sandboxPaths.invocationLogFile)};
const args = process.argv.slice(2);
function isInside(parent, candidate) {
  const relative = path.relative(parent, path.resolve(candidate));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
const cwd = fs.realpathSync.native(process.cwd());
if (!isInside(homeDir, cwd)) {
  process.stderr.write("compat gh cwd escaped temp HOME\\n");
  process.exit(2);
}
fs.appendFileSync(invocationLog, JSON.stringify({
  argCount: args.length,
  cwdInsideHome: isInside(homeDir, cwd),
  hasNetworkLookingArg: args.some((arg) => /^(?:https?|ssh):\\/\\//i.test(String(arg)) || /^git@[^:]+:/i.test(String(arg))),
  tool: "gh",
}) + "\\n");
if (args.join(" ") === "--version") {
  process.stdout.write("gh version 2.0.0 (compat)\\n");
  process.exit(0);
}
if (args.join(" ") === "pr view --json number,state,title,url") {
  process.stdout.write(JSON.stringify({ number: 7, state: "OPEN", title: "Compat PR", url: "https://example.invalid/pr/7" }) + "\\n");
  process.exit(0);
}
if (args.join(" ") === "pr create --fill") {
  process.stdout.write("https://example.invalid/pr/8\\n");
  process.exit(0);
}
process.stderr.write("unsupported gh args: " + args.join(" ") + "\\n");
process.exit(2);
`,
    { mode: 0o755 }
  );
  for (const agentCommand of ['claude', 'codex', 'cursor-agent', 'grok']) {
    await writeFile(
      path.join(sandboxPaths.toolStubDir, agentCommand),
      `${nodeShebang}
const fs = require("node:fs");
const path = require("node:path");
const homeDir = fs.realpathSync.native(${JSON.stringify(homeDir)});
const invocationLog = ${JSON.stringify(sandboxPaths.invocationLogFile)};
const args = process.argv.slice(2);
function isInside(parent, candidate) {
  const relative = path.relative(parent, path.resolve(candidate));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
fs.appendFileSync(invocationLog, JSON.stringify({
  argCount: args.length,
  cwdInsideHome: isInside(homeDir, process.cwd()),
  tool: ${JSON.stringify(agentCommand)},
}) + "\\n");
process.stdout.write("Compat Generated Title\\n");
`,
      { mode: 0o755 }
    );
  }
  runOptions.toolStubDir = sandboxPaths.toolStubDir;
  runOptions.realGit = realGit;
}

export function resolveTarget(runOptions) {
  if (runOptions.target === 'ts') {
    const cliPath = path.join(repoRoot, 'gxserver', 'dist', 'src', 'cli.js');
    if (!existsSync(cliPath)) {
      throw new Error(`Missing ${cliPath}. Run: npm --prefix gxserver run build`);
    }
    return {
      command: process.execPath,
      cwd: repoRoot,
      foregroundArgs: [cliPath, '--foreground'],
      name: 'typescript',
      statusArgs: [cliPath, 'status', '--json'],
      versionArgs: [cliPath, '--version'],
    };
  }

  if (runOptions.target === 'rust') {
    const binaryPath =
      runOptions.bin ??
      process.env.GHOSTEX_GXSERVER_RUST_BIN ??
      path.join(gxserverRsRoot, 'target', 'debug', 'gxserver');
    if (!existsSync(binaryPath)) {
      throw new Error(`Missing Rust gxserver binary at ${binaryPath}. Pass --bin or set GHOSTEX_GXSERVER_RUST_BIN.`);
    }
    return {
      command: binaryPath,
      cwd: repoRoot,
      foregroundArgs: ['--foreground'],
      name: 'rust',
      statusArgs: ['status', '--json'],
      versionArgs: ['--version'],
    };
  }

  throw new Error(`Unsupported target: ${runOptions.target}`);
}

export async function readTargetVersion(target, timeoutMs, env) {
  const result = await runCommand(target.command, target.versionArgs, { cwd: target.cwd, env, timeoutMs });
  assert.equal(result.exitCode, 0, result.stderr);
  const version = result.stdout.trim();
  assert.match(version, /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u);
  return version;
}

export async function runTargetCommand(target, args, env, timeoutMs) {
  return await runCommand(target.command, args, {
    cwd: target.cwd,
    env,
    timeoutMs,
  });
}

export function createTargetEnv(homeDir, runOptions) {
  /*
  CDXC:RepoStructure 2026-06-14-21:58:
  Compatibility runs may target an explicitly selected loopback port while the packaged daemon owns 58744. Pass the port through a dev-scoped environment variable only when --port is explicit so product defaults remain unchanged and startup never silently falls back to another daemon.
  */
  const sandboxPaths = runOptions.sandboxPaths ?? getCompatSandboxPaths(homeDir);
  const pathEntries = [...(runOptions.toolStubDir ? [runOptions.toolStubDir] : []), ...COMPAT_SAFE_SYSTEM_PATHS];
  return {
    ...(runOptions.port !== DEFAULT_LOCAL_PORT ? { [DEV_PORT_ENV]: String(runOptions.port) } : {}),
    ...(runOptions.realGit ? { GXSERVER_COMPAT_REAL_GIT: runOptions.realGit } : {}),
    GCM_INTERACTIVE: 'never',
    GIT_ASKPASS: '/bin/false',
    GIT_CONFIG_GLOBAL: sandboxPaths.gitConfigFile,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: sandboxPaths.gitTemplateDir,
    GIT_TERMINAL_PROMPT: '0',
    GHOSTEX_SOURCE_ROOT: repoRoot,
    HOME: homeDir,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    LOGNAME: COMPAT_USER,
    NO_PROXY: `${LOCAL_HOST},localhost`,
    PATH: pathEntries.join(path.delimiter),
    SHELL: resolveCompatShell(),
    SSH_ASKPASS: '/bin/false',
    TMPDIR: sandboxPaths.tmpDir,
    USER: COMPAT_USER,
    XDG_CACHE_HOME: sandboxPaths.xdgCacheHome,
    XDG_CONFIG_HOME: sandboxPaths.xdgConfigHome,
    XDG_DATA_HOME: sandboxPaths.xdgDataHome,
  };
}

export function createGitSetupEnv(homeDir, runOptions) {
  const targetEnv = createTargetEnv(homeDir, runOptions);
  return {
    ...targetEnv,
    PATH: COMPAT_SAFE_SYSTEM_PATHS.join(path.delimiter),
  };
}

export function resolveCompatShell() {
  /*
  CDXC:PlatformSupport 2026-06-23-07:52:
  The compat harness must exercise the same server code on macOS and Ubuntu. Keep zsh when present for mac parity, but use bash/sh on Linux sandboxes so tests do not fail before gxserver can prove platform-neutral behavior.
  */
  const candidates = (
    process.platform === 'darwin'
      ? ['/bin/zsh', process.env.SHELL, '/usr/bin/zsh', '/bin/bash', '/usr/bin/bash']
      : [process.env.SHELL, '/bin/bash', '/usr/bin/bash', '/bin/zsh', '/usr/bin/zsh']
  )
    .concat(['/bin/sh', '/usr/bin/sh'])
    .filter(Boolean);
  for (const candidate of candidates) {
    if (['bash', 'sh', 'zsh'].includes(path.basename(candidate)) && existsSync(candidate)) {
      return candidate;
    }
  }
  return '/bin/sh';
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export async function runCommand(command, args, { cwd, env = process.env, timeoutMs }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  let timeout;
  try {
    const [exitCode, signal] = await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Timed out running ${command} ${args.join(' ')}`));
        }, timeoutMs);
      }),
    ]);
    return {
      exitCode: exitCode ?? (signal ? 1 : 0),
      stderr,
      stdout,
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function collectChildOutput(child, output) {
  child.stdout.on('data', (chunk) => {
    output.stdout = appendBounded(output.stdout, String(chunk));
  });
  child.stderr.on('data', (chunk) => {
    output.stderr = appendBounded(output.stderr, String(chunk));
  });
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-16_000);
}

export function getGxserverPaths(homeDir) {
  const rootDir = path.join(homeDir, '.ghostex', 'gxserver');
  const authDir = path.join(rootDir, 'auth');
  const runtimeDir = path.join(rootDir, 'runtime');
  const logsDir = path.join(homeDir, '.ghostex', 'logs');
  return {
    authDir,
    authTokenFile: path.join(authDir, 'token'),
    configFile: path.join(rootDir, 'config.json'),
    identityFile: path.join(rootDir, 'identity.json'),
    logFile: path.join(logsDir, 'gxserver.jsonl'),
    logsDir,
    rootDir,
    runtimeMetadataFile: path.join(runtimeDir, 'server.json'),
    stateDbFile: path.join(rootDir, 'state.db'),
    zmxDir: path.join(rootDir, 'zmx'),
  };
}

function getCompatSandboxPaths(homeDir) {
  const compatDir = path.join(homeDir, 'compat-sandbox');
  return {
    gitConfigFile: path.join(compatDir, 'gitconfig'),
    gitTemplateDir: path.join(compatDir, 'git-template'),
    invocationLogFile: path.join(compatDir, 'tool-invocations.jsonl'),
    tmpDir: path.join(compatDir, 'tmp'),
    toolStubDir: path.join(compatDir, 'bin'),
    xdgCacheHome: path.join(compatDir, 'xdg-cache'),
    xdgConfigHome: path.join(compatDir, 'xdg-config'),
    xdgDataHome: path.join(compatDir, 'xdg-data'),
  };
}

export function assertCompatTargetEnv(env, homeDir) {
  assert.equal(env.HOME, homeDir);
  assert.equal(env.TMPDIR, path.join(homeDir, 'compat-sandbox', 'tmp'));
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(env.GHOSTEX_SOURCE_ROOT, repoRoot);
  for (const forbiddenKey of [
    'ANTHROPIC_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NETRC',
    'OPENAI_API_KEY',
    'SSH_AUTH_SOCK',
  ]) {
    assert.equal(Object.hasOwn(env, forbiddenKey), false, `compat target env leaked ${forbiddenKey}`);
  }
  const realHome = process.env.HOME;
  if (realHome && realHome !== homeDir) {
    for (const [key, value] of Object.entries(env)) {
      if (key === 'GHOSTEX_SOURCE_ROOT') {
        continue;
      }
      assert.equal(String(value).includes(realHome), false, `compat target env ${key} leaked real HOME`);
    }
  }
}

export async function assertCompatSandboxContained(homeDir, runOptions) {
  const sandboxPaths = runOptions.sandboxPaths ?? getCompatSandboxPaths(homeDir);
  let text = '';
  try {
    text = await readFile(sandboxPaths.invocationLogFile, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const invocation = JSON.parse(line);
    assert.equal(Object.hasOwn(invocation, 'args'), false, 'compat invocation log persisted raw args');
    assert.equal(Object.hasOwn(invocation, 'cwd'), false, 'compat invocation log persisted cwd');
    assert.equal(Object.hasOwn(invocation, 'destination'), false, 'compat invocation log persisted destination');
    assert.equal(invocation.cwdInsideHome, true, `compat ${invocation.tool} cwd escaped temp HOME`);
    if (Object.hasOwn(invocation, 'destinationInsideHome')) {
      assert.equal(invocation.destinationInsideHome, true, 'compat git clone destination escaped temp HOME');
    }
    if (invocation.tool === 'git' && invocation.delegated === true) {
      assert.equal(
        invocation.hasNetworkLookingArg,
        false,
        'compat delegated git command included a network-looking argument'
      );
    }
  }
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(resolveExistingPath(parentPath), resolveExistingPath(candidatePath));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveExistingPath(inputPath) {
  try {
    return realpathSync.native(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

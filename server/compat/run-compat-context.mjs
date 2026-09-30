import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
CDXC:RepoStructure 2026-06-14-20:01:
Phase 0 needs a reusable black-box compatibility harness before the Rust daemon owns API behavior. Keep TypeScript as the fixture source, normalize dynamic runtime fields, and run the same minimal lifecycle, health, protocol-gate, status, WebSocket, and stop checks against TypeScript or a future Rust binary.
*/

export const PRODUCT = 'gxserver';
export const PROTOCOL_VERSION = 1;
export const PROTOCOL_HEADER = 'x-gxserver-protocol-version';
export const LOCAL_HOST = '127.0.0.1';
export const DEFAULT_LOCAL_PORT = 58744;
export const DEV_PORT_ENV = 'GHOSTEX_GXSERVER_DEV_PORT';
export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export const GXSERVER_ZMX_HISTORY_STDOUT_LIMIT_BYTES = 256 * 1024;
export const GXSERVER_ZMX_SEND_TEXT_LIMIT_BYTES = 512 * 1024;
export const COMPAT_USER = 'gxserver-compat';
export const COMPAT_SAFE_SYSTEM_PATHS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
export const CURRENT_MIGRATION_VERSION = 11;
export const EXPECTED_MIGRATIONS = [
  '0001_foundation',
  '0002_domain_state',
  '0003_session_sidebar_order',
  '0004_previous_session_history_quality',
  '0005_session_tags',
  '0006_expand_session_tags',
  '0007_expand_session_tags_in_progress_and_type',
  '0008_remove_retired_session_type_tags',
  '0009_remove_legacy_zmux_chat_projects',
  '0010_portless_persistence_model',
  '0011_session_kind_constraint',
];
export const EXPECTED_CAPABILITIES = ['health', 'events', 'localFullApi', 'remoteLimitedApi', 'strictProtocolVersion'];

const compatDir = path.dirname(fileURLToPath(import.meta.url));
export const gxserverRsRoot = path.resolve(compatDir, '..');
export const repoRoot = path.resolve(gxserverRsRoot, '..');
export const fixturesDir = path.join(compatDir, 'fixtures');

export const options = parseArgs(process.argv.slice(2));

function parseArgs(args) {
  const options = {
    bin: undefined,
    help: false,
    keepHome: false,
    suite: 'phase0',
    skipIfPortBusy: false,
    target: 'ts',
    timeoutMs: 7_500,
    updateFixtures: false,
    port: DEFAULT_LOCAL_PORT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--bin':
        options.bin = readArgValue(args, ++index, arg);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--keep-home':
        options.keepHome = true;
        break;
      case '--suite':
        options.suite = readArgValue(args, ++index, arg);
        break;
      case '--skip-if-port-busy':
        options.skipIfPortBusy = true;
        break;
      case '--port':
        options.port = parsePort(readArgValue(args, ++index, arg));
        break;
      case '--target':
        options.target = readArgValue(args, ++index, arg);
        break;
      case '--timeout-ms':
        options.timeoutMs = Number(readArgValue(args, ++index, arg));
        if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
          throw new Error('--timeout-ms must be a positive number.');
        }
        break;
      case '--update-fixtures':
        options.updateFixtures = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--port must be an integer from 1 to 65535.');
  }
  return port;
}

function readArgValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function printUsage() {
  console.log(`Usage: node gxserver-rs/compat/run-compat.mjs [options]

Options:
  --target ts|rust          Daemon target to run. Defaults to ts.
  --suite phase0|phase3|phase4|phase5|phase6|phase7
                            Compatibility suite. Defaults to phase0.
  --bin <path>             Rust binary path when --target rust is used.
  --port <port>            Explicit local development/compatibility port. Defaults to 58744.
  --update-fixtures        Replace phase0-observed-ts.json from the current TypeScript target.
  --skip-if-port-busy      Exit successfully without running if the selected local port is occupied.
  --keep-home              Keep the isolated HOME for debugging.
  --timeout-ms <ms>        Poll and process timeout. Defaults to 7500.
`);
}

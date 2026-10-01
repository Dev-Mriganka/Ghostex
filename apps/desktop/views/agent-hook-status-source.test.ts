import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// session-grid-contract-sidebar.ts is a barrel over per-concern
// session-grid-contract-sidebar-*.ts modules; check them as one text.
const contractSource = [
  'session-grid-contract-sidebar.ts',
  'session-grid-contract-sidebar-tooling.ts',
  'session-grid-contract-sidebar-sessions.ts',
  'session-grid-contract-sidebar-hud.ts',
  'session-grid-contract-sidebar-messages.ts',
  'session-grid-contract-sidebar-commands.ts',
]
  .map((file) => readFileSync(new URL(`../../../packages/shared/${file}`, import.meta.url), 'utf8'))
  .join('\n');

describe('agent hook status source', () => {
  test('does not keep a titlebar direct-install hook command', () => {
    /*
     * CDXC:AgentHooks 2026-06-23-05:09:
     * The titlebar Tips hook warning deep-links to Settings instead of invoking
     * installation directly, so the shared native command contract should keep
     * hook writes behind Settings and first-launch setup only.
     */
    expect(contractSource).not.toContain("'installAgentHooksFromTitlebarNotice'");
  });
});

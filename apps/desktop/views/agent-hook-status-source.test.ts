import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// modal-host.tsx keeps AppModalHost and the page mount; its state types, native bridge,
// request helpers, message guards and useModalStateFromNative live in views/modal-host/.
const modalHostSource = [
  'modal-host.tsx',
  'modal-host/modal-state.ts',
  'modal-host/native-fit-height.ts',
  'modal-host/host-messages.ts',
  'modal-host/bridge.ts',
  'modal-host/settings-routing.ts',
  'modal-host/first-launch.ts',
  'modal-host/add-project-requests.ts',
  'modal-host/use-modal-state-from-native.ts',
  'modal-host/message-guards.ts',
]
  .map((file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))
  .join('\n');
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
// packages/shared/gxserver-protocol.ts is a barrel over per-concern
// gxserver-protocol-*.ts modules; check the whole contract as one text.
const gxserverProtocolSource = [
  'gxserver-protocol.ts',
  'gxserver-protocol-core.ts',
  'gxserver-protocol-health.ts',
  'gxserver-protocol-agents.ts',
  'gxserver-protocol-prompts.ts',
  'gxserver-protocol-projects.ts',
  'gxserver-protocol-domain.ts',
  'gxserver-protocol-sessions.ts',
  'gxserver-protocol-presentation.ts',
  'gxserver-protocol-session-runtime.ts',
  'gxserver-protocol-events.ts',
]
  .map((file) => readFileSync(new URL(`../../../packages/shared/${file}`, import.meta.url), 'utf8'))
  .join('\n');

describe('agent hook status source', () => {
  test('checks requested hook providers one at a time and prioritizes Codex, Claude, OpenCode, and Pi', () => {
    /*
     * CDXC:AgentHooks 2026-06-18-02:38:
     * First-launch can request the full supported hook set while native checks
     * providers one at a time, prioritizing Codex, Claude, OpenCode, and Pi
     * before the secondary agents and posting each partial result as soon as it
     * arrives.
     *
     * CDXC:AgentHooks 2026-06-19-08:42:
     * OpenCode participates in first-launch hook-warning suppression, so native
     * must request its status in the priority group instead of waiting for lower
     * priority provider probes.
     */
    expect(contractSource).toContain('agentIds?: readonly string[];');
    expect(modalHostSource).toContain('vscode.postMessage({ agentIds, type: "installAgentHooks" });');
  });

  test('wires advanced Settings uninstall actions for hooks and bundled skills', () => {
    /*
     * CDXC:AgentHooks 2026-06-18-02:54:
     * Advanced Settings should expose explicit uninstall actions for Ghostex
     * hooks and bundled Ghostex skills, with hook cleanup routed through
     * gxserver and skill cleanup handled by the native bundled-skill catalog.
     *
     * CDXC:AgentHooks 2026-08-19-11:20:
     * Hook removal is per-agent from each hook row and all-at-once from the
     * Agent Hooks section, so the host must forward the selected agentIds
     * instead of always uninstalling every provider.
     */
    expect(contractSource).toContain("'requestAgentHookStatus'");
    expect(contractSource).toContain("'installAgentHooks'");
    expect(contractSource).toContain("'uninstallAgentHooks'");
    expect(contractSource).toContain("'uninstallBundledAgentSkills'");
    expect(modalHostSource).toContain('vscode.postMessage({ agentIds, type: "uninstallAgentHooks" });');
    expect(modalHostSource).toContain('vscode.postMessage({ type: "uninstallBundledAgentSkills" });');
    expect(gxserverProtocolSource).toContain('"/api/uninstallAgentHooks"');
  });

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

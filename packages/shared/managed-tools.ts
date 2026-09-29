/**
 * CDXC:ManagedTools 2026-09-29 SEE-ALSO:
 * The wire contract of gxserver's `POST /api/managedTools` (server/src/managed_tools/endpoint.rs): the tools Ghostex
 * installs for the user so every install button works with one click (Node.js and npm, uv, Homebrew on macOS, Linux
 * system tools, Beads, the GitHub and GitLab CLIs). docs/2026-09-29/one-click-installs/PLAN.md has the decisions.
 */
export type ManagedToolId = 'node' | 'uv' | 'homebrew' | 'systemTools' | 'beads' | 'gh' | 'glab';

export type ManagedToolOperation = 'install' | 'update' | 'reinstall' | 'uninstall';

export type ManagedToolJob = {
  id: string;
  operation: ManagedToolOperation;
  /** `queued` waits for another install (agent CLIs included): gxserver runs one at a time. */
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  output: string;
  error?: string | null;
  finishedAt?: string | null;
};

export type ManagedToolState = {
  id: ManagedToolId;
  label: string;
  description: string;
  /** False when this platform cannot have the tool at all (the row is hidden). */
  supported: boolean;
  unsupportedReason?: string;
  installed: boolean;
  executablePath?: string;
  /** `ghostex` when Ghostex installed it, `system` when the user did. */
  source?: 'ghostex' | 'system';
  version?: string;
  /** Extra status line, for example which Linux system tools are missing. */
  detail?: string;
  /** Tooltip for the Install button: exactly how Ghostex installs it. */
  installPlan: string;
  /** Installing shows a password or administrator prompt. */
  needsPassword: boolean;
  /** Why Install cannot run here (not an administrator, glibc too old…). */
  unavailableReason?: string;
  /** Linux without a password dialog (WSL): the client runs this in a terminal tab instead of starting a job. */
  terminalCommand?: string;
  /** Operations that can run now. */
  actions: ManagedToolOperation[];
  latestVersion?: string;
  updateAvailable?: boolean;
  checkError?: string;
  job?: ManagedToolJob;
};

export type ManagedToolsRequest =
  | { action: 'list'; fresh?: boolean }
  | { action: 'read'; tool: ManagedToolId; fresh?: boolean }
  | { action: 'start'; tool: ManagedToolId; operation: ManagedToolOperation };

export function isManagedToolJobActive(job: ManagedToolJob | undefined | null): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

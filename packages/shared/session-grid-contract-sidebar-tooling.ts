import type { AgentSyncApplyResult, AgentSyncPlan, AgentSyncReport } from './agent-sync';
import type { SidebarAgentIcon } from './sidebar-agents';

export type SidebarActiveSessionsSortMode = 'manual' | 'lastActivity';

export type SidebarTitleObservationState = {
  failureCount?: number;
  lastFailedAt?: string;
  lastObservedAt?: string;
  lastStartedAt?: string;
  nextRetryAt?: string;
  status: 'active' | 'failed' | 'retrying' | 'starting';
};

/** The four file-catalog tabs of the Agents Hub. */
export type AgentsHubFileTab = 'mds' | 'skills' | 'hooks' | 'configs';
/**
 * CDXC:AgentSync 2026-09-16 WHY:
 * Agent Sync is a Hub tab that lists agents instead of files, so it is a separate member: the
 * catalog message and every per-tab file map stay keyed by the file tabs only.
 */
export type AgentsHubTab = AgentsHubFileTab | 'sync';

export type AgentsHubProfile = {
  agentIcon: SidebarAgentIcon;
  filePath: string;
  label: string;
  profilePath: string;
  targetPath?: string;
};

export type AgentsHubFile = {
  content?: string;
  id: string;
  language: string;
  name: string;
  path: string;
};

export type AgentsHubGroup = {
  description: string;
  files: AgentsHubFile[];
  id: string;
  name: string;
  path: string;
  profiles: AgentsHubProfile[];
};

export type AgentsHubCatalogMessage = {
  generatedAt: string;
  groupsByTab: Record<AgentsHubFileTab, AgentsHubGroup[]>;
  type: 'agentsHubCatalog';
};

export type AgentsHubFileContentMessage = {
  content?: string;
  errorMessage?: string;
  filePath: string;
  requestId: string;
  type: 'agentsHubFileContent';
};

/**
 * CDXC:AgentSync 2026-09-16 WHY:
 * The three Agent Sync replies carry the JSON the shared ghostex-agent-sync crate serializes,
 * so the payload types live in packages/shared/agent-sync.ts next to their Rust source of truth
 * and the contract only names the envelopes.
 */
export type AgentSyncReportMessage = AgentSyncReport & { errorMessage?: string; type: 'agentSyncReport' };
export type AgentSyncPlanMessage = AgentSyncPlan & { errorMessage?: string; type: 'agentSyncPlan' };
export type AgentSyncApplyResultMessage = AgentSyncApplyResult & {
  errorMessage?: string;
  type: 'agentSyncApplyResult';
};

export type SidebarAgentHookStatus = 'installed' | 'missing' | 'cliMissing' | 'notRequired' | 'updateRequired';

export type SidebarAgentHookStatusItem = {
  agentId: string;
  cliCommand: string;
  cliInstalled: boolean;
  detail: string;
  hookInstalled: boolean;
  paths: string[];
  status: SidebarAgentHookStatus;
};

/**
 * CDXC:AgentHooks 2026-05-23-10:05:
 * Settings -> Agents shows machine-local hook setup status for the same reliable-resume agents Ghostex installs at startup. Native owns filesystem inspection and returns only normalized status rows so the modal host can render the result without direct filesystem access.
 */
export type SidebarAgentHookStatusMessage = {
  agents: SidebarAgentHookStatusItem[];
  /**
   * CDXC:Onboarding 2026-09-11 WHY:
   * The desktop host probes providers one at a time and posts a merged payload after each, so a host that
   * clears its loading state on the first payload reports the scan as finished too early. `false` marks a
   * partial post of that walk and `true` its final one; a payload without the field (install/uninstall
   * replies, remote hosts) is complete.
   */
  complete?: boolean;
  errorMessage?: string;
  generatedAt: string;
  hookStateDirectory: string;
  notifyHookPath: string;
  type: 'agentHookStatus';
};

export type SidebarGhostexCliStatusMessage = {
  /**
   * CDXC:Browser 2026-05-26-22:17:
   * First-launch CLI setup treats the Ghostex Browser Use skill as part of the
   * installed CLI experience because agents need both the executable and the
   * skill instructions before they can inspect embedded CEF logs and pages.
   *
   * CDXC:RemotePairing 2026-05-27-04:17:
   * Settings -> Integrations and the first-launch flow need one native-owned
   * status payload for CLI, Ghostex Browser Use, and Ghostex Computer Use. Native owns
   * PATH and app-bundle checks so React can warn without guessing from UI state.
   *
   * CDXC:Extensions 2026-05-27-06:58:
   * Desktop Control readiness includes the `$ghostex-computer-use` wrapper
   * skill, because Cua Driver alone does not teach agents the Ghostex-named
   * computer-use workflow.
   *
   * CDXC:AgentSkills 2026-05-31-09:18:
   * First launch and Settings must show each bundled Ghostex skill as an
   * explicit install item. Carry per-skill status for Browser Use, Computer Use,
   * Agent Orchestration, and Generate Title instead of only exposing the skills
   * that also have standalone guide pages.
   *
   * CDXC:AgentSkills 2026-06-26-13:24:
   * The Codex session-move skill is part of the bundled skills setup surface,
   * so the status payload must carry its installed state and path like the
   * other app-shipped skills.
   *
   * CDXC:OsIntegration 2026-05-29-06:00:
   * The Cua Permissions row must report Cua Driver's own macOS privacy grants,
   * not Ghostex's Accessibility grant. Carry both Accessibility and Screen
   * Recording from `cua-driver check_permissions` in the setup status payload.
   *
   * CDXC:Build 2026-06-22-23:23:
   * `unavailable` means an optional local-build resource was intentionally not
   * bundled, while `missing` means a strict or release-shaped build is broken.
   */
  browserSkillInstalled: boolean;
  browserSkillPath?: string;
  embeddedBrowserSkillInstalled: boolean;
  embeddedBrowserSkillPath?: string;
  computerUseSkillInstalled: boolean;
  computerUseSkillPath?: string;
  /**
   * CDXC:AgentSkills 2026-08-24:
   * `$ghostex-cli` is the entry-point skill after the agent-orchestration,
   * manage-automations, and find-prev-session skills were folded into the CLI
   * help, so its status fields (and Manage Beads') stay optional for older
   * host builds that never report them.
   */
  cliSkillInstalled?: boolean;
  cliSkillPath?: string;
  manageBeadsSkillInstalled?: boolean;
  manageBeadsSkillPath?: string;
  /**
   * CDXC:AgentSkills 2026-09-19 WHY:
   * `$ghostex-agents` (first shipped as `$ghostex-agents-orchestration`, which replaced the Fable 5.6 orchestration skill in the same slot) shipped after existing hosts, so its
   * status fields stay optional and consumers must treat a missing value as
   * not installed instead of requiring every host build to send it.
   */
  agentsOrchestrationSkillInstalled?: boolean;
  agentsOrchestrationSkillPath?: string;
  generateTitleSkillInstalled: boolean;
  generateTitleSkillPath?: string;
  moveCodexSessionSkillInstalled: boolean;
  moveCodexSessionSkillPath?: string;
  helpSkillInstalled: boolean;
  helpSkillPath?: string;
  cuaDriverAccessibilityPermissionGranted?: boolean;
  cuaAppInstalled: boolean;
  cuaDriverInstalled: boolean;
  /**
   * CDXC:Extensions 2026-08-24:
   * The exact shell command the host's Install Trycua button runs, published by
   * the host that owns it so Settings can show the command it will execute
   * instead of picking one per platform in React. Hosts that cannot install
   * Trycua omit it, and those surfaces show no command block.
   */
  cuaDriverInstallCommand?: string;
  /** Tooltip for Install and Reinstall Trycua: exactly what one click runs (CDXC:ManagedTools). */
  cuaDriverInstallPlan?: string;
  /** macOS: why Trycua cannot be installed (this account cannot write /Applications). */
  cuaDriverApplicationsBlockedReason?: string | null;
  /** The Trycua install, update, reinstall or uninstall the desktop app is running (or last ran) in the background. */
  cuaDriverJob?: SidebarCuaDriverJob | null;
  /** True only when this host can install and update Cua Driver in-app. */
  cuaDriverManagedUpdatesSupported?: boolean;
  cuaDriverLatestVersion?: string;
  cuaDriverPermissionDetail?: string;
  cuaDriverPath?: string;
  cuaDriverScreenRecordingPermissionGranted?: boolean;
  cuaDriverUpdateAvailable?: boolean;
  cuaDriverVersion?: string;
  detail: string;
  generatedAt: string;
  ghostexPath?: string;
  gxBlockedByExistingCommand: boolean;
  gxPath?: string;
  gxUsable: boolean;
  installed: boolean;
  type: 'ghostexCliStatus';
};

export type SidebarCuaDriverJob = {
  operation: 'install' | 'update' | 'reinstall' | 'uninstall';
  status: 'running' | 'succeeded' | 'failed';
  output: string;
  error?: string | null;
};

/** The last non-empty line a running Trycua job printed, for a one-line progress label. */
export function sidebarCuaDriverJobProgressLine(job: SidebarCuaDriverJob | null | undefined): string | undefined {
  return job?.output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

export type SidebarOSIntegrationStatusTarget =
  'bundleRegistration' | 'editor' | 'platform' | 'scriptRunner' | 'terminalLinks';

export type SidebarOSIntegrationStatusOperation = 'readStatus' | 'registerBundle' | 'setDefault';

export type SidebarOSIntegrationStatusState = 'failed' | 'skipped' | 'unsupported';

export type SidebarOSIntegrationStatusReason =
  | 'bundleIdentifierMissing'
  | 'bundleRegistrationFailed'
  | 'contentTypeUnavailable'
  | 'invalidTarget'
  | 'launchServicesRejected'
  | 'unsupportedPlatform';

export type SidebarOSIntegrationStatusItem = {
  extension?: string;
  operation: SidebarOSIntegrationStatusOperation;
  reason: SidebarOSIntegrationStatusReason;
  scheme?: 'ghostex';
  status: SidebarOSIntegrationStatusState;
  target: SidebarOSIntegrationStatusTarget;
};

export type SidebarOSIntegrationStatusMessage = {
  /**
   * CDXC:OsIntegration 2026-05-27-18:06:
   * Settings -> OS Integration shows native Launch Services diagnostics so the
   * user can tell whether Ghostex is merely available in Open With or is the
   * current default for editor, terminal-link, and script-runner roles.
   *
   * CDXC:OsIntegration 2026-06-24-15:10:
   * Reused Settings surfaces need a shared privacy-safe status channel for
   * Launch Services failures. `statusItems` carries only enum reasons, target,
   * operation, known file extensions, and the fixed ghostex scheme; it must not
   * expose bundle paths, file paths, URLs, command text, environment values,
   * tokens, stdout/stderr, daemon bodies, or raw OSStatus values.
   */
  bundleIdentifier: string;
  editorDefaults: Record<string, string>;
  generatedAt: string;
  registeredEditableFiles: boolean;
  registeredGhostexURLScheme: boolean;
  registeredScriptRunner: boolean;
  scriptDefaults: Record<string, string>;
  statusItems?: SidebarOSIntegrationStatusItem[];
  terminalLinkDefaultBundleId?: string;
  type: 'osIntegrationStatus';
};

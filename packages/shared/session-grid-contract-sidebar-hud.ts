import type { CompletionSoundSetting } from './completion-sound';
import type { SidebarAgentButton } from './sidebar-agents';
import type { SidebarCommandButton } from './sidebar-commands';
import type { SidebarGitState } from './sidebar-git';
import type { ghostexSettings } from './ghostex-settings';
import type { GxserverPortlessPresentation, GxserverPortlessStatus } from './gxserver-protocol';
import type { NativePortlessAdminAction, NativePortlessAdminResult } from './native-ghostty-host-protocol';
import type { SessionGridSnapshot, TerminalViewMode, VisibleSessionCount } from './session-grid-contract-core';
import type {
  SidebarActiveSessionsSortMode,
  SidebarAgentHookStatusMessage,
} from './session-grid-contract-sidebar-tooling';
import type {
  SidebarProjectWorktree,
  SidebarProjectSettingsItem,
  SidebarRecentProject,
  SidebarCommandSessionIndicator,
} from './session-grid-contract-sidebar-sessions';

export type SidebarPortlessNativeAdminUnavailableReason = 'localMacOnly' | 'notRecommended' | 'setupNotGhostexOwned';

export type SidebarPortlessNativeAdminActionAvailability = {
  action: NativePortlessAdminAction;
  available: boolean;
  unavailableReason?: SidebarPortlessNativeAdminUnavailableReason;
};

export type SidebarPortlessState = {
  /*
  CDXC:Portless 2026-06-23-00:25:
  React receives Portless setup state, route previews, local-only native action availability, and sanitized native admin results through HUD metadata. This keeps future modal/settings/resources UI off Portless files and prevents remote gxserver state from advertising runnable privileged actions.
  */
  health: GxserverPortlessStatus;
  nativeAdmin: {
    actions: Record<NativePortlessAdminAction, SidebarPortlessNativeAdminActionAvailability>;
    available: boolean;
    lastResult?: NativePortlessAdminResult;
  };
  presentation?: GxserverPortlessPresentation;
};

export type SidebarHudState = {
  activeSessionsSortMode: SidebarActiveSessionsSortMode;
  /**
   * CDXC:AgentHooks 2026-06-07-08:51:
   * Tips & Tricks and Settings consume gxserver-owned hook status from shared HUD state so every client can warn about unreliable agent statuses without probing local hook files or owning installer logic.
   */
  agentHookStatus?: SidebarAgentHookStatusMessage;
  agentManagerZoomPercent: number;
  agents: SidebarAgentButton[];
  /**
   * Hosts without a native App Icon subsystem (GPUI) set this so the shared
   * Settings modal hides the App Icon section instead of rendering a dead
   * picker. Absent means available, so macOS behavior is unchanged.
   */
  appIconPickerUnavailable?: boolean;
  buildStamp?: string;
  commands: SidebarCommandButton[];
  /**
   * CDXC:Projects 2026-08-01:
   * Per-project Action buttons keyed by project id (worktrees already resolved
   * to their parent's Actions by gxserver). Project rows read their own entry
   * so showOnProjectRow actions render for every visible project, not just the
   * active one. Hosts that cannot serve the block omit it and rows fall back
   * to rendering nothing.
   */
  commandsByProject?: Record<string, SidebarCommandButton[]>;
  commandSessionIndicators: SidebarCommandSessionIndicator[];
  completionBellEnabled: boolean;
  completionSound: CompletionSoundSetting;
  completionSoundLabel: string;
  /**
   * CDXC:Theming 2026-05-05-02:58
   * The active workspace can override the preset sidebar theme with a custom
   * validated color. Keep the preset `theme` as the fallback, and send this
   * color separately so CSS can derive app-level theme variables.
   */
  customThemeColor?: string;
  debuggingMode: boolean;
  focusedSessionTitle?: string;
  git: SidebarGitState;
  /**
   * CDXC:AgentLauncher 2026-08-01:
   * Actions that apply to every project, stored by the daemon rather than in
   * project metadata. Optional because hosts that do not serve them (legacy
   * macOS) leave it absent, and Settings renders an empty section rather than
   * a broken one.
   */
  globalCommands?: SidebarCommandButton[];
  isFocusModeActive: boolean;
  pendingAgentIds: string[];
  portless?: SidebarPortlessState;
  /**
   * CDXC:Worktrees 2026-05-18-23:07:
   * The Worktrees settings surface needs the same project id/name/path projection as native workspace storage, plus an optional per-project command override for creating worktrees.
   */
  projectSettingsProjects?: SidebarProjectSettingsItem[];
  projectViewSpaces?: import('./ghostex-settings/project-views').ProjectViewSpace[];
  projectViewProjects?: import('./ghostex-settings/project-views').ProjectViewProject[];
  /**
   * CDXC:Extensions 2026-09-18 WHY:
   * Space membership lives on the owning daemon's collections and spaces documents, which the native
   * titlebar cannot read. The active project's id and its resolved spaces (group and worktree-parent
   * inheritance already applied) ride the HUD so a scoped view resolves synchronously while the titlebar
   * renders, instead of each surface re-deriving sidebar membership or polling gxserver.
   * SEE-ALSO: packages/shared/ghostex-settings/view-scopes.ts, apps/desktop/src/app/view_scopes.rs.
   */
  activeProjectId?: string;
  activeProjectSpaceRefs?: import('./ghostex-settings/view-scopes').GhostexViewScopeSpaceRef[];
  /**
   * CDXC:Projects 2026-05-04-14:25
   * Combined sidebar hides projects without active/sleeping sessions in a
   * bottom Recent Projects drawer. The drawer receives a compact, sorted
   * projection so React can restore projects without owning native session
   * storage.
   */
  recentProjects: SidebarRecentProject[];
  /**
   * CDXC:AgentLauncher 2026-08-29:
   * Global Actions are owned by ONE gxserver daemon, so a host that shows
   * projects from several daemons at once (the web app's remote machines)
   * cannot describe them with a single list: `globalCommands` stays the local
   * daemon's list, and every other machine's list arrives here keyed by machine
   * id. Rows resolve their own machine's entry, which is the same local/remote
   * split `sidebarProjectCollections` and `sidebarSpaces` already use.
   */
  remoteGlobalCommandsByMachineId?: Record<string, SidebarCommandButton[]>;
  projectWorktrees?: SidebarProjectWorktree[];
  settings?: ghostexSettings;
  createSessionOnSidebarDoubleClick: boolean;
  renameSessionOnDoubleClick: boolean;
  theme:
    | 'dark-1'
    | 'dark-2'
    | 'plain-dark'
    | 'plain-light'
    | 'dark-green'
    | 'dark-blue'
    | 'dark-red'
    | 'dark-pink'
    | 'dark-orange'
    | 'light-blue'
    | 'light-green'
    | 'light-pink'
    | 'light-orange';
  highlightedVisibleCount: VisibleSessionCount;
  visibleCount: VisibleSessionCount;
  visibleSlotLabels: string[];
  viewMode: TerminalViewMode;
  /**
   * The system's own switch (Reduce Transparency on macOS, Transparency effects
   * off on Windows) is keeping the window opaque, so Settings says why turning
   * transparency on shows nothing. Absent means not blocked.
   */
  windowGlassBlockedBySystem?: boolean;
};

export type SidebarHudSnapshot = Pick<
  SessionGridSnapshot,
  'focusedSessionId' | 'fullscreenRestoreVisibleCount' | 'sessions' | 'visibleCount' | 'visibleSessionIds' | 'viewMode'
>;

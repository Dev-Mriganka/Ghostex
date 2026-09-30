import type { DelayedSendAgentReference } from '@/packages/shared/delayed-send';
import type { SidebarAgentIcon } from './sidebar-agents';
import type { WorkspaceProjectIcon } from './workspace-project-appearance';
import type { SidebarProjectDiffStats } from './project-diff-stats';
import type { SidebarSessionTag } from './session-tags';
import type { GxserverPresentationSessionGitStatus } from './gxserver-protocol';
import type {
  SessionLifecycleState,
  SessionRecord,
  SidebarTheme,
  TerminalSessionPersistenceProvider,
  TerminalViewMode,
  VisibleSessionCount,
} from './session-grid-contract-core';
import type { SidebarTitleObservationState } from './session-grid-contract-sidebar-tooling';

/**
 * CDXC:StateSync 2026-07-29:
 * The explicit user pin on a session's settle state. `"settled"` forces the
 * settled shelf, `"active"` holds a session in the inbox and suppresses
 * auto-settle. gxserver keeps an unpublished `settledOverrideAt` so real
 * activity newer than the override clears it server-side.
 */
export type SidebarSessionSettledOverride = 'active' | 'settled';

/**
 * CDXC:Git 2026-07-29:
 * A session's git/PR state is gxserver's to compute (only the daemon can run
 * git in the session's cwd), so the sidebar contract ALIASES the wire type
 * instead of restating it. One source of truth means a field the server adds
 * cannot silently stop at the projection.
 */
export type SidebarSessionGitStatus = GxserverPresentationSessionGitStatus;

/** Change-request state a `SidebarSessionGitStatus` can report. */
export type SidebarSessionPrState = NonNullable<SidebarSessionGitStatus['prState']>;

/**
 * CDXC:StateSync 2026-07-29:
 * gxserver's per-daemon settle/snooze capability flags, mirrored from
 * `GxserverPresentationSnapshot.capabilities`. ABSENCE means "this daemon
 * predates session lifecycle": the affordances hide entirely and nothing
 * classifies as settled or snoozed, instead of clicking through to a 404.
 *
 * CDXC:Git 2026-07-29:
 * `sessionGitStatus` rides the same per-daemon block and the same
 * machine-scoped resolution, because git/PR data is exactly as machine-local
 * as settle state: one gxserver in the merged sidebar can publish it while
 * another cannot. A false/absent flag renders identically to a session that
 * simply has no `gitStatus`.
 */
/** One account a session row can be switched to (see `SidebarSessionItem.switchableAgents`). */
export type SidebarSwitchableSessionAgent = {
  agentId: string;
  baseAgentId: string;
  icon: string;
  name: string;
};

export type SidebarSessionItem = {
  accountId?: string;
  accountName?: string;
  accountSlot?: string;
  kind?: 'browser' | 'workspace';
  sessionKind?: 'browser' | 'terminal';
  activity: 'idle' | 'working' | 'attention';
  pendingQuestionCount?: number;
  activityLabel?: string;
  agentIcon?: SidebarAgentIcon;
  /** Canonical or configured agent name used by native agent-session controls. */
  agentName?: string;
  /**
   * CDXC:SessionSleep 2026-05-22-23:59:
   * Agent CLI hook installs capture the stable provider session id separately from Ghostex's visible session id. Sidebar cards carry that value so hover tooltips can show the exact resume target while title-based restore remains a backup.
   */
  agentSessionId?: string;
  /**
   * CDXC:SessionFork 2026-08-28:
   * The registry session this row's conversation branched off, when gxserver
   * could prove the edge: a Ghostex fork or restore records it directly, and an
   * out-of-band `codex fork` becomes provable once the chat follower adopts the
   * successor rollout id. Absent means "no known parent", which is also what a
   * daemon that predates fork awareness reports.
   */
  forkedFromSessionId?: string;
  /**
   * How many VISIBLE sessions share this row's earlier history, this row
   * included. Only present at two or more, so any value here means the row is
   * one branch of a fork and the branch badge should render. Superseded
   * ancestors are not counted, because they are not offered as rows anywhere.
   */
  forkBranchCount?: number;
  /**
   * The session ids behind `forkBranchCount`, in the same id space this row's
   * own `sessionId` uses, so a client can route straight to a sibling branch
   * without asking the daemon who the relatives are.
   */
  forkFamilySessionIds?: string[];
  faviconDataUrl?: string;
  firstUserMessage?: string;
  isGeneratingFirstPromptTitle?: boolean;
  isReloading?: boolean;
  lifecycleState?: SessionLifecycleState;
  isFavorite?: boolean;
  /**
   * CDXC:Sessions 2026-06-05-12:30:
   * Sidebar rows carry the expanded tag marker separately from legacy
   * `isFavorite`. Renderers use this for the leading icon, tag filters, and
   * tooltip prefix while older Favorite-only rows still project as Favorite.
   */
  sessionTag?: SidebarSessionTag;
  /**
   * CDXC:SessionNotes 2026-08-24:
   * Free-text "what to do next here" note the user filed against this session's
   * provider conversation (`agentSessionId`), projected straight from gxserver.
   * Rows use it for the hover tooltip line and the note dot beside the leading
   * agent icon. Absent when the session has no note — never an empty string —
   * which is also what a daemon that predates session notes reports.
   */
  sessionNote?: string;
  /** Saved prompts associated with this agent conversation; absent at zero. */
  stashedPromptCount?: number;
  /**
   * CDXC:AgentProviders 2026-09-03:
   * The same-family agent configurations (accounts) this session can be
   * resumed under, projected straight from gxserver. Absent when there is
   * nothing to switch to, which hides the "Switch Account" submenu.
   */
  switchableAgents?: readonly SidebarSwitchableSessionAgent[];
  /**
   * CDXC:Sessions 2026-05-28-12:04:
   * Sidebar rows carry project-local pin state so the React display sorter can
   * keep pinned sessions at the top of their project and render pin chrome
   * without overloading Favorite.
   */
  isPinned?: boolean;
  /** Parked rows render in a collapsible section at the bottom of the sidebar. */
  isParked?: boolean;
  /**
   * CDXC:Drafts 2026-08-28:
   * The session was created from the sidebar and has not received its first user
   * prompt yet, copied straight through from
   * `GxserverPresentationSession.isDraft`. PRESENT-ONLY (never `false`), which
   * is also what a daemon that predates drafts publishes, so absence means
   * "not a draft". After the 10-minute new-session grace period, drafts with
   * composer text belong in Drafts. They use a pencil glyph and a dimmed title; the drafted text
   * already arrives as `displayTitle`, derived server-side.
   */
  isDraft?: true;
  /**
   * CDXC:StateSync 2026-07-29:
   * Session creation stamp, projected straight from gxserver's presentation
   * session. Sidebar V2's inbox is ordered by creation and must never move a
   * row on activity, so it needs a clock that activity cannot advance —
   * `lastInteractionAt` and `sortKey` both change while a session works.
   */
  createdAt?: string;
  /**
   * CDXC:AgentScreenDetection 2026-07-29-12:00:
   * `lastInteractionAt` carries gxserver's meaningful-activity recency: short
   * working blips (tiny commands, wake redraws) do not advance it, so
   * activity-sorted lists stay stable. `workingStartedAt` marks the current
   * working stint so the sorter can tell whether that stint has already
   * qualified as meaningful (lastInteractionAt >= workingStartedAt) before
   * giving the row working priority.
   */
  lastInteractionAt?: string;
  workingStartedAt?: string;
  /**
   * CDXC:StateSync 2026-07-29:
   * Server-owned settle/snooze lifecycle, projected straight from gxserver's
   * presentation session. Every field is optional because an older daemon (a
   * remote machine that has not been upgraded) publishes none of them, and the
   * V2 shelves must degrade to "nothing is settled, nothing is snoozed" instead
   * of inventing lifecycle out of derived data.
   *
   * `settledAt` is stamped only by a MANUAL settle; the server-side auto-settle
   * sweep sets `settledOverride: "settled"` and leaves this null, so the settled
   * shelf falls back to the activity clock for sorting (see
   * `resolveSidebarV2SettledTimestampMs`).
   *
   * `snoozedUntil` is deliberately RETAINED after the wake time passes (gxserver
   * garbage-collects it ~24h later). The wake itself is derived client-side, to
   * the millisecond, and the retained pair is what drives the "Woke" indicator.
   */
  settledAt?: string;
  settledOverride?: SidebarSessionSettledOverride;
  snoozedAt?: string;
  snoozedUntil?: string;
  /**
   * CDXC:Git 2026-07-29:
   * Branch, diff stats, and change-request state for this session's cwd,
   * copied through from gxserver's presentation session. Absent for every
   * session the daemon could not (or does not yet) probe, which is also what
   * an un-upgraded remote machine publishes — Sidebar V2 then renders the card
   * exactly as it did before git data existed instead of reserving a blank
   * line for it.
   */
  gitStatus?: SidebarSessionGitStatus;
  /**
   * CDXC:Worktrees 2026-07-29:
   * The session's working directory, copied through from gxserver's
   * presentation session. Sidebar V2 needs it because a worktree is an
   * ATTRIBUTE of a session: `cwd` IS the checkout, and pairing it with
   * `gitStatus.branch` is how the client tells a managed `ghostex/…` worktree
   * from a plain session in the project root. Absent for hosts that do not
   * publish it, and the worktree affordances simply do not appear.
   */
  cwd?: string;
  sessionId: string;
  /**
   * CDXC:Tooltips 2026-05-31-06:25:
   * macOS gxserver sessions need their full routed identity in hover tooltips
   * instead of the legacy two-digit display number, because the short display
   * number does not identify the server/project/session being restored.
   */
  sessionRoutingId?: string;
  sessionNumber?: string;
  sessionPersistenceName?: string;
  sessionPersistenceProvider?: TerminalSessionPersistenceProvider;
  /**
   * CDXC:SessionTitles 2026-06-07-09:33:
   * gxserver-owned rows carry the final visible title string. Sidebar clients render this directly so platform adapters do not duplicate terminal-title trust, placeholder, or unsynced-marker rules.
   */
  displayTitle?: string;
  displayTitleTooltip?: string;
  primaryTitle?: string;
  isPrimaryTitleTerminalTitle?: boolean;
  terminalTitle?: string;
  /**
   * CDXC:SessionStatus 2026-06-07-00:30:
   * Sidebar Auto Sleep must not interpret an idle activity value as reliable while gxserver's zmx title observer is starting or retrying. Carry only coarse observer health so the UI can defer sleep decisions without exposing terminal titles or user-owned terminal content.
   */
  titleObservation?: SidebarTitleObservationState;
  alias: string;
  shortcutLabel: string;
  row: number;
  column: number;
  isFocused: boolean;
  /**
   * CDXC:Sessions 2026-05-29-09:20:
   * Session lifecycle uses resource-specific state names so UI and batch
   * actions do not infer provider session existence from the legacy `isSleeping` and
   * `isRunning` booleans. A native pane can be unmounted while a zmx/tmux/zellij
   * provider session still exists, so both resource states are carried
   * explicitly and `isLive` is derived from them.
   *
   * CDXC:Sessions 2026-05-29-06:29:
   * Persistence-disabled terminal sessions must report `providerSessionState:
   * "persistence-disabled"` instead of `unknown`. Unknown is reserved for configured
   * providers whose existence check has not completed or failed.
   *
   * CDXC:Sessions 2026-05-29-07:19:
   * Name the providerless state `persistence-disabled` so payloads make it
   * clear the terminal provider is absent because persistence is off, not
   * because some unrelated disabled flag was set.
   */
  nativePaneState?: 'mounted' | 'mounting' | 'unmounted';
  providerSessionState?: 'exists' | 'missing' | 'persistence-disabled' | 'unknown';
  isLive?: boolean;
  /** @deprecated Use nativePaneState/providerSessionState plus isLive. */
  isSleeping?: boolean;
  isVisible: boolean;
  /** @deprecated Use isLive for runtime liveness and activity for work state. */
  isRunning: boolean;
  detail?: string;
  /**
   * CDXC:Sessions 2026-06-15-21:00:
   * Sidebar cards need both the armed Close After Done flag and countdown
   * projection. The armed flag keeps the red clock visible before Done, while
   * the deadline fields drive the fading countdown once the session remains
   * Done long enough to be eligible for automatic close.
   */
  closeAfterDone?: boolean;
  closeAfterDoneDeadlineAt?: string;
  closeAfterDoneRemainingLabel?: string;
  closeAfterDoneRemainingMs?: number;
  /**
   * CDXC:RemoteMachines 2026-06-30-15:22:
   * Remote session rows opt into sidebar actions that depend on host timers or local pane carriers. Absence is false so the shared context menu never assumes every remote terminal can schedule Delayed Send, toggle Close After Done, or pop out through AppKit.
   */
  canScheduleDelayedSend?: boolean;
  canToggleCloseAfterDone?: boolean;
  /**
   * CDXC:DelayedSend 2026-05-17-03:14
   * Delayed Send timers must be visible before they fire. Carry both the
   * absolute deadline and the display countdown so sidebar cards, titlebar
   * resources, and tooltips can show the same remaining time.
   */
  delayedSendDeadlineAt?: string;
  delayedSendRemainingLabel?: string;
  delayedSendRemainingMs?: number;
  /**
   * CDXC:SessionChat 2026-08-21-b:
   * Number of Ghostex-owned chat prompts held for this session, `failed` rows
   * included. Drives the count badge over the leading agent icon; absent or
   * zero means no badge, which is also what a daemon that predates the queue
   * reports.
   */
  queuedPromptCount?: number;
  /**
   * CDXC:SessionChat 2026-08-21-b:
   * How many of those rows failed to deliver and are held for the user. Any
   * non-zero value paints the same badge red instead of yellow, because a queue
   * that has stopped dead is the one queue state that needs the user to act.
   */
  queuedPromptFailedCount?: number;
  /**
   * CDXC:Drafts 2026-09-04 DECISION:
   * User: the chat composer holds unsent text for this session. Draws the white
   * composer-draft dot on the leading agent icon; absent means no dot.
   */
  hasComposerDraft?: boolean;
  /** True when Delayed Send is armed for every agent in this project to finish. */
  sendWhenAllProjectSessionsStopActive?: boolean;
  /** True when Delayed Send is armed for this agent to finish. */
  sendWhenAgentStopsActive?: boolean;
  sendWhenSpecificAgentFinishes?: DelayedSendAgentReference;
  /**
   * CDXC:Workarea 2026-05-19-10:15:
   * Sidebar session context menus need the live pop-out presentation flag so
   * browser and agent cards can offer Pop Out Pane versus Restore Pane without
   * re-querying native chrome state.
   *
   * CDXC:RemoteMachines 2026-06-30-15:24:
   * Remote rows must expose Pop Out Pane as an explicit local-carrier capability. A remote gxserver session can look like a normal agent terminal, but AppKit pop-out is only valid when a live local attach carrier already exists.
   */
  canPopOutPane?: boolean;
  isPoppedOut?: boolean;
};

export function getSidebarSessionLifecycleState(
  session: Pick<
    SidebarSessionItem,
    'isLive' | 'isRunning' | 'isSleeping' | 'lifecycleState' | 'nativePaneState' | 'providerSessionState'
  >
): SessionLifecycleState {
  if (session.lifecycleState) {
    return session.lifecycleState;
  }

  if (session.isLive === true) {
    return 'running';
  }

  if (session.nativePaneState === 'mounted' || session.providerSessionState === 'exists') {
    return 'running';
  }

  if (session.isSleeping) {
    return 'sleeping';
  }

  return session.isRunning ? 'running' : 'done';
}

export type SidebarPreviousSessionItem = SidebarSessionItem & {
  restoreUnavailableReason?: string;
  externalSession?: boolean;
  closedAt: string;
  groupId?: string;
  historyId: string;
  isGeneratedName: boolean;
  isRestorable: boolean;
  /**
   * CDXC:Sessions 2026-05-05-05:30
   * Restoring from Previous Sessions must recreate the archived agent session,
   * not only its card title. Store the normalized session record and source
   * project/group metadata so native restore can preserve agent identity,
   * first-message metadata, title provenance, and resumable session details.
   */
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  sessionRecord?: SessionRecord;
  sidebarOrder?: number;
};

export type SidebarSessionGroup = {
  kind?: 'browser' | 'workspace';
  groupId: string;
  isActive: boolean;
  /**
   * CDXC:Projects 2026-05-04-09:41
   * Native Combined mode renders all chat folders under one synthetic Chats
   * header. Mark it explicitly so the React sidebar can keep it non-draggable
   * and route its add button to creating a new chat folder.
   */
  isChatCollection?: boolean;
  /**
   * CDXC:FocusMode 2026-05-28-12:52:
   * Focus is a split-pane zoom, not a tab selector. Sidebar groups must carry actual pane topology so session context menus can hide Focus when a project has only one pane, even if that pane has multiple tabs.
   *
   * CDXC:FocusMode 2026-05-28-15:35:
   * The topology signal must reflect awake rendered pane owners, not only persisted paneLayout children, so sleeping-only split panes do not leave Focus visible while the user sees one native pane.
   */
  canFocusMode?: boolean;
  /**
   * CDXC:StateSync 2026-07-02-03:49:
   * The shared sidebar can expose named session-group creation only when the host can persist or emulate user-defined groups for the project.
   *
   * Hosts that support user-defined named session groups within a project set
   * this on groups that can spawn a new group (project groups and their
   * sub-groups). Hosts without the capability leave it unset so the New
   * Group / Move to New Group affordances never render.
   */
  canCreateSessionGroup?: boolean;
  isFocusModeActive: boolean;
  layoutVisibleCount: VisibleSessionCount;
  projectContext?: {
    canRemoveProject: boolean;
    /**
     * CDXC:Notifications 2026-06-26-07:22:
     * GPUI session-attention notifications need the same project icon attachment source as the macOS host. Carry only the already-normalized project image data URL on project context so status bridges can attach icons without paths, URLs, file probes, command text, terminal output, or generic renderer IPC.
     */
    iconDataUrl?: string;
    /**
     * CDXC:Icons 2026-07-29:
     * The project's TYPED icon, exactly as the user chose it in the project
     * appearance UI. `iconDataUrl` above covers only the image variant, which
     * is the rarer of the two: most Ghostex projects carry a Tabler glyph plus
     * a color, and a surface that reads `iconDataUrl` alone shows those
     * projects a generic folder. Carry the whole icon so sidebar surfaces can
     * render the same identity the Recent Projects list does, with the folder
     * glyph reserved for projects that genuinely have no icon.
     */
    icon?: WorkspaceProjectIcon;
    /**
     * CDXC:Icons 2026-07-29 (discovered icons):
     * The icon the project's own repository ships through standard web metadata,
     * its favicon, or the icon its HTML entry point declares — discovered by
     * gxserver and carried as a `data:` URL
     * (`GxserverPresentationProject.discoveredIconDataUrl`).
     *
     * Rank: below a user-attached IMAGE (an uploaded picture is deliberate
     * intent that no automatic guess should override), above a typed Tabler
     * glyph (which V1 never renders on session rows at all, so it is usually a
     * legacy value migrated forward rather than a considered choice), and above
     * the folder — which is now reserved for projects that have nothing.
     *
     * Absent whenever the daemon found nothing, has not probed yet, or is too
     * old to publish it.
     */
    discoveredIconDataUrl?: string;
    /**
     * CDXC:StateSync 2026-07-29:
     * The project's git `origin` remote URL, straight off the presentation
     * project (`GxserverPresentationProject.gitRemoteOriginUrl`) with no
     * client-side interpretation. Sidebar V2 normalizes it into a repository
     * identity so the same repository checked out on several machines merges
     * into ONE logical project; `null` means "probed, no origin" and an absent
     * key means "not probed / not a git work tree". Both never merge.
     *
     * It lives on `projectContext` rather than on the group because it is a
     * property of the checkout the group points at, exactly like `path`, and
     * because the Quick/Chats collection has no project context and therefore
     * can never participate in repository grouping.
     */
    gitRemoteOriginUrl?: string | null;
    /**
     * CDXC:StateSync 2026-07-29 (P5 fix round):
     * The repository root the checkout belongs to, straight off
     * `GxserverPresentationProject.gitRepositoryRootPath`. Paired with
     * `gitRemoteOriginUrl` it lets Sidebar V2 derive each project's path
     * BELOW the repository root, which is the only thing that can tell two
     * sub-projects of one monorepo apart under "Repository + path".
     *
     * Absent whenever the daemon has no root to report; the client then keys
     * on the bare repository, which is what a single-checkout project wants
     * anyway.
     */
    gitRepositoryRootPath?: string;
    path: string;
    pathState?: 'available' | 'missing' | 'notDirectory' | 'unavailable';
    /**
     * CDXC:CodeEditor 2026-05-06-14:21
     * Combined project cards expose one project-owned code editor surface.
     * The editor is not a split session, so sidebar state carries it through
     * project context instead of mixing it into session card records.
     */
    editor: {
      diffStats: SidebarProjectDiffStats;
      /**
       * CDXC:CodeEditor 2026-05-09-17:24
       * Project editor rows represent attempted/running editor surfaces, not
       * only focused panes. Carry load status so the sidebar can keep the row
       * visible through startup failures and show timeout diagnostics.
       */
      errorMessage?: string;
      isOpen: boolean;
      isSleeping: boolean;
      projectId: string;
      status: 'idle' | 'opening' | 'running' | 'error';
    };
    theme?: SidebarTheme;
    themeColor?: string;
    worktree?: SidebarProjectWorktreeMetadata;
  };
  remoteMachineContext?: {
    machineId: string;
    machineName: string;
    /** Raw project id in that machine's gxserver; absent for synthetic groups such as Chats. */
    projectId?: string;
  };
  /**
   * CDXC:RemoteMachines 2026-07-12:
   * A stale group renders the last-seen state of a disconnected remote
   * machine: faded, with terminal/agent rows non-interactive while browser
   * rows (local CEF tabs) stay clickable. Hosts without last-seen retention
   * leave it unset.
   */
  isStale?: boolean;
  sessions: SidebarSessionItem[];
  title: string;
  viewMode: TerminalViewMode;
  visibleCount: VisibleSessionCount;
};

export type SidebarProjectWorktreeMetadata = {
  branch: string;
  createdAt?: string;
  name: string;
  parentProjectId: string;
  parentProjectName: string;
  parentProjectPath: string;
};

export type SidebarProjectWorktree = {
  branch?: string;
  directory: string;
  name: string;
};

export type SidebarProjectSettingsItem = {
  beadsDirectory?: string;
  beadsDisplayKey?: string;
  /**
   * CDXC:Docs 2026-08-09:
   * Absolute folder this project's Docs surface shows IN ADDITION to the
   * project's own docs. Absent/blank means the project inherits the Docs
   * directory Global Default, and an unset global adds nothing.
   *
   * CDXC:Docs 2026-08-09: it never replaces the project's own
   * README.md, CLAUDE.md, docs/, or configured Docs folders.
   */
  docsDirectory?: string;
  name: string;
  path: string;
  projectId: string;
  /**
   * CDXC:Portless 2026-06-23-03:47:
   * Projects settings groups read-only Portless domain summaries by project
   * and worktree family. Carry only the stable parent project id for worktree
   * rows so the Settings UI does not need branch names, parent paths, command
   * text, or slug-editing state.
   */
  worktreeParentProjectId?: string;
  worktreeCommand?: string;
};

export type SidebarRecentProject = {
  icon?: WorkspaceProjectIcon;
  iconDataUrl?: string;
  /** True while the project is part of the live sidebar presentation. */
  isOpen?: boolean;
  path: string;
  projectId: string;
  recentClosedAt?: string;
  /**
   * CDXC:RemoteMachines 2026-06-24-10:36:
   * Remote closed projects share the Recent Projects drawer with local parked projects. Carry the owning machine separately so React can display "Project (Machine)" while native still routes restore/open/remove by the trusted scoped project id.
   */
  remoteMachineId?: string;
  remoteMachineName?: string;
  sessionCount: number;
  theme?: SidebarTheme;
  themeColor?: string;
  title: string;
  updatedAt?: string;
};

export type SidebarCommandSessionIndicator = {
  commandId: string;
  /**
   * CDXC:DelayedSend 2026-06-27-02:05:
   * Command-session HUD indicators need the same safe timer projection as sidebar session cards so GPUI command panes can show Delayed Send and Close After Done parity without carrying command text, cwd/env, paths, URLs, output, run ids, status-file paths, tokens, or unknown native fields.
   */
  closeAfterDone?: boolean;
  closeAfterDoneDeadlineAt?: string;
  closeAfterDoneRemainingLabel?: string;
  closeAfterDoneRemainingMs?: number;
  delayedSendDeadlineAt?: string;
  delayedSendRemainingLabel?: string;
  delayedSendRemainingMs?: number;
  isActive?: boolean;
  sessionId: string;
  status: 'idle' | 'running' | 'error';
  title?: string;
};

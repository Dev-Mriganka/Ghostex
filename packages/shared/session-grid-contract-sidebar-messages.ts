import type { CompletionSoundSetting } from './completion-sound';
import type { SidebarGitAction, SidebarGitChangedFile, SidebarGitFileDiffDraft } from './sidebar-git';
import type { ghostexHotkeyActionId } from './ghostex-hotkeys';
import type { SidebarPinnedPrompt } from './sidebar-pinned-prompts';
import type {
  GxserverCustomSessionTagsState,
  GxserverSidebarProjectCollectionsState,
  GxserverSidebarSpacesState,
  GxserverStashedPrompt,
  GxserverStashedPromptTag,
} from './gxserver-protocol';
import type {
  SidebarSessionItem,
  SidebarPreviousSessionItem,
  SidebarSessionGroup,
  SidebarRecentProject,
} from './session-grid-contract-sidebar-sessions';
import type { SidebarHudState } from './session-grid-contract-sidebar-hud';
import type {
  AgentsHubCatalogMessage,
  AgentsHubFileContentMessage,
  AgentSyncReportMessage,
  AgentSyncPlanMessage,
  AgentSyncApplyResultMessage,
  SidebarAgentHookStatusMessage,
  SidebarGhostexCliStatusMessage,
  SidebarOSIntegrationStatusMessage,
} from './session-grid-contract-sidebar-tooling';

export type SidebarHydrateMessage = {
  /** The local daemon's custom session tag catalog; same local/remote split as `sidebarSpaces`. */
  customSessionTags?: GxserverCustomSessionTagsState;
  groups: SidebarSessionGroup[];
  pinnedPrompts: SidebarPinnedPrompt[];
  previousSessions: SidebarPreviousSessionItem[];
  remoteCustomSessionTagsByMachineId?: Readonly<Record<string, GxserverCustomSessionTagsState>>;
  remoteSidebarProjectCollectionsByMachineId?: Readonly<Record<string, GxserverSidebarProjectCollectionsState>>;
  remoteSidebarSpacesByMachineId?: Readonly<Record<string, GxserverSidebarSpacesState>>;
  revision: number;
  sidebarProjectCollections?: GxserverSidebarProjectCollectionsState;
  sidebarSpaces?: GxserverSidebarSpacesState;
  type: 'hydrate';
  hud: SidebarHudState;
};

export type SidebarSessionStateMessage = {
  customSessionTags?: GxserverCustomSessionTagsState;
  groups: SidebarSessionGroup[];
  pinnedPrompts: SidebarPinnedPrompt[];
  previousSessions: SidebarPreviousSessionItem[];
  remoteCustomSessionTagsByMachineId?: Readonly<Record<string, GxserverCustomSessionTagsState>>;
  remoteSidebarProjectCollectionsByMachineId?: Readonly<Record<string, GxserverSidebarProjectCollectionsState>>;
  remoteSidebarSpacesByMachineId?: Readonly<Record<string, GxserverSidebarSpacesState>>;
  revision: number;
  sidebarProjectCollections?: GxserverSidebarProjectCollectionsState;
  sidebarSpaces?: GxserverSidebarSpacesState;
  type: 'sessionState';
  hud: SidebarHudState;
};

export type SidebarSessionPresentationChangedMessage = {
  revision?: number;
  session: SidebarSessionItem;
  type: 'sessionPresentationChanged';
};

export type SidebarGroupsChangedMessage = {
  groupOrder: string[];
  groups: SidebarSessionGroup[];
  removedGroupIds?: string[];
  removedSessionIds?: string[];
  revision: number;
  /*
  CDXC:StateSync 2026-06-09-23:01:
  Routine gxserver presentation changes must patch the React sidebar tree instead of posting a full hydrate. Carry changed groups, removals, and authoritative order so session add/remove/reorder/project deltas update visible rows without replacing unrelated sidebar state or letting WKWebView refreshes steal terminal focus.
  */
  type: 'sidebarGroupsChanged';
};

export type SidebarProjectCollectionsChangedMessage = {
  /*
  CDXC:Projects 2026-07-18-00:00:
  gxserver owns the shared colored "Group N" project-collection overlay so
  React Native Android edits the same grouped project list. Hosts forward the normalized
  wire state (snapshot field, live event, or update ack) to SidebarApp, which
  reconciles it into its localStorage-backed instant-edit state.
  */
  sidebarProjectCollections: GxserverSidebarProjectCollectionsState;
  remoteMachineId?: string;
  type: 'sidebarProjectCollectionsChanged';
};

export type SidebarSpacesChangedMessage = {
  /*
  CDXC:Spaces 2026-08-27:
  gxserver owns the Space document (the saved sidebar filters and their
  memberships) for the projects it hosts. Hosts forward the normalized wire
  state (snapshot field, live event, or update ack) to SidebarApp, tagged with
  the owning machine so a remote daemon's Spaces stay in that daemon's own
  sidebar section instead of merging into the local set.
  */
  remoteMachineId?: string;
  sidebarSpaces: GxserverSidebarSpacesState;
  type: 'sidebarSpacesChanged';
};

export type CustomSessionTagsChangedMessage = {
  /**
   * CDXC:Sessions 2026-09-11 WHY:
   * gxserver owns the custom session tag catalog for the sessions it hosts. Hosts forward the normalized wire state (snapshot field, live event, or update ack) to SidebarApp tagged with the owning machine, exactly like `sidebarSpacesChanged`, so a remote daemon's tags resolve for that daemon's sessions without merging into the local catalog.
   */
  customSessionTags: GxserverCustomSessionTagsState;
  remoteMachineId?: string;
  type: 'customSessionTagsChanged';
};

/**
 * CDXC:Spaces 2026-08-27:
 * What the New/Edit Space dialog reports back, and nothing more: the user's
 * typed field values plus the identity of the Space and the daemon they belong
 * to. The dialog deliberately never carries a Space document — it renders in a
 * separate app-modal window (desktop) or a sibling host (web) and would be
 * writing back a snapshot that is already stale by the time it lands. SidebarApp
 * applies these fields to whatever Space state it holds at apply time.
 *
 * `mode: 'create'` uses name/icon/color and may carry the group/project that
 * should become the new Space's first member; it ignores `spaceId`. `mode:
 * 'edit'` patches the named Space; `mode: 'delete'` needs only `spaceId`.
 * `remoteMachineId` selects the owning daemon, exactly like `updateSidebarSpaces`.
 */
export type SidebarSpaceEditorResultFields = {
  color?: string;
  icon?: string;
  memberCollectionId?: string;
  memberProjectId?: string;
  mode: 'create' | 'delete' | 'edit';
  name?: string;
  remoteMachineId?: string;
  spaceId?: string;
};

/**
 * The host-to-sidebar half of the Space editor round trip. The dialog posts
 * `sidebarSpaceEditorResult` (a sidebar-to-extension command, because the dialog
 * is a separate window); the host forwards exactly those fields back into
 * SidebarApp under this type, which is the only place the mutation is applied.
 */
export type ApplySidebarSpaceEditorResultMessage = SidebarSpaceEditorResultFields & {
  type: 'applySidebarSpaceEditorResult';
};

/**
 * CDXC:Spaces 2026-09-15 DECISION:
 * User: a project added through the Add Project dialog is assigned to the Space currently open in the sidebar and lands at the top of it.
 * The host posts the added project's raw id (plus the owning machine for a remote add) before it activates the project; SidebarApp, which owns the Space document and the selected Space, applies the membership and the reorder.
 */
export type SidebarAssignAddedProjectToSelectedSpaceMessage = {
  projectId: string;
  remoteMachineId?: string;
  type: 'assignAddedProjectToSelectedSpace';
};

export type SidebarHudChangedMessage = {
  hud: SidebarHudState;
  revision: number;
  /*
  CDXC:StateSync 2026-06-09-23:01:
  Live presentation patches still need HUD-derived chrome such as focused title, counts, and command indicators. Send HUD as its own patch so gxserver deltas do not force a session-tree hydrate just to keep non-row controls current.
  */
  type: 'sidebarHudChanged';
};

export type SidebarPlayCompletionSoundMessage = {
  sound: CompletionSoundSetting;
  sessionId?: string;
  type: 'playCompletionSound';
};

export type SidebarOrderSyncKind = 'agent' | 'command';

export type SidebarOrderSyncResultMessage = {
  /**
   * The daemon answers an order mutation with `itemIds?: readonly string[]`
   * (`GxserverSidebarHudSettingsMutationResult`); this message only relays that
   * confirmation, so it carries the same read-only array instead of forcing
   * every host to copy it.
   */
  itemIds: readonly string[];
  kind: SidebarOrderSyncKind;
  requestId: string;
  status: 'error' | 'success';
  type: 'sidebarOrderSyncResult';
};

export type SidebarCommandRunState = 'error' | 'running' | 'success';

export type SidebarCommandRunStateChangedMessage = {
  commandId: string;
  runId: string;
  state: SidebarCommandRunState;
  type: 'sidebarCommandRunStateChanged';
};

export type SidebarCommandRunStateClearedMessage = {
  commandId: string;
  type: 'sidebarCommandRunStateCleared';
};

/**
 * CDXC:Sidebar 2026-09-20 WHY:
 * A host-owned request to make one existing session row visible in the sidebar:
 * expand every collapsed container above it and scroll it into view if it is
 * off screen. `requestId` makes repeat reveals of the same row distinct one-shot
 * requests, since the same row may have to be revealed twice in a row. This
 * supersedes the 2026-08-18 note that named a new Browser tab as the sender:
 * browser tabs are not sidebar rows any more, and a new one reveals itself in
 * the view panel's tab strip instead.
 */
export type SidebarRevealSessionMessage = {
  requestId: number;
  sessionId: string;
  type: 'revealSidebarSession';
};

export type SidebarDaemonInfo = {
  pid: number;
  port: number;
  protocolVersion: number;
  startedAt: string;
};

export type SidebarDaemonSessionItem = {
  agentName?: string;
  agentStatus: 'idle' | 'working' | 'attention';
  cols: number;
  cwd: string;
  endedAt?: string;
  errorMessage?: string;
  exitCode?: number;
  isCurrentWorkspace: boolean;
  isLocalOnly?: boolean;
  /**
   * CDXC:SessionIdentity 2026-06-02-17:19:
   * Running Sessions may show gxserver-backed terminal rows and macOS-local panes in one modal. Carry ownership on the contract so the UI and external consumers can label local-only rows instead of treating every row as shared daemon state.
   */
  ownership?: 'gxserver' | 'local';
  restoreState: 'live' | 'replayed';
  rows: number;
  sessionId: string;
  shell: string;
  startedAt: string;
  status: 'starting' | 'running' | 'exited' | 'error' | 'disconnected';
  title?: string;
  workspaceId: string;
};

export type SidebarDaemonSessionsStateMessage = {
  daemon?: SidebarDaemonInfo;
  errorMessage?: string;
  sessions: SidebarDaemonSessionItem[];
  type: 'daemonSessionsState';
};

export type SidebarPromptGitCommitMessage = {
  /**
   * CDXC:AgentLauncher 2026-05-29-10:53:
   * Git commit review, Multiple Commits, Release, and generated rename/title flows
   * must carry the user-selected prompt agent explicitly. Modal-specific choices
   * are remembered by the modal host, while Settings default-agent changes clear
   * those remembered choices so every modal returns to the new default.
   */
  action: SidebarGitAction;
  agentId?: string;
  branch?: string | null;
  changedFiles?: SidebarGitChangedFile[];
  confirmLabel: string;
  deleteWorktreeAfterDefault?: boolean;
  description: string;
  isWorktree?: boolean;
  isDefaultRef?: boolean;
  requestId: string;
  showCommitMessage?: boolean;
  suggestedBody?: string;
  suggestedSubject: string;
  type: 'promptGitCommit';
  worktreeName?: string;
};

export type SidebarGitFileDiffMessage = {
  /*
  CDXC:Git 2026-06-24-15:22:
  Reused SidebarApp commit review can run outside the native app-modal host.
  Return selected-file diffs through a request-scoped shared message so non-native hosts can fill the inline review pane without opening files, trusting renderer paths as authority, or adding GPUI-only UI.
  */
  draft: SidebarGitFileDiffDraft;
  requestId: string;
  type: 'sidebarGitFileDiff';
};

export type SidebarGitPreferenceScope = {
  /*
  CDXC:Git 2026-06-24-18:22:
  Git preference writes are project-scoped when the shared UI knows the owning project row. Carry a trusted group id or machine-scoped project id with preference changes so GPUI can route remote writes through the owning gxserver tunnel instead of inferring from the active local project, labels, or DOM text.
  */
  groupId?: string;
  projectId?: string;
};

export type SidebarGhostexFolderStat = {
  name: string;
  path: string;
  sizeBytes: number;
};

/**
 * CDXC:Diagnostics 2026-09-16 SEE-ALSO:
 * packages/core-ui/settings-modal/tabs/debugging.tsx gates folder-size requests on Show debug UI controls.
 * The native sidebar returns folder sizes so the Settings page does not own filesystem access or accept client-provided paths.
 */
export type SidebarGhostexFolderStatsMessage = {
  errorMessage?: string;
  folderPath: string;
  folders: SidebarGhostexFolderStat[];
  generatedAt: string;
  totalBytes: number;
  type: 'ghostexFolderStats';
};

export type SidebarPluginSettingsItem = {
  canReinstall: boolean;
  errorMessage?: string;
  id: 'code' | 'cef';
  sizeBytes: number;
  status:
    'installed' | 'notInstalled' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'finishing' | 'failed';
  statusLabel: string;
  version: string;
};

/** Native component-store state shown by Settings -> Extensions. */
export type SidebarPluginSettingsStatusMessage = {
  plugins: SidebarPluginSettingsItem[];
  type: 'pluginSettingsStatus';
};

/**
 * CDXC:AppModal 2026-04-28-16:18
 * User-input flows must not use VS Code input boxes, quick picks, or modal
 * editors. Extension-initiated prompts are represented as sidebar messages so
 * the existing React modal host owns rendering and styling.
 */
export type SidebarShowSessionRenameModalMessage = {
  initialTitle: string;
  sessionAgentIcon?: string;
  sessionId: string;
  type: 'showSessionRenameModal';
};

export type SidebarPreviousSessionsResultMessage = {
  projects?: Array<{ projectId: string; name: string; path?: string }>;
  cursor?: string;
  previousSessions: SidebarPreviousSessionItem[];
  query?: string;
  requestId: string;
  type: 'previousSessionsResult';
};

export type SidebarSessionTranscriptSizesResultMessage = {
  requestId: string;
  sizes: Array<{
    key: string;
    sizeBytes?: number | null;
  }>;
  type: 'sessionTranscriptSizesResult';
};

/*
 * CDXC:SavedPrompts 2026-07-29:
 * Answer to `requestStashedPrompts`, correlated by requestId. Rows carry
 * user-authored prompt bodies from gxserver, so hosts must forward them to the
 * Prompts modal verbatim and never log or persist them outside that surface.
 */
export type SidebarStashedPromptsResultMessage = {
  prompts: GxserverStashedPrompt[];
  requestId: string;
  /**
   * CDXC:SavedPrompts 2026-08-23:
   * The tag catalogue rides along with the prompts so the pill rail, its
   * counts, and the row chips all paint from one answer instead of three.
   */
  tags?: GxserverStashedPromptTag[];
  type: 'stashedPromptsResult';
  drafts?: import('./gxserver-protocol').GxserverSessionChatDraftListEntry[];
  deliveredDrafts?: import('./session-chat-queue').SessionChatDeliveredDraft[];
  recoveryDrafts?: import('./session-chat-queue').SessionChatRecoveryDraft[];
};

/**
 * CDXC:SavedPrompts 2026-08-23:
 * Answer to `saveStashedPromptTag` and `deleteStashedPromptTag`. Both return
 * the whole refreshed catalogue rather than the one row they touched, because
 * a create can resolve to an existing tag and a delete reorders nothing but
 * removes assignments the modal is still holding.
 */
export type SidebarStashedPromptTagsResultMessage = {
  /** Set on delete so the modal can drop the id from every prompt it holds. */
  deletedTagId?: string;
  error?: string;
  ok: boolean;
  requestId: string;
  tags: GxserverStashedPromptTag[];
  type: 'stashedPromptTagsResult';
};

/** Answer to `setStashedPromptTags`, carrying the canonical re-tagged row. */
export type SidebarSetStashedPromptTagsResultMessage = {
  error?: string;
  ok: boolean;
  prompt?: GxserverStashedPrompt;
  requestId: string;
  type: 'setStashedPromptTagsResult';
};

/**
 * Result of creating a prompt directly from the saved-prompts modal. The host
 * returns the canonical gxserver row so the modal never has to invent ids,
 * timestamps, or project presentation metadata optimistically.
 */
export type SidebarSaveStashedPromptResultMessage = {
  error?: string;
  ok: boolean;
  prompt?: GxserverStashedPrompt;
  requestId: string;
  type: 'saveStashedPromptResult';
};

/*
 * CDXC:Worktrees 2026-07-29:
 * Answers to the two V2 worktree commands, correlated by the `requestId` the
 * sidebar minted. They exist ONLY to end a pending state: the created session
 * itself arrives the normal way, as a presentation delta, and the host is the
 * one that focuses it. `ok: false` carries a short, already-sanitized reason
 * for the popover's inline error line — never raw git or daemon output.
 */
export type SidebarWorktreeSessionResultMessage = {
  branch?: string;
  error?: string;
  ok: boolean;
  requestId: string;
  /** Sidebar-scoped id of the created session, when the host published one. */
  sessionId?: string;
  type: 'worktreeSessionResult';
  worktreePath?: string;
};

/**
 * `dirty: true` with `removed: false` is a REFUSAL, not a failure: the checkout
 * has uncommitted work and the prompt re-asks with a force option.
 */
export type SidebarSessionWorktreeRemovalResultMessage = {
  dirty?: boolean;
  error?: string;
  ok: boolean;
  removed: boolean;
  requestId: string;
  type: 'sessionWorktreeRemovalResult';
  warnings?: string[];
  worktreePath: string;
};

export type SidebarRecentProjectsResultMessage = {
  machineId?: string;
  recentProjects: SidebarRecentProject[];
  type: 'recentProjectsResult';
};

export type SidebarRemoteMachineStatusMessage = {
  machineId: string;
  /**
   * CDXC:RemoteMachines 2026-07-12:
   * Optional sanitized failure summary authored by the native host (the same
   * text as the failure toast) so the remote header's error control can explain
   * why a connect attempt failed. Never raw SSH/daemon output.
   */
  message?: string;
  /**
   * CDXC:RemoteMachines 2026-07-12:
   * The union now names the granular native connect states that hosts were
   * already sending as raw strings, so the sidebar can show real progress
   * ("Installing…", "Downloading…") and per-cause failure text instead of
   * collapsing everything that is not "connected".
   */
  state:
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'downloadingRemoteServerPackage'
    | 'installApprovalRequired'
    | 'installFailed'
    | 'installing'
    | 'invalid'
    | 'keychainFailed'
    | 'presentationStreamFailed'
    | 'presentationSubscribeFailed'
    | 'sshFailed'
    | 'tokenUnavailable'
    | 'tunnelFailed'
    | 'unsupported'
    | 'unsupportedRemotePlatform'
    | 'failed';
  type: 'remoteMachineStatus';
};

export type SidebarNativeHotkeyMessage = {
  /**
   * CDXC:Hotkeys 2026-06-05-20:53:
   * AppKit owns Cmd+number while terminal panes have focus, then forwards the shared hotkey action id into the sidebar so React can resolve session slots from the currently rendered row order, including collapsed-project filtering.
   */
  actionId: ghostexHotkeyActionId;
  type: 'nativeHotkey';
};

/**
 * CDXC:Icons 2026-06-25-21:50:
 * One available Dock/app-switcher icon as reported by native. thumbnailDataUrl
 * is a self-contained data: URL so the picker grid renders without native file
 * reads, and `selected` mirrors which entry native currently has applied.
 */
export type SidebarAppIconInfo = {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  selected: boolean;
};

/**
 * CDXC:Icons 2026-06-25-21:50:
 * Native -> Settings App Icon state. Already trimmed by native to the newest 10
 * icons plus the selected one. `ok: false` with `error` describes a failed list
 * or swap; the sidebar persists appIconSourceId only when ok is true.
 */
export type SidebarAppIconStateMessage = {
  error: string | null;
  icons: SidebarAppIconInfo[];
  ok: boolean;
  selectedId: string;
  type: 'appIconState';
};

export type SidebarGpuiProjectSlotHotkeyMessage = {
  /**
   * CDXC:Hotkeys 2026-06-26-23:42:
   * GPUI project slot hotkeys resolve locally in SidebarApp because SidebarApp owns the rendered Projects row order. Carry only the 1-based slot number so host payloads do not expose paths, titles, session ids, command text, URLs, or project metadata.
   */
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  type: 'gpuiProjectSlotHotkey';
};

export type ExtensionToSidebarMessage =
  | SidebarHydrateMessage
  | SidebarSessionStateMessage
  | SidebarNativeHotkeyMessage
  | SidebarGpuiProjectSlotHotkeyMessage
  | AgentsHubCatalogMessage
  | AgentsHubFileContentMessage
  | AgentSyncReportMessage
  | AgentSyncPlanMessage
  | AgentSyncApplyResultMessage
  | SidebarSessionPresentationChangedMessage
  | SidebarGroupsChangedMessage
  | SidebarProjectCollectionsChangedMessage
  | SidebarSpacesChangedMessage
  | CustomSessionTagsChangedMessage
  | ApplySidebarSpaceEditorResultMessage
  | SidebarAssignAddedProjectToSelectedSpaceMessage
  | SidebarHudChangedMessage
  | SidebarPlayCompletionSoundMessage
  | SidebarOrderSyncResultMessage
  | SidebarCommandRunStateChangedMessage
  | SidebarCommandRunStateClearedMessage
  | SidebarRevealSessionMessage
  | SidebarDaemonSessionsStateMessage
  | SidebarPromptGitCommitMessage
  | SidebarGitFileDiffMessage
  | SidebarGhostexFolderStatsMessage
  | SidebarPluginSettingsStatusMessage
  | SidebarAgentHookStatusMessage
  | SidebarGhostexCliStatusMessage
  | SidebarOSIntegrationStatusMessage
  | SidebarShowSessionRenameModalMessage
  | SidebarPreviousSessionsResultMessage
  | SidebarSessionTranscriptSizesResultMessage
  | SidebarStashedPromptsResultMessage
  | SidebarSaveStashedPromptResultMessage
  | SidebarStashedPromptTagsResultMessage
  | SidebarSetStashedPromptTagsResultMessage
  | SidebarWorktreeSessionResultMessage
  | SidebarSessionWorktreeRemovalResultMessage
  | SidebarRecentProjectsResultMessage
  | SidebarRemoteMachineStatusMessage
  // CDXC:Icons 2026-06-25-21:50: Native pushes App Icon list/selection state into Settings.
  | SidebarAppIconStateMessage;

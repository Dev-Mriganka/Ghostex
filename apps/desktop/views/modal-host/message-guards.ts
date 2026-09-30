import type { StashedPromptsScope } from "@/packages/core-ui/stashed-prompts-modal";
import type { UpdateAvailableModalState } from "@/packages/core-ui/update-available-modal";
import type { GitFileDiffModalDraft } from "@/packages/core-ui/git-file-diff-modal";
import type { GitCommitModalDraft } from "@/packages/core-ui/git-commit-modal";
import type { WorktreeDeleteModalDraft } from "@/packages/core-ui/worktree-delete-modal";
import type { WorktreeRenameModalDraft } from "@/packages/core-ui/worktree-rename-modal";
import type {
  ExtensionToSidebarMessage,
  SidebarAgentHookStatusMessage,
  SidebarGhostexCliStatusMessage,
  SidebarGhostexFolderStatsMessage,
  SidebarPluginSettingsStatusMessage,
  SidebarOSIntegrationStatusMessage,
  SidebarAppIconStateMessage,
} from "@/packages/shared/session-grid-contract";
import { useSidebarStore } from "@/packages/core-ui/sidebar-store";
import type {
  AgentsHubCatalogMessage,
  AgentsHubFileContentMessage,
  AgentSyncReportMessage,
  AgentSyncPlanMessage,
  AgentSyncApplyResultMessage,
} from "./host-messages";
import type {
  AppModalKind,
  RenameSessionModalState,
  SessionNoteModalState,
  SidebarSpaceEditorModalState,
  AddProjectModalState,
  RecentProjectsModalState,
  StashedPromptsModalState,
  ExportTranscriptResultModalState,
  RemoteGxserverInstallState,
  DelayedSendModalState,
  MissingProjectFolderModalState,
  WorktreeModalState,
  PortlessSetupModalState,
  AgentHooksRequiredModalState,
} from "./modal-state";

export function isAgentHookStatusMessage(
  message: unknown,
): message is SidebarAgentHookStatusMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "agentHookStatus",
  );
}

export function isGhostexCliStatusMessage(
  message: unknown,
): message is SidebarGhostexCliStatusMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "ghostexCliStatus",
  );
}

export function isGhostexFolderStatsMessage(
  message: unknown,
): message is SidebarGhostexFolderStatsMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "ghostexFolderStats",
  );
}

export function isOSIntegrationStatusMessage(
  message: unknown,
): message is SidebarOSIntegrationStatusMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "osIntegrationStatus",
  );
}

export function isPluginSettingsStatusMessage(
  message: unknown,
): message is SidebarPluginSettingsStatusMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "pluginSettingsStatus",
  );
}

// CDXC:Icons 2026-06-25-21:50: Narrow relayed sidebarState payloads to the App Icon contract.
export function isAppIconStateMessage(
  message: unknown,
): message is SidebarAppIconStateMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "appIconState",
  );
}

// CDXC:SavedPrompts 2026-08-24: Narrow a launcher-pinned origin filter to the modal's scope vocabulary.
export function isStashedPromptsScope(value: unknown): value is StashedPromptsScope {
  return value === "all" || value === "project" || value === "session";
}

export function isStashedPromptsTransientMessage(message: unknown): message is Extract<
  ExtensionToSidebarMessage,
  {
    type:
      | "saveStashedPromptResult"
      | "setStashedPromptTagsResult"
      | "stashedPromptTagsResult"
      | "stashedPromptsResult";
  }
> {
  /*
   * CDXC:SavedPrompts 2026-07-29:
   * Stashed-prompt query answers are transient sidebarState payloads. Forward
   * them to the Prompts modal as window messages instead of storing prompt
   * bodies in the reusable modal-host hydrate snapshot.
   *
   * CDXC:SavedPrompts 2026-08-24:
   * The two tag answers belong in the same relay. They were missing, so every
   * tag mutation made from the GPUI modal host — create, delete, file a prompt
   * under a tag — was answered into a window message the modal never received:
   * the rail only refreshed on the next full reopen, and a failed mutation
   * reported no error at all.
   */
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    (message.type === "stashedPromptsResult" ||
      message.type === "saveStashedPromptResult" ||
      message.type === "stashedPromptTagsResult" ||
      message.type === "setStashedPromptTagsResult"),
  );
}

export function isPreviousSessionsResultMessage(
  message: unknown,
): message is Extract<
  ExtensionToSidebarMessage,
  { type: "previousSessionsResult" }
> {
  /*
  CDXC:Sessions 2026-06-01-22:01:
  The full-window Previous Sessions modal lives in the app modal host WebView, while gxserver previous-session queries are requested through the native sidebar bridge. Forward the result as a normal window message so the shared modal component receives the same response path it uses inside the sidebar WebView.
  */
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "previousSessionsResult",
  );
}

export function isSessionTranscriptSizesResultMessage(
  message: unknown,
): message is Extract<
  ExtensionToSidebarMessage,
  { type: "sessionTranscriptSizesResult" }
> {
  /*
  CDXC:Sessions 2026-08-28:
  Transcript sizes are transient answers owned by PreviousSessionsModal, not
  persistent sidebar store state. Relay them through the modal window just like
  the paged previous-session result so the request can leave its loading state.
  */
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "sessionTranscriptSizesResult",
  );
}

export function isRecentProjectsResultMessage(
  message: unknown,
): message is Extract<
  ExtensionToSidebarMessage,
  { type: "recentProjectsResult" }
> {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "recentProjectsResult",
  );
}

export function isAgentsHubCatalogMessage(
  message: unknown,
): message is AgentsHubCatalogMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "agentsHubCatalog",
  );
}

export function isAgentsHubFileContentMessage(
  message: unknown,
): message is AgentsHubFileContentMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "agentsHubFileContent",
  );
}

export function isAgentSyncReportMessage(
  message: unknown,
): message is AgentSyncReportMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "agentSyncReport",
  );
}

export function isAgentSyncPlanMessage(
  message: unknown,
): message is AgentSyncPlanMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "agentSyncPlan",
  );
}

export function isAgentSyncApplyResultMessage(
  message: unknown,
): message is AgentSyncApplyResultMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "agentSyncApplyResult",
  );
}

export function isModalRenderable({
  activeModal,
  addProject,
  agentHooksRequired,
  delayedSend,
  gitCommit,
  gitFileDiff,
  worktreeDelete,
  worktreeRename,
  missingProjectFolder,
  recentProjects,
  remoteGxserverInstall,
  renameSession,
  sessionNote,
  sidebarSpaceEditor,
  stashedPrompts,
  exportTranscriptResult,
  updateAvailable,
  settings,
  worktree,
  portlessSetup,
}: {
  activeModal: AppModalKind | undefined;
  addProject: AddProjectModalState | undefined;
  agentHooksRequired: AgentHooksRequiredModalState | undefined;
  delayedSend: DelayedSendModalState | undefined;
  gitCommit: GitCommitModalDraft | undefined;
  gitFileDiff: GitFileDiffModalDraft | undefined;
  worktreeDelete: WorktreeDeleteModalDraft | undefined;
  worktreeRename: WorktreeRenameModalDraft | undefined;
  missingProjectFolder: MissingProjectFolderModalState | undefined;
  recentProjects: RecentProjectsModalState | undefined;
  remoteGxserverInstall: RemoteGxserverInstallState | undefined;
  renameSession: RenameSessionModalState | undefined;
  sessionNote: SessionNoteModalState | undefined;
  sidebarSpaceEditor: SidebarSpaceEditorModalState | undefined;
  stashedPrompts: StashedPromptsModalState | undefined;
  exportTranscriptResult: ExportTranscriptResultModalState | undefined;
  updateAvailable: UpdateAvailableModalState | undefined;
  settings: unknown;
  worktree: WorktreeModalState | undefined;
  portlessSetup: PortlessSetupModalState | undefined;
}): boolean {
  switch (activeModal) {
    case undefined:
      return false;
    case "addProject":
      return addProject !== undefined;
    case "agentHooksRequired":
      return agentHooksRequired !== undefined;
    case "agentsHub":
    case "commandPalette":
      return true;
    case "delayedSend":
      return delayedSend !== undefined;
    case "gitCommit":
      return gitCommit !== undefined;
    case "gitFileDiff":
      return gitFileDiff !== undefined;
    case "missingProjectFolder":
      return missingProjectFolder !== undefined;
    case "deleteWorktree":
      return worktreeDelete !== undefined;
    case "renameWorktree":
      return worktreeRename !== undefined;
    case "recentProjects":
      return recentProjects !== undefined;
    case "remoteGxserverInstall":
      return remoteGxserverInstall !== undefined;
    case "renameSession":
      return renameSession !== undefined;
    case "sessionNote":
      return sessionNote !== undefined;
    case "sidebarSpaceEditor":
      return sidebarSpaceEditor !== undefined;
    case "stashedPrompts":
      return stashedPrompts !== undefined;
    case "exportTranscriptResult":
      return exportTranscriptResult !== undefined;
    case "updateAvailable":
      return updateAvailable !== undefined;
    case "settings":
    case "configureActions":
    case "configureAgents":
    case "hotkeys":
    case "openTargets":
      return settings !== undefined;
    case "worktree":
      return worktree !== undefined;
    case "portlessSetup":
      return portlessSetup !== undefined;
    case "previousSessions":
    case "remoteSetup":
    case "onboarding":
      return true;
  }
}

export function applySidebarStateMessage(message: unknown) {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return;
  }

  if (message.type === "hydrate" || message.type === "sessionState") {
    useSidebarStore
      .getState()
      .applySidebarMessage(
        message as Parameters<
          ReturnType<typeof useSidebarStore.getState>["applySidebarMessage"]
        >[0],
      );
    return;
  }
}

import type { DelayedSendAgentReference } from "@/packages/shared/delayed-send";
import type { StashedPromptsScope } from "@/packages/core-ui/stashed-prompts-modal";
import type { PortlessSetupModalMode } from "@/packages/core-ui/portless-setup-modal";
import type { ExportTranscriptModalStage } from "@/packages/core-ui/export-transcript-result-modal";
import { type SidebarAgentIcon } from "@/packages/shared/sidebar-agents";

export type AppModalKind =
  | "addProject"
  | "agentHooksRequired"
  | "agentsHub"
  | "commandPalette"
  | "configureActions"
  | "configureAgents"
  | "delayedSend"
  | "exportTranscriptResult"
  | "hotkeys"
  | "missingProjectFolder"
  | "gitCommit"
  | "gitFileDiff"
  | "deleteWorktree"
  | "renameWorktree"
  | "openTargets"
  | "portlessSetup"
  | "previousSessions"
  | "recentProjects"
  | "remoteGxserverInstall"
  | "remoteSetup"
  | "renameSession"
  | "sessionNote"
  | "settings"
  | "sidebarSpaceEditor"
  | "stashedPrompts"
  | "worktree"
  | "updateAvailable"
  | "onboarding";

export type RenameSessionModalState = {
  initialTitle: string;
  sessionAgentIcon?: string;
  sessionId: string;
};

/*
 * CDXC:SessionNotes 2026-08-24:
 * The session-note editor's open payload. `initialNote` is the note the sidebar
 * row was already rendering, so the dialog opens filled in without a round
 * trip; `projectId` is an optional scope hint the app's Rust store may use to route the
 * write, and `sessionTitle` is heading copy only.
 */
export type SessionNoteModalState = {
  initialNote: string;
  projectId?: string;
  sessionId: string;
  sessionTitle?: string;
};

/*
 * CDXC:Spaces 2026-08-27:
 * The New/Edit Space dialog's open payload. `remoteMachineId` is the only
 * routing token that crosses this boundary — it names the gxserver that owns
 * the Space — and the optional member id carries the group/project that opened
 * a create dialog. The name/icon/color are the values the sidebar row was
 * already rendering, so the dialog opens on live values without a round trip.
 * No Space document crosses here in either direction: the sidebar owns it.
 */
export type SidebarSpaceEditorModalState = {
  memberCollectionId?: string;
  memberProjectId?: string;
  mode: "create" | "edit";
  remoteMachineId?: string;
  spaceColor?: string;
  spaceIcon?: string;
  spaceId?: string;
  spaceName?: string;
};

export type PromptAgentModalKey = "gitCommit" | "renameSession";

export const PROMPT_AGENT_MODAL_STORAGE_KEYS: Record<PromptAgentModalKey, string> = {
  gitCommit: "ghostex.promptAgent.gitCommit",
  renameSession: "ghostex.promptAgent.renameSession",
};

/*
 * CDXC:AddProject 2026-07-30:
 * The add-project dialog resolves its own machine list through the host, so the
 * only thing an open message carries is which machine to preselect. A remote
 * machine header sends one; the projects header, the V2 create menu, and the
 * command palette send none and let the dialog decide.
 */
export type AddProjectModalState = {
  machineId?: string;
};

export type RecentProjectsModalState = {
  machineId?: string;
  machineName?: string;
};

/*
 * CDXC:SavedPrompts 2026-07-29:
 * The session Prompts modal carries the launching session's project scope and
 * the terminal session the selected prompt is inserted back into. Both are
 * optional so the modal can open in all-projects browse mode.
 *
 * CDXC:SavedPrompts 2026-08-24:
 * `initialScope` is the launcher's pinned origin filter. It stays optional so
 * an opener with no opinion lets the modal choose its own default.
 */
export type StashedPromptsModalState = {
  initialScope?: StashedPromptsScope;
  projectId?: string;
  sessionId?: string;
};

/*
 * CDXC:TranscriptExport 2026-08-20 / CDXC:TranscriptExport 2026-08-24:
 * The Export Transcript dialog. It opens on its include-toggle options stage;
 * the export runs only when the user confirms it, and the app (gx_store/git/export_transcript.rs)
 * answers with `exportSessionTranscriptResult`, which moves `stage` to
 * done/failed. `path` on the done stage is absolute on the machine that owns
 * the transcript, so `canReveal` is false for a remote session's export: the
 * host running this dialog has no such file.
 */
export type ExportTranscriptResultModalState = {
  agentId?: string;
  canReveal: boolean;
  requestId?: string;
  stage: ExportTranscriptModalStage;
  targetAgentId?: string;
};

export type RemoteGxserverInstallState = {
  remoteMachineId: string;
  remoteMachineName: string;
};

export type DelayedSendModalState = {
  agentIcon?: SidebarAgentIcon;
  closeAfterDoneActive?: boolean;
  delayedSendDeadlineAt?: string;
  delayedSendRemainingLabel?: string;
  sendWhenAllProjectSessionsStopActive?: boolean;
  sendWhenAgentStopsActive?: boolean;
  sendWhenSpecificAgentFinishes?: DelayedSendAgentReference;
  sessionId: string;
  supportsSendWhenAllProjectSessionsStop?: boolean;
  supportsSendWhenAgentStops?: boolean;
  title?: string;
};

export type MissingProjectFolderModalState = {
  projectId: string;
  projectName: string;
  projectPath: string;
};

/**
 * CDXC:AppModal 2026-06-03-16:12:
 * macOS and crossplatform app-modal toasts should sit 23px higher than
 * Sonner's 24px bottom default, so progress notices stay clear of lower app
 * chrome while preserving the bottom-center stack behavior.
 */
export const APP_MODAL_TOAST_BOTTOM_OFFSET_PX = 47;
export type WorktreeModalState = {
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  remoteMachineId?: string;
  remoteMachineName?: string;
};

export type PortlessSetupModalState = {
  mode: PortlessSetupModalMode;
  protocol: "https" | "http";
};

const APP_MODAL_CONTEXT_MENU_EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [role='textbox']";

export function isEditableAppModalContextMenuTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest(APP_MODAL_CONTEXT_MENU_EDITABLE_SELECTOR) !== null;
}

export type AgentHooksRequiredModalState = {
  agentId: string;
  agentName: string;
  groupId?: string;
  hookAgentId: string;
  accountId?: string;
};

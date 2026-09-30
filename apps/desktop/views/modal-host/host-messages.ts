import type { DelayedSendAgentReference } from "@/packages/shared/delayed-send";
import type { StashedPromptsScope } from "@/packages/core-ui/stashed-prompts-modal";
import type { PortlessSetupModalMode } from "@/packages/core-ui/portless-setup-modal";
import type {
  MainSettingsInitialSectionId,
  SettingsModalTab,
  SettingsSidebarTagsAction,
} from "@/packages/core-ui/settings-modal";
import type { GitFileDiffModalDraft } from "@/packages/core-ui/git-file-diff-modal";
import type { GitCommitModalDraft } from "@/packages/core-ui/git-commit-modal";
import type { WorktreeDeleteModalDraft } from "@/packages/core-ui/worktree-delete-modal";
import type { WorktreeRenameModalDraft } from "@/packages/core-ui/worktree-rename-modal";
import { type AppToastRequest } from "@/packages/shared/app-toast-contract";
import { type SidebarAgentIcon } from "@/packages/shared/sidebar-agents";
import type { ExtensionToSidebarMessage } from "@/packages/shared/session-grid-contract";
import {
  type SettingsAgentsSection,
  type SettingsRemoteSection,
} from "@/packages/core-ui/app-modal-host-bridge";
import type { AppModalKind } from "./modal-state";

export type AgentsHubCatalogMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "agentsHubCatalog" }
>;
export type AgentsHubFileContentMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "agentsHubFileContent" }
>;
export type AgentSyncReportMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "agentSyncReport" }
>;
export type AgentSyncPlanMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "agentSyncPlan" }
>;
export type AgentSyncApplyResultMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "agentSyncApplyResult" }
>;
export type AgentHookStatusMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "agentHookStatus" }
>;
export type GhostexCliStatusMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "ghostexCliStatus" }
>;
export type OSIntegrationStatusMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "osIntegrationStatus" }
>;
export type PluginSettingsStatusMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "pluginSettingsStatus" }
>;
// CDXC:Icons 2026-06-25-21:50: App Icon state message threaded through modal state into Settings.
export type AppIconStateMessage = Extract<
  ExtensionToSidebarMessage,
  { type: "appIconState" }
>;

export type AppModalHostMessage =
  | {
      paneId?: number;
      runtimeKey?: number;
      agentIcon?: SidebarAgentIcon;
      agentId?: string;
      agentName?: string;
      /** CDXC:TranscriptExport 2026-08-20: see ExportTranscriptResultModalState. */
      canReveal?: boolean;
      path?: string;
      targetAgentId?: string;
      closeAfterDoneActive?: boolean;
      delayedSendDeadlineAt?: string;
      delayedSendRemainingLabel?: string;
      sendWhenAllProjectSessionsStopActive?: boolean;
      sendWhenAgentStopsActive?: boolean;
      sendWhenSpecificAgentFinishes?: DelayedSendAgentReference;
      supportsSendWhenAllProjectSessionsStop?: boolean;
      supportsSendWhenAgentStops?: boolean;
      initialTitle?: string;
      initialQuery?: string;
      initialProjectId?: string;
      initialSessionScope?: "all" | "closed" | "external";
      /** CDXC:SessionNotes 2026-08-24: see SessionNoteModalState. */
      initialNote?: string;
      sessionTitle?: string;
      message?: string;
      projectId?: string;
      projectName?: string;
      projectPath?: string;
      remoteMachineId?: string;
      remoteMachineName?: string;
      filePath?: string;
      gitCommitDraft?: GitCommitModalDraft;
      gitFileDiff?: GitFileDiffModalDraft;
      source?: string;
      groupId?: string;
      hookAgentId?: string;
      accountId?: string;
      worktreeDeleteDraft?: WorktreeDeleteModalDraft;
      worktreeRenameDraft?: WorktreeRenameModalDraft;
      initialRemoteMachineId?: string;
      initialRemoteSection?: SettingsRemoteSection;
      initialAgentsSection?: SettingsAgentsSection;
      initialCustomViewId?: string;
      initialViewScopeKey?: string;
      initialSection?: MainSettingsInitialSectionId;
      initialSidebarTagsAction?: SettingsSidebarTagsAction;
      /** CDXC:SavedPrompts 2026-08-24: see StashedPromptsModalState. */
      initialScope?: StashedPromptsScope;
      initialSearchQuery?: string;
      initialTab?: SettingsModalTab;
      latestSidebarStateMessage?: unknown;
      /** Set only by the automatic first-run open of `onboarding`; see contract.ts `firstRun`. */
      firstRun?: boolean;
      machineId?: string;
      machineName?: string;
      /** Membership target for a Space created from a group/project menu. */
      memberCollectionId?: string;
      memberProjectId?: string;
      modal: AppModalKind;
      /**
       * CDXC:Spaces 2026-08-27:
       * `create`/`edit` belong to the Space editor; the two portless values are
       * that dialog's own modes. They share the field because the modal-open
       * message is one flat record keyed by `modal`.
       */
      mode?: PortlessSetupModalMode | "create" | "edit";
      prewarm?: boolean;
      protocol?: "https" | "http";
      requestId?: string;
      sessionAgentIcon?: string;
      sessionId?: string;
      /** CDXC:Spaces 2026-08-27: see SidebarSpaceEditorModalState. */
      spaceColor?: string;
      spaceIcon?: string;
      spaceId?: string;
      spaceName?: string;
      threadId?: string;
      title?: string;
      notesMarkdown?: string;
      portable?: boolean;
      state?: "available" | "ready";
      version?: string;
      type: "open";
    }
  | { type: "close" }
  | { type: "completeFirstLaunchSetup" }
  | AppToastRequest
  | { keepOpen?: boolean; type: "toastDismissed" }
  | { initialPath?: string; type: "pickRepositoryFolder" }
  | { path: string; type: "repositoryFolderPicked" }
  | {
      error?: string;
      ok: boolean;
      projectPath?: string;
      requestId: string;
      type: "repositoryCloneResult";
    }
  | {
      error?: string;
      ok: boolean;
      preview?: unknown;
      requestId: string;
      type: "repositoryClonePreviewResult";
    }
  | {
      /*
       * CDXC:AddProject 2026-07-30:
       * One answer channel for every add-project dialog round trip. `result` is
       * the daemon's own result object (browse entries, project record, clone
       * job, discovery) forwarded unchanged, and `error` is the daemon's own
       * rejection text so the dialog can show why a path was refused instead of
       * a generic failure line.
       */
      error?: string;
      ok: boolean;
      requestId: string;
      result?: unknown;
      type: "addProjectDialogResult";
    }
  | { type: "pickWorktreeImages" }
  | { paths: string[]; type: "worktreeImageFilesPicked" }
  | { path: string; type: "terminalBackgroundImageFilePicked" }
  | {
      appearance: "dark" | "light";
      path: string;
      type: "windowGlassImageFilePicked";
    }
  | {
      appearance: "dark" | "light";
      error?: string;
      path?: string;
      type: "windowGlassVideoFilePicked";
    }
  | { path: string; type: "firstLaunchProjectFolderPicked" }
  | {
      error?: string;
      ok: boolean;
      requestId: string;
      type: "firstLaunchCreateProjectSessionResult";
    }
  | {
      /*
       * CDXC:RemoteMachines 2026-08-19:
       * Native's answer to `probeRemoteGxserverInstall`: whether the saved
       * remote machine already has a gxserver package and, when native could
       * read it, that package's version. Settings uses it to label the action
       * Install or Update and to show the installed version beside it.
       */
      installed: boolean;
      remoteMachineId: string;
      type: "remoteGxserverInstallState";
      version?: string;
    }
  | {
      branches?: unknown;
      error?: string;
      ok: boolean;
      requestId: string;
      type: "projectWorktreesResult";
      worktrees?: unknown;
    }
  | {
      /*
       * CDXC:TranscriptExport 2026-08-24:
       * The app's answer to `runExportSessionTranscript` (gx_store/git/export_transcript.rs): the
       * export finished (path is on the machine that owns the transcript) or
       * failed with the daemon's structured message. Moves the open Export
       * Transcript dialog from its exporting stage to done/failed.
       */
      agentId?: string;
      canReveal?: boolean;
      error?: string;
      ok: boolean;
      path?: string;
      requestId: string;
      type: "exportSessionTranscriptResult";
    }
  | { details?: string; event: string; type: "debugLog" }
  | { modal: AppModalKind; requestId?: string; type: "presented" }
  | { message: unknown; type: "sidebarState" };

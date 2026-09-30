import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  MainSettingsInitialSectionId,
  SettingsModalTab,
  SettingsSidebarTagsAction,
} from "@/packages/core-ui/settings-modal";
import type { ExportTranscriptModalStage } from "@/packages/core-ui/export-transcript-result-modal";
import type { UpdateAvailableModalState } from "@/packages/core-ui/update-available-modal";
import type { GitFileDiffModalDraft } from "@/packages/core-ui/git-file-diff-modal";
import type { GitCommitModalDraft } from "@/packages/core-ui/git-commit-modal";
import type { WorktreeDeleteModalDraft } from "@/packages/core-ui/worktree-delete-modal";
import type { WorktreeRenameModalDraft } from "@/packages/core-ui/worktree-rename-modal";
import { normalizeAppToastDescription } from "@/packages/shared/app-toast-contract";
import type { SidebarGhostexFolderStatsMessage } from "@/packages/shared/session-grid-contract";
import { logAppModalError } from "@/packages/core-ui/app-modal-error-log";
import {
  postAppModalHostMessage,
  type SettingsAgentsSection,
  type SettingsRemoteSection,
} from "@/packages/core-ui/app-modal-host-bridge";
import { useSidebarStore } from "@/packages/core-ui/sidebar-store";
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
import type {
  AgentsHubCatalogMessage,
  AgentsHubFileContentMessage,
  AgentSyncReportMessage,
  AgentSyncPlanMessage,
  AgentSyncApplyResultMessage,
  AgentHookStatusMessage,
  GhostexCliStatusMessage,
  OSIntegrationStatusMessage,
  PluginSettingsStatusMessage,
  AppIconStateMessage,
  AppModalHostMessage,
} from "./host-messages";
import {
  vscode,
  isAppModalDebugLoggingEnabled,
  postAppModalDebugLog,
  postSettingsModalDebugLog,
  notifyNativeModalClosed,
  notifyNativeFirstLaunchSetupCompleted,
} from "./bridge";
import {
  isSettingsModalKind,
  isFirstLaunchSetupModalKind,
  shouldApplySidebarStateBeforeModalOpen,
  isSettingsModalTab,
} from "./settings-routing";
import {
  isAgentHookStatusMessage,
  isGhostexCliStatusMessage,
  isGhostexFolderStatsMessage,
  isOSIntegrationStatusMessage,
  isPluginSettingsStatusMessage,
  isAppIconStateMessage,
  isStashedPromptsScope,
  isStashedPromptsTransientMessage,
  isPreviousSessionsResultMessage,
  isSessionTranscriptSizesResultMessage,
  isRecentProjectsResultMessage,
  isAgentsHubCatalogMessage,
  isAgentsHubFileContentMessage,
  isAgentSyncReportMessage,
  isAgentSyncPlanMessage,
  isAgentSyncApplyResultMessage,
  applySidebarStateMessage,
} from "./message-guards";

/**
 * CDXC:AppModal 2026-04-26-15:10
 * Sidebar-owned modals must render from a full-window host so settings and
 * other management dialogs center over the whole application instead of being
 * constrained by the narrow sidebar WKWebView.
 */
export function useModalStateFromNative() {
  const [activeModal, setActiveModal] = useState<AppModalKind | undefined>();
  /*
   * CDXC:CommandPalette 2026-06-13-09:53:
   * Native command-palette prewarm opens the real modal host while hidden.
   * Preserve the request id through React state so the presented event lets
   * AppKit hide the warmed host instead of showing it to the user.
   */
  const [activeModalRequestId, setActiveModalRequestId] = useState<string>();
  const [agentHooksRequired, setAgentHooksRequired] =
    useState<AgentHooksRequiredModalState>();
  const [agentsHubCatalog, setAgentsHubCatalog] =
    useState<AgentsHubCatalogMessage>();
  const [agentsHubFileContent, setAgentsHubFileContent] =
    useState<AgentsHubFileContentMessage>();
  const [agentSyncReport, setAgentSyncReport] =
    useState<AgentSyncReportMessage>();
  const [agentSyncPlan, setAgentSyncPlan] = useState<AgentSyncPlanMessage>();
  const [agentSyncApplyResult, setAgentSyncApplyResult] =
    useState<AgentSyncApplyResultMessage>();
  const [delayedSend, setDelayedSend] = useState<DelayedSendModalState>();
  const [gitCommit, setGitCommit] = useState<GitCommitModalDraft>();
  const [gitFileDiff, setGitFileDiff] = useState<GitFileDiffModalDraft>();
  const [worktreeDelete, setWorktreeDelete] =
    useState<WorktreeDeleteModalDraft>();
  const [worktreeRename, setWorktreeRename] =
    useState<WorktreeRenameModalDraft>();
  const [missingProjectFolder, setMissingProjectFolder] =
    useState<MissingProjectFolderModalState>();
  const [remoteGxserverInstall, setRemoteGxserverInstall] =
    useState<RemoteGxserverInstallState>();
  const [addProject, setAddProject] = useState<AddProjectModalState>();
  const [onboardingFirstRun, setOnboardingFirstRun] = useState(false);
  const [recentProjects, setRecentProjects] =
    useState<RecentProjectsModalState>();
  const [renameSession, setRenameSession] = useState<RenameSessionModalState>();
  const [sessionNote, setSessionNote] = useState<SessionNoteModalState>();
  const [sidebarSpaceEditor, setSidebarSpaceEditor] =
    useState<SidebarSpaceEditorModalState>();
  const [stashedPrompts, setStashedPrompts] =
    useState<StashedPromptsModalState>();
  const [exportTranscriptResult, setExportTranscriptResult] =
    useState<ExportTranscriptResultModalState>();
  const [worktree, setWorktree] = useState<WorktreeModalState>();
  const [portlessSetup, setPortlessSetup] = useState<PortlessSetupModalState>();
  const [updateAvailable, setUpdateAvailable] =
    useState<UpdateAvailableModalState>();
  const [agentHookStatus, setAgentHookStatus] =
    useState<AgentHookStatusMessage>();
  const [
    previousSessionsInitialProjectId,
    setPreviousSessionsInitialProjectId,
  ] = useState<string>();
  const [previousSessionsInitialScope, setPreviousSessionsInitialScope] =
    useState<"all" | "closed" | "external">("all");
  const [
    previousSessionsOpenRequestSequence,
    setPreviousSessionsOpenRequestSequence,
  ] = useState(0);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] =
    useState("");
  const [
    commandPaletteOpenRequestSequence,
    setCommandPaletteOpenRequestSequence,
  ] = useState(0);
  const [isCommandPalettePrewarm, setIsCommandPalettePrewarm] = useState(false);
  const [ghostexCliStatus, setGhostexCliStatus] =
    useState<GhostexCliStatusMessage>();
  const [ghostexFolderStats, setGhostexFolderStats] =
    useState<SidebarGhostexFolderStatsMessage>();
  const [osIntegrationStatus, setOSIntegrationStatus] =
    useState<OSIntegrationStatusMessage>();
  const [pluginSettingsStatus, setPluginSettingsStatus] =
    useState<PluginSettingsStatusMessage>();
  // CDXC:Icons 2026-06-25-21:50: Latest native App Icon state passed to Settings.
  const [appIconState, setAppIconState] = useState<AppIconStateMessage>();
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<MainSettingsInitialSectionId>();
  const [
    settingsInitialSidebarTagsAction,
    setSettingsInitialSidebarTagsAction,
  ] = useState<SettingsSidebarTagsAction>();
  const [settingsInitialRemoteMachineId, setSettingsInitialRemoteMachineId] =
    useState<string>();
  const [settingsInitialRemoteSection, setSettingsInitialRemoteSection] =
    useState<SettingsRemoteSection>();
  const [settingsInitialAgentsSection, setSettingsInitialAgentsSection] =
    useState<SettingsAgentsSection>();
  const [settingsInitialCustomViewId, setSettingsInitialCustomViewId] =
    useState<string>();
  const [settingsInitialViewScopeKey, setSettingsInitialViewScopeKey] =
    useState<string>();
  const [settingsInitialSearchQuery, setSettingsInitialSearchQuery] =
    useState<string>();
  const [settingsInitialTabOverride, setSettingsInitialTabOverride] =
    useState<SettingsModalTab>();
  const activeModalRef = useRef<AppModalKind | undefined>(activeModal);
  const toastTokenRef = useRef(0);

  const clearActiveModalState = useCallback(() => {
    setActiveModal(undefined);
    setActiveModalRequestId(undefined);
    setAgentHooksRequired(undefined);
    setDelayedSend(undefined);
    setGitCommit(undefined);
    setGitFileDiff(undefined);
    setWorktreeDelete(undefined);
    setWorktreeRename(undefined);
    setMissingProjectFolder(undefined);
    setRemoteGxserverInstall(undefined);
    setAddProject(undefined);
    setRecentProjects(undefined);
    setRenameSession(undefined);
    setSessionNote(undefined);
    setSidebarSpaceEditor(undefined);
    setStashedPrompts(undefined);
    setExportTranscriptResult(undefined);
    setWorktree(undefined);
    setPortlessSetup(undefined);
    setUpdateAvailable(undefined);
    setGhostexFolderStats(undefined);
    setOSIntegrationStatus(undefined);
    setPluginSettingsStatus(undefined);
    // CDXC:Icons 2026-06-25-21:50: Drop stale App Icon state when the modal closes.
    setAppIconState(undefined);
    setAgentsHubCatalog(undefined);
    setAgentsHubFileContent(undefined);
    setAgentSyncReport(undefined);
    setAgentSyncPlan(undefined);
    setAgentSyncApplyResult(undefined);
    setCommandPaletteInitialQuery("");
    setCommandPaletteOpenRequestSequence(0);
    setIsCommandPalettePrewarm(false);
    setSettingsInitialSection(undefined);
    setSettingsInitialRemoteMachineId(undefined);
    setSettingsInitialSearchQuery(undefined);
    setSettingsInitialTabOverride(undefined);
  }, []);

  const closeModal = useCallback(() => {
    /**
     * CDXC:AppModal 2026-05-22-16:55:
     * Modal controls such as Previous Sessions Escape and the X button must
     * dismiss the React dialog immediately, then notify native to hide the
     * transparent modal-host WKWebView. Do not require the native echo before
     * clearing visible modal state.
     */
    clearActiveModalState();
    notifyNativeModalClosed();
  }, [clearActiveModalState]);

  const completeFirstLaunchSetup = useCallback(() => {
    clearActiveModalState();
    notifyNativeFirstLaunchSetupCompleted();
  }, [clearActiveModalState]);

  const closeGitFileDiff = useCallback(() => {
    setGitFileDiff(undefined);
  }, []);

  /*
   * CDXC:TranscriptExport 2026-08-24:
   * The Export button's stage move. The app (gx_store/git/export_transcript.rs) answers with
   * `exportSessionTranscriptResult`, which lands the dialog on done/failed.
   */
  const beginExportTranscriptExport = useCallback(() => {
    setExportTranscriptResult((current) =>
      current ? { ...current, stage: { stage: "exporting" } } : current,
    );
  }, []);

  useEffect(() => {
    activeModalRef.current = activeModal;
  }, [activeModal]);

  useEffect(() => {
    const handleMessage = (event: Event) => {
      try {
        const message = (event as CustomEvent<AppModalHostMessage>).detail;
        if (!message || typeof message !== "object") {
          return;
        }

        if (message.type === "open") {
          const hasInlineSidebarStateMessage =
            message.latestSidebarStateMessage !== undefined;
          const shouldApplyInlineSidebarState =
            shouldApplySidebarStateBeforeModalOpen(message.modal);
          if (shouldApplyInlineSidebarState && hasInlineSidebarStateMessage) {
            /*
             * CDXC:Settings 2026-06-20-23:02:
             * Settings opens must apply the native window's latest sidebar
             * snapshot before setting activeModal. This keeps Debugging Mode,
             * revision, and settings data in the modal host before React decides
             * whether the Settings component can actually render.
             *
             * CDXC:Onboarding 2026-06-29-13:46:
             * The first-launch setup modal uses the same hydrated settings store,
             * so it must receive the inline native snapshot before activeModal is
             * set and before native waits for the React presented acknowledgement.
             */
            applySidebarStateMessage(message.latestSidebarStateMessage);
          }
          const sidebarStateAtOpen = useSidebarStore.getState();
          if (isAppModalDebugLoggingEnabled()) {
            postAppModalHostMessage(
              {
                details: JSON.stringify({
                  hasSettings: sidebarStateAtOpen.hud.settings !== undefined,
                  inlineSidebarStateApplied:
                    shouldApplyInlineSidebarState &&
                    hasInlineSidebarStateMessage,
                  modal: message.modal,
                  performanceNow: performance.now(),
                }),
                event: "modalHost.open.received",
                type: "debugLog",
              },
              "AppModals:debug",
            );
          }
          if (isSettingsModalKind(message.modal)) {
            postSettingsModalDebugLog("modalHost.settings.open.received", {
              activeModalBeforeOpen: activeModalRef.current ?? null,
              hasInitialRemoteMachineId:
                typeof message.initialRemoteMachineId === "string" &&
                message.initialRemoteMachineId.trim().length > 0,
              hasInitialSearchQuery:
                typeof message.initialSearchQuery === "string",
              hasSettings: sidebarStateAtOpen.hud.settings !== undefined,
              hasInlineSidebarStateMessage:
                message.latestSidebarStateMessage !== undefined,
              initialSection:
                typeof message.initialSection === "string"
                  ? message.initialSection
                  : null,
              initialTab: isSettingsModalTab(message.initialTab)
                ? message.initialTab
                : null,
              modal: message.modal,
              nativeWindowSurface:
                window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
              revision: sidebarStateAtOpen.revision,
            });
          }
          if (isFirstLaunchSetupModalKind(message.modal)) {
            /*
             * CDXC:Diagnostics 2026-06-29-22:08:
             * Capture the setup open boundary after any inline sidebar-state
             * hydrate has applied so a slow repro can tell whether React already
             * has settings state before renderability waits begin.
             */
            postAppModalDebugLog("modalHost.setup.open.received", {
              activeModalBeforeOpen: activeModalRef.current ?? null,
              hasInlineSidebarStateMessage,
              hasNativeSettingsHydrated: sidebarStateAtOpen.revision > 0,
              hasSettings: sidebarStateAtOpen.hud.settings !== undefined,
              inlineSidebarStateApplied:
                shouldApplyInlineSidebarState && hasInlineSidebarStateMessage,
              modal: message.modal,
              nativeWindowSurface:
                window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
              revision: sidebarStateAtOpen.revision,
            });
          }
          /*
           * CDXC:AddProject 2026-07-30:
           * Set alongside the other payload-only modals rather than inside the
           * open-message if/else chain: the dialog has no draft to validate, so
           * every non-addProject open simply clears it.
           */
          setOnboardingFirstRun(
            message.modal === "onboarding" && message.firstRun === true,
          );
          setAddProject(
            message.modal === "addProject"
              ? {
                  machineId:
                    typeof message.machineId === "string" &&
                    message.machineId.trim()
                      ? message.machineId
                      : undefined,
                }
              : undefined,
          );
          setAgentHooksRequired(
            message.modal === "agentHooksRequired" &&
              typeof message.agentId === "string" &&
              message.agentId.trim() &&
              typeof message.agentName === "string" &&
              message.agentName.trim() &&
              typeof message.hookAgentId === "string" &&
              message.hookAgentId.trim()
              ? {
                  agentId: message.agentId,
                  agentName: message.agentName,
                  groupId:
                    typeof message.groupId === "string" &&
                    message.groupId.trim()
                      ? message.groupId
                      : undefined,
                  hookAgentId: message.hookAgentId,
                  accountId:
                    typeof message.accountId === "string"
                      ? message.accountId
                      : undefined,
                }
              : undefined,
          );
          setRecentProjects(
            message.modal === "recentProjects"
              ? {
                  machineId:
                    typeof message.machineId === "string"
                      ? message.machineId
                      : undefined,
                  machineName:
                    typeof message.machineName === "string"
                      ? message.machineName
                      : undefined,
                }
              : undefined,
          );
          /*
           * CDXC:SessionNotes 2026-08-24:
           * Set alongside the other payload-only modals rather than inside the
           * open-message if/else chain below: the dialog validates nothing of
           * its own, so every non-sessionNote open simply clears it. A note
           * open without a session id is dropped — the write would have no
           * target.
           */
          setSessionNote(
            message.modal === "sessionNote" &&
              typeof message.sessionId === "string" &&
              message.sessionId.trim().length > 0
              ? {
                  initialNote:
                    typeof message.initialNote === "string"
                      ? message.initialNote
                      : "",
                  projectId:
                    typeof message.projectId === "string" &&
                    message.projectId.trim()
                      ? message.projectId
                      : undefined,
                  sessionId: message.sessionId,
                  sessionTitle:
                    typeof message.sessionTitle === "string" &&
                    message.sessionTitle.trim()
                      ? message.sessionTitle
                      : undefined,
                }
              : undefined,
          );
          setStashedPrompts(
            message.modal === "stashedPrompts"
              ? {
                  initialScope: isStashedPromptsScope(message.initialScope)
                    ? message.initialScope
                    : undefined,
                  projectId:
                    typeof message.projectId === "string" &&
                    message.projectId.trim()
                      ? message.projectId
                      : undefined,
                  sessionId:
                    typeof message.sessionId === "string" &&
                    message.sessionId.trim()
                      ? message.sessionId
                      : undefined,
                }
              : undefined,
          );
          setExportTranscriptResult(() => {
            if (message.modal !== "exportTranscriptResult") {
              return undefined;
            }
            const agentId =
              typeof message.agentId === "string" && message.agentId.trim()
                ? message.agentId
                : undefined;
            const canReveal = message.canReveal === true;
            const requestId =
              typeof message.requestId === "string" && message.requestId.trim()
                ? message.requestId
                : undefined;
            // A done-stage open (path present) stays supported so a host that
            // already exported can show the result directly; the normal flow
            // opens on the include-toggle options stage.
            const stage: ExportTranscriptModalStage =
              typeof message.path === "string" && message.path.trim()
                ? { agentId, canReveal, path: message.path, stage: "done" }
                : { stage: "options" };
            const targetAgentId =
              typeof message.targetAgentId === "string" &&
              message.targetAgentId.trim()
                ? message.targetAgentId
                : undefined;
            return { agentId, canReveal, requestId, stage, targetAgentId };
          });
          setUpdateAvailable(
            message.modal === "updateAvailable" &&
              typeof message.version === "string" &&
              (message.state === "available" || message.state === "ready")
              ? {
                  notesMarkdown:
                    typeof message.notesMarkdown === "string"
                      ? message.notesMarkdown
                      : "",
                  portable: message.portable === true,
                  state: message.state,
                  version: message.version,
                }
              : undefined,
          );
          if (message.modal === "missingProjectFolder") {
            if (
              typeof message.projectId !== "string" ||
              !message.projectId.trim() ||
              typeof message.projectName !== "string" ||
              !message.projectName.trim() ||
              typeof message.projectPath !== "string" ||
              !message.projectPath.trim()
            ) {
              throw new Error(
                "Missing-project modal request is missing project details.",
              );
            }
            setMissingProjectFolder({
              projectId: message.projectId,
              projectName: message.projectName,
              projectPath: message.projectPath,
            });
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "renameSession") {
            if (!message.sessionId) {
              throw new Error("Rename modal request is missing sessionId.");
            }
            setRenameSession({
              initialTitle: message.initialTitle ?? "",
              sessionAgentIcon:
                typeof message.sessionAgentIcon === "string"
                  ? message.sessionAgentIcon
                  : undefined,
              sessionId: message.sessionId,
            });
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "sidebarSpaceEditor") {
            /*
             * CDXC:Spaces 2026-08-27:
             * Edit mode has to name a Space; create mode must not, or Save would
             * patch whichever Space id happened to be left on the message.
             */
            const spaceEditorMode = message.mode === "edit" ? "edit" : "create";
            if (
              spaceEditorMode === "edit" &&
              (typeof message.spaceId !== "string" || !message.spaceId.trim())
            ) {
              throw new Error("Space editor request is missing spaceId.");
            }
            setSidebarSpaceEditor({
              ...(spaceEditorMode === "create" &&
              typeof message.memberCollectionId === "string" &&
              message.memberCollectionId.trim()
                ? { memberCollectionId: message.memberCollectionId }
                : {}),
              ...(spaceEditorMode === "create" &&
              typeof message.memberProjectId === "string" &&
              message.memberProjectId.trim()
                ? { memberProjectId: message.memberProjectId }
                : {}),
              mode: spaceEditorMode,
              ...(typeof message.remoteMachineId === "string" &&
              message.remoteMachineId.trim()
                ? { remoteMachineId: message.remoteMachineId }
                : {}),
              ...(spaceEditorMode === "edit"
                ? { spaceId: message.spaceId }
                : {}),
              ...(typeof message.spaceColor === "string"
                ? { spaceColor: message.spaceColor }
                : {}),
              ...(typeof message.spaceIcon === "string"
                ? { spaceIcon: message.spaceIcon }
                : {}),
              ...(typeof message.spaceName === "string"
                ? { spaceName: message.spaceName }
                : {}),
            });
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "remoteGxserverInstall") {
            if (
              typeof message.remoteMachineId !== "string" ||
              !message.remoteMachineId.trim() ||
              typeof message.remoteMachineName !== "string" ||
              !message.remoteMachineName.trim()
            ) {
              throw new Error(
                "Remote gxserver install request is missing machine details.",
              );
            }
            /*
             * CDXC:RemoteMachines 2026-06-23-08:30:
             * SSH-reachable Ubuntu and macOS machines that are missing gxserver
             * must keep install approval state populated so Remote Settings
             * shows the Install gxserver button instead of only the warning
             * toast that explains the missing daemon.
             */
            setRemoteGxserverInstall({
              remoteMachineId: message.remoteMachineId,
              remoteMachineName: message.remoteMachineName,
            });
            setDelayedSend(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "delayedSend") {
            if (!message.sessionId) {
              throw new Error(
                "Delayed Actions modal request is missing sessionId.",
              );
            }
            setDelayedSend({
              agentIcon: message.agentIcon,
              closeAfterDoneActive:
                typeof message.closeAfterDoneActive === "boolean"
                  ? message.closeAfterDoneActive
                  : undefined,
              delayedSendDeadlineAt:
                typeof message.delayedSendDeadlineAt === "string"
                  ? message.delayedSendDeadlineAt
                  : undefined,
              delayedSendRemainingLabel:
                typeof message.delayedSendRemainingLabel === "string"
                  ? message.delayedSendRemainingLabel
                  : undefined,
              sendWhenAllProjectSessionsStopActive:
                message.sendWhenAllProjectSessionsStopActive === true,
              sendWhenAgentStopsActive:
                message.sendWhenAgentStopsActive === true,
              sendWhenSpecificAgentFinishes:
                message.sendWhenSpecificAgentFinishes,
              sessionId: message.sessionId,
              supportsSendWhenAgentStops:
                message.supportsSendWhenAgentStops === true,
              supportsSendWhenAllProjectSessionsStop:
                message.supportsSendWhenAllProjectSessionsStop === true,
              title:
                typeof message.title === "string" ? message.title : undefined,
            });
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "worktree") {
            setWorktree({
              projectId:
                typeof message.projectId === "string"
                  ? message.projectId
                  : undefined,
              projectName:
                typeof message.projectName === "string"
                  ? message.projectName
                  : undefined,
              projectPath:
                typeof message.projectPath === "string"
                  ? message.projectPath
                  : undefined,
              remoteMachineId:
                typeof message.remoteMachineId === "string"
                  ? message.remoteMachineId
                  : undefined,
              remoteMachineName:
                typeof message.remoteMachineName === "string"
                  ? message.remoteMachineName
                  : undefined,
            });
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setGitCommit(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "portlessSetup") {
            if (
              message.mode !== "firstSetup" &&
              message.mode !== "standaloneReconfigure"
            ) {
              throw new Error(
                "Portless setup modal request is missing setup mode.",
              );
            }
            if (message.protocol !== "https" && message.protocol !== "http") {
              throw new Error(
                "Portless setup modal request is missing protocol.",
              );
            }
            setPortlessSetup({
              mode: message.mode,
              protocol: message.protocol,
            });
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setGitCommit(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "deleteWorktree") {
            if (!message.worktreeDeleteDraft) {
              throw new Error(
                "Delete worktree modal request is missing worktreeDeleteDraft.",
              );
            }
            setWorktreeDelete(message.worktreeDeleteDraft);
            setWorktreeRename(undefined);
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setGitCommit(undefined);
          } else if (message.modal === "renameWorktree") {
            if (!message.worktreeRenameDraft) {
              throw new Error(
                "Rename worktree modal request is missing worktreeRenameDraft.",
              );
            }
            setWorktreeRename(message.worktreeRenameDraft);
            setWorktreeDelete(undefined);
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setGitCommit(undefined);
          } else if (message.modal === "gitCommit") {
            if (!message.gitCommitDraft) {
              throw new Error(
                "Git commit modal request is missing gitCommitDraft.",
              );
            }
            setGitCommit(message.gitCommitDraft);
            setGitFileDiff(undefined);
            setDelayedSend(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          } else if (message.modal === "gitFileDiff") {
            if (!message.gitFileDiff) {
              throw new Error(
                "Git file diff modal request is missing gitFileDiff.",
              );
            }
            setGitFileDiff(message.gitFileDiff);
            return;
          } else {
            setDelayedSend(undefined);
            setRemoteGxserverInstall(undefined);
            setRenameSession(undefined);
            setWorktree(undefined);
            setPortlessSetup(undefined);
            setWorktreeDelete(undefined);
            setWorktreeRename(undefined);
          }
          if (message.modal === "settings") {
            setGhostexFolderStats(undefined);
            setSettingsInitialSection(
              typeof message.initialSection === "string"
                ? message.initialSection
                : undefined,
            );
            setSettingsInitialSidebarTagsAction(
              message.initialSidebarTagsAction === "createTag"
                ? "createTag"
                : undefined,
            );
            /**
             * CDXC:Workarea 2026-06-04-02:52:
             * Titlebar Tips notices can open Settings directly to a searchable
             * tab and pre-fill the query with a setting name. Carry that state
             * through the full-window modal host instead of requiring titlebar
             * code to know the Settings DOM.
             */
            setSettingsInitialSearchQuery(
              typeof message.initialSearchQuery === "string"
                ? message.initialSearchQuery
                : undefined,
            );
            /**
             * CDXC:RemoteMachines 2026-06-10-09:54:
             * Sidebar Remote machine Edit opens Settings directly on the Remote
             * tab and carries the selected machine id so the modal can scroll to
             * and focus that machine's editable fields.
             */
            setSettingsInitialRemoteMachineId(
              typeof message.initialRemoteMachineId === "string" &&
                message.initialRemoteMachineId.trim()
                ? message.initialRemoteMachineId
                : undefined,
            );
            setSettingsInitialRemoteSection(
              message.initialRemoteSection === "easyConnect" ||
                message.initialRemoteSection === "tailscale"
                ? message.initialRemoteSection
                : undefined,
            );
            setSettingsInitialAgentsSection(
              message.initialAgentsSection === "agentHooks"
                ? message.initialAgentsSection
                : undefined,
            );
            setSettingsInitialCustomViewId(
              typeof message.initialCustomViewId === "string"
                ? message.initialCustomViewId
                : undefined,
            );
            setSettingsInitialViewScopeKey(
              typeof message.initialViewScopeKey === "string"
                ? message.initialViewScopeKey
                : undefined,
            );
            setSettingsInitialTabOverride(
              isSettingsModalTab(message.initialTab)
                ? message.initialTab
                : undefined,
            );
          } else {
            setSettingsInitialSection(undefined);
            setSettingsInitialRemoteMachineId(undefined);
            setSettingsInitialRemoteSection(undefined);
            setSettingsInitialAgentsSection(undefined);
            setSettingsInitialCustomViewId(undefined);
            setSettingsInitialViewScopeKey(undefined);
            setSettingsInitialSearchQuery(undefined);
            setSettingsInitialTabOverride(undefined);
          }
          if (message.modal === "previousSessions") {
            setPreviousSessionsInitialProjectId(message.initialProjectId);
            setPreviousSessionsInitialScope(
              message.initialSessionScope === "external" ||
                message.initialSessionScope === "closed"
                ? message.initialSessionScope
                : "all",
            );
            setPreviousSessionsOpenRequestSequence((sequence) => sequence + 1);
          }
          if (message.modal === "commandPalette") {
            /*
             * CDXC:CommandPalette 2026-06-13-22:18:
             * The Commands tab owns only command fuzzy finding. Preserve an
             * optional caller query as normal search text; Recent Sessions is
             * selected through its own modal id instead of a query prefix.
             *
             * CDXC:CommandPalette 2026-06-15-10:27:
             * Increment a request sequence for every Commands open so React can
             * refocus and apply the requested command query on repeat opens.
             */
            setCommandPaletteInitialQuery(
              typeof message.initialQuery === "string"
                ? message.initialQuery
                : "",
            );
            setCommandPaletteOpenRequestSequence((sequence) => sequence + 1);
            setIsCommandPalettePrewarm(message.prewarm === true);
          } else {
            setCommandPaletteInitialQuery("");
            setCommandPaletteOpenRequestSequence(0);
            setIsCommandPalettePrewarm(false);
          }
          if (message.modal !== "agentsHub") {
            setAgentsHubCatalog(undefined);
            setAgentsHubFileContent(undefined);
            setAgentSyncReport(undefined);
            setAgentSyncPlan(undefined);
            setAgentSyncApplyResult(undefined);
          }
          setActiveModalRequestId(
            typeof message.requestId === "string"
              ? message.requestId
              : undefined,
          );
          setActiveModal(message.modal);
          return;
        }

        if (message.type === "exportSessionTranscriptResult") {
          /*
           * CDXC:TranscriptExport 2026-08-24:
           * Answers only the dialog that asked: the app (gx_store/git/export_transcript.rs) posts this while
           * the Export Transcript dialog sits on its exporting stage, so a
           * result arriving after the user closed it is dropped.
           */
          if (activeModalRef.current !== "exportTranscriptResult") {
            return;
          }
          setExportTranscriptResult((current) => {
            if (!current || current.requestId !== message.requestId) {
              return current;
            }
            if (
              message.ok &&
              typeof message.path === "string" &&
              message.path.trim()
            ) {
              const agentId =
                typeof message.agentId === "string" && message.agentId.trim()
                  ? message.agentId
                  : current.agentId;
              const canReveal = message.canReveal === true;
              return {
                agentId,
                canReveal,
                requestId: current.requestId,
                stage: {
                  agentId,
                  canReveal,
                  path: message.path,
                  stage: "done",
                },
              };
            }
            return {
              ...current,
              stage: {
                message:
                  typeof message.error === "string" && message.error.trim()
                    ? message.error
                    : "The transcript export failed.",
                stage: "failed",
              },
            };
          });
          return;
        }

        if (message.type === "close") {
          if (isAppModalDebugLoggingEnabled()) {
            postAppModalHostMessage(
              {
                details: JSON.stringify({ performanceNow: performance.now() }),
                event: "modalHost.close.received",
                type: "debugLog",
              },
              "AppModals:debug",
            );
          }
          clearActiveModalState();
          return;
        }

        if (message.type === "toast") {
          /**
           * CDXC:Worktrees 2026-06-02-15:27:
           * Git and worktree command execution belongs to gxserver after the ownership split. The app-modal host owns only the visible toast surface, so gxserver-backed progress feedback appears over the full Ghostex window without stealing focus from terminal panes.
           *
           * CDXC:Git 2026-05-30-05:34:
           * Long-running Git actions and agent workflows need persistent status
           * toasts. Reuse Sonner ids so native can update a running toast to a
           * success or error state instead of stacking transient progress notices.
           *
           * CDXC:Git 2026-05-30-06:39:
           * Persistent Git/worktree toasts need an explicit spinner, error
           * toasts need a red-tinted surface, and success toasts need a subtle
           * green tint so users can distinguish completion states even when the
           * toast copy is partially clipped.
           */
          toastTokenRef.current += 1;
          const toastToken = toastTokenRef.current;
          const isPersistent = message.persistent === true;
          const toastDescription = normalizeAppToastDescription(
            message.title,
            typeof message.description === "string"
              ? message.description
              : undefined,
          );
          const toastClassName = [
            "ghostex-app-toast",
            isPersistent ? "ghostex-app-toast-persistent" : "",
            message.level === "error" ? "ghostex-app-toast-error" : "",
            message.level === "success" ? "ghostex-app-toast-success" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const toastOptions = {
            action: message.action
              ? {
                  label: message.action.label,
                  onClick: () => {
                    if (message.action) {
                      vscode.postMessage(message.action.sidebarMessage);
                    }
                  },
                }
              : undefined,
            className: toastClassName,
            description: toastDescription,
            duration: isPersistent ? Number.POSITIVE_INFINITY : undefined,
            id: message.toastId,
            style:
              message.level === "error"
                ? {
                    background:
                      "linear-gradient(0deg, rgba(95, 24, 31, 0.28), rgba(95, 24, 31, 0.28)), var(--app-modal-background)",
                    border: "1px solid rgba(248, 113, 113, 0.32)",
                    color: "#fff1f2",
                  }
                : message.level === "success"
                  ? {
                      background:
                        "linear-gradient(0deg, rgba(22, 101, 52, 0.24), rgba(22, 101, 52, 0.24)), var(--app-modal-background)",
                      border: "1px solid rgba(74, 222, 128, 0.3)",
                      color: "#f0fdf4",
                    }
                  : undefined,
          };
          if (message.level === "error") {
            toast.error(message.title, toastOptions);
          } else if (message.level === "warning") {
            toast.warning(message.title, toastOptions);
          } else if (message.level === "success") {
            toast.success(message.title, toastOptions);
          } else {
            toast.message(message.title, toastOptions);
          }
          if (isPersistent) {
            return;
          }
          window.setTimeout(() => {
            if (toastToken !== toastTokenRef.current) {
              return;
            }
            postAppModalHostMessage(
              {
                keepOpen: activeModalRef.current !== undefined,
                type: "toastDismissed",
              },
              "AppModals:toastDismissed",
            );
          }, 4_200);
          return;
        }

        if (message.type === "sidebarState") {
          if (isAgentsHubCatalogMessage(message.message)) {
            setAgentsHubCatalog(message.message);
            setAgentsHubFileContent(undefined);
            return;
          }
          if (isAgentsHubFileContentMessage(message.message)) {
            setAgentsHubFileContent(message.message);
            return;
          }
          if (isAgentSyncReportMessage(message.message)) {
            setAgentSyncReport(message.message);
            setAgentSyncPlan(undefined);
            return;
          }
          if (isAgentSyncPlanMessage(message.message)) {
            setAgentSyncPlan(message.message);
            setAgentSyncApplyResult(undefined);
            return;
          }
          if (isAgentSyncApplyResultMessage(message.message)) {
            setAgentSyncApplyResult(message.message);
            return;
          }
          if (isGhostexFolderStatsMessage(message.message)) {
            setGhostexFolderStats(message.message);
            return;
          }
          if (isAgentHookStatusMessage(message.message)) {
            setAgentHookStatus(message.message);
            return;
          }
          if (isGhostexCliStatusMessage(message.message)) {
            setGhostexCliStatus(message.message);
            return;
          }
          if (isOSIntegrationStatusMessage(message.message)) {
            setOSIntegrationStatus(message.message);
            return;
          }
          if (isPluginSettingsStatusMessage(message.message)) {
            setPluginSettingsStatus(message.message);
            return;
          }
          // CDXC:Icons 2026-06-25-21:50: Route relayed App Icon state into Settings modal state.
          if (isAppIconStateMessage(message.message)) {
            setAppIconState(message.message);
            return;
          }
          if (
            isPreviousSessionsResultMessage(message.message) ||
            isSessionTranscriptSizesResultMessage(message.message) ||
            isRecentProjectsResultMessage(message.message) ||
            isStashedPromptsTransientMessage(message.message)
          ) {
            window.postMessage(message.message, "*");
            return;
          }
          applySidebarStateMessage(message.message);
        }
      } catch (error) {
        logAppModalError("AppModals:hostMessage", error);
        throw error;
      }
    };

    window.addEventListener("ghostex-app-modal-host-message", handleMessage);
    postAppModalHostMessage(
      {
        nativeWindowHostId: window.__ghostex_APP_MODAL_HOST_ID__,
        type: "ready",
      },
      "AppModals:ready",
    );
    /*
     * CDXC:AppModal 2026-06-11-19:46:
     * Native child windows reuse modal-host.html for the app modal family.
     */
    return () => {
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
    };
  }, []);

  return {
    activeModal,
    activeModalRequestId,
    addProject,
    onboardingFirstRun,
    agentHooksRequired,
    agentsHubCatalog,
    agentsHubFileContent,
    agentSyncApplyResult,
    agentSyncPlan,
    agentSyncReport,
    delayedSend,
    gitCommit,
    gitFileDiff,
    worktreeDelete,
    worktreeRename,
    missingProjectFolder,
    previousSessionsInitialProjectId,
    previousSessionsInitialScope,
    previousSessionsOpenRequestSequence,
    commandPaletteInitialQuery,
    commandPaletteOpenRequestSequence,
    isCommandPalettePrewarm,
    closeGitFileDiff,
    closeModal,
    completeFirstLaunchSetup,
    recentProjects,
    renameSession,
    sessionNote,
    sidebarSpaceEditor,
    stashedPrompts,
    beginExportTranscriptExport,
    exportTranscriptResult,
    updateAvailable,
    remoteGxserverInstall,
    worktree,
    portlessSetup,
    agentHookStatus,
    ghostexCliStatus,
    ghostexFolderStats,
    osIntegrationStatus,
    pluginSettingsStatus,
    // CDXC:Icons 2026-06-25-21:50: Expose App Icon state to the modal component.
    appIconState,
    settingsInitialSection,
    settingsInitialSidebarTagsAction,
    settingsInitialRemoteMachineId,
    settingsInitialRemoteSection,
    settingsInitialAgentsSection,
    settingsInitialCustomViewId,
    settingsInitialViewScopeKey,
    settingsInitialSearchQuery,
    settingsInitialTabOverride,
  };
}

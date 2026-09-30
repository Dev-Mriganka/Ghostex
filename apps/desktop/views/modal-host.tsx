import { bootClientStorage } from "@/packages/client-storage/bootstrap";
import { storageScope } from "@/packages/client-storage";
import { useDesktopDelayedSendAgents } from "./delayed-send-agents";
import { useAppScrollbars } from "@/packages/components/ui/app-scrollbars";
import { createRoot } from "react-dom/client";
import { notifyAccountsConnectionsChanged } from "@/packages/core-ui/accounts/transport";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Toaster, toast } from "sonner";
import { gpuiBootstrapRemoteSetupRpc } from "@/packages/core-ui/remote-setup-modal/gxserver-rpc";
import {
  areLazyModalsSettled,
  lazyModal,
  useLazyModalsSettled,
} from "./lazy-modal";
import {
  buildOnboardingDetectedAgents,
  deriveOnboardingComputerUseState,
} from "./onboarding-host-adapter";
import {
  sidebarAgentIconSupportsSessionHistoryTitleGeneration,
  type SidebarAgentButton,
} from "@/packages/shared/sidebar-agents";
import type { SidebarToExtensionMessage } from "@/packages/shared/session-grid-contract";
import {
  getWorkspaceThemeForeground,
  normalizeWorkspaceThemeColor,
} from "@/packages/shared/workspace-project-appearance";
import {
  installAppModalGlobalErrorLogging,
  logAppModalError,
} from "@/packages/core-ui/app-modal-error-log";
import {
  openAppModal,
  postAppModalHostMessage,
} from "@/packages/core-ui/app-modal-host-bridge";
import { useSidebarStore } from "@/packages/core-ui/sidebar-store";
import {
  DEFAULT_ghostex_SETTINGS,
  getAccentColorForSettings,
} from "@/packages/shared/ghostex-settings";
import "@/packages/core-ui/styles.css";
import { installWindowGlassFlag } from "./workarea-theme";
import {
  PROMPT_AGENT_MODAL_STORAGE_KEYS,
  APP_MODAL_TOAST_BOTTOM_OFFSET_PX,
  isEditableAppModalContextMenuTarget,
} from "./modal-host/modal-state";
import type {
  AppModalKind,
  PromptAgentModalKey,
} from "./modal-host/modal-state";
import {
  GPUI_APP_MODAL_HOST_ID,
  shouldUseOneShotNativeFitHeight,
  measureOneShotNativeFitHeight,
} from "./modal-host/native-fit-height";
import type { AppModalHostMessage } from "./modal-host/host-messages";
import {
  vscode,
  postAppModalDebugLog,
  postSettingsModalDebugLog,
} from "./modal-host/bridge";
import {
  isSettingsModalKind,
  isFirstLaunchSetupModalKind,
  getSettingsInitialTab,
} from "./modal-host/settings-routing";
import {
  requestFirstLaunchInstallSelectedSkills,
  requestFirstLaunchCreateProjectSession,
} from "./modal-host/first-launch";
import {
  ADD_PROJECT_DIALOG_ADD_TIMEOUT_MS,
  ADD_PROJECT_DIALOG_BROWSE_TIMEOUT_MS,
  ADD_PROJECT_DIALOG_DISCOVERY_TIMEOUT_MS,
  ADD_PROJECT_DIALOG_LOOKUP_TIMEOUT_MS,
  ADD_PROJECT_DIALOG_JOB_TIMEOUT_MS,
  requestAddProjectDialogOperation,
  readAddProjectMachineOptions,
  readAddProjectBrowseResult,
  readAddProjectCreateDirectoryResult,
  readAddProjectAddResult,
  readAddProjectDiscovery,
  readAddProjectRepositoryInfo,
  readAddProjectCloneHandle,
  readAddProjectClonePreview,
  readAddProjectCloneJob,
} from "./modal-host/add-project-requests";
import { useModalStateFromNative } from "./modal-host/use-modal-state-from-native";
import { isModalRenderable } from "./modal-host/message-guards";

const AddProjectModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/add-project-modal/add-project-modal"))
      .AddProjectModal,
);
const AgentHooksRequiredModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/agent-hooks-required-modal"))
      .AgentHooksRequiredModal,
);
const CommandPalette = lazyModal(
  async () =>
    (await import("@/packages/core-ui/command-palette")).CommandPalette,
);
const DelayedSendModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/delayed-send-modal")).DelayedSendModal,
);
const StashedPromptsModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/stashed-prompts-modal"))
      .StashedPromptsModal,
);
const PortlessSetupModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/portless-setup-modal"))
      .PortlessSetupModal,
);
const PreviousSessionsModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/previous-sessions-modal"))
      .PreviousSessionsModal,
);
const RecentProjectsModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/recent-projects-modal"))
      .RecentProjectsModal,
);
const RemoteGxserverInstallModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/remote-gxserver-install-modal"))
      .RemoteGxserverInstallModal,
);
const RemoteSetupModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/remote-setup-modal")).RemoteSetupModal,
);
const SettingsModal = lazyModal(
  async () => (await import("@/packages/core-ui/settings-modal")).SettingsModal,
);
const ExportTranscriptModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/export-transcript-result-modal"))
      .ExportTranscriptModal,
);
const SessionNoteModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/session-note-modal")).SessionNoteModal,
);
const SessionRenameModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/session-rename-modal"))
      .SessionRenameModal,
);
const SpaceEditorModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/space-editor-modal")).SpaceEditorModal,
);
const UpdateAvailableModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/update-available-modal"))
      .UpdateAvailableModal,
);
const WorktreeDeleteModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/worktree-delete-modal"))
      .WorktreeDeleteModal,
);
const WorktreeRenameModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/worktree-rename-modal"))
      .WorktreeRenameModal,
);
const WorktreeCreateModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/worktree-create-modal"))
      .WorktreeCreateModal,
);
const MissingProjectFolderModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/missing-project-folder-modal"))
      .MissingProjectFolderModal,
);
const AgentsHubModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/agents-hub-modal")).AgentsHubModal,
);
const OnboardingModal = lazyModal(
  async () => (await import("@/packages/core-ui/onboarding")).OnboardingModal,
);
const GitCommitModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/git-commit-modal")).GitCommitModal,
);
const GitFileDiffModal = lazyModal(
  async () =>
    (await import("@/packages/core-ui/git-file-diff-modal")).GitFileDiffModal,
);

const clientStorage = storageScope(["commitAgent", "renameAgent"]);

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        ghostexAppModalHost?: {
          postMessage: (message: unknown) => void;
        };
        ghostexNativeHost?: {
          postMessage: (message: unknown) => void;
        };
        ghostexNativeHostDiagnostics?: {
          postMessage: (message: unknown) => void;
        };
      };
    };
    __ghostex_APP_MODAL_HOST_ID__?: string;
    __ghostex_APP_MODAL_HOST_SURFACE__?: "main" | "nativeWindow";
  }
}

function readPromptAgentModalOverride(
  modal: PromptAgentModalKey,
): string | undefined {
  const value = clientStorage
    .getItem(PROMPT_AGENT_MODAL_STORAGE_KEYS[modal])
    ?.trim();
  return value || undefined;
}

function writePromptAgentModalOverride(
  modal: PromptAgentModalKey,
  agentId: string,
): void {
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) {
    clientStorage.removeItem(PROMPT_AGENT_MODAL_STORAGE_KEYS[modal]);
    return;
  }
  clientStorage.setItem(
    PROMPT_AGENT_MODAL_STORAGE_KEYS[modal],
    normalizedAgentId,
  );
}

function clearPromptAgentModalOverrides(): void {
  for (const key of Object.values(PROMPT_AGENT_MODAL_STORAGE_KEYS)) {
    clientStorage.removeItem(key);
  }
}

function resolvePromptAgentModalSelection(
  agents: readonly SidebarAgentButton[],
  savedAgentId: string | undefined,
  defaultAgentId: string | undefined,
): string | undefined {
  const commandAgents = agents.filter((agent) => agent.command?.trim());
  return (
    commandAgents.find((agent) => agent.agentId === savedAgentId)?.agentId ??
    commandAgents.find((agent) => agent.agentId === defaultAgentId)?.agentId ??
    commandAgents[0]?.agentId
  );
}

function AppModalHost() {
  useAppScrollbars();
  const lazyModalsSettled = useLazyModalsSettled();
  const {
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
    remoteGxserverInstall,
    renameSession,
    sessionNote,
    sidebarSpaceEditor,
    stashedPrompts,
    beginExportTranscriptExport,
    exportTranscriptResult,
    updateAvailable,
    worktree,
    agentHookStatus,
    ghostexCliStatus,
    ghostexFolderStats,
    osIntegrationStatus,
    pluginSettingsStatus,
    // CDXC:Icons 2026-06-25-21:50: Pull relayed App Icon state for the Settings modal.
    appIconState,
    portlessSetup,
    settingsInitialSection,
    settingsInitialSidebarTagsAction,
    settingsInitialRemoteMachineId,
    settingsInitialRemoteSection,
    settingsInitialAgentsSection,
    settingsInitialCustomViewId,
    settingsInitialViewScopeKey,
    settingsInitialSearchQuery,
    settingsInitialTabOverride,
  } = useModalStateFromNative();
  const [agentHookStatusLoading, setAgentHookStatusLoading] = useState(false);
  const [ghostexCliStatusLoading, setGhostexCliStatusLoading] = useState(false);
  const [ghostexFolderStatsLoading, setGhostexFolderStatsLoading] =
    useState(false);
  const [osIntegrationStatusLoading, setOSIntegrationStatusLoading] =
    useState(false);
  const [pluginSettingsStatusLoading, setPluginSettingsStatusLoading] =
    useState(false);
  const [onboardingPickedProjectFolder, setOnboardingPickedProjectFolder] =
    useState<string>();
  const [
    onboardingComputerUseInstallRequested,
    setOnboardingComputerUseInstallRequested,
  ] = useState(false);
  const isOnboardingModal = activeModal === "onboarding";
  // Memoized so the onboarding scan log sees a new `agents` array only when a new detection payload arrived.
  const onboardingAgents = useMemo(
    () => buildOnboardingDetectedAgents(agentHookStatus),
    [agentHookStatus],
  );
  const onboardingComputerUseState = deriveOnboardingComputerUseState({
    ghostexCliStatus,
    installRequested: onboardingComputerUseInstallRequested,
  });
  useEffect(() => {
    if (isOnboardingModal) {
      return;
    }
    setOnboardingPickedProjectFolder(undefined);
    setOnboardingComputerUseInstallRequested(false);
  }, [isOnboardingModal]);
  useEffect(() => {
    // The Computer Use install request is fulfilled once both the driver and the skill report installed.
    if (
      ghostexCliStatus?.cuaDriverInstalled === true &&
      ghostexCliStatus.computerUseSkillInstalled === true
    ) {
      setOnboardingComputerUseInstallRequested(false);
    }
  }, [ghostexCliStatus]);
  useEffect(() => {
    /*
     * The Trycua installer runs as a background job of the desktop app; its exit reaches the modal host as the
     * `installCuaDriver` settings-action status (`FinishDesktopControlSetup`). A failed report ends the
     * onboarding's "installing" state; native already shows the failure toast for it.
     */
    if (!isOnboardingModal) {
      return;
    }
    const handleMessage = (event: Event) => {
      const message = (event as CustomEvent<AppModalHostMessage>).detail;
      if (
        !message ||
        typeof message !== "object" ||
        message.type !== "sidebarState"
      ) {
        return;
      }
      const status = message.message;
      if (
        !status ||
        typeof status !== "object" ||
        !("type" in status) ||
        status.type !== "settingsActionStatus" ||
        !("action" in status) ||
        status.action !== "installCuaDriver" ||
        !("available" in status) ||
        status.available !== false
      ) {
        return;
      }
      setOnboardingComputerUseInstallRequested(false);
    };
    window.addEventListener("ghostex-app-modal-host-message", handleMessage);
    return () => {
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
    };
  }, [isOnboardingModal]);
  useEffect(() => {
    /*
     * The native folder dialog answers `pickFirstLaunchProjectFolder` with this host message, and the
     * onboarding takes the path as a prop.
     */
    if (!isOnboardingModal) {
      return;
    }
    const handlePickedFolder = (event: Event) => {
      const message = (event as CustomEvent<AppModalHostMessage>).detail;
      if (
        !message ||
        typeof message !== "object" ||
        message.type !== "firstLaunchProjectFolderPicked"
      ) {
        return;
      }
      const path = message.path.trim();
      if (path) {
        setOnboardingPickedProjectFolder(path);
      }
    };
    window.addEventListener(
      "ghostex-app-modal-host-message",
      handlePickedFolder,
    );
    return () => {
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handlePickedFolder,
      );
    };
  }, [isOnboardingModal]);
  useEffect(() => {
    // OnboardingModal only exposes a rescan, so the host requests agent detection when it opens.
    if (!isOnboardingModal || agentHookStatus || agentHookStatusLoading) {
      return;
    }
    setAgentHookStatusLoading(true);
    vscode.postMessage({ type: "requestAgentHookStatus" });
  }, [agentHookStatus, agentHookStatusLoading, isOnboardingModal]);
  const sentNativeFitHeightMeasurementKeysRef = useRef<Set<string>>(new Set());
  const previousSettingsRenderStateLogRef = useRef("");
  const previousFirstLaunchSetupRenderStateLogRef = useRef("");
  const latestSettingsPresentedLogDetailsRef = useRef<
    Record<string, string | number | boolean | null | undefined>
  >({});
  const latestFirstLaunchSetupPresentedLogDetailsRef = useRef<
    Record<string, string | number | boolean | null | undefined>
  >({});
  const settings = useSidebarStore((state) => state.hud.settings);
  const appIconPickerUnavailable = useSidebarStore(
    (state) => state.hud.appIconPickerUnavailable === true,
  );
  const windowGlassBlockedBySystem = useSidebarStore(
    (state) => state.hud.windowGlassBlockedBySystem === true,
  );
  const revision = useSidebarStore((state) => state.revision);
  const agents = useSidebarStore((state) => state.hud.agents);
  const commands = useSidebarStore((state) => state.hud.commands);
  const projectSettingsProjects = useSidebarStore(
    (state) => state.hud.projectSettingsProjects ?? [],
  );
  const projectViewSpaces = useSidebarStore(
    (state) => state.hud.projectViewSpaces,
  );
  const projectViewProjects = useSidebarStore(
    (state) => state.hud.projectViewProjects,
  );
  const portless = useSidebarStore((state) => state.hud.portless);
  const customThemeColor = useSidebarStore(
    (state) => state.hud.customThemeColor,
  );
  const theme = useSidebarStore((state) => state.hud.theme);
  const delayedSendAgents = useDesktopDelayedSendAgents(
    activeModal === "delayedSend" ? delayedSend?.sessionId : undefined,
  );
  const delayedSendCloseAfterDoneActive = useSidebarStore((state) => {
    const sessionId = delayedSend?.sessionId;
    if (!sessionId) {
      return false;
    }
    return (
      delayedSend.closeAfterDoneActive ??
      state.sessionsById[sessionId]?.closeAfterDone ??
      state.hud.commandSessionIndicators.find(
        (session) => session.sessionId === sessionId,
      )?.closeAfterDone ??
      false
    );
  });
  const [gitCommitPromptAgentId, setGitCommitPromptAgentId] = useState(() =>
    readPromptAgentModalOverride("gitCommit"),
  );
  const [renamePromptAgentId, setRenamePromptAgentId] = useState(() =>
    readPromptAgentModalOverride("renameSession"),
  );
  const previousDefaultPromptAgentIdRef = useRef(
    settings?.defaultPromptAgentId,
  );
  const resolvedGitCommitPromptAgentId = resolvePromptAgentModalSelection(
    agents,
    gitCommitPromptAgentId,
    settings?.defaultPromptAgentId,
  );
  const resolvedRenamePromptAgentId = resolvePromptAgentModalSelection(
    agents,
    renamePromptAgentId,
    settings?.defaultPromptAgentId,
  );
  /*
   * CDXC:AgentProviders 2026-06-19-08:58:
   * The modal store starts with DEFAULT_ghostex_SETTINGS before the native
   * hydrate arrives. Keep Settings and First Launch closed until revision > 0
   * so their full-setting save messages cannot seed gxserver-owned Default
   * Prompt Agent back to Codex from a pre-hydrate placeholder.
   */
  const hasNativeSettingsHydrated = revision > 0;
  const isSettingsModal = isSettingsModalKind(activeModal);
  const isSettingsRenderable = isSettingsModal && hasNativeSettingsHydrated;
  const isFirstLaunchSetupModal = isFirstLaunchSetupModalKind(activeModal);
  const isFirstLaunchSetupRenderable =
    isFirstLaunchSetupModal && hasNativeSettingsHydrated;
  const settingsInitialTab =
    settingsInitialTabOverride ?? getSettingsInitialTab(activeModal);
  const hasSettings = settings !== undefined;
  const hasSettingsInitialSection = settingsInitialSection !== undefined;
  const hasSettingsInitialRemoteMachineId =
    settingsInitialRemoteMachineId !== undefined;
  const hasSettingsInitialSearchQuery =
    settingsInitialSearchQuery !== undefined;
  const isBaseActiveModalRenderable = isModalRenderable({
    activeModal,
    addProject,
    agentHooksRequired,
    delayedSend,
    gitCommit,
    gitFileDiff,
    worktreeDelete,
    worktreeRename,
    missingProjectFolder,
    remoteGxserverInstall,
    recentProjects,
    renameSession,
    sessionNote,
    sidebarSpaceEditor,
    stashedPrompts,
    exportTranscriptResult,
    updateAvailable,
    settings,
    worktree,
    portlessSetup,
  });
  /*
   * CDXC:DesignSystem 2026-09-09 DECISION:
   * User: every Quick Access page appears immediately, then shows its shared spinner-and-text state only if loading is still pending after 500ms. This supersedes hiding Projects and Sessions until their first request resolves.
   */
  /*
   * CDXC:Settings 2026-06-20-23:02:
   * Settings must not send native `presented` from the generic modal-ready path
   * while the actual Settings component is still closed on revision 0. Tie
   * Settings-family presentation to the same hydrated renderability condition
   * used by SettingsModal so native cannot believe Settings is open while
   * React is showing no Settings UI.
   */
  const isActiveModalRenderable =
    isBaseActiveModalRenderable &&
    (!isSettingsModal || isSettingsRenderable) &&
    (!isFirstLaunchSetupModal || isFirstLaunchSetupRenderable);
  /*
   * CDXC:Diagnostics 2026-06-20-20:24:
   * Settings presented diagnostics must not add sidebar revision or hydration
   * fields to the `presented` effect dependencies, because that would re-send
   * native presented messages on ordinary sidebar updates. Keep the latest safe
   * diagnostic payload in a ref while preserving the original present trigger.
   */
  latestSettingsPresentedLogDetailsRef.current = {
    activeModal,
    hasNativeSettingsHydrated,
    hasSettings,
    hasSettingsInitialRemoteMachineId,
    hasSettingsInitialSearchQuery,
    hasSettingsInitialSection,
    isActiveModalRenderable,
    isBaseActiveModalRenderable,
    isSettingsRenderable,
    nativeWindowSurface:
      window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
    revision,
    settingsInitialTab,
  };
  latestFirstLaunchSetupPresentedLogDetailsRef.current = {
    activeModal,
    hasNativeSettingsHydrated,
    hasSettings,
    isActiveModalRenderable,
    isBaseActiveModalRenderable,
    isFirstLaunchSetupModal,
    isFirstLaunchSetupRenderable,
    nativeWindowSurface:
      window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
    revision,
  };

  useEffect(() => {
    if (!isSettingsModalKind(activeModal)) {
      previousSettingsRenderStateLogRef.current = "";
      return;
    }
    const signature = JSON.stringify({
      activeModal,
      hasNativeSettingsHydrated,
      hasSettings,
      hasSettingsInitialRemoteMachineId,
      hasSettingsInitialSearchQuery,
      hasSettingsInitialSection,
      isActiveModalRenderable,
      isBaseActiveModalRenderable,
      isSettingsRenderable,
      nativeWindowSurface:
        window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
      revision,
      settingsInitialTab,
    });
    if (previousSettingsRenderStateLogRef.current === signature) {
      return;
    }
    previousSettingsRenderStateLogRef.current = signature;
    postSettingsModalDebugLog("modalHost.settings.renderState", {
      activeModal,
      hasNativeSettingsHydrated,
      hasSettings,
      hasSettingsInitialRemoteMachineId,
      hasSettingsInitialSearchQuery,
      hasSettingsInitialSection,
      isActiveModalRenderable,
      isBaseActiveModalRenderable,
      isSettingsRenderable,
      nativeWindowSurface:
        window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
      revision,
      settingsInitialTab,
    });
  }, [
    activeModal,
    hasNativeSettingsHydrated,
    hasSettings,
    hasSettingsInitialRemoteMachineId,
    hasSettingsInitialSearchQuery,
    hasSettingsInitialSection,
    isActiveModalRenderable,
    isBaseActiveModalRenderable,
    isSettingsRenderable,
    revision,
    settingsInitialTab,
  ]);

  useEffect(() => {
    if (!isFirstLaunchSetupModalKind(activeModal)) {
      previousFirstLaunchSetupRenderStateLogRef.current = "";
      return;
    }
    /*
     * CDXC:Diagnostics 2026-06-29-22:08:
     * Setup can feel slow before it ever becomes visible because native waits
     * for React renderability before presenting the child NSPanel. Log each
     * distinct setup renderability state with no settings values or user text.
     */
    const signature = JSON.stringify({
      activeModal,
      hasNativeSettingsHydrated,
      hasSettings,
      isActiveModalRenderable,
      isBaseActiveModalRenderable,
      isFirstLaunchSetupRenderable,
      nativeWindowSurface:
        window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
      revision,
    });
    if (previousFirstLaunchSetupRenderStateLogRef.current === signature) {
      return;
    }
    previousFirstLaunchSetupRenderStateLogRef.current = signature;
    postAppModalDebugLog("modalHost.setup.renderState", {
      activeModal,
      hasNativeSettingsHydrated,
      hasSettings,
      isActiveModalRenderable,
      isBaseActiveModalRenderable,
      isFirstLaunchSetupRenderable,
      nativeWindowSurface:
        window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow",
      revision,
    });
  }, [
    activeModal,
    hasNativeSettingsHydrated,
    hasSettings,
    isActiveModalRenderable,
    isBaseActiveModalRenderable,
    isFirstLaunchSetupRenderable,
    revision,
  ]);

  useEffect(() => {
    const previousDefaultPromptAgentId =
      previousDefaultPromptAgentIdRef.current;
    const nextDefaultPromptAgentId = settings?.defaultPromptAgentId;
    previousDefaultPromptAgentIdRef.current = nextDefaultPromptAgentId;
    if (
      !previousDefaultPromptAgentId ||
      previousDefaultPromptAgentId === nextDefaultPromptAgentId
    ) {
      return;
    }

    /*
     * CDXC:AgentLauncher 2026-05-29-10:53:
     * Per-modal prompt-agent choices are temporary overrides. When the global
     * Settings default prompt agent changes, clear every modal override so Git
     * commit review and Rename Generate Name immediately show the new default.
     */
    clearPromptAgentModalOverrides();
    setGitCommitPromptAgentId(undefined);
    setRenamePromptAgentId(undefined);
  }, [settings?.defaultPromptAgentId]);

  const updateGitCommitPromptAgentId = useCallback((agentId: string) => {
    writePromptAgentModalOverride("gitCommit", agentId);
    setGitCommitPromptAgentId(agentId);
  }, []);

  const updateRenamePromptAgentId = useCallback((agentId: string) => {
    writePromptAgentModalOverride("renameSession", agentId);
    setRenamePromptAgentId(agentId);
  }, []);

  useEffect(() => {
    if (!activeModal) {
      sentNativeFitHeightMeasurementKeysRef.current.clear();
    }
  }, [activeModal]);

  useLayoutEffect(() => {
    if (
      window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow" &&
      shouldUseOneShotNativeFitHeight(activeModal)
    ) {
      document.body.dataset.appModalFitHeight = "true";
    } else {
      delete document.body.dataset.appModalFitHeight;
    }
    return () => {
      delete document.body.dataset.appModalFitHeight;
    };
  }, [activeModal]);

  /**
   * CDXC:AppModal 2026-05-08-09:00
   * Native should unhide the transparent modal webview only after the requested
   * modal has enough state to render. This prevents a blank overlay flash while
   * sidebar state is still syncing into the app-modal host.
   *
   * CDXC:AppModal 2026-06-30-16:08:
   * Approved compact native-window modals send their fitted React dialog height
   * once before `presented`, so AppKit can resize the child window without
   * later height churn while the user interacts with the form.
   */
  useLayoutEffect(() => {
    if (!activeModal || !isActiveModalRenderable || !areLazyModalsSettled()) {
      return;
    }
    const presentedMessage: {
      modal: AppModalKind;
      requestId?: string;
      type: "presented";
    } = {
      modal: activeModal,
      type: "presented",
    };
    if (activeModalRequestId) {
      presentedMessage.requestId = activeModalRequestId;
    }
    if (isSettingsModalKind(activeModal)) {
      postSettingsModalDebugLog(
        "modalHost.settings.presented.sent",
        latestSettingsPresentedLogDetailsRef.current,
      );
    }
    if (isFirstLaunchSetupModalKind(activeModal)) {
      postAppModalDebugLog(
        "modalHost.setup.presented.sent",
        latestFirstLaunchSetupPresentedLogDetailsRef.current,
      );
    }
    if (
      window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow" &&
      shouldUseOneShotNativeFitHeight(activeModal)
    ) {
      const measurementKey = `${activeModal}:${activeModalRequestId ?? "none"}`;
      if (!sentNativeFitHeightMeasurementKeysRef.current.has(measurementKey)) {
        const measuredHeight = measureOneShotNativeFitHeight(activeModal);
        if (measuredHeight) {
          sentNativeFitHeightMeasurementKeysRef.current.add(measurementKey);
          const contentHeightMeasuredMessage: {
            height: number;
            modal: AppModalKind;
            nativeWindowHostId?: string;
            requestId?: string;
            type: "contentHeightMeasured";
          } = {
            height: measuredHeight,
            modal: activeModal,
            type: "contentHeightMeasured",
          };
          if (window.__ghostex_APP_MODAL_HOST_ID__) {
            contentHeightMeasuredMessage.nativeWindowHostId =
              window.__ghostex_APP_MODAL_HOST_ID__;
          }
          if (activeModalRequestId) {
            contentHeightMeasuredMessage.requestId = activeModalRequestId;
          }
          postAppModalHostMessage(
            contentHeightMeasuredMessage,
            "AppModals:contentHeightMeasured",
          );
        }
      }
    }
    postAppModalHostMessage(presentedMessage, "AppModals:presented");
  }, [
    activeModal,
    activeModalRequestId,
    isActiveModalRenderable,
    lazyModalsSettled,
  ]);

  useEffect(() => {
    if (activeModal !== "settings") {
      setGhostexFolderStatsLoading(false);
    }
  }, [activeModal]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const suppressModalWebviewContextMenu = (event: MouseEvent) => {
      if (isEditableAppModalContextMenuTarget(event.target)) {
        return;
      }

      /**
       * CDXC:ContextMenus 2026-05-15-18:15:
       * Right-clicking modal backdrops, blank modal chrome, or modal buttons
       * must not expose WKWebView's native Reload menu. Suppress the webview
       * default while a modal is active, but keep editable fields eligible for
       * their normal editing context menus.
       */
      event.preventDefault();
    };

    document.addEventListener(
      "contextmenu",
      suppressModalWebviewContextMenu,
      true,
    );
    return () => {
      document.removeEventListener(
        "contextmenu",
        suppressModalWebviewContextMenu,
        true,
      );
    };
  }, [activeModal]);

  useEffect(() => {
    if (ghostexFolderStats) {
      setGhostexFolderStatsLoading(false);
    }
  }, [ghostexFolderStats]);

  useEffect(() => {
    /*
     * CDXC:Onboarding 2026-09-11 WHY:
     * The desktop host posts a merged `agentHookStatus` after each provider probe; only the walk's final
     * post carries `complete: true`. Clearing the loading marker on the first partial payload made the
     * onboarding scan log print "Scan complete." while providers were still being probed. Payloads without
     * the field (install/uninstall replies, remote hosts) are complete.
     */
    if (agentHookStatus && agentHookStatus.complete !== false) {
      setAgentHookStatusLoading(false);
    }
  }, [agentHookStatus]);

  useEffect(() => {
    if (ghostexCliStatus) {
      setGhostexCliStatusLoading(false);
    }
  }, [ghostexCliStatus]);

  useEffect(() => {
    if (osIntegrationStatus) {
      setOSIntegrationStatusLoading(false);
    }
  }, [osIntegrationStatus]);

  useEffect(() => {
    if (pluginSettingsStatus) {
      setPluginSettingsStatusLoading(false);
    }
  }, [pluginSettingsStatus]);

  useEffect(() => {
    if (
      activeModal !== "settings" ||
      pluginSettingsStatus ||
      pluginSettingsStatusLoading
    ) {
      return;
    }
    setPluginSettingsStatusLoading(true);
    vscode.postMessage({ type: "requestPluginSettingsStatus" });
  }, [activeModal, pluginSettingsStatus, pluginSettingsStatusLoading]);

  useEffect(() => {
    /*
     * Settings requests CLI status only when Integrations is active. Preserve
     * that request's loading marker here; clearing it makes the still-unknown
     * status render as "Not installed" until the native probe finishes.
     */
    if (activeModal === "settings") {
      return;
    }
    if (!isFirstLaunchSetupModalKind(activeModal)) {
      setGhostexCliStatusLoading(false);
      return;
    }
    if (ghostexCliStatus || ghostexCliStatusLoading) {
      return;
    }
    /**
     * CDXC:Onboarding 2026-05-26-17:12:
     * The production first-launch modal should reflect the app-bundled CLI that
     * native auto-links on startup. Request native PATH inspection when the setup
     * flow opens and render Storybook through the same status prop.
     *
     * CDXC:Onboarding 2026-05-27-02:41:
     * Tips & Tricks now opens the first-launch modal, so the legacy modal id must
     * receive the same CLI status request while old menu messages are still in use.
     */
    setGhostexCliStatusLoading(true);
    vscode.postMessage({ type: "requestGhostexCliStatus" });
  }, [activeModal, ghostexCliStatus, ghostexCliStatusLoading]);

  useEffect(() => {
    /**
     * CDXC:Onboarding 2026-09-15 WHY:
     * The onboarding is a dark-only design that fills its window, so that window publishes the dark theme even
     * when the app theme is light. Without this the toasts stacked over it took the light modal background and
     * rendered as pale green and pink cards with white text.
     */
    const pageTheme: typeof theme = isOnboardingModal ? "dark-2" : theme;
    document.body.dataset.sidebarTheme = pageTheme;
    document.documentElement.dataset.appAppearance =
      pageTheme === "plain-light" || pageTheme.startsWith("light-")
        ? "light"
        : "dark";
    /**
     * CDXC:Theming 2026-08-24:
     * Modals read their accent from --ghostex-accent, so publish the
     * tint-derived accent onto the modal host body alongside the workspace
     * theme variables. Before the HUD settings arrive the default tint's accent
     * is the correct value.
     */
    document.body.style.setProperty(
      "--ghostex-accent",
      getAccentColorForSettings(settings),
    );
    /** CDXC:Theming 2026-09-23 SEE-ALSO: the `.gx-app-modal` tokens in packages/core-ui/styles/modals.css derive every modal's surfaces from this. */
    const themeChrome =
      pageTheme === "plain-light" || pageTheme.startsWith("light-")
        ? settings?.customSidebarTitlebarLightBackgroundColor
        : settings?.customSidebarTitlebarBackgroundColor;
    if (themeChrome)
      document.body.style.setProperty("--gx-theme-chrome", themeChrome);
    else document.body.style.removeProperty("--gx-theme-chrome");
    const normalizedThemeColor = normalizeWorkspaceThemeColor(customThemeColor);
    if (normalizedThemeColor) {
      document.body.dataset.sidebarCustomTheme = "true";
      document.body.style.setProperty(
        "--workspace-sidebar-theme-color",
        normalizedThemeColor,
      );
      document.body.style.setProperty(
        "--workspace-sidebar-theme-foreground",
        getWorkspaceThemeForeground(normalizedThemeColor),
      );
    } else {
      delete document.body.dataset.sidebarCustomTheme;
      document.body.style.removeProperty("--workspace-sidebar-theme-color");
      document.body.style.removeProperty(
        "--workspace-sidebar-theme-foreground",
      );
    }

    return () => {
      delete document.body.dataset.sidebarTheme;
      delete document.body.dataset.sidebarCustomTheme;
      document.body.style.removeProperty("--workspace-sidebar-theme-color");
      document.body.style.removeProperty(
        "--workspace-sidebar-theme-foreground",
      );
      document.body.style.removeProperty("--ghostex-accent");
      document.body.style.removeProperty("--gx-theme-chrome");
    };
  }, [
    customThemeColor,
    isOnboardingModal,
    settings?.customSidebarTitlebarBackgroundTintColor,
    settings?.darkThemePreset,
    theme,
  ]);

  return (
    <>
      <PreviousSessionsModal
        initialProjectId={previousSessionsInitialProjectId}
        initialScope={previousSessionsInitialScope}
        openRequestSequence={previousSessionsOpenRequestSequence}
        isOpen={activeModal === "previousSessions"}
        onClose={closeModal}
        shouldPreload={
          activeModal === "commandPalette" ||
          activeModal === "recentProjects" ||
          activeModal === "stashedPrompts"
        }
        vscode={vscode}
      />
      <UpdateAvailableModal
        isOpen={
          activeModal === "updateAvailable" && updateAvailable !== undefined
        }
        onCancel={closeModal}
        onDownload={() => {
          postAppModalHostMessage(
            { type: "downloadGhostexUpdate" },
            "AppModals:update:download",
          );
        }}
        onRestart={() => {
          postAppModalHostMessage(
            { type: "restartAndUpdateGhostex" },
            "AppModals:update:restart",
          );
        }}
        update={updateAvailable}
      />
      <RecentProjectsModal
        isOpen={
          activeModal === "recentProjects" && recentProjects !== undefined
        }
        machineId={recentProjects?.machineId}
        machineName={recentProjects?.machineName}
        onClose={closeModal}
        vscode={vscode}
      />
      <StashedPromptsModal
        initialScope={stashedPrompts?.initialScope}
        isOpen={
          activeModal === "stashedPrompts" && stashedPrompts !== undefined
        }
        onClose={closeModal}
        projectId={stashedPrompts?.projectId}
        sessionId={stashedPrompts?.sessionId}
        vscode={vscode}
      />
      <AgentHooksRequiredModal
        agentName={agentHooksRequired?.agentName ?? "this agent"}
        hookAgentId={agentHooksRequired?.hookAgentId}
        isOpen={
          activeModal === "agentHooksRequired" &&
          agentHooksRequired !== undefined
        }
        onClose={closeModal}
        onInstall={() => {
          if (!agentHooksRequired) {
            return;
          }
          vscode.postMessage({
            agentId: agentHooksRequired.agentId,
            groupId: agentHooksRequired.groupId,
            hookAgentId: agentHooksRequired.hookAgentId,
            accountId: agentHooksRequired.accountId,
            installHooks: true,
            type: "confirmAgentHookLaunch",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
        onSkip={() => {
          if (!agentHooksRequired) {
            return;
          }
          vscode.postMessage({
            agentId: agentHooksRequired.agentId,
            groupId: agentHooksRequired.groupId,
            hookAgentId: agentHooksRequired.hookAgentId,
            accountId: agentHooksRequired.accountId,
            installHooks: false,
            type: "confirmAgentHookLaunch",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
      />
      <MissingProjectFolderModal
        isOpen={
          activeModal === "missingProjectFolder" &&
          missingProjectFolder !== undefined
        }
        onCancel={closeModal}
        onLocate={() => {
          if (!missingProjectFolder) {
            return;
          }
          vscode.postMessage({
            projectId: missingProjectFolder.projectId,
            type: "pickReplacementProjectFolder",
          });
        }}
        onRemove={() => {
          if (!missingProjectFolder) {
            return;
          }
          vscode.postMessage({
            projectId: missingProjectFolder.projectId,
            type: "removeProject",
          });
          closeModal();
        }}
        projectName={missingProjectFolder?.projectName ?? "this project"}
        projectPath={missingProjectFolder?.projectPath ?? ""}
      />
      <RemoteGxserverInstallModal
        isOpen={
          activeModal === "remoteGxserverInstall" &&
          remoteGxserverInstall !== undefined
        }
        machineName={remoteGxserverInstall?.remoteMachineName ?? "Remote"}
        onApprove={() => {
          if (!remoteGxserverInstall) {
            return;
          }
          vscode.postMessage({
            installApproved: true,
            remoteMachineId: remoteGxserverInstall.remoteMachineId,
            type: "reconnectRemoteMachine",
          });
          closeModal();
        }}
        onCancel={closeModal}
      />
      <RemoteSetupModal
        isOpen={activeModal === "remoteSetup"}
        onClose={closeModal}
        onOpenExternalUrl={(url) => {
          vscode.postMessage({ type: "openExternalUrl", url });
        }}
        rpc={gpuiBootstrapRemoteSetupRpc()}
        tailscaleEnabled={
          (settings ?? DEFAULT_ghostex_SETTINGS).remoteTailscaleEnabled
        }
      />
      {/*
       * CDXC:AddProject 2026-07-30:
       * The shared add-project dialog replaces both the native OS folder picker
       * and the remote project picker. It is transport-free by design, so every
       * callback here is the same bounded host round trip and the machine id it
       * was handed is the only routing information that crosses back.
       */}
      <AddProjectModal
        addProject={async ({ createIfMissing, machineId, path }) =>
          readAddProjectAddResult(
            await requestAddProjectDialogOperation(
              "add",
              ADD_PROJECT_DIALOG_ADD_TIMEOUT_MS,
              {
                machineId,
                params: { createIfMissing, path },
              },
            ),
            machineId,
            path,
          )
        }
        browse={async ({ cwd, machineId, partialPath, inspectPath }) =>
          readAddProjectBrowseResult(
            await requestAddProjectDialogOperation(
              "browse",
              ADD_PROJECT_DIALOG_BROWSE_TIMEOUT_MS,
              {
                machineId,
                params: {
                  ...(cwd ? { cwd } : {}),
                  partialPath,
                  ...(inspectPath ? { inspectPath } : {}),
                },
              },
            ),
          )
        }
        cancelCloneJob={async ({ jobId, machineId }) => {
          await requestAddProjectDialogOperation(
            "cancelCloneJob",
            ADD_PROJECT_DIALOG_JOB_TIMEOUT_MS,
            {
              machineId,
              params: { jobId },
            },
          );
        }}
        createDirectory={async ({ machineId, name, parentPath }) =>
          readAddProjectCreateDirectoryResult(
            await requestAddProjectDialogOperation(
              "createDirectory",
              ADD_PROJECT_DIALOG_JOB_TIMEOUT_MS,
              {
                machineId,
                params: { name, parentPath },
              },
            ),
            parentPath,
            name,
          )
        }
        discoverSourceControl={async ({ machineId }) =>
          readAddProjectDiscovery(
            await requestAddProjectDialogOperation(
              "discoverSourceControl",
              ADD_PROJECT_DIALOG_DISCOVERY_TIMEOUT_MS,
              {
                machineId,
              },
            ),
          )
        }
        initialMachineId={addProject?.machineId}
        isOpen={activeModal === "addProject" && addProject !== undefined}
        listMachineOptions={async () =>
          readAddProjectMachineOptions(
            await requestAddProjectDialogOperation(
              "listMachines",
              ADD_PROJECT_DIALOG_JOB_TIMEOUT_MS,
            ),
          )
        }
        lookupRepository={async ({ machineId, provider, repository }) =>
          readAddProjectRepositoryInfo(
            await requestAddProjectDialogOperation(
              "lookupRepository",
              ADD_PROJECT_DIALOG_LOOKUP_TIMEOUT_MS,
              {
                machineId,
                params: { provider, repository },
              },
            ),
          )
        }
        onClose={closeModal}
        previewClone={async ({
          branchName,
          cloneMainOnly,
          destinationPath,
          machineId,
          remoteUrl,
          shallowClone,
        }) =>
          readAddProjectClonePreview(
            await requestAddProjectDialogOperation(
              "previewClone",
              ADD_PROJECT_DIALOG_LOOKUP_TIMEOUT_MS,
              {
                machineId,
                params: {
                  branchName,
                  cloneMainOnly,
                  destinationPath,
                  remoteUrl,
                  shallowClone,
                },
              },
            ),
          )
        }
        readCloneJob={async ({ jobId, machineId }) =>
          readAddProjectCloneJob(
            await requestAddProjectDialogOperation(
              "readCloneJob",
              ADD_PROJECT_DIALOG_JOB_TIMEOUT_MS,
              {
                machineId,
                params: { jobId },
              },
            ),
          )
        }
        startClone={async ({
          branchName,
          cloneMainOnly,
          destinationPath,
          machineId,
          remoteUrl,
          shallowClone,
        }) =>
          readAddProjectCloneHandle(
            await requestAddProjectDialogOperation(
              "startClone",
              ADD_PROJECT_DIALOG_ADD_TIMEOUT_MS,
              {
                machineId,
                params: {
                  branchName,
                  cloneMainOnly,
                  destinationPath,
                  remoteUrl,
                  shallowClone,
                },
              },
            ),
          )
        }
      />
      <AgentsHubModal
        catalog={agentsHubCatalog}
        fileContent={agentsHubFileContent}
        isOpen={activeModal === "agentsHub"}
        onClose={closeModal}
        syncApplyResult={agentSyncApplyResult}
        syncPlan={agentSyncPlan}
        syncReport={agentSyncReport}
        vscode={vscode}
      />
      {/*
       * CDXC:CommandPalette 2026-06-13-10:26:
       * The configured command-palette hotkey must render in the same
       * full-window app-modal host as Settings, not inside the sidebar webview.
       * The palette reads mirrored sidebar state here so its command list
       * remains current while the dialog is centered over the whole Ghostex
       * window.
       */}
      <CommandPalette
        commands={commands}
        hotkeys={settings?.hotkeys}
        initialQuery={commandPaletteInitialQuery}
        isInitialLoadResolved={hasNativeSettingsHydrated}
        isOpen={activeModal === "commandPalette"}
        isPrewarm={isCommandPalettePrewarm}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeModal();
          }
        }}
        openRequestSequence={commandPaletteOpenRequestSequence}
        openTargetSettings={settings}
        petOverlayEnabled={settings?.petOverlayEnabled}
        vscode={vscode}
      />
      <DelayedSendModal
        awakeSessions={
          delayedSend?.supportsSendWhenAllProjectSessionsStop
            ? delayedSendAgents.sessions
            : undefined
        }
        awakeSessionsError={delayedSendAgents.error}
        awakeSessionsLoading={delayedSendAgents.loading}
        sendWhenSpecificAgentFinishes={
          delayedSendAgents.active ?? delayedSend?.sendWhenSpecificAgentFinishes
        }
        agentIcon={delayedSend?.agentIcon}
        closeAfterDoneActive={delayedSendCloseAfterDoneActive}
        delayedSendDeadlineAt={delayedSend?.delayedSendDeadlineAt}
        delayedSendRemainingLabel={delayedSend?.delayedSendRemainingLabel}
        isOpen={activeModal === "delayedSend" && delayedSend !== undefined}
        onCancel={closeModal}
        onCancelTimer={() => {
          if (!delayedSend) {
            return;
          }
          vscode.postMessage({
            sessionId: delayedSend.sessionId,
            type: "cancelDelayedSend",
          });
          closeModal();
        }}
        onConfirm={(
          delayMs,
          sendWhenAgentStops,
          sendWhenAllProjectSessionsStop,
          sendWhenSpecificAgentFinishes,
        ) => {
          if (!delayedSend) {
            return;
          }
          vscode.postMessage({
            ...(delayMs === undefined ? {} : { delayMs }),
            sendWhenSpecificAgentFinishes,
            sendWhenAllProjectSessionsStop,
            sendWhenAgentStops,
            sessionId: delayedSend.sessionId,
            type: "scheduleDelayedSend",
          });
          closeModal();
        }}
        onToggleCloseAfterDone={() => {
          if (!delayedSend) {
            return;
          }
          vscode.postMessage({
            sessionId: delayedSend.sessionId,
            type: "toggleCloseAfterDone",
          });
          closeModal();
        }}
        sendWhenAllProjectSessionsStopActive={
          delayedSend?.sendWhenAllProjectSessionsStopActive
        }
        sendWhenAgentStopsActive={delayedSend?.sendWhenAgentStopsActive}
        sessionTitle={delayedSend?.title}
        supportsSendWhenAgentStops={delayedSend?.supportsSendWhenAgentStops}
        supportsSendWhenAllProjectSessionsStop={
          delayedSend?.supportsSendWhenAllProjectSessionsStop
        }
      />
      <GitCommitModal
        agents={agents}
        draft={
          gitCommit ?? {
            confirmLabel: "Commit",
            description: "",
            changedFiles: [],
            requestId: "",
            showCommitMessage: true,
            suggestedBody: undefined,
            suggestedSubject: "",
          }
        }
        isOpen={activeModal === "gitCommit" && gitCommit !== undefined}
        fileDiffDraft={gitFileDiff}
        onCancel={(requestId) => {
          vscode.postMessage({ requestId, type: "cancelSidebarGitCommit" });
          closeModal();
        }}
        onConfirm={(requestId, message, options) => {
          vscode.postMessage({
            agentId: options.agentId,
            commitOnNewRef: options.commitOnNewRef,
            deleteWorktreeAfter: options.deleteWorktreeAfter,
            filePaths: options.filePaths,
            message,
            requestId,
            type: "confirmSidebarGitCommit",
          });
          closeModal();
        }}
        onDirectMerge={(requestId, message, options) => {
          vscode.postMessage({
            agentId: options.agentId,
            deleteWorktreeAfter: options.deleteWorktreeAfter,
            filePaths: options.filePaths,
            message,
            requestId,
            type: "confirmSidebarGitDirectMerge",
          });
          closeModal();
        }}
        onMultipleCommits={(requestId, agentId) => {
          vscode.postMessage({
            agentId,
            requestId,
            type: "runSidebarGitMultipleCommits",
          });
          closeModal();
        }}
        onOpenFileLocation={(filePath, requestId) => {
          vscode.postMessage({
            filePath,
            requestId,
            openLocation: true,
            type: "openSidebarGitChangedFile",
          });
        }}
        onOpenFileDiff={(filePath, requestId) => {
          vscode.postMessage({
            filePath,
            requestId,
            type: "openSidebarGitChangedFileDiff",
          });
        }}
        onPromptAgentIdChange={updateGitCommitPromptAgentId}
        promptAgentId={resolvedGitCommitPromptAgentId}
        theme={theme}
      />
      {activeModal === "gitCommit" ? null : (
        <GitFileDiffModal
          draft={
            gitFileDiff ?? {
              filePath: "",
              patch: "No diff is available for this file.",
            }
          }
          isOpen={gitFileDiff !== undefined}
          onClose={closeGitFileDiff}
          theme={theme}
        />
      )}
      <WorktreeDeleteModal
        draft={
          worktreeDelete ?? {
            branch: null,
            canDeleteLocalBranch: false,
            groupId: "",
            hasChanges: false,
            projectId: "",
            remoteBranchExists: false,
            statusSummary: "",
            worktreeName: "worktree",
          }
        }
        isOpen={
          activeModal === "deleteWorktree" && worktreeDelete !== undefined
        }
        onCancel={closeModal}
        onCommit={(groupId) => {
          vscode.postMessage({ groupId, type: "commitWorktreeBeforeDelete" });
          closeModal();
        }}
        onDelete={(projectId, options) => {
          vscode.postMessage({
            deleteLocalBranch: options.deleteLocalBranch,
            deleteRemoteBranch: options.deleteRemoteBranch,
            projectId,
            type: "confirmDeleteWorktree",
          });
          closeModal();
        }}
        theme={theme}
      />
      <WorktreeRenameModal
        draft={
          worktreeRename ?? {
            currentName: "",
            currentPath: "",
            parentFolderName: "",
            parentProjectPath: "",
            projectId: "",
            renameBranchDefault: false,
            worktreeName: "worktree",
          }
        }
        isOpen={
          activeModal === "renameWorktree" && worktreeRename !== undefined
        }
        onCancel={closeModal}
        onRename={(projectId, options) => {
          vscode.postMessage({
            name: options.name,
            projectId,
            renameBranch: options.renameBranch,
            type: "confirmRenameWorktree",
          });
          closeModal();
        }}
        theme={theme}
      />
      {/*
       * CDXC:Worktrees 2026-06-02-13:41:
       * Creating a project worktree is a full-window modal flow because macOS
       * owns the agent, first prompt, and image attachment drafts before submit,
       * while gxserver owns the branch/worktree mutation and returned project.
       *
       * CDXC:Worktrees 2026-06-24-14:06:
       * Open Existing mode shares the worktree first-prompt controls. Blank
       * prompt submits remain project-open-only; non-blank prompts carry the
       * user-selected agent and prompt alongside the selected worktree path so
       * native and GPUI receivers can start the actual agent session.
       *
       * CDXC:Worktrees 2026-06-24-11:32:
       * Create New mode must send the selected base branch through the sidebar
       * command so the worktree starts from the chosen branch instead of the
       * currently checked-out HEAD.
       */}
      <WorktreeCreateModal
        agents={agents}
        defaultAgentId={settings?.defaultPromptAgentId}
        isOpen={activeModal === "worktree" && worktree !== undefined}
        onCancel={closeModal}
        onConfirm={(draft) => {
          vscode.postMessage({
            agentId: draft.agentId,
            baseBranch: draft.mode === "create" ? draft.baseBranch : undefined,
            existingWorktreeKey:
              draft.mode === "openExisting"
                ? draft.existingWorktreeKey
                : undefined,
            existingWorktreePath:
              draft.mode === "openExisting"
                ? draft.existingWorktreePath
                : undefined,
            mode: draft.mode,
            projectId: worktree?.projectId,
            projectPath: worktree?.projectPath,
            prompt: draft.prompt,
            remoteMachineId: worktree?.remoteMachineId,
            type: "createProjectWorktree",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
        onRequestExistingWorktrees={(requestId) => {
          vscode.postMessage({
            projectId: worktree?.projectId,
            projectPath: worktree?.projectPath,
            remoteMachineId: worktree?.remoteMachineId,
            requestId,
            type: "requestProjectWorktrees",
          } satisfies SidebarToExtensionMessage);
        }}
        projectName={worktree?.projectName}
      />
      <PortlessSetupModal
        isOpen={activeModal === "portlessSetup" && portlessSetup !== undefined}
        mode={portlessSetup?.mode ?? "firstSetup"}
        onAdminAction={(action, protocol, requestId) => {
          vscode.postMessage({
            action,
            protocol,
            requestId,
            type: "runPortlessSetupPromptAdminAction",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
        onCancel={() => {
          vscode.postMessage({
            type: "cancelPortlessSetupPrompt",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
        onDisable={() => {
          vscode.postMessage({
            enabled: false,
            type: "setPortlessEnabled",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
        onPostpone={() => {
          vscode.postMessage({
            type: "postponePortlessSetupPrompt",
          } satisfies SidebarToExtensionMessage);
          closeModal();
        }}
        protocol={portlessSetup?.protocol ?? "https"}
      />
      <SettingsModal
        agentHookStatus={agentHookStatus}
        agentHookStatusLoading={agentHookStatusLoading}
        appIconPickerUnavailable={appIconPickerUnavailable}
        windowGlassBlockedBySystem={windowGlassBlockedBySystem}
        automateIsExperimental={window.__ghostex_APP_MODAL_HOST_ID__ !== "gpui"}
        initialSection={settingsInitialSection}
        initialSidebarTagsAction={settingsInitialSidebarTagsAction}
        initialRemoteMachineId={settingsInitialRemoteMachineId}
        initialRemoteSection={settingsInitialRemoteSection}
        initialAgentsSection={settingsInitialAgentsSection}
        initialCustomViewId={settingsInitialCustomViewId}
        initialViewScopeKey={settingsInitialViewScopeKey}
        initialSearchQuery={settingsInitialSearchQuery}
        initialTab={settingsInitialTab}
        isOpen={isSettingsRenderable}
        onUpdateCustomSessionTags={(state) => {
          vscode.postMessage({ state, type: "updateCustomSessionTags" });
        }}
        onChange={(nextSettings, source = "settings:bulk") => {
          vscode.postMessage({
            settings: nextSettings,
            source,
            type: "updateSettings",
          });
        }}
        onPatch={(patch, source) => {
          vscode.postMessage({
            baseRevision: revision,
            patch,
            source,
            type: "updateSettingsPatch",
          });
        }}
        onGhosttySettingsAction={(action) => {
          vscode.postMessage({ type: action });
        }}
        onInstallGhostexCli={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installGhostexCli" });
        }}
        onInstallBrowserControl={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installBrowserControl" });
        }}
        onInstallBrowserUseSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installBrowserUseSkill" });
        }}
        onInstallComputerUseSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installComputerUseSkill" });
        }}
        onInstallCliSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installCliSkill" });
        }}
        onInstallAgentsOrchestrationSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installAgentsOrchestrationSkill" });
        }}
        onInstallManageBeadsSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installManageBeadsSkill" });
        }}
        onInstallGenerateTitleSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installGenerateTitleSkill" });
        }}
        onInstallMoveCodexSessionSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installMoveCodexSessionSkill" });
        }}
        onInstallHelpSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installHelpSkill" });
        }}
        onInstallCuaDriver={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installCuaDriver" });
        }}
        onReinstallCuaDriver={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "reinstallCuaDriver" });
        }}
        onUninstallCuaDriver={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "uninstallCuaDriver" });
        }}
        onCheckCuaDriverUpdate={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "checkCuaDriverUpdate" });
        }}
        onSetOSIntegrationDefaults={(target) => {
          setOSIntegrationStatusLoading(true);
          vscode.postMessage({ target, type: "setOSIntegrationDefaults" });
        }}
        onPlayCompletionSound={(sound) => {
          vscode.postMessage({ sound, type: "playCompletionSoundPreview" });
        }}
        onOpenAccessibilityPreferences={() => {
          /**
           * CDXC:OsIntegration 2026-05-27-07:24
           * The settings modal button should open macOS Accessibility settings
           * directly for desktop integrations without enabling any removed
           * IDE attachment behavior.
           */
          vscode.postMessage({ type: "openAccessibilityPreferences" });
        }}
        onOpenMacOSNotificationSettings={() => {
          vscode.postMessage({ type: "openMacOSNotificationSettings" });
        }}
        onOpenScreenRecordingPreferences={() => {
          vscode.postMessage({ type: "openScreenRecordingPreferences" });
        }}
        onOpenGhostexFolder={() => {
          vscode.postMessage({ type: "openGhostexFolder" });
        }}
        onRequestMacOSNotificationPermission={() => {
          vscode.postMessage({ type: "requestMacOSNotificationPermission" });
        }}
        onRequestGhostexFolderStats={() => {
          setGhostexFolderStatsLoading(true);
          vscode.postMessage({ type: "requestGhostexFolderStats" });
        }}
        onRequestAgentHookStatus={() => {
          setAgentHookStatusLoading(true);
          vscode.postMessage({ type: "requestAgentHookStatus" });
        }}
        onRequestGhostexCliStatus={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "requestGhostexCliStatus" });
        }}
        onRequestOSIntegrationStatus={() => {
          setOSIntegrationStatusLoading(true);
          vscode.postMessage({ type: "requestOSIntegrationStatus" });
        }}
        onRequestPluginSettingsStatus={() => {
          setPluginSettingsStatusLoading(true);
          vscode.postMessage({ type: "requestPluginSettingsStatus" });
        }}
        onReinstallPlugin={(pluginId) => {
          setPluginSettingsStatusLoading(true);
          vscode.postMessage({ pluginId, type: "reinstallPlugin" });
        }}
        onInstallAgentHooks={(agentIds) => {
          setAgentHookStatusLoading(true);
          vscode.postMessage({ agentIds, type: "installAgentHooks" });
        }}
        onUninstallAgentHooks={(agentIds) => {
          setAgentHookStatusLoading(true);
          vscode.postMessage({ agentIds, type: "uninstallAgentHooks" });
        }}
        onUninstallBundledAgentSkill={(skillId) => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ skillId, type: "uninstallBundledAgentSkill" });
        }}
        onUninstallBundledAgentSkills={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "uninstallBundledAgentSkills" });
        }}
        onTestAgentTaskCompletion={() => {
          vscode.postMessage({ type: "testAgentTaskCompletion" });
        }}
        onClose={closeModal}
        portless={portless}
        projects={projectSettingsProjects}
        projectViewProjects={projectViewProjects}
        projectViewSpaces={projectViewSpaces}
        settings={settings}
        tailcatRpc={gpuiBootstrapRemoteSetupRpc()}
        vscode={vscode}
        ghostexCliStatus={ghostexCliStatus}
        ghostexCliStatusLoading={ghostexCliStatusLoading}
        ghostexFolderStats={ghostexFolderStats}
        ghostexFolderStatsLoading={ghostexFolderStatsLoading}
        osIntegrationStatus={osIntegrationStatus}
        osIntegrationStatusLoading={osIntegrationStatusLoading}
        pluginSettingsStatus={pluginSettingsStatus}
        pluginSettingsStatusLoading={pluginSettingsStatusLoading}
        // CDXC:Icons 2026-06-25-21:50: Prop-driven App Icon state for Settings (mirrors osIntegrationStatus).
        appIconState={appIconState}
      />
      <OnboardingModal
        agentHookStatus={agentHookStatus}
        agents={onboardingAgents}
        agentsLoading={agentHookStatusLoading}
        browserSkillInstalled={ghostexCliStatus?.browserSkillInstalled === true}
        computerUseState={onboardingComputerUseState}
        ghostexCliStatus={ghostexCliStatus}
        ghostexCliStatusLoading={ghostexCliStatusLoading}
        firstRun={onboardingFirstRun}
        hasProjects={projectSettingsProjects.length > 0}
        isOpen={isFirstLaunchSetupRenderable && activeModal === "onboarding"}
        onChange={(nextSettings) => {
          vscode.postMessage({
            settings: nextSettings,
            source: "firstLaunch:preferences",
            type: "updateSettings",
          });
        }}
        onClose={completeFirstLaunchSetup}
        onFinishFirstLaunch={({ agentId, path }) =>
          requestFirstLaunchCreateProjectSession(agentId, path)
        }
        onInstallAgentHooks={(agentIds) => {
          setAgentHookStatusLoading(true);
          vscode.postMessage({
            agentIds: [...agentIds],
            type: "installAgentHooks",
          });
        }}
        onInstallBrowserSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({ type: "installBrowserUseSkill" });
        }}
        onInstallComputerUse={() => {
          /*
           * Cua Driver first when it is missing, then the Computer Use skill through the acknowledged
           * settings-action request.
           */
          setOnboardingComputerUseInstallRequested(true);
          setGhostexCliStatusLoading(true);
          if (ghostexCliStatus?.cuaDriverInstalled !== true) {
            vscode.postMessage({ type: "installCuaDriver" });
          }
          void requestFirstLaunchInstallSelectedSkills(["computerUse"]).catch(
            (error: unknown) => {
              logAppModalError("Onboarding:installComputerUse", error);
              setOnboardingComputerUseInstallRequested(false);
              toast.error("Computer Use could not be turned on", {
                description:
                  error instanceof Error && error.message
                    ? error.message
                    : "Ghostex could not install the Computer Use skill.",
                id: "onboarding-computer-use-install",
              });
            },
          );
        }}
        onOpenAccessibilityPreferences={() => {
          vscode.postMessage({ type: "openAccessibilityPreferences" });
        }}
        onOpenExternalUrl={(url) => {
          vscode.postMessage({ type: "openExternalUrl", url });
        }}
        onOpenInstallGuide={(url) => {
          vscode.postMessage({ type: "openExternalUrl", url });
        }}
        onOpenRemoteSettings={() => {
          openAppModal({
            initialRemoteSection: "easyConnect",
            initialTab: "remote",
            modal: "settings",
            type: "open",
          });
        }}
        onOpenScreenRecordingPreferences={() => {
          vscode.postMessage({ type: "openScreenRecordingPreferences" });
        }}
        onOpenSettings={(tab) => {
          openAppModal(
            tab
              ? { initialTab: tab, modal: "settings", type: "open" }
              : { modal: "settings", type: "open" },
          );
        }}
        onPickProjectFolder={() => {
          vscode.postMessage({ type: "pickFirstLaunchProjectFolder" });
        }}
        onRescanAgents={() => {
          setAgentHookStatusLoading(true);
          vscode.postMessage({ type: "requestAgentHookStatus" });
        }}
        onUninstallBrowserSkill={() => {
          setGhostexCliStatusLoading(true);
          vscode.postMessage({
            skillId: "browserUse",
            type: "uninstallBundledAgentSkill",
          });
        }}
        pickedProjectFolder={onboardingPickedProjectFolder}
        settings={settings}
        theme={theme}
      />
      <SessionRenameModal
        agents={agents}
        /*
        CDXC:SessionTitles 2026-07-29:
        Empty-title Generate Name summarizes the session's recent transcript
        user messages through gxserver. Only the gpui host routes renameSession
        through the gxserver runtime that supports the empty-text generate
        call, so the deprecated Swift host keeps the pasted-text-only rule.
        */
        canGenerateNameFromSessionHistory={
          window.__ghostex_APP_MODAL_HOST_ID__ === GPUI_APP_MODAL_HOST_ID &&
          sidebarAgentIconSupportsSessionHistoryTitleGeneration(
            renameSession?.sessionAgentIcon,
          )
        }
        initialTitle={renameSession?.initialTitle ?? ""}
        isOpen={activeModal === "renameSession" && renameSession !== undefined}
        onCancel={closeModal}
        onConfirm={(title, options) => {
          if (!renameSession) {
            return;
          }
          vscode.postMessage({
            agentId: options?.agentId,
            sessionId: renameSession.sessionId,
            ...(options?.shouldGenerateTitle
              ? { shouldGenerateTitle: true }
              : {}),
            title,
            type: "renameSession",
          });
          closeModal();
        }}
        onPromptAgentIdChange={updateRenamePromptAgentId}
        promptAgentId={resolvedRenamePromptAgentId}
      />
      {/*
      CDXC:SessionNotes 2026-08-24:
      Saving posts the shared `setSessionNote` sidebar command exactly the way
      Rename posts `renameSession`: the dialog reports the typed text and the
      session it belongs to, and the app's Rust store owns the daemon call and
      the provider-conversation resolution (gx_store/terminal_lifecycle/session_edits.rs). An empty string is the explicit
      clear, so it is sent rather than suppressed.
      */}
      <SessionNoteModal
        initialNote={sessionNote?.initialNote ?? ""}
        isOpen={activeModal === "sessionNote" && sessionNote !== undefined}
        onCancel={closeModal}
        onConfirm={(note) => {
          if (!sessionNote) {
            return;
          }
          vscode.postMessage({
            note,
            ...(sessionNote.projectId
              ? { projectId: sessionNote.projectId }
              : {}),
            sessionId: sessionNote.sessionId,
            type: "setSessionNote",
          });
          closeModal();
        }}
        sessionTitle={sessionNote?.sessionTitle}
      />
      {/*
      CDXC:Spaces 2026-08-27:
      New/Edit Space. The dialog reports field values only; the app applies
      them in Rust (gx_store/space_editor.rs), the one place that owns the Space
      document and can apply an edit to the CURRENT one (until 2026-09-21 that
      was SidebarApp). That is the same
      dialog-reports / host-writes split Rename Session and Session Note use, and
      the reason a Space edit can never clobber a concurrent membership change.
      */}
      <SpaceEditorModal
        initialColor={sidebarSpaceEditor?.spaceColor}
        initialIcon={sidebarSpaceEditor?.spaceIcon}
        initialName={sidebarSpaceEditor?.spaceName}
        isOpen={
          activeModal === "sidebarSpaceEditor" &&
          sidebarSpaceEditor !== undefined
        }
        mode={sidebarSpaceEditor?.mode ?? "create"}
        onCancel={closeModal}
        onDelete={() => {
          if (!sidebarSpaceEditor?.spaceId) {
            return;
          }
          vscode.postMessage({
            mode: "delete",
            ...(sidebarSpaceEditor.remoteMachineId
              ? { remoteMachineId: sidebarSpaceEditor.remoteMachineId }
              : {}),
            spaceId: sidebarSpaceEditor.spaceId,
            type: "sidebarSpaceEditorResult",
          });
          closeModal();
        }}
        onSubmit={(space) => {
          if (!sidebarSpaceEditor) {
            return;
          }
          vscode.postMessage({
            color: space.color,
            icon: space.icon,
            ...(sidebarSpaceEditor.memberCollectionId
              ? { memberCollectionId: sidebarSpaceEditor.memberCollectionId }
              : {}),
            ...(sidebarSpaceEditor.memberProjectId
              ? { memberProjectId: sidebarSpaceEditor.memberProjectId }
              : {}),
            mode: sidebarSpaceEditor.mode,
            name: space.name,
            ...(sidebarSpaceEditor.remoteMachineId
              ? { remoteMachineId: sidebarSpaceEditor.remoteMachineId }
              : {}),
            ...(sidebarSpaceEditor.mode === "edit" && sidebarSpaceEditor.spaceId
              ? { spaceId: sidebarSpaceEditor.spaceId }
              : {}),
            type: "sidebarSpaceEditorResult",
          });
          closeModal();
        }}
      />
      {/*
      CDXC:TranscriptExport 2026-08-20 / CDXC:TranscriptExport 2026-08-24:
      Copy Path is settled inside the dialog; the export itself, Reveal, and
      Start New Conversation are host side effects, so they leave through the
      same sidebarCommand boundary every other modal action uses. Neither
      carries the exported path back out: the host still holds it from its
      own result message (gx_store/git/export_transcript.rs).
      */}
      <ExportTranscriptModal
        agents={agents}
        defaultAgentId={exportTranscriptResult?.agentId}
        isOpen={
          activeModal === "exportTranscriptResult" &&
          exportTranscriptResult !== undefined
        }
        onClose={() => {
          if (exportTranscriptResult?.requestId) {
            vscode.postMessage({
              requestId: exportTranscriptResult.requestId,
              type: "cancelExportSessionTranscript",
            });
          }
          closeModal();
        }}
        onExport={(options) => {
          if (!exportTranscriptResult?.requestId) {
            return;
          }
          beginExportTranscriptExport();
          vscode.postMessage({
            ...options,
            requestId: exportTranscriptResult.requestId,
            type: "runExportSessionTranscript",
          });
        }}
        onRevealInFinder={
          exportTranscriptResult?.canReveal
            ? () => {
                vscode.postMessage({ type: "revealExportedTranscript" });
                closeModal();
              }
            : undefined
        }
        onStartNewConversation={(agentId) => {
          if (!exportTranscriptResult?.requestId) {
            return;
          }
          vscode.postMessage({
            agentId,
            requestId: exportTranscriptResult.requestId,
            type: "startExportedTranscriptConversation",
          });
          closeModal();
        }}
        stage={exportTranscriptResult?.stage ?? { stage: "options" }}
        targetAgentId={exportTranscriptResult?.targetAgentId}
      />
      {/*
       * CDXC:AppModal 2026-05-21-12:21:
       * Native/sidebar status feedback should appear as dark Ghostex toasts,
       * not Sonner's bright default surface, so non-blocking Delayed Send and
       * worktree/git notices stay visually consistent with the dark app chrome.
       *
       * CDXC:AppModal 2026-05-28-13:52:
       * Toast overlay chrome should use the same background family as modal
       * and menu overlays instead of the older #181818 surface.
       *
       * CDXC:Theming 2026-06-15-01:43:
       * Toasts inherit --app-modal-background so Dark 1, Dark 2, and Light
       * keep transient modal-host feedback on the selected app surface.
       */}
      <Toaster
        offset={{ bottom: APP_MODAL_TOAST_BOTTOM_OFFSET_PX }}
        position="bottom-center"
        richColors
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--app-modal-background)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            color: "#f4f4f5",
          },
        }}
      />
    </>
  );
}

document.body.classList.add("app-modal-host-body");
installWindowGlassFlag();
if (window.__ghostex_APP_MODAL_HOST_SURFACE__ === "nativeWindow") {
  document.documentElement.classList.add(
    "app-modal-host-native-window-document",
  );
  document.body.classList.add("app-modal-host-native-window-body");
  /*
   * CDXC:AppModal 2026-07-26-07:55:
   * GPUI child windows fit to the one-shot measured dialog height and then
   * keep that frame for the rest of the open. Mark that host so the
   * stylesheet can bound growable regions (long pasted rename text, long
   * prompts) and scroll them instead of pushing the title row and action row
   * outside the window, and so the duplicated in-dialog close button stays
   * hidden in these native child windows.
   */
  if (window.__ghostex_APP_MODAL_HOST_ID__ === GPUI_APP_MODAL_HOST_ID) {
    document.body.dataset.appModalFixedWindow = "true";
  }
}
installAppModalGlobalErrorLogging("AppModals:modalHost");
// CDXC:Settings 2026-09-07 WHY:
// CEF can install the server connection after Settings renders, including when reusing another modal's window. Re-read Accounts connections on that existing bootstrap callback instead of retaining the initial empty list.
const accountsBootstrapBridge = window as unknown as {
  ghostexGpui?: { onGxserverBootstrapChanged?: () => void };
};
accountsBootstrapBridge.ghostexGpui ??= {};
accountsBootstrapBridge.ghostexGpui.onGxserverBootstrapChanged =
  notifyAccountsConnectionsChanged;
bootClientStorage(() => {
  createRoot(document.getElementById("root")!).render(<AppModalHost />);
});

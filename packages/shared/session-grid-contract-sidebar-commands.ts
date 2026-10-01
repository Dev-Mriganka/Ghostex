import type { DelayedSendAgentReference } from '@/packages/shared/delayed-send';
import type { CompletionSoundSetting } from './completion-sound';
import type { BundledGhostexAgentSkillId } from './ghostex-agent-skills';
import type { ManagedToolId } from './managed-tools';
import type { AgentAcceptAllMode } from './sidebar-agent-accept-all';
import type { SidebarAgentIcon } from './sidebar-agents';
import type { SidebarCommandIcon } from './sidebar-command-icons';
import type {
  SidebarActionType,
  SidebarCommandLink,
  SidebarCommandRunMode,
  SidebarCommandScope,
} from './sidebar-commands';
import type { SidebarGitAction } from './sidebar-git';
import type {
  ghostexSettings,
  ghostexSettingsPatch,
  ghostexSettingsUpdateSource,
  DiagnosticLoggingScenarioId,
  KeepAwakeDurationMinutes,
} from './ghostex-settings';
import type { ghostexHotkeyActionId } from './ghostex-hotkeys';
import type { WorkspaceIdeTargetApp } from './workspace-open-targets';
import type { SidebarSessionTag, SidebarSessionTagFilter } from './session-tags';
import type {
  GxserverCustomSessionTagsState,
  GxserverSidebarProjectCollectionsState,
  GxserverSidebarSpacesState,
} from './gxserver-protocol';
import type { NativePortlessAdminInstallAction, NativePortlessProtocol } from './native-ghostty-host-protocol';
import type { SidebarTheme, TerminalViewMode, VisibleSessionCount } from './session-grid-contract-core';
import type {
  SidebarSpaceEditorResultFields,
  SidebarPluginSettingsItem,
} from './session-grid-contract-sidebar-messages';
import type { SidebarActiveSessionsSortMode } from './session-grid-contract-sidebar-tooling';

/**
 * CDXC:AddProject 2026-07-30:
 * The operations the shared add-project dialog can ask its host to perform.
 * Each one maps to exactly one gxserver endpoint, and the mapping lives in the
 * host (gpui's Rust bridge, ghostex-web's rpcForMachine) rather than in the
 * dialog, so no surface has to know an endpoint path to render this dialog.
 * `listMachines` is the exception: it is answered from the host's own machine
 * registry without any daemon round trip.
 */
export type SidebarAddProjectDialogOperation =
  | 'add'
  | 'browse'
  | 'cancelCloneJob'
  | 'createDirectory'
  | 'discoverSourceControl'
  | 'listMachines'
  | 'lookupRepository'
  | 'previewClone'
  | 'readCloneJob'
  | 'startClone';

/**
 * CDXC:AddProject 2026-07-30:
 * The complete set of fields any add-project operation may carry. Keeping it
 * one flat bounded record (instead of a per-operation union) is what lets the
 * host validate it field by field against the operation it received, and makes
 * it impossible for a new field to reach a daemon without being named here.
 */
export type SidebarAddProjectDialogRequestParams = {
  readonly branchName?: string;
  readonly cloneMainOnly?: boolean;
  readonly createIfMissing?: boolean;
  readonly cwd?: string;
  readonly destinationPath?: string;
  readonly jobId?: string;
  /** New-folder step: the single path segment to create under `parentPath`. */
  readonly name?: string;
  readonly parentPath?: string;
  readonly partialPath?: string;
  readonly path?: string;
  readonly provider?: string;
  readonly remoteUrl?: string;
  readonly repository?: string;
  readonly shallowClone?: boolean;
};

export type SidebarToExtensionMessage =
  | {
      /**
       * CDXC:ServerDaemon 2026-05-31-03:56:
       * The gxserver failure toast needs a Retry action that returns to the
       * trusted sidebar command router, then native performs the daemon restart.
       */
      type: 'retryGxserverStart';
    }
  | {
      type: 'openSettings';
    }
  | {
      /**
       * CDXC:Sidebar 2026-05-27-05:04:
       * Sidebar surfaces can link to the public Ghostex Discord for support,
       * questions, and contributors. Native owns URL opening so the sidebar
       * does not depend on webview popup behavior.
       */
      type: 'openExternalUrl';
      url: string;
    }
  | {
      /**
       * CDXC:Sidebar 2026-06-29-01:43:
       * The sidebar Keep Awake dropdown moved into top chrome but must command the existing titlebar runtime owner instead of duplicating caffeinate lifecycle state in the sidebar renderer.
       */
      action: 'start';
      durationMinutes: KeepAwakeDurationMinutes;
      type: 'runTitlebarKeepAwakeCommand';
    }
  | {
      action: 'stop';
      type: 'runTitlebarKeepAwakeCommand';
    }
  | {
      /**
       * CDXC:Settings 2026-05-09-15:25
       * The settings modal can request Ghostex folder stats lazily, but native
       * resolves the folder path itself and never trusts a path from React.
       */
      type: 'requestGhostexFolderStats' | 'openGhostexFolder';
    }
  | {
      /**
       * CDXC:AgentHooks 2026-05-23-10:05:
       * Settings -> Agents can refresh hook status and trigger the existing hook installer, but native remains the owner of config paths, executable checks, and hook-file mutation.
       *
       * CDXC:Onboarding 2026-06-18-02:38:
       * First launch narrows hook setup to Codex, Claude, and Pi by passing
       * agentIds while Settings can omit agentIds to inspect the full supported
       * provider set.
       */
      type: 'requestAgentHookStatus' | 'installAgentHooks' | 'uninstallAgentHooks';
      agentIds?: readonly string[];
    }
  | {
      /**
       * CDXC:Onboarding 2026-05-26-17:12:
       * First launch CLI setup must distinguish a missing CLI from an app that
       * was already installed through Homebrew. Native owns PATH inspection so
       * the production modal and Storybook mock can share the same UI contract.
       */
      type: 'requestGhostexCliStatus';
    }
  | {
      /**
       * CDXC:RemotePairing 2026-05-27-04:17:
       * First launch and Settings -> Integrations expose one-click install
       * actions for optional integrations. Native runs the actual commands and
       * refreshes the shared integration status afterward.
       */
      type:
        | 'installGhostexCli'
        | 'installBrowserControl'
        | 'installBrowserUseSkill'
        | 'installComputerUseSkill'
        | 'installCliSkill'
        | 'installManageBeadsSkill'
        | 'installAgentsOrchestrationSkill'
        | 'installGenerateTitleSkill'
        | 'installManageBeadsSkill'
        | 'installMoveCodexSessionSkill'
        | 'installHelpSkill'
        | 'uninstallBundledAgentSkills'
        | 'installCuaDriver'
        | 'reinstallCuaDriver'
        | 'uninstallCuaDriver'
        | 'checkCuaDriverUpdate'
        | 'installSpaceoSkill'
        | 'installSpaceo'
        | 'reinstallSpaceo'
        | 'uninstallSpaceo'
        | 'checkSpaceoUpdate';
    }
  | {
      /**
       * CDXC:ManagedTools 2026-09-29 WHY:
       * Settings > Integrations > Tools asks the desktop to run a tool's install in a command-pane terminal where there is no password dialog (Linux system tools on WSL). Only the tool id crosses: the desktop reads the command from gxserver itself, never from the page.
       */
      toolId: ManagedToolId;
      type: 'runManagedToolTerminalCommand';
    }
  | {
      /**
       * CDXC:AgentBox 2026-10-01 WHY:
       * Settings > Cloud Boxes runs one agentbox setup step in a command-pane terminal. Only the step name and its arguments cross; the desktop asks gxserver's `/api/agentbox` for the command text, never the page.
       */
      agent?: string;
      alias?: string;
      command: string;
      host?: string;
      provider?: string;
      ssh?: string;
      type: 'runAgentboxTerminalCommand';
    }
  | {
      /** Settings > Cloud Boxes "Set it up for me": an agent session that sets agentbox up. */
      type: 'setUpAgentboxWithAgent';
    }
  | {
      /**
       * CDXC:AgentSkills 2026-07-29:
       * Per-row uninstall identifies one catalog-owned bundled skill. Native
       * maps this closed ID to a fixed directory instead of accepting a path.
       */
      skillId: BundledGhostexAgentSkillId;
      type: 'uninstallBundledAgentSkill';
    }
  | {
      /**
       * CDXC:OsIntegration 2026-05-27-18:06:
       * Settings exposes explicit OS default actions. Installing Ghostex only
       * registers it as an available handler; default editor, terminal-link,
       * and script-runner ownership changes happen only through this command.
       */
      target: 'editor' | 'terminalLinks' | 'scriptRunner' | 'all';
      type: 'setOSIntegrationDefaults';
    }
  | {
      type: 'requestOSIntegrationStatus';
    }
  | {
      type: 'requestPluginSettingsStatus';
    }
  | {
      pluginId: SidebarPluginSettingsItem['id'];
      type: 'reinstallPlugin';
    }
  | {
      source?: ghostexSettingsUpdateSource;
      settings: ghostexSettings;
      type: 'updateSettings';
    }
  | {
      baseRevision?: number;
      patch: ghostexSettingsPatch;
      source: ghostexSettingsUpdateSource;
      type: 'updateSettingsPatch';
    }
  | {
      /*
      CDXC:Portless 2026-06-23-13:42:
      Portless setup prompts run in a separate app-modal child-window document,
      and native logs modal sidebar commands as JSON. Keep this boundary
      metadata-only: admin actions carry action/protocol/request id, Disable
      carries one boolean, and dismissals carry only intent so full settings,
      project data, paths, domains, URLs, and command text never cross here.
      */
      action: Extract<NativePortlessAdminInstallAction, 'install' | 'reconfigure'>;
      protocol: NativePortlessProtocol;
      requestId: string;
      type: 'runPortlessSetupPromptAdminAction';
    }
  | {
      /*
      CDXC:Portless 2026-06-23-03:47:
      Settings -> Projects exposes explicit Portless setup actions outside the
      setup prompt. Keep this command metadata-only: install/reconfigure/retry
      carry the selected HTTP/HTTPS mode, remove carries only intent, and
      native still owns privileged execution and sanitized results.
      */
      action: NativePortlessAdminInstallAction;
      protocol: NativePortlessProtocol;
      requestId: string;
      type: 'runPortlessSettingsAdminAction';
    }
  | {
      action: 'remove';
      requestId: string;
      type: 'runPortlessSettingsAdminAction';
    }
  | {
      type: 'postponePortlessSetupPrompt' | 'cancelPortlessSetupPrompt';
    }
  | {
      enabled: false;
      type: 'setPortlessEnabled';
    }
  | {
      /**
       * CDXC:RemoteMachines 2026-06-09-18:23:
       * Remote settings can save an SSH password, but the password must cross
       * the webview boundary only as an explicit user action. Native writes it
       * to macOS Keychain and settings store only the saved-password marker.
       */
      password: string;
      remoteMachineId: string;
      type: 'saveRemoteMachinePassword';
    }
  | {
      /**
       * CDXC:Terminal 2026-04-30-01:48
       * The settings modal exposes Ghostty-specific actions that are not plain
       * ghostex preference changes: reset managed config keys, apply the
       * recommended config block, open docs, and open the platform config file.
       *
       * CDXC:OsIntegration 2026-05-08-13:08
       * The same modal action channel also carries a direct open-settings
       * command for macOS Accessibility status. It does not enable attachment
       * or trigger the permission prompt by itself.
       */
      type:
        | 'applyRecommendedGhosttySettings'
        | 'openAccessibilityPreferences'
        | 'openScreenRecordingPreferences'
        | 'requestMacOSNotificationPermission'
        | 'openMacOSNotificationSettings'
        | 'openGhosttyConfigFile'
        | 'openGhosttySettingsDocs'
        | 'resetGhosttySettingsToDefault';
    }
  | {
      /** The native host reveals only its own retained exported path. */
      type: 'revealExportedTranscript';
    }
  | {
      /**
       * Start the follow-up only for the exact dialog request that produced
       * the retained export; a closed or replaced dialog cannot consume it.
       */
      agentId?: string;
      requestId: string;
      type: 'startExportedTranscriptConversation';
    }
  | {
      /** Invalidate an in-flight export when its owning dialog closes. */
      requestId: string;
      type: 'cancelExportSessionTranscript';
    }
  | {
      /**
       * CDXC:TranscriptExport 2026-08-24:
       * The Export Transcript dialog's Export button: run the export with the
       * chosen include-toggles. The dialog never names the session (the
       * host, apps/desktop/src/app/gx_store/git/export_transcript.rs, holds
       * the pending export context from opening the dialog; the sidebar
       * runtime held it until 2026-09-25), and `requestId` proves the command still belongs to that open.
       */
      includeCommands?: boolean;
      includePatches?: boolean;
      includeReasoning?: boolean;
      requestId: string;
      type: 'runExportSessionTranscript';
    }
  | {
      /**
       * CDXC:Notifications 2026-05-11-01:14
       * Settings' test button should exercise the same native attention
       * completion flow as a real agent task without mutating any session.
       */
      type: 'testAgentTaskCompletion';
    }
  | {
      /**
       * CDXC:Settings 2026-05-11-02:06
       * Settings sound dropdown preview buttons play only the selected sound,
       * using the same native audio path as real completion alerts while
       * avoiding notification side effects.
       */
      sound: CompletionSoundSetting;
      type: 'playCompletionSoundPreview';
    }
  | {
      type: 'toggleCompletionBell';
    }
  | {
      delta: -1 | 1;
      type: 'adjustTerminalFontSize';
    }
  | {
      type: 'refreshDaemonSessions';
    }
  | {
      type: 'killTerminalDaemon';
    }
  | {
      type: 'killDaemonSession';
      sessionId: string;
      workspaceId: string;
    }
  | {
      /**
       * CDXC:Sidebar 2026-06-12-02:23:
       * Cmd+B and command-palette execution need a native chrome command that
       * collapses the whole AppKit sidebar, not only React sidebar content.
       */
      type: 'toggleSidebarCollapsed';
    }
  | {
      /**
       * CDXC:ContextMenus 2026-05-20-13:05:
       * Session and project context menus notify native when open so clicks on
       * terminal, titlebar, and other non-sidebar surfaces dismiss the menu
       * while the original AppKit click still reaches its target.
       *
       * CDXC:ContextMenus 2026-09-11 WHY:
       * On the desktop app the same pair also holds the sidebar's native focus grant for as long as any menu is open, so every SidebarContextMenuPortal instance must send both, balanced.
       * The runtime that counted the pair (`gxserver-runtime/sessions-and-focus.ts`) was deleted with QuickJS on 2026-09-25.
       */
      type: 'sidebarContextMenuOpened';
    }
  | {
      type: 'sidebarContextMenuClosed';
    }
  | {
      /**
       * CDXC:CommandPalette 2026-05-16-08:18:
       * The full-window command palette needs a pet wake/sleep action that
       * reuses the sidebar settings owner instead of mutating pet visibility
       * inside the detached modal host.
       */
      type: 'togglePetOverlay';
    }
  | {
      type: 'createSession';
    }
  | {
      /**
       * CDXC:CommandPalette 2026-05-15-20:38:
       * Palette selections for built-in Ghostex commands should execute through
       * the same native hotkey action dispatcher as physical shortcuts so the
       * available command list cannot drift from actual app behavior.
       */
      actionId: ghostexHotkeyActionId;
      type: 'runGhostexHotkeyAction';
    }
  | {
      /**
       * CDXC:CommandPane 2026-05-11-11:51
       * The combined sidebar Settings row has a legacy-named secondary terminal
       * action. It targets the currently active project and creates the new
       * terminal as the selected tab in the focused session's tab group so pane
       * sizes and tab groupings remain unchanged.
       */
      type: 'createFullWidthTerminalPane';
    }
  | {
      /**
       * CDXC:Projects 2026-05-04-09:30
       * Chats are projectless AI work areas. The native sidebar owns chat
       * folder creation and then opens a normal empty terminal there so agent
       * title/icon detection stays identical to project sessions.
       */
      title?: string;
      type: 'createChat';
    }
  | {
      /**
       * CDXC:Extensions 2026-05-08-10:44
       * The top-sidebar Plugins entry opens the skills directory as a Chromium
       * browser pane under Chats, not inside the active project. Keep this
       * separate from generic browser actions because its destination is fixed.
       */
      type: 'openPluginsBrowserChat';
    }
  | {
      /**
       * CDXC:Automations 2026-06-29-15:55:
       * The top-sidebar Automations entry now opens the project Automation page backed by server, but keep the old toast message in the contract for older native bundles during the cutover.
       */
      type: 'showAutomationsComingSoonToast';
    }
  | {
      /**
       * CDXC:Automations 2026-06-29-15:55:
       * The sidebar shortcut should open a real first-party Automation page backed by gxserver.
       *
       * CDXC:Automations 2026-06-30-11:05:
       * Sidebar Automations is a Quick-level global page that aggregates automations from all projects. Project-scoped automation access belongs to the titlebar Automate view instead of reusing the Kanban surface.
       */
      type: 'openAutomationsPage';
    }
  | {
      /**
       * CDXC:AgentLauncher 2026-05-12-09:21
       * Agents Hub runs in the full-window modal host, but profile/file actions
       * still need native filesystem affordances from the sidebar bridge.
       */
      path: string;
      type: 'openAgentsHubPathInFinder';
    }
  | {
      /**
       * Agents Hub file rows open in Ghostex's owned Source editor. Hosts must
       * validate the catalog path before handing it to their embedded editor.
       */
      filePath: string;
      type: 'openAgentsHubFileInBuiltInEditor';
    }
  | {
      /**
       * CDXC:AgentLauncher 2026-05-14-08:29:
       * Agents Hub must show the real files installed on the user's machine, including files owned by Claude/Codex profiles and plugin caches.
       * The modal host requests a fresh native filesystem catalog whenever the Hub opens instead of relying on a bundled placeholder list.
       *
       * CDXC:AgentLauncher 2026-06-12-02:53:
       * Catalog requests return metadata only so large profile/plugin trees can
       * paint the Hub immediately without pushing every file buffer through the
       * native process-result bridge.
       */
      type: 'requestAgentsHubCatalog';
    }
  | {
      /**
       * CDXC:AgentSync 2026-09-16 WHY:
       * The Agent Sync tab asks native for a fresh scan on open and after every apply; the scan
       * is metadata only and runs on the background executor.
       */
      type: 'requestAgentSyncReport';
    }
  | {
      /** `all` or one agent id from the report. */
      scope: string;
      type: 'requestAgentSyncPlan';
    }
  | {
      /**
       * Native recomputes the plan from a fresh scan right before applying, so the groups the
       * user left enabled are the only input; the reply carries the executed plan and failures.
       */
      groups: string[];
      scope: string;
      type: 'applyAgentSyncPlan';
    }
  | {
      /**
       * CDXC:AgentLauncher 2026-06-12-02:53:
       * Agents Hub reads file contents only after selection because the left
       * tree needs metadata, while editor buffers can be large enough to block
       * the modal bridge when loaded for every file at once.
       */
      filePath: string;
      requestId: string;
      type: 'requestAgentsHubFileContent';
    }
  | {
      /**
       * CDXC:AgentLauncher 2026-05-14-08:27:
       * The Hub modal edits real agent instruction/config files and enables Save only after text changes.
       * Persist the current editor buffer through the native sidebar command contract so the modal host keeps using the same catalog-validated filesystem bridge as the built-in Source action.
       */
      content: string;
      filePath: string;
      type: 'saveAgentsHubFile';
    }
  | {
      /**
       * CDXC:Projects 2026-05-08-11:53
       * The reference-style Chats section header has a hover-only browser
       * action beside New Chat. It creates a new projectless chat and opens a
       * browser pane there, without requiring a concrete chat group id.
       */
      type: 'openBrowserChat';
    }
  | {
      type: 'openBrowser';
    }
  | {
      /**
       * CDXC:Browser 2026-05-27-07:24
       * Browser actions always create in-workspace browser panes now that the
       * legacy Chrome Canary attachment route has been removed.
       */
      url?: string;
      type: 'openBrowserPane';
    }
  | {
      /**
       * CDXC:Projects 2026-05-06-18:42
       * Project headers expose New Browser beside the create-session control.
       * Carry the group id so native can focus that project/group before
       * creating the browser pane.
       *
       * CDXC:AgentLauncher 2026-09-09 WHY:
       * The New Thread picker sends no group id: it is an app-modal window
       * that cannot see sidebar groups, and the sidebar store (gx-core; the
       * QuickJS runtime until 2026-09-25) already owns the active group, so an absent id means the active project.
       */
      groupId?: string;
      type: 'openBrowserPaneInGroup';
    }
  | {
      type: 'openWorkspaceWelcome';
    }
  | {
      /*
       * CDXC:Onboarding 2026-06-16-08:17:
       * The titlebar Tips & Tricks panel can open the replayable highlighted
       * features modal. Keep the request in the sidebar command contract so
       * the native sidebar remains the single owner of app modal presentation.
       *
       * CDXC:Onboarding 2026-06-18-05:31:
       * Keep this legacy command for callers, but native routes it to the
       * tutorial video modal so Highlighted Features can remain unused.
       */
      type: 'openHighlightedFeatures';
    }
  | {
      /**
       * CDXC:AddProject 2026-05-08-18:45
       * The reference Projects header add button should open the trusted native
       * folder picker.
       */
      type: 'pickWorkspaceFolder';
    }
  | {
      /** The missing-folder child modal asks native to locate this durable project again. */
      projectId: string;
      type: 'pickReplacementProjectFolder';
    }
  | {
      /*
       * CDXC:CommandPalette 2026-06-18-03:46:
       * Cmd+Shift+P exposes the main-window Open In actions. The modal host
       * sends only a target id; native resolves it against the active project,
       * current Settings visibility, and detected target availability so the
       * palette does not carry workspace paths or duplicate titlebar launch
       * rules.
       */
      targetId: string;
      type: 'openCurrentProjectInTarget';
    }
  | {
      /*
       * CDXC:CommandPalette 2026-06-18-03:46:
       * Open Current Project in Finder is a global command-palette action that
       * mirrors the main titlebar Open In affordance without sending a raw path
       * through React.
       */
      type: 'openCurrentProjectInFinder';
    }
  | {
      /**
       * CDXC:RemoteMachines 2026-06-02-23:47:
       * Disconnected Remote sidebar sections stay visible and expose only Reload. Native owns the SSH reconnect/start/install gxserver flow, so React sends the saved machine id instead of handling SSH details in the sidebar.
       *
       * CDXC:RemoteMachines 2026-06-02-23:38:
       * Missing gxserver installation requires explicit React modal approval.
       * The approval flag is carried back through the same reconnect command
       * so native can upload/install only after the user accepts.
       */
      installApproved?: boolean;
      remoteMachineId: string;
      type: 'reconnectRemoteMachine';
    }
  | {
      /**
       * CDXC:RemoteMachines 2026-08-19:
       * The Remote settings install action reads as Install for a machine that
       * has no gxserver yet and as Update for one that already runs it, so
       * React asks native whether the saved machine already has a gxserver
       * package and which version it is. The request carries only the bounded
       * machine id; native owns the SSH probe and answers with a
       * `remoteGxserverInstallState` host message.
       */
      remoteMachineId: string;
      type: 'probeRemoteGxserverInstall';
    }
  | {
      /**
       * CDXC:AddProject 2026-07-30:
       * Every server round trip the shared add-project dialog performs travels
       * on this one request. `machineId` is the whole routing vocabulary — the
       * host resolves it to the local daemon or to that machine's tunnel — so
       * the dialog never learns a host, a port, or a token. The host answers on
       * its own result channel keyed by `requestId`; nothing is optimistic, and
       * a dismissed dialog simply abandons the answer.
       */
      machineId?: string;
      operation: SidebarAddProjectDialogOperation;
      params?: SidebarAddProjectDialogRequestParams;
      requestId: string;
      type: 'addProjectDialogRequest';
    }
  | {
      type: 'createSessionInGroup';
      groupId: string;
    }
  | {
      /**
       * Project-heading terminal creation is a distinct intent from the generic
       * subgroup add button so the GPUI Windows host can own the WSL
       * create-and-attach sequence without changing other group creation.
       */
      type: 'createProjectTerminal';
      groupId: string;
    }
  | {
      type: 'focusGroup';
      groupId: string;
    }
  | {
      type: 'toggleFullscreenSession';
    }
  | {
      /*
       * CDXC:FocusRouting 2026-06-29-02:04:
       * The macOS focused-pane border must be preserved only for real sidebar session-row clicks. Send a hover-scoped native hint from the session card so AppKit's pre-dispatch mouseDown path can distinguish session focus clicks from other sidebar chrome before WebKit temporarily becomes first responder.
       */
      isSessionCard: boolean;
      type: 'setSidebarSessionFocusBorderHandoffHitTarget';
    }
  | {
      /*
       * CDXC:FocusRouting 2026-06-29-02:04:
       * If a session-row mouseDown is actually a child control, modified click, or context-menu path, cancel the pre-dispatch border handoff so only session focus selection keeps the old border during the AppKit sidebar responder gap.
       */
      type: 'cancelSidebarSessionFocusBorderHandoff';
    }
  | {
      type: 'focusSession';
      sessionId: string;
      /**
       * CDXC:Navigation 2026-09-11 DECISION:
       * User: landing on another project keeps that project's remembered view instead of switching to Agents.
       * The desktop runtime infers that from a project change on its own; this flag is for a Space restore, which may reopen a session inside the project already active and must still keep the view.
       */
      keepView?: boolean;
    }
  | {
      /**
       * CDXC:SavedPrompts 2026-08-24:
       * A Saved Prompts row asks to be taken back to the session it was stashed
       * from. The ids are RAW gxserver ids (never the combined
       * `combined-session:<project>:<session>` form) because the stash rows
       * carry the daemon's own ids, and `agentSessionId` is the durable
       * provider conversation id that survives the session being closed,
       * restored, or resumed under a new gxserver session row. All three are
       * optional: the handler resolves the best available target (live session
       * → recorded-but-closed session → resumable conversation) and shows a
       * notice when none of them can be opened.
       */
      type: 'jumpToStashedPromptSession';
      projectId?: string;
      sessionId?: string;
      agentSessionId?: string;
    }
  | {
      /**
       * CDXC:FocusMode 2026-05-23-09:28:
       * Session-card and pane-tab Focus is a reversible zoom for the clicked
       * session's pane tab group. The native/sidebar controller owns this
       * command because it must also switch from Code/Browser/Project/Manage
       * surfaces back to Agents while remembering the prior surface for unfocus.
       */
      type: 'focusSessionMode';
      sessionId: string;
    }
  | {
      type: 'promptRenameSession';
      sessionId: string;
    }
  | {
      type: 'restartSession';
      sessionId: string;
    }
  | {
      type: 'renameSession';
      agentId?: string;
      sessionId: string;
      title: string;
      /**
       * CDXC:SessionTitles 2026-05-09-17:25
       * Generate Title reuses renameSession with the saved 1st user message,
       * but must force controller-side title generation even when that message
       * is shorter than the rename modal's 70-character Generate Name threshold.
       */
      shouldGenerateTitle?: boolean;
    }
  | {
      type: 'renameGroup';
      groupId: string;
      title: string;
    }
  | {
      /**
       * CDXC:Worktrees 2026-05-28-07:46:
       * Combined project rows render worktrees as project headers, so project-name edits and delete confirmation prompts must route through trusted group ids instead of trusting DOM-provided paths.
       */
      type: 'renameWorkspaceProjectForGroup';
      groupId: string;
      title: string;
    }
  | {
      type: 'copyWorkspaceProjectPathForGroup';
      groupId: string;
    }
  | {
      /** Copy the exact Git origin URL the project presentation displayed. */
      type: 'copyWorkspaceProjectRemoteUrl';
      remoteUrl: string;
    }
  | {
      type: 'closeProjectFromProjects' | 'focusRecentProject' | 'restoreRecentProject';
      projectId: string;
    }
  | {
      /**
       * CDXC:Projects 2026-05-27-07:04:
       * Recent Projects rows have their own right-click menu because they are
       * parked projects without a rendered project group id. Route filesystem
       * and removal actions by trusted project id so the sidebar does not send
       * raw paths back to native.
       */
      type: 'copyRecentProjectPath' | 'openRecentProjectInFinder' | 'openRecentProjectTerminal' | 'removeRecentProject';
      projectId: string;
    }
  | {
      /**
       * CDXC:Workarea 2026-05-04-08:22
       * Combined-mode project cards expose native open actions from the
       * right-click menu. The native sidebar resolves the group id to its
       * trusted stored workspace path instead of accepting a client path.
       */
      type: 'openWorkspaceProjectInFinderForGroup' | 'openWorkspaceProjectInIdeForGroup';
      groupId: string;
    }
  | {
      /**
       * CDXC:CodeEditor 2026-05-06-14:21
       * Project editor buttons are trusted group-scoped commands. Native
       * resolves the group id to its stored project path before launching the
       * embedded code-server editor or refreshing its diff stats.
       *
       * CDXC:CodeEditor 2026-05-06-18:55
       * The editor card also accepts middle-click close, but the editor is not a
       * session; route close through the same trusted project/group resolver.
       */
      type:
        | 'closeWorkspaceProjectEditorForGroup'
        | 'openWorkspaceProjectEditorForGroup'
        | 'refreshWorkspaceProjectDiffForGroup';
      groupId: string;
    }
  | {
      /**
       * CDXC:AgentLauncher 2026-05-05-02:47
       * Sidebar Open In dropdowns know the active project but not a group id.
       * Route these commands through the native sidebar so stored workspace
       * paths remain trusted on the app side instead of being accepted from DOM.
       */
      type: 'openActiveWorkspaceProjectInFinder';
    }
  | {
      /**
       * CDXC:AgentLauncher 2026-05-05-03:11
       * The sidebar Open In dropdown lists explicit IDE targets. The selected
       * target must travel with the active-project open command instead of
       * being inferred from Settings, so choosing VS Code or Zed immediately
       * opens the project in that exact app.
       */
      targetApp: Extract<WorkspaceIdeTargetApp, 'vscode' | 'zed'>;
      type: 'openActiveWorkspaceProjectInIde';
    }
  | {
      /**
       * CDXC:Theming 2026-05-05-05:01
       * Preset theme selection must actively clear a previous Custom color.
       * `themeColor: null` is the sidebar-to-native signal that the custom
       * override is being removed, so icon and project-header tinting cannot
       * keep using stale custom CSS variables after a preset is selected.
       */
      type: 'setWorkspaceProjectThemeForGroup';
      groupId: string;
      theme?: SidebarTheme;
      themeColor?: string | null;
    }
  | {
      /**
       * CDXC:Projects 2026-05-04-14:25
       * Combined project context menus close projects into the Recent Projects
       * drawer instead of deleting their stored sessions. Remove remains the
       * explicit project-delete path.
       */
      type: 'removeWorkspaceProjectForGroup';
      groupId: string;
    }
  | {
      type: 'closeWorkspaceProjectForGroup';
      groupId: string;
      /**
       * CDXC:Projects 2026-09-16 DECISION:
       * User: closing a project in a Space stays in that Space and selects a non-sleeping session from the next project in the list.
       * The sidebar resolves that session from the rows the user sees (packages/gx-core/src/sidebar_view/close_successor.rs) and the host focuses it BEFORE parking the project, so the active project never falls back to one outside the Space.
       */
      successorSessionId?: string;
    }
  | {
      /**
       * CDXC:Worktrees 2026-06-02-13:41:
       * Delete Worktree first asks gxserver for a fresh Git status summary,
       * then the native sidebar opens the full-window confirmation modal before
       * any checkout directory is removed.
       */
      type: 'promptDeleteWorktreeForGroup';
      groupId: string;
    }
  | {
      /**
       * CDXC:Worktrees 2026-08-09-18:40:
       * Rename Worktree collects the worktree's git state — populated
       * submodules, lock, pushed branch, uncommitted changes, live sessions —
       * before the native modal opens, because those answers decide whether the
       * rename can happen at all and the modal has no way to ask for them
       * itself. This is separate from the label-only `Rename` above it, which
       * changes the project row's title and nothing on disk.
       */
      type: 'promptRenameWorktreeForGroup';
      groupId: string;
    }
  | {
      type: 'closeGroup';
      groupId: string;
    }
  | {
      type: 'closeSession';
      sessionId: string;
    }
  | {
      type: 'closeSessions';
      sessionIds: string[];
    }
  | {
      type: 'setSessionSleeping';
      sessionId: string;
      sleeping: boolean;
    }
  | {
      type: 'setSessionsSleeping';
      sessionIds: string[];
      sleeping: boolean;
      /**
       * CDXC:SessionSleep 2026-06-13-12:59:
       * Bulk sleep diagnostics need to distinguish Sleep below from other
       * setSessionsSleeping callers without logging session ids, titles, paths,
       * commands, or user text. Keep this as an enum-like action source only.
       */
      source?: 'sleepBelow';
    }
  | {
      favorite: boolean;
      type: 'setSessionFavorite';
      sessionId: string;
    }
  | {
      sessionId: string;
      sessionTag?: SidebarSessionTag | null;
      type: 'setSessionTag';
    }
  | {
      /**
       * CDXC:SessionNotes 2026-08-24:
       * Writes the session's free-text note. The host resolves the provider
       * conversation id the note is filed under, so the renderer only names the
       * session; `projectId` is an optional hint for hosts that need the scope
       * to route the write. An empty (or whitespace-only) note clears it. The UI
       * is NOT optimistic: the presentation delta that follows the write is what
       * updates the row.
       */
      note: string;
      projectId?: string;
      sessionId: string;
      type: 'setSessionNote';
    }
  | {
      pinned: boolean;
      type: 'setSessionPinned';
      sessionId: string;
    }
  | {
      parked: boolean;
      type: 'setSessionParked';
      sessionId: string;
    }
  | {
      /**
       * CDXC:StateSync 2026-07-29:
       * Sidebar V2's settle/snooze commands. They carry only the sidebar
       * session id, exactly like `setSessionPinned` and `setSessionSleeping`:
       * the host already owns the id -> (machine, project, session) mapping and
       * must not accept a project scope from the renderer.
       *
       * Every command is idempotent server-side, and the UI is NOT optimistic:
       * the presentation delta that follows the write is what moves the row.
       */
      sessionId: string;
      type: 'settleSession' | 'unsettleSession' | 'unsnoozeSession';
    }
  | {
      sessionId: string;
      /** ISO wake time; gxserver rejects anything not strictly in the future. */
      snoozedUntil: string;
      type: 'snoozeSession';
    }
  | {
      type: 'setGroupSleeping';
      groupId: string;
      sleeping: boolean;
    }
  | {
      /**
       * CDXC:SessionSleep 2026-05-27-01:50:
       * Combined project rows do not map to one native workspace group. Their
       * context-menu sleep action must be project-scoped and must only sleep
       * inactive sessions so running, working, and attention sessions stay
       * awake.
       */
      type: 'sleepInactiveProjectSessions';
      groupId: string;
    }
  | {
      /**
       * CDXC:Projects 2026-06-04-23:40:
       * Combined project-row Close inactive is project-scoped, not group-scoped.
       * It closes idle terminal sessions while preserving working and attention
       * sessions, and it must not park the whole project in Recent Projects.
       */
      type: 'closeInactiveProjectSessions';
      groupId: string;
    }
  | {
      /**
       * CDXC:SessionSleep 2026-05-27-02:18:
       * Combined project-row Wake must wake sleeping terminal sessions across
       * every workspace group because the row does not carry a concrete native
       * workspace group id.
       */
      type: 'wakeProjectSleepingSessions';
      groupId: string;
    }
  | {
      /**
       * CDXC:ContextMenus 2026-06-11-23:08:
       * The React sidebar builds Copy details text from its rendered session row
       * and sends only that user-requested clipboard payload to native.
       */
      type: 'copySessionDetails';
      detailsText: string;
      sessionId: string;
    }
  | {
      /**
       * CDXC:DelayedSend 2026-05-11-11:56
       * Delayed Send schedules an Enter keypress for an already-staged terminal
       * command. The sidebar/modal sends only the trusted session id and delay;
       * native resolves the terminal and uses the existing Enter-key path.
       *
       * CDXC:DelayedSend 2026-08-19:
       * Exactly one trigger travels in this message. `delayMs` is present only
       * for the "after a delay" trigger, so the status triggers cannot be read
       * as a second, conflicting trigger by the daemon endpoint.
       */
      delayMs?: number;
      sendWhenAllProjectSessionsStop?: boolean;
      sendWhenAgentStops?: boolean;
      sendWhenSpecificAgentFinishes?: DelayedSendAgentReference;
      sessionId: string;
      type: 'scheduleDelayedSend';
    }
  | {
      /**
       * CDXC:DelayedSend 2026-05-17-03:14
       * Users must be able to cancel a scheduled delayed send from the same
       * modal/sidebar affordance that shows the remaining countdown.
       */
      sessionId: string;
      type: 'cancelDelayedSend';
    }
  | {
      delayMs: number;
      sessionId: string;
      type: 'postponeDelayedSend';
    }
  | {
      /**
       * CDXC:Sessions 2026-06-15-21:00:
       * Session context menus toggle Close After Done without sending titles,
       * commands, or terminal content. Native owns the actual three-minute Done
       * stability timer and routes closure through the existing close path.
       */
      sessionId: string;
      type: 'toggleCloseAfterDone';
    }
  | {
      type: 'forkSession';
      sessionId: string;
    }
  | {
      /** Open the existing transcript export flow for this exact agent session. */
      type: 'exportSessionTranscript';
      sessionId: string;
    }
  | {
      type: 'fullReloadSession';
      sessionId: string;
    }
  | {
      /**
       * CDXC:AgentProviders 2026-09-03:
       * Resume this session under another same-family agent configuration
       * (`agentId` is one of the row's `switchableAgents`): the runtime asks
       * gxserver to rewrite the launch identity, then full-reloads the session.
       */
      type: 'switchSessionAgent';
      sessionId: string;
      agentId: string;
    }
  | {
      /**
       * CDXC:Workarea 2026-05-19-10:15:
       * Browser and agent session cards expose Pop Out Pane in the sidebar
       * context menu. The controller toggles pop-out presentation from the
       * current session record, matching the focused-pane hotkey behavior.
       */
      sessionId: string;
      type: 'popOutPane';
    }
  | {
      type: 'fullReloadGroup';
      groupId: string;
    }
  | {
      /**
       * CDXC:Projects 2026-05-27-02:18:
       * Combined project rows need a project-scoped full reload because their
       * sidebar group id is synthetic. Reload only idle attached zmx terminals
       * so project-level reload never interrupts working or attention sessions
       * and never tries to restore sleeping/detached history records.
       */
      type: 'fullReloadProjectZmxSessions';
      groupId: string;
    }
  | {
      /**
       * CDXC:Browser 2026-05-02-06:35
       * Browser session cards expose pane-specific controls copied from the
       * native browser workflow: DevTools, the Settings-selected feedback tool,
       * and profile selection. The native host owns the macOS UI and WebKit/CEF
       * work.
       */
      action: 'devtools' | 'feedback-tool' | 'profile-picker';
      sessionId: string;
      type: 'runBrowserPaneAction';
    }
  | {
      /**
       * CDXC:Sessions 2026-06-01-15:08:
       * Previous Sessions is loaded on demand from gxserver after the presentation hard cutover. React sends debounced metadata queries through native so startup no longer hydrates all previous-session history into the sidebar store.
       */
      limit?: number;
      cursor?: string;
      query?: string;
      requestId: string;
      sessionTags?: SidebarSessionTagFilter[];
      projectId?: string;
      externalOnly?: boolean;
      refreshExternalSessions?: boolean;
      type: 'requestPreviousSessions';
    }
  | {
      requestId: string;
      sessions: Array<{
        historyId?: string;
        key: string;
        routingId?: string;
      }>;
      type: 'requestSessionTranscriptSizes';
    }
  | {
      machineId?: string;
      type: 'requestRecentProjects';
    }
  | {
      historyId: string;
      type: 'restorePreviousSession';
    }
  | {
      historyId: string;
      type: 'deletePreviousSession';
    }
  | {
      /**
       * CDXC:Sessions 2026-05-29-12:36:
       * Previous Sessions needs a direct text-search launcher. Keep it as an
       * explicit sidebar command so the Search row can start a fresh terminal
       * running `gx f`.
       *
       * CDXC:Sessions 2026-05-29-20:32:
       * Search by Text must create that terminal in the currently active
       * project, not in the Quick/projectless terminal area.
       *
       * CDXC:Sessions 2026-06-13-01:09:
       * The Previous Sessions modal no longer renders launch buttons, and the
       * agent-based previous-session prompt path has been removed. This command
       * remains the direct Search row launcher only.
       */
      type: 'searchPreviousSessionsByText';
    }
  | {
      content: string;
      promptId?: string;
      title: string;
      type: 'savePinnedPrompt';
    }
  | {
      /**
       * CDXC:SavedPrompts 2026-07-29:
       * The session Prompts modal loads gxserver-stashed prompt-editor saves on
       * demand. projectId limits the answer to that project plus its worktree
       * family; omitting it returns every stashed prompt.
       */
      projectId?: string;
      requestId: string;
      type: 'requestStashedPrompts';
      includeRecovery?: boolean;
      includeDelivered?: boolean;
    }
  | {
      promptId: string;
      type: 'deleteStashedPrompt';
    }
  | {
      /**
       * CDXC:SavedPrompts 2026-08-23:
       * Creates a tag, or renames/recolors `tagId` when it is supplied. The
       * daemon owns the catalogue, so the modal never mints tag ids itself.
       */
      color?: string;
      name: string;
      requestId: string;
      tagId?: string;
      type: 'saveStashedPromptTag';
    }
  | {
      /** Unfiles every prompt carrying this tag; the prompts themselves stay. */
      requestId: string;
      tagId: string;
      type: 'deleteStashedPromptTag';
    }
  | {
      /** Replaces one prompt's whole tag set, including its Favorites star. */
      promptId: string;
      requestId: string;
      tagIds: string[];
      type: 'setStashedPromptTags';
    }
  | {
      content: string;
      promptId?: string;
      projectId?: string;
      requestId: string;
      sessionId?: string;
      /** Explicit manual filing; an empty array means No tag. */
      tagIds?: string[];
      type: 'saveStashedPrompt';
    }
  | {
      /**
       * CDXC:SavedPrompts 2026-07-29:
       * Selecting a stashed prompt inserts its text into the named session's
       * active composer without submitting it. The host owns the chat/native
       * input mechanics; the modal only supplies the prompt body and target.
       */
      content: string;
      promptId: string;
      sessionId?: string;
      type: 'insertStashedPrompt';
    }
  | {
      type: 'moveSessionToGroup';
      groupId: string;
      sessionId: string;
      targetIndex?: number;
    }
  | {
      type: 'sidebarDebugLog';
      event: string;
      details?: unknown;
      scenarioId: DiagnosticLoggingScenarioId;
    }
  | {
      type: 'createGroupFromSession';
      sessionId: string;
    }
  | {
      type: 'createGroup';
      /**
       * CDXC:StateSync 2026-07-02-03:49:
       * GPUI can create a group inside a specific project section, while legacy macOS sidebar handlers can still use the active project fallback.
       *
       * Optional sidebar group id identifying the project the new group should
       * belong to. Hosts without it (macOS legacy handler) fall back to the
       * active project.
       */
      groupId?: string;
    }
  | {
      type: 'setVisibleCount';
      visibleCount: VisibleSessionCount;
      groupId?: string;
    }
  | {
      type: 'setViewMode';
      viewMode: TerminalViewMode;
    }
  | {
      type: 'toggleActiveSessionsSortMode';
    }
  | {
      manualSessionIdsByGroup?: Record<string, string[]>;
      sortMode: SidebarActiveSessionsSortMode;
      type: 'setActiveSessionsSortMode';
    }
  | {
      type: 'syncSessionOrder';
      groupId: string;
      sessionIds: string[];
    }
  | {
      type: 'syncGroupOrder';
      groupIds: string[];
    }
  | {
      /*
      CDXC:Projects 2026-07-18-00:00:
      SidebarApp write-through-syncs its whole project-collection overlay after
      each local edit. The host debounces and pushes the wire state to
      gxserver's /api/updateSidebarProjectCollections; only bounded metadata
      (ids, titles, colors, project membership, ordering) crosses this message.
      */
      state: GxserverSidebarProjectCollectionsState;
      remoteMachineId?: string;
      type: 'updateSidebarProjectCollections';
    }
  | {
      /*
      CDXC:Spaces 2026-08-27:
      SidebarApp write-through-syncs the whole Space document of one gxserver
      after each local edit. The host debounces and pushes the wire state to
      that daemon's /api/updateSidebarSpaces; only bounded metadata (space ids,
      names, icon ids, colors, collection/project membership, ordering) crosses
      this message. `remoteMachineId` selects the owning daemon, because each
      gxserver section keeps its own Space set.
      */
      remoteMachineId?: string;
      state: GxserverSidebarSpacesState;
      type: 'updateSidebarSpaces';
    }
  | {
      /**
       * CDXC:Sessions 2026-09-11 WHY:
       * SidebarApp write-through-syncs the whole custom session tag catalog of one gxserver after each create, delete, or reorder. The host pushes the wire state to that daemon's /api/updateCustomSessionTags; `remoteMachineId` selects the owning daemon.
       */
      remoteMachineId?: string;
      state: GxserverCustomSessionTagsState;
      type: 'updateCustomSessionTags';
    }
  | (SidebarSpaceEditorResultFields & {
      /*
      CDXC:Spaces 2026-08-27:
      The New/Edit Space dialog's confirm (and its Delete). It travels as a
      sidebar command because the dialog is a separate app-modal window, and the
      host bounces it straight back to SidebarApp as
      `applySidebarSpaceEditorResult` instead of acting on it: only SidebarApp
      holds the Space document, and only it can apply an edit to the CURRENT one.
      */
      type: 'sidebarSpaceEditorResult';
    })
  | {
      /*
      CDXC:CommandPane 2026-06-26-05:11:
      `runSidebarCommand` is a narrow Action selector: renderer messages may provide only the saved command id and optional run mode. Native and GPUI hosts must resolve command text, URLs, saved close-on-exit metadata, cwd/env, paths, output, and launch behavior from trusted command/HUD state.

      CDXC:Projects 2026-08-01:
      Project-row Action buttons add an optional group selector like
      `runSidebarAgent` already carries. The host resolves the group to its
      project, activates that project through the existing focus flow, and only
      then dispatches the trusted launch — the message never gains launch
      metadata or project paths.

      CDXC:AgentLauncher 2026-08-07:
      Project rows also render Global Actions flagged showOnProjectRow, so the
      selector must say which list its id belongs to: the two scopes are
      separate id spaces and an id alone cannot pick one. Scope stays optional
      and absent means project, so senders that only ever run Project Actions
      are unchanged. A global selector may still carry the row's group id —
      that names the project the Action runs in, not the list it came from.
      */
      type: 'runSidebarCommand';
      commandId: string;
      groupId?: string;
      runMode?: SidebarCommandRunMode;
      scope?: SidebarCommandScope;
    }
  | {
      type: 'endSidebarCommandRun';
      commandId: string;
    }
  | {
      action: SidebarGitAction;
      groupId?: string;
      projectId?: string;
      type: 'runSidebarGitAction';
    }
  | {
      action: SidebarGitAction;
      groupId?: string;
      projectId?: string;
      type: 'setSidebarGitPrimaryAction';
    }
  | {
      /*
      CDXC:Git 2026-06-24-21:26:
      Git refreshes can originate from reused project-scoped controls, including remote project rows. Carry the optional group/project scope so GPUI refreshes the owning gxserver project instead of falling back to the active local project.
      */
      groupId?: string;
      projectId?: string;
      type: 'refreshGitState';
    }
  | {
      enabled: boolean;
      groupId?: string;
      projectId?: string;
      type: 'setSidebarGitCommitConfirmationEnabled';
    }
  | {
      enabled: boolean;
      groupId?: string;
      projectId?: string;
      type: 'setSidebarGitGenerateCommitBodyEnabled';
    }
  | {
      commitOnNewRef?: boolean;
      deleteWorktreeAfter?: boolean;
      agentId?: string;
      filePaths?: string[];
      message: string;
      requestId: string;
      type: 'confirmSidebarGitCommit';
    }
  | {
      deleteWorktreeAfter?: boolean;
      agentId?: string;
      filePaths?: string[];
      message: string;
      requestId: string;
      type: 'confirmSidebarGitDirectMerge';
    }
  | {
      agentId?: string;
      requestId: string;
      type: 'runSidebarGitMultipleCommits';
    }
  | {
      filePath: string;
      /*
      CDXC:Git 2026-06-24-15:43:
      Commit-review changed-file opens may include the active review request id so non-native hosts can validate the file against the gxserver-derived review list before native code resolves and opens the project-relative path.

      CDXC:Git 2026-06-24-21:26:
      Non-review changed-file opens may come from scoped Git controls. Carry the same optional group/project scope as Git actions so GPUI can re-read the owning local or remote gxserver project before opening a file.
      */
      groupId?: string;
      projectId?: string;
      requestId?: string;
      openLocation?: boolean;
      type: 'openSidebarGitChangedFile';
    }
  | {
      filePath: string;
      requestId?: string;
      type: 'openSidebarGitChangedFileDiff';
    }
  | {
      requestId: string;
      type: 'cancelSidebarGitCommit';
    }
  | {
      /**
       * CDXC:Worktrees 2026-06-10-22:56:
       * Delete Worktree confirmation may request branch cleanup after the
       * checkout is removed. Keep only boolean user choices in the sidebar
       * bridge message; native re-resolves branch names before mutating Git.
       */
      deleteLocalBranch?: boolean;
      deleteRemoteBranch?: boolean;
      projectId: string;
      type: 'confirmDeleteWorktree';
    }
  | {
      groupId: string;
      type: 'commitWorktreeBeforeDelete';
    }
  | {
      /**
       * CDXC:Worktrees 2026-08-09-18:40:
       * One typed name plus one boolean. gxserver derives the destination folder
       * (`<ParentFolder>-<slug>`) and the project label from it, so the modal
       * never names a path; `renameBranch` stays opt-in because renaming a
       * pushed branch breaks the user's next push.
       */
      name: string;
      projectId: string;
      renameBranch?: boolean;
      type: 'confirmRenameWorktree';
    }
  | {
      type: 'saveSidebarCommand';
      actionType: SidebarActionType;
      closeTerminalOnExit: boolean;
      commandId?: string;
      icon?: SidebarCommandIcon;
      links?: SidebarCommandLink[];
      name: string;
      playCompletionSound: boolean;
      showOnProjectRow: boolean;
      command?: string;
      url?: string;
    }
  | {
      type: 'deleteSidebarCommand';
      commandId: string;
    }
  | {
      requestId: string;
      type: 'syncSidebarCommandOrder';
      commandIds: string[];
    }
  /*
   * CDXC:AgentLauncher 2026-08-01:
   * Global Actions get their own message types rather than a scope flag on the
   * project ones. A host that predates this feature drops an unknown message
   * type through the unsupported-message path, which is a visible no-op; a host
   * that ignored an unknown scope field would instead write the Global Action
   * into whichever project happened to be active.
   */
  | {
      type: 'saveGlobalSidebarCommand';
      actionType: SidebarActionType;
      closeTerminalOnExit: boolean;
      commandId?: string;
      icon?: SidebarCommandIcon;
      links?: SidebarCommandLink[];
      name: string;
      playCompletionSound: boolean;
      /*
       * CDXC:AgentLauncher 2026-08-07:
       * Settings offers the project-row toggle on Global Actions too, and
       * gxserver stores it for both lists. The field was missing here, so the
       * host had nothing to forward and every global save wrote the flag back
       * as false — the toggle looked saved and did nothing.
       */
      showOnProjectRow: boolean;
      command?: string;
      url?: string;
    }
  | {
      type: 'deleteGlobalSidebarCommand';
      commandId: string;
    }
  | {
      requestId: string;
      type: 'syncGlobalSidebarCommandOrder';
      commandIds: string[];
    }
  | {
      type: 'runSidebarAgent';
      agentId: string;
      accountId?: string;
      groupId?: string;
    }
  | {
      type: 'confirmAgentHookLaunch';
      agentId: string;
      accountId?: string;
      groupId?: string;
      hookAgentId: string;
      installHooks: boolean;
    }
  | {
      type: 'createProjectWorktree';
      agentId?: string;
      baseBranch?: string;
      existingWorktreeKey?: string;
      existingWorktreePath?: string;
      mode?: 'create' | 'openExisting';
      prompt?: string;
      projectId?: string;
      projectPath?: string;
      remoteMachineId?: string;
    }
  | {
      type: 'requestProjectWorktrees';
      projectId?: string;
      projectPath?: string;
      requestId: string;
      remoteMachineId?: string;
    }
  /*
   * CDXC:Worktrees 2026-07-29:
   * Sidebar V2's worktree flow. These mirror gxserver's
   * `/api/createWorktreeSession` and `/api/removeSessionWorktree` one-for-one,
   * with two deliberate differences:
   * - `projectId` is the SIDEBAR project/group id (the same value V2 rows carry
   *   as `projectId`), so the host resolves the owning daemon and gxserver
   *   project itself. The renderer never picks a daemon.
   * - `existingWorktreePath` is flat here and nests into `existingWorktree` on
   *   the wire; the sidebar has one field to fill, the endpoint has one shape.
   * `requestId` exists because the popover has a pending state: the answer
   * comes back as `worktreeSessionResult` / `sessionWorktreeRemovalResult`, and
   * a stale answer must never re-enable a form the user already reopened.
   */
  | {
      agentId?: string;
      baseBranch?: string;
      existingWorktreePath?: string;
      firstPrompt?: string;
      projectId: string;
      requestId: string;
      startFromOrigin?: boolean;
      type: 'createWorktreeSession';
    }
  | {
      /** Retry after a `dirty: true` answer: remove the checkout anyway. */
      force?: boolean;
      projectId: string;
      requestId: string;
      type: 'removeSessionWorktree';
      worktreePath: string;
    }
  | {
      type: 'setProjectWorktreeCommand';
      command: string;
      projectId: string;
    }
  | {
      type: 'setProjectBeadsDisplayKey';
      displayKey: string;
      projectId: string;
    }
  | {
      type: 'setProjectBeadsDirectory';
      directory: string;
      projectId: string;
    }
  | {
      /*
       * CDXC:Docs 2026-08-09:
       * Absolute folder this project's Docs surface shows in addition to the
       * project's own docs. Blank clears the override so the project inherits
       * the Docs directory Global Default.
       */
      type: 'setProjectDocsDirectory';
      directory: string;
      projectId: string;
    }
  | {
      /*
       * CDXC:Projects 2026-06-17-17:13:
       * The Projects settings selector lists durable project rows, so Settings must be able to remove any selected project through the same native removeProject path used by project headers instead of limiting deletion to sidebar context menus.
       */
      type: 'removeProject';
      projectId: string;
    }
  | {
      acceptAllMode?: AgentAcceptAllMode;
      type: 'saveSidebarAgent';
      agentId?: string;
      command: string;
      icon?: SidebarAgentIcon;
      name: string;
    }
  | {
      type: 'deleteSidebarAgent';
      agentId: string;
    }
  | {
      requestId: string;
      type: 'syncSidebarAgentOrder';
      agentIds: string[];
    }
  /**
   * CDXC:Icons 2026-06-25-21:50:
   * Settings -> App Icon talks to native through these four messages. Native
   * owns the icons folder, file picking, and the live Dock/app-switcher icon;
   * the sidebar only requests state and selections. sourceId is a filename in
   * the icons folder, or "" to restore the default bundled icon. The sidebar
   * waits for an ok appIconState event before persisting appIconSourceId
   * (confirm-before-persist) so a failed native swap never sticks in settings.
   */
  | {
      type: 'listAppIcons';
    }
  | {
      type: 'setAppIcon';
      sourceId: string;
    }
  | {
      type: 'pickAppIconFile';
    }
  | {
      type: 'revealAppIconsFolder';
    }
  /**
   * CDXC:Terminal 2026-08-01:
   * Settings -> Terminal Background Image "Browse" opens a native file dialog
   * host-side; the picked absolute path comes back to the settings modal as a
   * terminalBackgroundImageFilePicked host message and fills the path field.
   */
  | {
      type: 'pickTerminalBackgroundImageFile';
    }
  /** Settings -> Window glass -> Custom image: same round trip, answered as windowGlassImageFilePicked. */
  | {
      appearance: 'dark' | 'light';
      type: 'pickWindowGlassImageFile';
    }
  /** Settings -> Window glass -> Live -> Your video: "Choose a file…", answered as windowGlassVideoFilePicked with a path or an error. */
  | {
      appearance: 'dark' | 'light';
      type: 'pickWindowGlassVideoFile';
    }
  /**
   * CDXC:Onboarding 2026-08-24:
   * The onboarding footer's Add 1st project action opens a native folder dialog
   * host-side. The picked absolute path returns to the modal as a
   * firstLaunchProjectFolderPicked host message, then registers `path` as a
   * project and starts its first session with `agentId` (a sidebar agent id or
   * 'terminal' for a plain shell).
   */
  | {
      type: 'pickFirstLaunchProjectFolder';
    }
  | {
      agentId: string;
      path: string;
      requestId: string;
      type: 'firstLaunchCreateProjectSession';
    };

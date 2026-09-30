import type { SettingsAgentsSection, SettingsRemoteSection } from '../app-modal-host-bridge';
import { type SettingsModalTab } from '../settings-modal-tabs';
import { type CompletionSoundSetting } from '../../shared/completion-sound';
import {
  type SidebarAppIconStateMessage,
  type SidebarAgentHookStatusMessage,
  type SidebarGhostexCliStatusMessage,
  type SidebarGhostexFolderStatsMessage,
  type SidebarOSIntegrationStatusMessage,
  type SidebarPluginSettingsItem,
  type SidebarPluginSettingsStatusMessage,
  type SidebarPortlessState,
  type SidebarProjectSettingsItem,
  type SidebarTheme,
} from '../../shared/session-grid-contract';
import {
  type ghostexSettingsPatch,
  type ghostexSettingsUpdateSource,
  type ghostexSettings,
} from '../../shared/ghostex-settings';
import { type BundledGhostexAgentSkillId } from '../../shared/ghostex-agent-skills';
import { type FirstLaunchSetupMainSettingKey } from '../../shared/first-launch-setup-settings';
import { type CustomSessionTagsState } from '../../shared/session-tags';
import { type WebviewApi } from '../webview-api';
import { type RemoteSetupRpc } from '../remote-setup-modal/gxserver-rpc';
import { MainSettingsScrollTargetId } from './types';
import { type GhosttySettingsAction } from './settings-actions';

export type MainSettingsInitialSectionId = MainSettingsScrollTargetId;

/**
 * CDXC:Sessions 2026-09-12 DECISION:
 * User: creating a session tag happens in one place only. The sidebar's New tag row deep-links into Settings > Sidebar Tags and asks for the create form to be open on arrival, instead of offering a second inline editor inside the Tag as menu.
 */
export type SettingsSidebarTagsAction = 'createTag';

export type SettingsModalPresentation = 'default' | 'firstLaunchSetup';

export type SettingsModalProps = {
  agentHookStatus?: SidebarAgentHookStatusMessage;
  agentHookStatusLoading?: boolean;
  automateIsExperimental?: boolean;
  firstLaunchSetupVisibleSettings?: ReadonlySet<FirstLaunchSetupMainSettingKey>;
  initialSection?: MainSettingsInitialSectionId;
  initialSidebarTagsAction?: SettingsSidebarTagsAction;
  initialSearchQuery?: string;
  initialRemoteMachineId?: string;
  /** CDXC:RemotePairing 2026-09-03: Remote tab card to scroll to (consumed by the Remote tab). */
  initialRemoteSection?: SettingsRemoteSection;
  /** Agents tab card to scroll to (consumed by the Agents tab). */
  initialAgentsSection?: SettingsAgentsSection;
  initialCustomViewId?: string;
  /** Open one view's scope editor straight away; see ExtensionsSettingsTab. */
  initialViewScopeKey?: string;
  initialTab?: SettingsModalTab;
  isOpen: boolean;
  presentation?: SettingsModalPresentation;
  onChange: (settings: ghostexSettings, source?: ghostexSettingsUpdateSource) => void;
  onPatch?: (patch: ghostexSettingsPatch, source: ghostexSettingsUpdateSource) => void;
  onClose: () => void;
  onOpenAccessibilityPreferences?: () => void;
  onOpenMacOSNotificationSettings?: () => void;
  onOpenScreenRecordingPreferences?: () => void;
  onOpenGhostexFolder?: () => void;
  onGhosttySettingsAction?: (action: GhosttySettingsAction) => void;
  onInstallCliSkill?: () => void;
  onInstallBrowserControl?: () => void;
  onInstallBrowserUseSkill?: () => void;
  onInstallComputerUseSkill?: () => void;
  onInstallCuaDriver?: () => void;
  onReinstallCuaDriver?: () => void;
  onUninstallCuaDriver?: () => void;
  onCheckCuaDriverUpdate?: () => void;
  onInstallAgentsOrchestrationSkill?: () => void;
  onInstallManageBeadsSkill?: () => void;
  onInstallGenerateTitleSkill?: () => void;
  onInstallGhostexCli?: () => void;
  onInstallMoveCodexSessionSkill?: () => void;
  onInstallHelpSkill?: () => void;
  onPlayCompletionSound?: (sound: CompletionSoundSetting) => void;
  onRequestMacOSNotificationPermission?: () => void;
  /*
   * CDXC:AgentHooks 2026-08-28:
   * Settings installs hooks for one agent from its roster row and for the whole
   * supported set from the toolbar, so install takes the same optional agentIds
   * the uninstall side and the native message contract already carry.
   */
  onInstallAgentHooks?: (agentIds?: readonly string[]) => void;
  onUninstallAgentHooks?: (agentIds?: readonly string[]) => void;
  onUninstallBundledAgentSkill?: (skillId: BundledGhostexAgentSkillId) => void;
  onUninstallBundledAgentSkills?: () => void;
  onRequestAgentHookStatus?: () => void;
  onRequestGhostexCliStatus?: () => void;
  onRequestGhostexFolderStats?: () => void;
  onRequestOSIntegrationStatus?: () => void;
  onRequestPluginSettingsStatus?: () => void;
  onReinstallPlugin?: (pluginId: SidebarPluginSettingsItem['id']) => void;
  onSetOSIntegrationDefaults?: (target: 'editor' | 'terminalLinks' | 'scriptRunner' | 'all') => void;
  onTestAgentTaskCompletion?: () => void;
  projects?: SidebarProjectSettingsItem[];
  projectViewSpaces?: import('@/packages/shared/ghostex-settings/project-views').ProjectViewSpace[];
  projectViewProjects?: import('@/packages/shared/ghostex-settings/project-views').ProjectViewProject[];
  settings?: ghostexSettings;
  /**
   * Talks to the gxserver that owns Easy Connect and SSH access. Absent where
   * the host has no daemon connection, which leaves the Remote page's pairing
   * cards and Advanced section out entirely.
   */
  tailcatRpc?: RemoteSetupRpc;
  theme?: SidebarTheme;
  /**
   * Writes the local daemon's custom session tag catalog through the host. Absent on hosts with no daemon connection, which hides Add tag and the delete buttons in Sidebar Tags.
   */
  onUpdateCustomSessionTags?: (state: CustomSessionTagsState) => void;
  vscode?: WebviewApi;
  ghostexCliStatus?: SidebarGhostexCliStatusMessage;
  ghostexCliStatusLoading?: boolean;
  ghostexFolderStats?: SidebarGhostexFolderStatsMessage;
  ghostexFolderStatsLoading?: boolean;
  osIntegrationStatus?: SidebarOSIntegrationStatusMessage;
  osIntegrationStatusLoading?: boolean;
  pluginSettingsStatus?: SidebarPluginSettingsStatusMessage;
  pluginSettingsStatusLoading?: boolean;
  // CDXC:Icons 2026-06-25-21:50: Native App Icon state arrives prop-driven via the modal-state relay.
  appIconState?: SidebarAppIconStateMessage;
  /** Hosts without a native App Icon subsystem hide the section entirely. */
  appIconPickerUnavailable?: boolean;
  /** The system's own transparency switch is keeping the window opaque. */
  windowGlassBlockedBySystem?: boolean;
  /**
   * Retained for the hosts that still pass sidebar Portless state; Settings no
   * longer renders Portless controls (see docs/2026-09-03/mobile-setup plan §5.12).
   */
  portless?: SidebarPortlessState;
};

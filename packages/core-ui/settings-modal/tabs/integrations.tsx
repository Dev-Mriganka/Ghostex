import { useState, type ReactNode } from 'react';
import { Button } from '@/packages/components/ui/button';
import { Switch } from '@/packages/components/ui/switch';
import { AppTooltip } from '../../app-tooltip';
import { IconDeviceDesktop, IconDownload, IconInfoCircle, IconRefresh, IconTerminal2 } from '@tabler/icons-react';
import { type SidebarGhostexCliStatusMessage } from '../../../shared/session-grid-contract';
import { type BundledGhostexAgentSkillId } from '../../../shared/ghostex-agent-skills';
import { AgentSkillsSection, DesktopControlSection, IntegrationRowTitle } from './integration-skills';
import { ManagedToolsSection } from './managed-tools-section';
import type { ManagedToolId } from '../../../shared/managed-tools';
import { SettingButton, SettingsListItem, SettingsNativeScrollArea, SettingsSection } from '../fields';
import {
  SettingsTabSearch,
  hasVisibleSettingsSearchResult,
  shouldShowSetting,
  shouldShowSettingsSection,
} from '../search';
import { IS_MAC_HOST } from '../search-catalog';
import { playCopySound } from '../../copy-sound';

export function getCuaPermissionStatus(
  ghostexCliStatus: SidebarGhostexCliStatusMessage | undefined,
  ghostexCliStatusLoading: boolean
): { status: string; tone: 'success' | 'warning' | 'neutral' } {
  if (ghostexCliStatusLoading || !ghostexCliStatus) {
    return { status: 'Checking', tone: 'neutral' };
  }
  if (ghostexCliStatus?.cuaDriverInstalled !== true) {
    return { status: 'Fast Computer Use Not Installed', tone: 'warning' };
  }

  const accessibilityGranted = ghostexCliStatus.cuaDriverAccessibilityPermissionGranted;
  const screenRecordingGranted = ghostexCliStatus.cuaDriverScreenRecordingPermissionGranted;
  if (accessibilityGranted === true && screenRecordingGranted === true) {
    return { status: 'Permissions Allowed', tone: 'success' };
  }
  if (accessibilityGranted === false && screenRecordingGranted === false) {
    return { status: 'Permissions Off - Open Settings', tone: 'warning' };
  }
  if (accessibilityGranted === false) {
    return { status: 'Accessibility Off - Open Settings', tone: 'warning' };
  }
  if (screenRecordingGranted === false) {
    return { status: 'Screen Recording Off - Open Settings', tone: 'warning' };
  }
  if (accessibilityGranted === true) {
    return { status: 'Screen Recording Unknown', tone: 'warning' };
  }
  if (screenRecordingGranted === true) {
    return { status: 'Accessibility Unknown', tone: 'warning' };
  }
  return { status: 'Permission Status Unknown', tone: 'warning' };
}

export function VersionInfoButton({ label, version }: { label: string; version: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <AppTooltip content={copied ? `Copied ${version}` : version}>
      <Button
        aria-label={`Copy ${label} version ${version}`}
        onClick={() => {
          playCopySound();
          void navigator.clipboard.writeText(version).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            },
            () => undefined
          );
        }}
        size='icon-xs'
        type='button'
        variant='ghost'
      >
        <IconInfoCircle aria-hidden='true' />
      </Button>
    </AppTooltip>
  );
}

/** The hotkey that opens Floating Capture, in this platform's modifier names. */
const FLOATING_CAPTURE_HOTKEY = IS_MAC_HOST ? 'Cmd+Ctrl+Shift+S' : 'Alt+Ctrl+Shift+S';

const FLOATING_CAPTURE_DESCRIPTION =
  'A small button that floats over every app and shows how many agents are working, waiting for you, or asking a question. Use it to screenshot an area, an app or the whole screen, mark it up, and send a prompt to any project or session without switching to Ghostex.';

export function IntegrationsSettingsTab({
  ghostexCaptureEnabled,
  ghostexCaptureSwitchToSession,
  ghostexCliStatus,
  ghostexCliStatusLoading,
  onGhostexCaptureEnabledChange,
  onGhostexCaptureSwitchToSessionChange,
  onInstallCliSkill,
  onInstallBrowserControl,
  onInstallBrowserUseSkill,
  onInstallComputerUseSkill,
  onInstallCuaDriver,
  onReinstallCuaDriver,
  onUninstallCuaDriver,
  onCheckCuaDriverUpdate,
  onInstallAgentsOrchestrationSkill,
  onInstallManageBeadsSkill,
  onInstallGenerateTitleSkill,
  onInstallGhostexCli,
  onInstallMoveCodexSessionSkill,
  onInstallHelpSkill,
  onUninstallBundledAgentSkill,
  onUninstallBundledAgentSkills,
  onOpenAccessibilityPreferences,
  onOpenScreenRecordingPreferences,
  onRequestGhostexCliStatus,
  onRunManagedToolTerminalCommand,
  search,
  searchEmptyState,
}: {
  ghostexCaptureEnabled: boolean;
  ghostexCaptureSwitchToSession: boolean;
  ghostexCliStatus?: SidebarGhostexCliStatusMessage;
  ghostexCliStatusLoading: boolean;
  onGhostexCaptureEnabledChange: (checked: boolean) => void;
  onGhostexCaptureSwitchToSessionChange: (checked: boolean) => void;
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
  onUninstallBundledAgentSkill?: (skillId: BundledGhostexAgentSkillId) => void;
  onUninstallBundledAgentSkills?: () => void;
  onOpenAccessibilityPreferences?: () => void;
  onOpenScreenRecordingPreferences?: () => void;
  onRequestGhostexCliStatus?: () => void;
  /** Runs a managed tool's install in a command-pane terminal (Linux system tools without a password dialog). */
  onRunManagedToolTerminalCommand?: (tool: ManagedToolId) => void;
  search: SettingsTabSearch;
  searchEmptyState?: ReactNode;
}) {
  const showIntegrationRow = (settingKey: string) => shouldShowSetting(search.sections.integrations, settingKey);
  const ghostexCliStatusChecking = ghostexCliStatusLoading || !ghostexCliStatus;
  const cliReady = ghostexCliStatus?.installed === true;
  /**
   * CDXC:OsIntegration 2026-05-29-06:00:
   * Trycua Permissions status must be based on Trycua's own permission check,
   * because granting Trycua in macOS can still leave Ghostex's separate
   * Accessibility trust bit false. The row represents desktop automation
   * readiness for agents, not Ghostex's ability to synthesize input.
   */
  const cuaPermissionStatus = getCuaPermissionStatus(ghostexCliStatus, ghostexCliStatusChecking);

  return (
    <SettingsNativeScrollArea className='h-full min-h-0'>
      <div className='settings-page-width flex flex-col gap-6 px-5 pb-5'>
        {/*
         * CDXC:RemotePairing 2026-05-27-04:17:
         * Settings owns one Integrations tab for post-onboarding CLI, bundled
         * Ghostex skills, Trycua runtime lifecycle, and macOS privacy
         * permissions. Keeping Trycua here avoids duplicating it in Extensions.
         *
         * CDXC:AgentHooks 2026-06-29-01:26:
         * Agent hook install/status UI lives in Settings -> Agents, where the detailed per-agent hook list already exists. Integrations should not duplicate that setup row.
         *
         * CDXC:AgentHooks 2026-08-19-11:20:
         * Hook and bundled-skill removal moved next to the hook setup panel in Settings -> Agents, so Integrations no longer carries a Hooks & Skills recovery card.
         *
         * CDXC:AgentSkills 2026-05-31-09:18:
         * Bundled Ghostex skills are explicit per-skill installs in Settings,
         * not hidden side effects of CLI setup. Each row explains what the skill
         * teaches agents and remains disabled until the Ghostex CLI is present.
         *
         * CDXC:Cli 2026-06-07-13:53:
         * Ghostex installs and repairs the app-bundled CLI automatically for
         * DMG and Homebrew installs. Settings should expose a manual Repair CLI
         * action for unusual PATH states, not a cask reinstall flow.
         */}
        {search.tab.isSearching && !hasVisibleSettingsSearchResult(search.tab) ? searchEmptyState : null}
        {/*
         * CDXC:GhostexCapture 2026-09-30 DECISION:
         * User: call it "Floating Capture", put it at the very top of Integrations with text under it that explains what it does, and do not repeat the same name as both the section title and the toggle.
         */}
        {shouldShowSettingsSection(search.sections.integrations) && showIntegrationRow('ghostexCapture') ? (
          <SettingsSection description={FLOATING_CAPTURE_DESCRIPTION} title='Floating Capture'>
            <IntegrationSettingsRow
              badge='Beta'
              description={`${FLOATING_CAPTURE_HOTKEY} opens the button's panel. With the same keys, A captures an area, Space the current app, F the full screen, and T writes a prompt, straight away.`}
              icon={IconDeviceDesktop}
              status={ghostexCaptureEnabled ? 'Enabled' : 'Disabled'}
              tone={ghostexCaptureEnabled ? 'success' : 'neutral'}
              title='Show the floating button'
            >
              <Switch
                aria-label='Show the Floating Capture button'
                checked={ghostexCaptureEnabled}
                onCheckedChange={onGhostexCaptureEnabledChange}
              />
            </IntegrationSettingsRow>
            <IntegrationSettingsRow
              description='After a prompt is sent, the Ghostex window shows the session it went to, without coming in front of the app you are in.'
              icon={IconDeviceDesktop}
              status={ghostexCaptureSwitchToSession ? 'On' : 'Off'}
              title='Switch to the session after sending'
              tone={ghostexCaptureSwitchToSession ? 'success' : 'neutral'}
            >
              <Switch
                aria-label='Switch to the session after sending'
                checked={ghostexCaptureSwitchToSession}
                onCheckedChange={onGhostexCaptureSwitchToSessionChange}
              />
            </IntegrationSettingsRow>
          </SettingsSection>
        ) : null}
        {shouldShowSettingsSection(search.sections.integrations) ? (
          <SettingsSection title='Ghostex CLI'>
            {showIntegrationRow('ghostexCli') ? (
              <IntegrationSettingsRow
                description='Ghostex keeps the app-bundled ghostex command linked automatically for mobile apps and CLI-backed integration setup. gx is linked when that alias is available and not taken by another command.'
                icon={IconTerminal2}
                status={ghostexCliStatusChecking ? 'Checking' : cliReady ? 'Installed' : 'Not installed'}
                tone={ghostexCliStatusChecking ? 'neutral' : cliReady ? 'success' : 'warning'}
                title='Command line tool'
              >
                <SettingButton
                  disabled={ghostexCliStatusChecking || !onInstallGhostexCli}
                  disabledReason={
                    ghostexCliStatusChecking ? 'CLI status is being checked.' : 'CLI repair isn’t available here.'
                  }
                  onClick={onInstallGhostexCli}
                  type='button'
                  variant='outline'
                >
                  <IconDownload aria-hidden='true' data-icon='inline-start' />
                  Repair
                </SettingButton>
                <SettingButton
                  disabled={ghostexCliStatusChecking || !onRequestGhostexCliStatus}
                  disabledReason={
                    ghostexCliStatusChecking
                      ? 'CLI status is being checked.'
                      : 'CLI status refresh isn’t available here.'
                  }
                  onClick={onRequestGhostexCliStatus}
                  type='button'
                  variant='ghost'
                >
                  <IconRefresh aria-hidden='true' data-icon='inline-start' />
                  Refresh
                </SettingButton>
              </IntegrationSettingsRow>
            ) : null}

            {/*
            CDXC:Settings 2026-06-19-14:51:
            macOS Settings > Integrations should not include a Setup Flow launcher row.
            Keep setup access owned by first-launch and other explicit entry points instead of listing it as an integration setting.
          */}
          </SettingsSection>
        ) : null}
        {shouldShowSettingsSection(search.sections.integrations) ? (
          <DesktopControlSection
            ghostexCliStatus={ghostexCliStatus}
            ghostexCliStatusLoading={ghostexCliStatusChecking}
            onInstallCuaDriver={onInstallCuaDriver}
            onReinstallCuaDriver={onReinstallCuaDriver}
            onUninstallCuaDriver={onUninstallCuaDriver}
            onCheckCuaDriverUpdate={onCheckCuaDriverUpdate}
            onOpenAccessibilityPreferences={onOpenAccessibilityPreferences}
            onOpenScreenRecordingPreferences={onOpenScreenRecordingPreferences}
            permissionStatus={cuaPermissionStatus}
            // Accessibility and Screen Recording are macOS grants; Fast Computer Use needs none on Windows or Linux.
            showPermissions={IS_MAC_HOST && showIntegrationRow('cuaPermissions')}
            showTrycua={showIntegrationRow('bundledAgentSkills')}
          />
        ) : null}
        {shouldShowSettingsSection(search.sections.integrations) && showIntegrationRow('bundledAgentSkills') ? (
          <AgentSkillsSection
            ghostexCliStatus={ghostexCliStatus}
            ghostexCliStatusLoading={ghostexCliStatusChecking}
            onInstallSkill={{
              cli: onInstallCliSkill,
              browserUse: onInstallBrowserUseSkill,
              computerUse: onInstallComputerUseSkill,
              embeddedBrowserUse: onInstallBrowserControl,
              agentsOrchestration: onInstallAgentsOrchestrationSkill,
              manageBeads: onInstallManageBeadsSkill,
              generateTitle: onInstallGenerateTitleSkill,
              moveCodexSession: onInstallMoveCodexSessionSkill,
              help: onInstallHelpSkill,
            }}
            onRefreshStatus={onRequestGhostexCliStatus}
            onUninstallAllSkills={onUninstallBundledAgentSkills}
            onUninstallSkill={onUninstallBundledAgentSkill}
          />
        ) : null}
        {/* CDXC:Settings 2026-09-30 DECISION: User: "please move the tools list to the bottom of the integrations". */}
        {shouldShowSettingsSection(search.sections.integrations) && showIntegrationRow('managedTools') ? (
          <ManagedToolsSection onRunTerminalCommand={onRunManagedToolTerminalCommand} />
        ) : null}
      </div>
    </SettingsNativeScrollArea>
  );
}

export function IntegrationSettingsRow({
  badge,
  children,
  description,
  icon: Icon,
  status,
  title,
  tone,
  version,
}: {
  badge?: string;
  children: ReactNode;
  description: string;
  icon: typeof IconInfoCircle;
  status: string;
  title: string;
  tone: 'success' | 'warning' | 'neutral';
  version?: string;
}) {
  return (
    <SettingsListItem
      icon={<Icon aria-hidden='true' size={17} />}
      status={tone}
      title={
        <span className='flex flex-wrap items-center gap-2'>
          {/*
           * CDXC:AppShots 2026-06-13-19:51:
           * Settings must visibly mark App Shots as Beta while keeping
           * the separate Enabled/Disabled status badge for its toggle
           * state.
           */}
          <IntegrationRowTitle badge={badge} description={`${status}. ${description}`} label={title} />
          {version ? <VersionInfoButton label={title} version={version} /> : null}
        </span>
      }
    >
      <div className='flex shrink-0 flex-wrap justify-end gap-2'>{children}</div>
    </SettingsListItem>
  );
}

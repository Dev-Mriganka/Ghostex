import { useState, type ReactNode } from 'react';
import {
  IconBeer,
  IconBrandGithub,
  IconBrandGitlab,
  IconBrandNodejs,
  IconBrandPython,
  IconCircleArrowUp,
  IconCircleCheck,
  IconCloudSearch,
  IconDownload,
  IconLayoutKanban,
  IconLoader2,
  IconRefresh,
  IconTerminal2,
  IconTools,
  IconTrash,
} from '@tabler/icons-react';
import { Button } from '@/packages/components/ui/button';
import {
  isManagedToolJobActive,
  type ManagedToolId,
  type ManagedToolOperation,
  type ManagedToolState,
} from '@/packages/shared/managed-tools';
import { AppTooltip } from '../../app-tooltip';
import { useManagedToolsConnection, type ManagedToolsConnection } from '../../managed-tools/transport';
import {
  MANAGED_TOOL_ACTION_WORDS,
  useManagedTools,
  type ManagedToolsHook,
} from '../../managed-tools/use-managed-tools';
import { SettingButton, SettingsListItem, SettingsSection } from '../fields';

const TOOL_ICONS: Record<ManagedToolId, typeof IconTools> = {
  node: IconBrandNodejs,
  uv: IconBrandPython,
  homebrew: IconBeer,
  systemTools: IconTools,
  beads: IconLayoutKanban,
  gh: IconBrandGithub,
  glab: IconBrandGitlab,
};

/** What Uninstall's confirmation says will happen. */
function uninstallDetail(tool: ManagedToolState): string {
  switch (tool.id) {
    case 'node':
      return "Agent CLIs installed with Ghostex's Node.js stop working until it's installed again.";
    case 'uv':
      return 'Tools uv installed, such as Claude Swap, keep working.';
    default:
      return `Removes Ghostex's copy of ${tool.label}.`;
  }
}

/** The Install tooltip: the server's plan, saying when a password is asked for. */
export function managedToolInstallTooltip(tool: ManagedToolState): string {
  if (tool.needsPassword && !/password/i.test(tool.installPlan)) {
    return `${tool.installPlan} Asks for your password.`;
  }
  return tool.installPlan;
}

/** The last non-empty line of a job's output, for the row's progress text. */
function lastOutputLine(output: string | undefined): string | undefined {
  return output
    ?.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\d+%$/.test(line))
    .at(-1);
}

function rowDetail(tool: ManagedToolState): string {
  const job = tool.job;
  if (job && isManagedToolJobActive(job)) {
    if (job.status === 'queued') return 'Waiting for another install to finish…';
    const words = MANAGED_TOOL_ACTION_WORDS[job.operation] ?? MANAGED_TOOL_ACTION_WORDS.install;
    const progress = lastOutputLine(job.output);
    return progress ? `${words.running} ${tool.label}… ${progress}` : `${words.running} ${tool.label}…`;
  }
  if (!tool.installed) {
    return tool.detail ? `${tool.description} ${tool.detail}` : tool.description;
  }
  const owner = tool.source === 'ghostex' ? 'installed by Ghostex' : 'installed by you';
  const state = tool.version
    ? `Version ${tool.version} · ${owner}.`
    : `${owner.charAt(0).toUpperCase()}${owner.slice(1)}.`;
  return tool.id === 'systemTools' && tool.detail ? tool.detail : `${tool.description} ${state}`;
}

/**
 * CDXC:ManagedTools 2026-09-29 DECISION:
 * User: "when they click on something, we help them install it on windows/macos/linux automatically (show a button with a tooltip explaining how we'll install) but 1 click installs it for them as much as possible". Settings > Integrations > Tools lists what Ghostex can install for the user (Node.js and npm, uv, Homebrew, Linux system tools, Beads, the GitHub and GitLab CLIs): Install carries the server's plan as its tooltip, and an installed tool gets the Update (or check again), Reinstall and Uninstall icon buttons of the Trycua row, each only when gxserver offers it. Tools the user installed themselves are shown as theirs without buttons.
 * SEE-ALSO: server/src/managed_tools/endpoint.rs, apps/desktop/src/app/window/settings_modal/tabs/integrations/tools.rs (native twin).
 */
export function ManagedToolsSection({
  connection: connectionOverride,
  onRunTerminalCommand,
}: {
  /** Replaces this computer's connection (Storybook). */
  connection?: ManagedToolsConnection;
  /** Runs a tool's `terminalCommand` in a command-pane terminal (the desktop reads the command itself). */
  onRunTerminalCommand?: (tool: ManagedToolId) => void;
}) {
  const defaultConnection = useManagedToolsConnection();
  const connection = connectionOverride ?? defaultConnection;
  const hook = useManagedTools(connection);
  const [confirmUninstall, setConfirmUninstall] = useState<ManagedToolId>();
  if (!connection) return null;
  const visible = (hook.tools ?? []).filter((tool) => tool.supported);
  return (
    <SettingsSection
      actions={
        <SettingButton
          disabled={hook.tools === undefined}
          disabledReason='Tool status is being checked.'
          onClick={hook.refresh}
          type='button'
          variant='ghost'
        >
          <IconRefresh aria-hidden='true' data-icon='inline-start' />
          Refresh
        </SettingButton>
      }
      description='Ghostex installs these when something you set up needs them. Your own copies are used when you have them.'
      title='Tools'
    >
      {hook.tools === undefined ? (
        <SettingsListItem detail={hook.error ?? 'Checking what is installed…'} title='Tools' />
      ) : (
        visible.flatMap((tool) => [
          <ManagedToolRow
            hook={hook}
            key={tool.id}
            onAskUninstall={() => setConfirmUninstall(confirmUninstall === tool.id ? undefined : tool.id)}
            onRunTerminalCommand={onRunTerminalCommand}
            tool={tool}
          />,
          confirmUninstall === tool.id && !isManagedToolJobActive(tool.job) ? (
            <SettingsListItem
              detail={uninstallDetail(tool)}
              key={`${tool.id}-uninstall`}
              status='warning'
              title={`Uninstall ${tool.label}?`}
            >
              <Button onClick={() => setConfirmUninstall(undefined)} size='sm' type='button' variant='ghost'>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmUninstall(undefined);
                  void hook.start(tool.id, 'uninstall');
                }}
                size='sm'
                type='button'
                variant='destructive'
              >
                Uninstall
              </Button>
            </SettingsListItem>
          ) : null,
        ])
      )}
    </SettingsSection>
  );
}

function ManagedToolRow({
  hook,
  onAskUninstall,
  onRunTerminalCommand,
  tool,
}: {
  hook: ManagedToolsHook;
  onAskUninstall: () => void;
  onRunTerminalCommand?: (tool: ManagedToolId) => void;
  tool: ManagedToolState;
}) {
  const Icon = TOOL_ICONS[tool.id] ?? IconTools;
  const job = isManagedToolJobActive(tool.job) ? tool.job : undefined;
  const startingOperation = hook.starting?.tool === tool.id ? hook.starting.operation : undefined;
  const runningOperation: ManagedToolOperation | undefined = job?.operation ?? startingOperation;
  const busy = runningOperation !== undefined;
  const checking = hook.checking === tool.id;
  const busyReason = runningOperation
    ? `${MANAGED_TOOL_ACTION_WORDS[runningOperation].running} ${tool.label}…`
    : `${tool.label} isn't available here.`;
  const can = (operation: ManagedToolOperation) => tool.actions.includes(operation);
  const spinner = <IconLoader2 aria-hidden='true' className='animate-spin' />;
  const status = tool.updateAvailable === true ? 'warning' : tool.installed ? 'success' : 'neutral';
  const installedSuffix = tool.version ? ` (installed v${tool.version})` : '';

  let controls: ReactNode = null;
  if (!tool.installed) {
    const viaTerminal = Boolean(tool.terminalCommand);
    const installDisabled = busy || (viaTerminal ? !onRunTerminalCommand : !can('install'));
    const disabledReason = busy
      ? busyReason
      : viaTerminal
        ? `Run this in a terminal: ${tool.terminalCommand}`
        : (tool.unavailableReason ?? `${tool.label} can't be installed here.`);
    controls = (
      <AppTooltip content={managedToolInstallTooltip(tool)}>
        <SettingButton
          disabled={installDisabled}
          disabledReason={disabledReason}
          onClick={() => {
            if (viaTerminal) onRunTerminalCommand?.(tool.id);
            else void hook.start(tool.id, 'install');
          }}
          type='button'
          variant='outline'
        >
          {runningOperation === 'install' ? (
            <IconLoader2 aria-hidden='true' className='animate-spin' data-icon='inline-start' />
          ) : viaTerminal ? (
            <IconTerminal2 aria-hidden='true' data-icon='inline-start' />
          ) : (
            <IconDownload aria-hidden='true' data-icon='inline-start' />
          )}
          {runningOperation === 'install' ? 'Installing…' : 'Install'}
        </SettingButton>
      </AppTooltip>
    );
  } else if (tool.actions.length > 0) {
    const update =
      tool.updateAvailable === true
        ? {
            Icon: IconCircleArrowUp,
            className: 'text-sky-400',
            label: `Update ${tool.label}`,
            onClick: () => void hook.start(tool.id, 'update'),
            tooltip: tool.latestVersion
              ? `Update ${tool.label} to v${tool.latestVersion}${installedSuffix}`
              : `Update ${tool.label}${installedSuffix}`,
          }
        : tool.updateAvailable === false
          ? {
              Icon: IconCircleCheck,
              className: 'text-muted-foreground',
              label: `Check for ${tool.label} updates`,
              onClick: () => void hook.checkAgain(tool.id),
              tooltip: `${tool.label}${tool.version ? ` v${tool.version}` : ''} is up to date. Click to check again.`,
            }
          : {
              Icon: IconCloudSearch,
              className: undefined,
              label: `Check for ${tool.label} updates`,
              onClick: () => void hook.checkAgain(tool.id),
              tooltip: tool.checkError
                ? `Couldn't check for ${tool.label} updates: ${tool.checkError} Click to try again.`
                : `Check for ${tool.label} updates${installedSuffix}`,
            };
    controls = (
      <>
        {can('update') ? (
          <AppTooltip content={update.tooltip}>
            <SettingButton
              aria-label={update.label}
              className={update.className}
              disabled={busy || checking}
              disabledReason={checking ? `Checking for ${tool.label} updates…` : busyReason}
              onClick={update.onClick}
              size='icon'
              type='button'
              variant='ghost'
            >
              {runningOperation === 'update' || checking ? spinner : <update.Icon aria-hidden='true' />}
            </SettingButton>
          </AppTooltip>
        ) : null}
        {can('reinstall') ? (
          <AppTooltip content={`Reinstall the latest ${tool.label}${installedSuffix}`}>
            <SettingButton
              aria-label={`Reinstall ${tool.label}`}
              disabled={busy}
              disabledReason={busyReason}
              onClick={() => void hook.start(tool.id, 'reinstall')}
              size='icon'
              type='button'
              variant='ghost'
            >
              {runningOperation === 'reinstall' ? spinner : <IconRefresh aria-hidden='true' />}
            </SettingButton>
          </AppTooltip>
        ) : null}
        {can('uninstall') ? (
          <AppTooltip content={`Uninstall ${tool.label}`}>
            <SettingButton
              aria-label={`Uninstall ${tool.label}`}
              disabled={busy}
              disabledReason={busyReason}
              onClick={onAskUninstall}
              size='icon'
              type='button'
              variant='ghost'
            >
              {runningOperation === 'uninstall' ? spinner : <IconTrash aria-hidden='true' />}
            </SettingButton>
          </AppTooltip>
        ) : null}
      </>
    );
  }

  return (
    <SettingsListItem
      detail={rowDetail(tool)}
      icon={<Icon aria-hidden='true' size={17} />}
      status={status}
      title={tool.label}
    >
      {controls}
    </SettingsListItem>
  );
}

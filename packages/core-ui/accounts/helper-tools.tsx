import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCircleArrowUp,
  IconCircleCheck,
  IconCloudSearch,
  IconLoader2,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { createAppToastRequest, type AppToastLevel } from '@/packages/shared/app-toast-contract';
import type { AccountHelperTool, AccountHelperToolAction, AccountProvider } from '@/packages/shared/agent-accounts';
import { AppTooltip } from '../app-tooltip';
import { postAppModalHostMessage } from '../app-modal-host-bridge';
import { Button } from '@/packages/components/ui/button';
import { SettingButton, SettingsListItem } from '../settings-modal/fields';
import { getAccountsConnections } from './transport';

const HELPER_NAMES: Record<AccountProvider, { name: string; command: string }> = {
  claude: { name: 'Claude Swap', command: 'cswap' },
  codex: { name: 'Codex Swap', command: 'xswap' },
};
const ACTION_WORDS: Record<AccountHelperToolAction, { running: string; done: string; failed: string }> = {
  update: { running: 'Updating', done: 'updated', failed: 'update failed' },
  reinstall: { running: 'Reinstalling', done: 'reinstalled', failed: 'reinstall failed' },
  uninstall: { running: 'Uninstalling', done: 'uninstalled', failed: 'uninstall failed' },
};

function toast(level: AppToastLevel, title: string, description: string) {
  postAppModalHostMessage(
    createAppToastRequest(level, title, description, { durationMs: 12000, toastId: 'account-helper-tool' }),
    'Accounts:helperTool'
  );
}

/**
 * Claude Swap and Codex Swap as installed on `machineId`, read from gxserver's `helperStatus`.
 * Polls while an Update, Reinstall or Uninstall runs, toasts its result, then calls `onFinished`
 * so the page re-reads which helpers are installed.
 */
export function useAccountHelperTools(machineId: string, onFinished: () => void) {
  const [tools, setTools] = useState<AccountHelperTool[]>([]);
  const [checking, setChecking] = useState(false);
  const running = tools.some((tool) => tool.job?.status === 'running');
  const seenFinish = useRef<Record<string, string>>({});
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const connection = useCallback(() => getAccountsConnections().find((c) => c.id === machineId), [machineId]);
  const apply = useCallback((next: AccountHelperTool[], announce: boolean) => {
    let finished = false;
    for (const tool of next) {
      const job = tool.job;
      if (!job?.finishedAt || seenFinish.current[tool.provider] === job.finishedAt) continue;
      seenFinish.current[tool.provider] = job.finishedAt;
      if (!announce) continue;
      finished = true;
      const { name } = HELPER_NAMES[tool.provider];
      const words = ACTION_WORDS[job.action];
      if (job.status === 'complete') {
        toast(
          'success',
          `${name} ${words.done}`,
          job.action === 'uninstall'
            ? 'Saved logins and shared conversations were kept.'
            : tool.version
              ? `Version ${tool.version} is installed.`
              : `${name} is installed.`
        );
      } else {
        toast('error', `${name} ${words.failed}`, job.error ?? 'The command did not finish.');
      }
    }
    setTools(next);
    if (finished) onFinishedRef.current();
  }, []);
  const load = useCallback(
    async (fresh: boolean, announce: boolean) => {
      const result = await connection()?.request({ operation: 'helperStatus', fresh });
      if (result?.helperTools) apply(result.helperTools, announce);
      return result?.helperTools;
    },
    [apply, connection]
  );
  useEffect(() => {
    seenFinish.current = {};
    void load(false, false).catch(() => undefined);
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(false, true).catch(() => undefined), 2000);
    return () => clearInterval(timer);
  }, [load, running]);
  const checkForUpdates = useCallback(
    async (provider: AccountProvider) => {
      setChecking(true);
      try {
        const tool = (await load(true, false))?.find((item) => item.provider === provider);
        const { name } = HELPER_NAMES[provider];
        if (!tool) return;
        if (tool.updateAvailable === true)
          toast(
            'info',
            `${name} update available`,
            `Version ${tool.latestVersion} is available; ${tool.version} is installed.`
          );
        else if (tool.updateAvailable === false)
          toast('success', `${name} is up to date`, `Version ${tool.version} is the latest release.`);
        else toast('warning', `Couldn't check for ${name} updates`, tool.checkError ?? 'Try again in a moment.');
      } catch (error) {
        toast('error', 'Update check failed', error instanceof Error ? error.message : 'Try again in a moment.');
      } finally {
        setChecking(false);
      }
    },
    [load]
  );
  const run = useCallback(
    async (provider: AccountProvider, action: AccountHelperToolAction) => {
      try {
        const result = await connection()?.request({ operation: 'helperAction', provider, action });
        if (result?.helperTools) apply(result.helperTools, true);
      } catch (error) {
        toast(
          'error',
          `${HELPER_NAMES[provider].name} ${ACTION_WORDS[action].failed}`,
          error instanceof Error ? error.message : 'The command could not start.'
        );
      }
    },
    [apply, connection]
  );
  return { tools, checking, checkForUpdates, run };
}

/**
 * CDXC:AgentProviders 2026-09-28 DECISION:
 * User: each provider on the Accounts page gets icon buttons with tooltips to update, reinstall and uninstall its account helper (Claude Swap, Codex Swap), with update checking like the Trycua row: an Update button when a newer release exists, otherwise an "up to date, click to check again" button, and versions in the tooltips. Uninstall asks first.
 * SEE-ALSO: server/src/accounts/helper_tools.rs, packages/core-ui/settings-modal/tabs/integration-skills.tsx (TrycuaInstalledActions).
 */
export function AccountHelperToolRow({
  tool,
  checking,
  onCheckForUpdates,
  onRun,
}: {
  tool: AccountHelperTool | undefined;
  checking: boolean;
  onCheckForUpdates: () => void;
  onRun: (action: AccountHelperToolAction) => void;
}) {
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  if (!tool?.installed && tool?.job?.status !== 'running') return null;
  const { name, command } = HELPER_NAMES[tool.provider];
  const job = tool.job?.status === 'running' ? tool.job : undefined;
  const can = (action: AccountHelperToolAction) => tool.actions.includes(action);
  const installedSuffix = tool.version ? ` (installed v${tool.version})` : '';
  const unmanagedReason = tool.path
    ? `Ghostex can't tell how ${command} at ${tool.path} was installed. Use the tool you installed it with.`
    : `Ghostex can't tell how ${command} was installed.`;
  const busyReason = job ? `${ACTION_WORDS[job.action].running} ${name}…` : unmanagedReason;
  const update =
    tool.updateAvailable === true
      ? {
          Icon: IconCircleArrowUp,
          className: 'text-sky-400',
          label: `Update ${name}`,
          onClick: () => onRun('update'),
          enabled: can('update'),
          tooltip: `Update ${name} to v${tool.latestVersion}${installedSuffix}`,
        }
      : tool.updateAvailable === false
        ? {
            Icon: IconCircleCheck,
            className: 'text-muted-foreground',
            label: `Check for ${name} updates`,
            onClick: onCheckForUpdates,
            enabled: true,
            tooltip: `${name}${tool.version ? ` v${tool.version}` : ''} is up to date. Click to check again.`,
          }
        : {
            Icon: IconCloudSearch,
            className: undefined,
            label: `Check for ${name} updates`,
            onClick: onCheckForUpdates,
            enabled: true,
            tooltip: `Check for ${name} updates${installedSuffix}`,
          };
  const spinner = <IconLoader2 aria-hidden='true' className='animate-spin' />;
  return (
    <>
      <SettingsListItem
        detail={
          job
            ? `${ACTION_WORDS[job.action].running} ${name}…`
            : `Saves and switches ${tool.provider === 'claude' ? 'Claude' : 'Codex'} logins for Ghostex.`
        }
        status={tool.updateAvailable === true ? 'warning' : 'success'}
        title={`${name} (${command})`}
      >
        <AppTooltip content={update.tooltip}>
          <SettingButton
            aria-label={update.label}
            className={update.className}
            disabled={Boolean(job) || checking || !update.enabled}
            disabledReason={checking ? `Checking for ${name} updates…` : busyReason}
            onClick={update.onClick}
            size='icon'
            type='button'
            variant='ghost'
          >
            {job?.action === 'update' || checking ? spinner : <update.Icon aria-hidden='true' />}
          </SettingButton>
        </AppTooltip>
        <AppTooltip content={`Reinstall the latest ${name}${installedSuffix}`}>
          <SettingButton
            aria-label={`Reinstall ${name}`}
            disabled={Boolean(job) || !can('reinstall')}
            disabledReason={busyReason}
            onClick={() => onRun('reinstall')}
            size='icon'
            type='button'
            variant='ghost'
          >
            {job?.action === 'reinstall' ? spinner : <IconRefresh aria-hidden='true' />}
          </SettingButton>
        </AppTooltip>
        <AppTooltip content={`Uninstall ${name} (keeps saved logins and shared conversations)`}>
          <SettingButton
            aria-expanded={confirmUninstall}
            aria-label={`Uninstall ${name}`}
            disabled={Boolean(job) || !can('uninstall')}
            disabledReason={busyReason}
            onClick={() => setConfirmUninstall(!confirmUninstall)}
            size='icon'
            type='button'
            variant='ghost'
          >
            {job?.action === 'uninstall' ? spinner : <IconTrash aria-hidden='true' />}
          </SettingButton>
        </AppTooltip>
      </SettingsListItem>
      {confirmUninstall && !job ? (
        <SettingsListItem
          detail={`Saved logins and shared conversations stay. Ghostex can't add, reconnect or switch ${tool.provider === 'claude' ? 'Claude' : 'Codex'} accounts until you install it again.`}
          status='warning'
          title={`Uninstall ${name}?`}
        >
          <Button onClick={() => setConfirmUninstall(false)} size='sm' type='button' variant='ghost'>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConfirmUninstall(false);
              onRun('uninstall');
            }}
            size='sm'
            type='button'
            variant='destructive'
          >
            Uninstall
          </Button>
        </SettingsListItem>
      ) : null}
    </>
  );
}

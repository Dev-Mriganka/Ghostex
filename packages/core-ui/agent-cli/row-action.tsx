import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/packages/components/ui/button';
import {
  AGENT_CLI_CATALOG,
  type AgentCliConnection,
  type AgentCliState,
} from '@/packages/shared/agent-cli-maintenance';
import { useAgentCliJob } from './use-agent-cli-job';

/**
 * CDXC:AgentProviders 2026-09-28 WHY:
 * A collapsed Agents row whose CLI is missing offered "Install hook", which cannot work until the CLI exists, and
 * installing the CLI meant expanding the row first. The row now carries the next useful action itself: Install CLI
 * when it is missing, Add to PATH when it is installed where new terminals cannot find it, Update CLI when the vendor
 * has a newer release. They run the same gxserver jobs the expanded controls show in detail.
 */
export function AgentCliRowAction({
  agentId,
  connection,
  listState,
  cliMissing,
  onChanged,
}: {
  agentId: string;
  connection: AgentCliConnection | undefined;
  /** The row's entry from `useAgentCliList`, before this row read its own state. */
  listState: AgentCliState | undefined;
  /** Hook status reports the CLI missing (used until the list answers). */
  cliMissing: boolean;
  /** A job finished: refresh hook status and the list. */
  onChanged?: () => void;
}) {
  const definition = AGENT_CLI_CATALOG.find((entry) => entry.agentId === agentId);
  const job = useAgentCliJob({ agentId, connection, eager: false, onInstalled: onChanged });
  if (!definition || !connection) return null;
  const state = job.state ?? listState;
  const missing = state ? !state.executablePath : cliMissing;
  const failed = state?.job?.status === 'failed' ? state.job.error : undefined;
  const error = job.actionError ?? failed;
  if (job.running) {
    return (
      <Button className='shrink-0' disabled size='sm' type='button' variant='outline'>
        <IconRefresh aria-hidden='true' className='animate-spin' data-icon='inline-start' />
        {state?.job?.status === 'queued'
          ? 'Waiting…'
          : state?.job?.operation === 'update'
            ? 'Updating…'
            : 'Installing…'}
      </Button>
    );
  }
  if (missing) {
    return (
      <Button
        className='shrink-0'
        onClick={() => void job.install()}
        size='sm'
        title={error ?? `Install ${definition.binary} with its official installer`}
        type='button'
        variant='outline'
      >
        <IconDownload aria-hidden='true' data-icon='inline-start' />
        {error ? 'Retry install' : 'Install CLI'}
      </Button>
    );
  }
  if (state?.pathDirectory) {
    return (
      <Button
        className='shrink-0'
        onClick={() => void job.addToPath().then(onChanged)}
        size='sm'
        title={error ?? `Add ${state.pathDirectory} to your PATH so new terminals find ${definition.binary}`}
        type='button'
        variant='outline'
      >
        <IconDownload aria-hidden='true' data-icon='inline-start' />
        Add to PATH
      </Button>
    );
  }
  const detected = state?.detectedMethodId;
  if (state?.updateAvailable && detected) {
    return (
      <Button
        className='shrink-0'
        onClick={() => void job.start('update', detected)}
        size='sm'
        title={error ?? `Update ${definition.binary} to ${state.latestVersion}`}
        type='button'
        variant='outline'
      >
        <IconRefresh aria-hidden='true' data-icon='inline-start' />
        {error ? 'Retry update' : 'Update CLI'}
      </Button>
    );
  }
  return null;
}

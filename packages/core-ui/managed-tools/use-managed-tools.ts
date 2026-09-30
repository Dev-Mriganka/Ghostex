import { useCallback, useEffect, useRef, useState } from 'react';
import { createAppToastRequest, type AppToastLevel } from '@/packages/shared/app-toast-contract';
import {
  isManagedToolJobActive,
  type ManagedToolId,
  type ManagedToolOperation,
  type ManagedToolState,
} from '@/packages/shared/managed-tools';
import { postAppModalHostMessage } from '../app-modal-host-bridge';
import type { ManagedToolsConnection } from './transport';

/** How often a queued or running job is re-read from gxserver. */
export const MANAGED_TOOLS_POLL_MS = 1500;

/** The order the Tools section lists them in. */
export const MANAGED_TOOL_ORDER: readonly ManagedToolId[] = [
  'node',
  'uv',
  'homebrew',
  'systemTools',
  'beads',
  'gh',
  'glab',
];

export const MANAGED_TOOL_ACTION_WORDS: Record<
  ManagedToolOperation,
  { running: string; done: string; failed: string }
> = {
  install: { running: 'Installing', done: 'installed', failed: 'install failed' },
  update: { running: 'Updating', done: 'updated', failed: 'update failed' },
  reinstall: { running: 'Reinstalling', done: 'reinstalled', failed: 'reinstall failed' },
  uninstall: { running: 'Uninstalling', done: 'uninstalled', failed: 'uninstall failed' },
};

function toast(level: AppToastLevel, title: string, description: string) {
  try {
    postAppModalHostMessage(
      createAppToastRequest(level, title, description, { durationMs: 12000, toastId: 'managed-tool' }),
      'Settings:managedTools'
    );
  } catch {
    // Storybook and pages without the modal host have nowhere to show a toast.
  }
}

function sortTools(tools: readonly ManagedToolState[]): ManagedToolState[] {
  const rank = (tool: ManagedToolState) => {
    const index = MANAGED_TOOL_ORDER.indexOf(tool.id);
    return index === -1 ? MANAGED_TOOL_ORDER.length : index;
  };
  return [...tools].sort((left, right) => rank(left) - rank(right));
}

export type ManagedToolsHook = {
  tools: ManagedToolState[] | undefined;
  error: string | undefined;
  /** The tool whose "check again" read is in flight. */
  checking: ManagedToolId | undefined;
  /** An operation whose start request has not answered yet. */
  starting: { tool: ManagedToolId; operation: ManagedToolOperation } | undefined;
  start: (tool: ManagedToolId, operation: ManagedToolOperation) => Promise<void>;
  checkAgain: (tool: ManagedToolId) => Promise<void>;
  refresh: () => void;
};

/**
 * CDXC:ManagedTools 2026-09-29 SEE-ALSO:
 * The tools Ghostex installs for the user (server/src/managed_tools/endpoint.rs), read when the Integrations page
 * shows, re-read every 1.5 s while a job is queued or running, with each finished job toasted once. The native twin is
 * apps/desktop/src/app/window/settings_modal/tabs/integrations/tools.rs.
 */
export function useManagedTools(connection: ManagedToolsConnection | undefined, active = true): ManagedToolsHook {
  const [tools, setTools] = useState<ManagedToolState[]>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState<ManagedToolId>();
  const [starting, setStarting] = useState<{ tool: ManagedToolId; operation: ManagedToolOperation }>();
  const [revision, setRevision] = useState(0);
  const seenFinish = useRef<Partial<Record<ManagedToolId, string>>>({});
  const primed = useRef(false);

  const announce = useCallback((next: readonly ManagedToolState[]) => {
    for (const tool of next) {
      const job = tool.job;
      if (!job?.finishedAt || seenFinish.current[tool.id] === job.finishedAt) continue;
      seenFinish.current[tool.id] = job.finishedAt;
      // The first read only records jobs that finished before the page opened.
      if (!primed.current) continue;
      const words = MANAGED_TOOL_ACTION_WORDS[job.operation] ?? MANAGED_TOOL_ACTION_WORDS.install;
      if (job.status === 'succeeded') {
        toast(
          'success',
          `${tool.label} ${words.done}`,
          job.operation === 'uninstall'
            ? `Ghostex removed its copy of ${tool.label}.`
            : tool.version
              ? `Version ${tool.version} is installed.`
              : `${tool.label} is ready.`
        );
      } else if (job.status === 'failed') {
        toast('error', `${tool.label} ${words.failed}`, job.error || 'The install did not finish.');
      }
    }
    primed.current = true;
  }, []);

  const apply = useCallback(
    (next: readonly ManagedToolState[]) => {
      announce(next);
      setTools(sortTools(next));
    },
    [announce]
  );

  const merge = useCallback(
    (tool: ManagedToolState) => {
      announce([tool]);
      setTools((current) => sortTools([...(current ?? []).filter((item) => item.id !== tool.id), tool]));
    },
    [announce]
  );

  useEffect(() => {
    if (!active || !connection) return;
    let current = true;
    connection.list().then(
      (next) => {
        if (!current) return;
        setError(undefined);
        apply(next);
      },
      (reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : 'Could not read the tools.');
      }
    );
    return () => {
      current = false;
    };
  }, [active, connection, revision, apply]);

  const busy = (tools ?? []).some((tool) => isManagedToolJobActive(tool.job));
  useEffect(() => {
    if (!active || !connection || !busy) return;
    const timer = window.setInterval(() => {
      connection.list().then(apply, () => undefined);
    }, MANAGED_TOOLS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, connection, busy, apply]);

  const start = useCallback(
    async (tool: ManagedToolId, operation: ManagedToolOperation) => {
      if (!connection) return;
      setStarting({ tool, operation });
      try {
        merge(await connection.request({ action: 'start', tool, operation }));
      } catch (reason) {
        const label = tools?.find((item) => item.id === tool)?.label ?? tool;
        toast(
          'error',
          `${label} ${MANAGED_TOOL_ACTION_WORDS[operation].failed}`,
          reason instanceof Error ? reason.message : 'The install could not start.'
        );
      } finally {
        setStarting(undefined);
      }
    },
    [connection, merge, tools]
  );

  const checkAgain = useCallback(
    async (tool: ManagedToolId) => {
      if (!connection) return;
      setChecking(tool);
      try {
        const state = await connection.request({ action: 'read', tool, fresh: true });
        merge(state);
        if (state.updateAvailable === true) {
          toast(
            'info',
            `${state.label} update available`,
            `Version ${state.latestVersion} is available; ${state.version} is installed.`
          );
        } else if (state.updateAvailable === false) {
          toast('success', `${state.label} is up to date`, `Version ${state.version} is the latest release.`);
        } else {
          toast('warning', `Couldn't check for ${state.label} updates`, state.checkError || 'Try again in a moment.');
        }
      } catch (reason) {
        toast('error', 'Update check failed', reason instanceof Error ? reason.message : 'Try again in a moment.');
      } finally {
        setChecking(undefined);
      }
    },
    [connection, merge]
  );

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { tools, error, checking, starting, start, checkAgain, refresh };
}

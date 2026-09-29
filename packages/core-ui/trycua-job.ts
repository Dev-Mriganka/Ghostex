import {
  sidebarCuaDriverJobProgressLine,
  type SidebarGhostexCliStatusMessage,
} from '@/packages/shared/session-grid-contract';
import { GHOSTEX_TRYCUA_PRODUCT_NAME } from '@/packages/shared/ghostex-agent-skills';

const VERBS = {
  install: 'Installing',
  update: 'Updating',
  reinstall: 'Reinstalling',
  uninstall: 'Uninstalling',
} as const;

/**
 * What the Trycua rows show about the background job the desktop app runs for Install, Update,
 * Reinstall and Uninstall (CDXC:ManagedTools 2026-09-29 on `GPUI_TRYCUA_INSTALL_COMMAND`): whether
 * one is running, its one-line progress, and why the last one failed.
 */
export function trycuaJobView(status: SidebarGhostexCliStatusMessage | undefined) {
  const job = status?.cuaDriverJob ?? undefined;
  const running = job?.status === 'running';
  const operation = running ? job?.operation : undefined;
  const progress = sidebarCuaDriverJobProgressLine(job);
  const detail = running
    ? `${VERBS[job.operation]} ${GHOSTEX_TRYCUA_PRODUCT_NAME}…${progress ? ` ${progress}` : ''}`
    : job?.status === 'failed'
      ? `The last ${job.operation} did not finish: ${job.error || progress || 'no output'}`
      : undefined;
  return {
    running,
    operation,
    detail,
    runningReason: running && job ? `${VERBS[job.operation]} ${GHOSTEX_TRYCUA_PRODUCT_NAME}…` : undefined,
    plan: status?.cuaDriverInstallPlan,
    blockedReason: status?.cuaDriverApplicationsBlockedReason ?? undefined,
  };
}

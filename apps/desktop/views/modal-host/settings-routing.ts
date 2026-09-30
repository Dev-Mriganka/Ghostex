import type { SettingsModalTab } from "@/packages/core-ui/settings-modal";
import { SETTINGS_MODAL_NAVIGATION_TABS } from "@/packages/shared/ghostex-settings";
import type { AppModalKind } from "./modal-state";

export function isSettingsModalKind(modal: AppModalKind | undefined): boolean {
  return (
    modal === "settings" ||
    modal === "configureAgents" ||
    modal === "configureActions" ||
    modal === "openTargets" ||
    modal === "hotkeys"
  );
}

/**
 * CDXC:Onboarding 2026-09-27 SEE-ALSO:
 * The first-launch host rules (sidebar hydration before render, CLI/agent status requests, completion on close) apply
 * to `onboarding`; the older setup modal that shared them was deleted on 2026-09-27.
 * The native twin of this predicate is the `Onboarding` matching in apps/desktop/src/app/modals.rs.
 */
export function isFirstLaunchSetupModalKind(modal: AppModalKind | undefined): boolean {
  return modal === "onboarding";
}

export function shouldApplySidebarStateBeforeModalOpen(
  modal: AppModalKind | undefined,
): boolean {
  /*
   * CDXC:Onboarding 2026-06-29-13:46:
   * First-launch setup reads the same hydrated Settings store as the Settings
   * modal. Apply the native sidebar snapshot before setting activeModal so the
   * child-window setup flow cannot stay blank behind its native backdrop while
   * React waits at revision 0.
   */
  return isSettingsModalKind(modal) || isFirstLaunchSetupModalKind(modal);
}

export function getSettingsInitialTab(
  modal: AppModalKind | undefined,
): SettingsModalTab {
  /**
   * CDXC:Settings 2026-05-09-15:30
   * Existing entry points still request their historic modal kind, but the
   * app-modal host now routes Settings, Agents, Actions, and Hotkeys into one
   * tabbed Settings dialog so users have a single configuration surface.
   */
  if (modal === "configureAgents") {
    return "agents";
  }
  if (modal === "configureActions") {
    return "actions";
  }
  if (modal === "hotkeys") {
    return "hotkeys";
  }
  if (modal === "openTargets") {
    return "openTargets";
  }
  return "settings";
}

/**
 * CDXC:Settings 2026-08-19-00:00:
 * Settings deep links carry a tab id over the app-modal host message. Validate
 * it against the single canonical tab list instead of a hand-maintained copy,
 * which silently dropped newer pages such as Extensions (`extensions`) and made
 * their entry points open the remembered tab instead.
 */
const SETTINGS_MODAL_TAB_SET = new Set<string>(SETTINGS_MODAL_NAVIGATION_TABS);

export function isSettingsModalTab(value: unknown): value is SettingsModalTab {
  return typeof value === "string" && SETTINGS_MODAL_TAB_SET.has(value);
}

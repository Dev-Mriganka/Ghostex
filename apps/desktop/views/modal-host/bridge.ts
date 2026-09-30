import { postAppModalHostMessage } from "@/packages/core-ui/app-modal-host-bridge";
import { useSidebarStore } from "@/packages/core-ui/sidebar-store";
import {
  DEFAULT_ghostex_SETTINGS,
  isDiagnosticLoggingScenarioEnabled,
} from "@/packages/shared/ghostex-settings";
import type { WebviewApi } from "@/packages/core-ui/webview-api";

export const vscode: WebviewApi = {
  postMessage(message) {
    if (isAppModalDebugLoggingEnabled()) {
      console.debug(
        "[ghostex-app-modal-host] sidebarCommand",
        redactAppModalDebugMessage(message),
      );
    }
    /**
     * CDXC:AppModal 2026-06-13-01:09:
     * Previous Sessions no longer sends agent-prompt search commands, but modal
     * commands still cross this full-window host before native dispatch. Keep a
     * single debug boundary for restore, delete, and direct text-search commands.
     */
    postAppModalHostMessage(
      { message, type: "sidebarCommand" },
      "AppModals:sidebarCommand",
    );
  },
};

function redactAppModalDebugMessage(message: unknown): unknown {
  if (
    typeof message === "object" &&
    message !== null &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === "saveRemoteMachinePassword"
  ) {
    /*
     * CDXC:RemoteMachines 2026-06-09-18:23:
     * SSH password saves are intentionally one-shot Keychain writes. Modal
     * debug logging must redact the transient password before it reaches the
     * console so diagnostics cannot capture user credentials.
     */
    return {
      ...(message as Record<string, unknown>),
      password: "[redacted]",
    };
  }
  return message;
}

export function isAppModalDebugLoggingEnabled(): boolean {
  const settings =
    useSidebarStore.getState().hud.settings ?? DEFAULT_ghostex_SETTINGS;
  return isDiagnosticLoggingScenarioEnabled(
    settings.diagnosticLogging,
    "gpui.app.modal",
  );
}

type AppModalDebugDetails = Record<
  string,
  string | number | boolean | null | undefined
>;

export function postAppModalDebugLog(event: string, details: AppModalDebugDetails) {
  if (!isAppModalDebugLoggingEnabled()) {
    return;
  }
  /*
   * CDXC:Diagnostics 2026-06-20-05:38:
   * Settings and setup modal diagnostics must stay limited to lifecycle
   * booleans, revisions, timings, modal ids, and safe enum-like metadata.
   */
  postAppModalHostMessage(
    {
      details: JSON.stringify({
        performanceNow: Math.round(performance.now()),
        ...details,
      }),
      event,
      type: "debugLog",
    },
    "AppModals:debug",
  );
}

export function postSettingsModalDebugLog(
  event: string,
  details: AppModalDebugDetails,
) {
  postAppModalDebugLog(event, details);
}

export function notifyNativeModalClosed() {
  postAppModalHostMessage({ type: "close" }, "AppModals:close");
}

export function notifyNativeFirstLaunchSetupCompleted() {
  postAppModalHostMessage(
    { type: "completeFirstLaunchSetup" },
    "FirstLaunchSetup:complete",
  );
}

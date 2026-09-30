import type { AppModalKind } from "./modal-state";

/*
 * CDXC:AppModal 2026-07-26-07:55:
 * GPUI injects this host id into every app-modal child window it owns.
 *
 * CDXC:AppModal 2026-07-28:
 * GPUI now consumes the same one-shot `contentHeightMeasured` message as macOS
 * and fits its child window to the measured dialog height once per open. The
 * frame stays fixed after that fit, so the fixed-window stylesheet caps below
 * still own post-open content growth.
 */
export const GPUI_APP_MODAL_HOST_ID = "gpui";

/*
 * CDXC:AppModal 2026-06-30-16:08:
 * Centered compact native child-window modals should size to their rendered
 * React dialog once, before native presents the panel. Keep Settings out of
 * this path because it remains a user-resizable fixed-size native window.
 */
const ONE_SHOT_NATIVE_FIT_HEIGHT_MODAL_SELECTORS: Partial<
  Record<AppModalKind, string>
> = {
  agentHooksRequired: ".agent-hooks-required-modal",
  delayedSend: ".delayed-send-modal-shadcn",
  deleteWorktree: ".worktree-delete-modal-shadcn",
  exportTranscriptResult: ".export-transcript-modal-shadcn",
  missingProjectFolder: ".missing-project-folder-modal",
  portlessSetup: ".portless-setup-modal-shadcn",
  remoteGxserverInstall: ".remote-gxserver-install-modal",
  remoteSetup: ".remote-setup-modal",
  renameSession: ".session-rename-modal-shadcn",
  renameWorktree: ".worktree-rename-modal-shadcn",
  sessionNote: ".session-note-modal-shadcn",
  sidebarSpaceEditor: ".space-editor-modal-shadcn",
  worktree: ".worktree-create-modal-shadcn",
  updateAvailable: ".update-available-modal",
};

/*
 * CDXC:AppModal 2026-06-30-16:08:
 * Most measured dialogs are centered, so setting the native window to their
 * element height puts the React shell at y=0. Top-aligned modals keep an
 * intentional WebView inset, so include that inset in the one-shot height.
 */
const ONE_SHOT_NATIVE_FIT_HEIGHT_TOP_OFFSET_MODALS = new Set<AppModalKind>([
  "previousSessions",
]);

function oneShotNativeFitHeightSelector(
  modal: AppModalKind,
): string | undefined {
  return ONE_SHOT_NATIVE_FIT_HEIGHT_MODAL_SELECTORS[modal];
}

export function shouldUseOneShotNativeFitHeight(
  modal: AppModalKind | null | undefined,
): modal is AppModalKind {
  return Boolean(modal && oneShotNativeFitHeightSelector(modal));
}

export function measureOneShotNativeFitHeight(
  modal: AppModalKind,
): number | undefined {
  const selector = oneShotNativeFitHeightSelector(modal);
  if (!selector) {
    return undefined;
  }
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    return undefined;
  }
  /**
   * CDXC:AppModal 2026-09-15 WHY:
   * Measure the intrinsic shell before the native window fits it, then immediately restore its viewport cap.
   * Leaving max-height disabled to get this measurement clips tall dialogs on Windows instead of letting their actions scroll into view.
   * Inner lists and text editors keep their own bounds during measurement.
   */
  const maxHeight = element.style.getPropertyValue("max-height");
  const maxHeightPriority = element.style.getPropertyPriority("max-height");
  try {
    element.style.setProperty("max-height", "none", "important");
    const rect = element.getBoundingClientRect();
    const topOffset = ONE_SHOT_NATIVE_FIT_HEIGHT_TOP_OFFSET_MODALS.has(modal)
      ? Math.max(0, rect.top)
      : 0;
    const height = Math.ceil(
      Math.max(rect.height, element.offsetHeight) + topOffset,
    );
    return Number.isFinite(height) && height > 0 ? height : undefined;
  } finally {
    if (maxHeight) {
      element.style.setProperty("max-height", maxHeight, maxHeightPriority);
    } else {
      element.style.removeProperty("max-height");
    }
  }
}

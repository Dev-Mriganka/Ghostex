import type { BundledGhostexAgentSkillId } from "@/packages/shared/ghostex-agent-skills";
import type { AppModalHostMessage } from "./host-messages";
import { vscode } from "./bridge";
import { ADD_PROJECT_DIALOG_ADD_TIMEOUT_MS } from "./add-project-requests";

const FIRST_LAUNCH_SKILL_INSTALL_TIMEOUT_MS = 150_000;

type FirstLaunchSkillInstallAction =
  | "installBrowserControl"
  | "installBrowserUseSkill"
  | "installComputerUseSkill"
  | "installCliSkill"
  | "installAgentsOrchestrationSkill"
  | "installGenerateTitleSkill"
  | "installManageBeadsSkill"
  | "installMoveCodexSessionSkill"
  | "installHelpSkill";

const FIRST_LAUNCH_SKILL_INSTALL_ACTION_BY_ID: Record<
  BundledGhostexAgentSkillId,
  FirstLaunchSkillInstallAction
> = {
  browserUse: "installBrowserUseSkill",
  cli: "installCliSkill",
  computerUse: "installComputerUseSkill",
  embeddedBrowserUse: "installBrowserControl",
  agentsOrchestration: "installAgentsOrchestrationSkill",
  generateTitle: "installGenerateTitleSkill",
  manageBeads: "installManageBeadsSkill",
  moveCodexSession: "installMoveCodexSessionSkill",
  help: "installHelpSkill",
};

function requestAppModalSettingsAction(
  action: FirstLaunchSkillInstallAction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const handleMessage = (event: Event) => {
      const hostMessage = (event as CustomEvent<AppModalHostMessage>).detail;
      if (
        !hostMessage ||
        typeof hostMessage !== "object" ||
        hostMessage.type !== "sidebarState"
      ) {
        return;
      }
      const status = hostMessage.message;
      if (
        !status ||
        typeof status !== "object" ||
        !("type" in status) ||
        status.type !== "settingsActionStatus" ||
        !("action" in status) ||
        status.action !== action
      ) {
        return;
      }
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      if ("available" in status && status.available === true) {
        resolve();
        return;
      }
      reject(
        new Error(
          "message" in status && typeof status.message === "string"
            ? status.message
            : "Ghostex could not install the selected skill.",
        ),
      );
    };

    window.addEventListener("ghostex-app-modal-host-message", handleMessage);
    timeoutId = window.setTimeout(() => {
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      reject(new Error("Installing the selected skills timed out."));
    }, FIRST_LAUNCH_SKILL_INSTALL_TIMEOUT_MS);
    try {
      vscode.postMessage({ type: action });
    } catch (error) {
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      reject(error);
    }
  });
}

export async function requestFirstLaunchInstallSelectedSkills(
  skillIds: readonly BundledGhostexAgentSkillId[],
): Promise<void> {
  for (const skillId of skillIds) {
    await requestAppModalSettingsAction(
      FIRST_LAUNCH_SKILL_INSTALL_ACTION_BY_ID[skillId],
    );
  }
}

/*
 * CDXC:Onboarding 2026-09-11 WHY:
 * The onboarding's finished screen says "Ghostex is open, <project> is ready", so it may only appear once the
 * app has actually registered the folder and opened its first session. Same waiter shape as the
 * Add Project dialog: mint a requestId, post the operation, resolve or reject on the matching
 * `firstLaunchCreateProjectSessionResult`, with the add-project budget as the ceiling.
 */
export function requestFirstLaunchCreateProjectSession(
  agentId: string,
  path: string,
): Promise<void> {
  const requestId = `first-launch-project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const handleMessage = (event: Event) => {
      const message = (event as CustomEvent<AppModalHostMessage>).detail;
      if (
        !message ||
        typeof message !== "object" ||
        message.type !== "firstLaunchCreateProjectSessionResult" ||
        message.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      if (!message.ok) {
        reject(
          new Error(message.error || "Ghostex could not open the project."),
        );
        return;
      }
      resolve();
    };

    window.addEventListener("ghostex-app-modal-host-message", handleMessage);
    timeoutId = window.setTimeout(() => {
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      reject(new Error("Opening the project timed out."));
    }, ADD_PROJECT_DIALOG_ADD_TIMEOUT_MS);
    try {
      vscode.postMessage({
        agentId,
        path,
        requestId,
        type: "firstLaunchCreateProjectSession",
      });
    } catch (error) {
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      reject(error);
    }
  });
}

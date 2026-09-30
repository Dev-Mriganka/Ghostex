import type {
  AddProjectAddResult,
  AddProjectBrowseResult,
  AddProjectCloneJob,
  AddProjectCloneJobHandle,
  AddProjectClonePreview,
  AddProjectCreateDirectoryResult,
  AddProjectMachineOption,
  AddProjectRepositoryInfo,
  AddProjectSourceControlDiscovery,
} from "@/packages/core-ui/add-project-modal/types";
import type { RemoteFilesystemBrowseResult } from "@/packages/core-ui/remote-project-picker/remote-filesystem";
import type {
  SidebarAddProjectDialogOperation,
  SidebarAddProjectDialogRequestParams,
} from "@/packages/shared/session-grid-contract";
import type { AppModalHostMessage } from "./host-messages";
import { vscode } from "./bridge";

/*
 * CDXC:AddProject 2026-07-30:
 * The add-project dialog's callbacks are host round trips: mint a requestId,
 * post the bounded operation, and wait for the host's answer on the app-modal
 * message channel. The waiter budget MATCHES the host's own timeout for the
 * same operation (60s for an add or a clone start, per the reconnect-time add
 * that used to take ~19s against a 20s ceiling), so neither end can give up
 * while the other is still working. Dismissing the dialog unmounts it and
 * abandons the pending answer; nothing here is optimistic.
 */
export const ADD_PROJECT_DIALOG_ADD_TIMEOUT_MS = 60_000;
export const ADD_PROJECT_DIALOG_BROWSE_TIMEOUT_MS = 15_000;
export const ADD_PROJECT_DIALOG_DISCOVERY_TIMEOUT_MS = 30_000;
export const ADD_PROJECT_DIALOG_LOOKUP_TIMEOUT_MS = 20_000;
export const ADD_PROJECT_DIALOG_JOB_TIMEOUT_MS = 20_000;

function createAddProjectRequestId(
  operation: SidebarAddProjectDialogOperation,
): string {
  return `add-project-${operation}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function requestAddProjectDialogOperation(
  operation: SidebarAddProjectDialogOperation,
  timeoutMs: number,
  input: {
    machineId?: string;
    params?: SidebarAddProjectDialogRequestParams;
  } = {},
): Promise<unknown> {
  const requestId = createAddProjectRequestId(operation);
  const answer = new Promise<unknown>((resolve, reject) => {
    let timeoutId = 0;
    const handleMessage = (event: Event) => {
      const message = (event as CustomEvent<AppModalHostMessage>).detail;
      if (
        !message ||
        typeof message !== "object" ||
        message.type !== "addProjectDialogResult" ||
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
        reject(new Error(message.error || "The request failed."));
        return;
      }
      resolve(message.result);
    };

    window.addEventListener("ghostex-app-modal-host-message", handleMessage);
    timeoutId = window.setTimeout(() => {
      window.removeEventListener(
        "ghostex-app-modal-host-message",
        handleMessage,
      );
      reject(new Error("The machine did not answer in time."));
    }, timeoutMs);
  });
  vscode.postMessage({
    ...(input.machineId ? { machineId: input.machineId } : {}),
    operation,
    ...(input.params ? { params: input.params } : {}),
    requestId,
    type: "addProjectDialogRequest",
  });
  return answer;
}

/*
 * CDXC:AddProject 2026-07-30:
 * The host forwards gxserver result objects unchanged, so these readers are the
 * boundary that turns one into the dialog's prop shape. They THROW on anything
 * unexpected rather than substituting a default: the dialog renders a thrown
 * message in its persistent error region, which is the honest outcome for a
 * daemon answer this build does not understand.
 */
function readAddProjectResultObject(
  value: unknown,
  key: string,
): Record<string, unknown> {
  const container = value as Record<string, unknown> | null | undefined;
  const entry =
    container && typeof container === "object" ? container[key] : undefined;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("The machine returned an unexpected answer.");
  }
  return entry as Record<string, unknown>;
}

function readAddProjectRequiredString(
  source: Record<string, unknown>,
  key: string,
): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("The machine returned an unexpected answer.");
  }
  return value;
}

export function readAddProjectMachineOptions(
  value: unknown,
): readonly AddProjectMachineOption[] {
  const container = value as { machines?: unknown } | null | undefined;
  const machines =
    container && typeof container === "object" ? container.machines : undefined;
  if (!Array.isArray(machines)) {
    throw new Error("Ghostex could not list its machines.");
  }
  return machines.map((machine) => {
    const record = machine as Record<string, unknown>;
    return {
      ...(typeof record.description === "string"
        ? { description: record.description }
        : {}),
      label: readAddProjectRequiredString(record, "label"),
      machineId: readAddProjectRequiredString(record, "machineId"),
      ...(typeof record.platform === "string"
        ? { platform: record.platform }
        : {}),
    };
  });
}

export function readAddProjectBrowseResult(value: unknown): AddProjectBrowseResult {
  if (!isRemoteFilesystemBrowseResult(value)) {
    throw new Error("The machine returned an unexpected answer.");
  }
  const inspection = (value as AddProjectBrowseResult).inspection;
  return {
    entries: value.entries,
    parentPath: value.parentPath,
    inspection,
    isDriveList: (value as AddProjectBrowseResult).isDriveList === true,
  };
}

export function readAddProjectCreateDirectoryResult(
  value: unknown,
  requestedParentPath: string,
  requestedName: string,
): AddProjectCreateDirectoryResult {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    name:
      typeof record.name === "string" && record.name
        ? record.name
        : requestedName,
    parentPath:
      typeof record.parentPath === "string" && record.parentPath
        ? record.parentPath
        : requestedParentPath,
    path: readAddProjectRequiredString(record, "path"),
  };
}

export function readAddProjectAddResult(
  value: unknown,
  machineId: string,
  requestedPath: string,
): AddProjectAddResult {
  const project = readAddProjectResultObject(value, "project");
  return {
    machineId,
    path:
      typeof project.path === "string" && project.path
        ? project.path
        : requestedPath,
    ...(typeof project.projectId === "string"
      ? { projectId: project.projectId }
      : {}),
  };
}

export function readAddProjectDiscovery(
  value: unknown,
): AddProjectSourceControlDiscovery {
  const discovery = readAddProjectResultObject(value, "discovery");
  if (!Array.isArray(discovery.providers)) {
    throw new Error("The machine returned an unexpected answer.");
  }
  return discovery as unknown as AddProjectSourceControlDiscovery;
}

export function readAddProjectRepositoryInfo(
  value: unknown,
): AddProjectRepositoryInfo {
  const repository = readAddProjectResultObject(value, "repository");
  return {
    nameWithOwner: readAddProjectRequiredString(repository, "nameWithOwner"),
    provider: readAddProjectRequiredString(
      repository,
      "provider",
    ) as AddProjectRepositoryInfo["provider"],
    sshUrl: readAddProjectRequiredString(repository, "sshUrl"),
    url: readAddProjectRequiredString(repository, "url"),
  };
}

export function readAddProjectCloneHandle(value: unknown): AddProjectCloneJobHandle {
  const job = readAddProjectResultObject(value, "job");
  return { jobId: readAddProjectRequiredString(job, "jobId") };
}

export function readAddProjectClonePreview(value: unknown): AddProjectClonePreview {
  const preview = readAddProjectResultObject(value, "preview");
  const destinationExistsKind = preview.destinationExistsKind;
  if (
    destinationExistsKind !== undefined &&
    destinationExistsKind !== "directory" &&
    destinationExistsKind !== "file" &&
    destinationExistsKind !== "other"
  ) {
    throw new Error("The machine returned an unexpected clone destination.");
  }
  return {
    ...(typeof preview.branchName === "string"
      ? { branchName: preview.branchName }
      : {}),
    cloneMainOnly: preview.cloneMainOnly === true,
    cloneUrl: readAddProjectRequiredString(preview, "cloneUrl"),
    destinationBlocked: preview.destinationBlocked === true,
    destinationExists: preview.destinationExists === true,
    ...(destinationExistsKind ? { destinationExistsKind } : {}),
    destinationFolderName: readAddProjectRequiredString(
      preview,
      "destinationFolderName",
    ),
    ...(typeof preview.destinationIsEmpty === "boolean"
      ? { destinationIsEmpty: preview.destinationIsEmpty }
      : {}),
    destinationPath: readAddProjectRequiredString(preview, "destinationPath"),
    parentPath: readAddProjectRequiredString(preview, "parentPath"),
    repositoryName: readAddProjectRequiredString(preview, "repositoryName"),
    shallowClone: preview.shallowClone === true,
    ...(typeof preview.warning === "string"
      ? { warning: preview.warning }
      : {}),
  };
}

export function readAddProjectCloneJob(value: unknown): AddProjectCloneJob {
  const job = readAddProjectResultObject(value, "job");
  const state = readAddProjectRequiredString(job, "state");
  if (
    state !== "canceled" &&
    state !== "completed" &&
    state !== "failed" &&
    state !== "running"
  ) {
    throw new Error("The machine returned an unexpected clone state.");
  }
  return {
    ...(typeof job.error === "string" ? { error: job.error } : {}),
    jobId: readAddProjectRequiredString(job, "jobId"),
    ...(typeof job.message === "string" ? { message: job.message } : {}),
    ...(typeof job.projectPath === "string"
      ? { projectPath: job.projectPath }
      : {}),
    state,
  };
}

function isRemoteFilesystemBrowseResult(
  value: unknown,
): value is RemoteFilesystemBrowseResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RemoteFilesystemBrowseResult>;
  return (
    typeof candidate.parentPath === "string" &&
    Array.isArray(candidate.entries) &&
    candidate.entries.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as { fullPath?: unknown }).fullPath === "string" &&
        typeof (entry as { name?: unknown }).name === "string",
    )
  );
}

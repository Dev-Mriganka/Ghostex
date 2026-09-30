import { type ReactNode } from "react";
import type {
  AddProjectBrowseEntry,
  AddProjectMachineOption,
  AddProjectRepositoryInfo,
  AddProjectSourceId,
} from "./types";

export const EMPTY_BROWSE_ENTRIES: readonly AddProjectBrowseEntry[] = [];
export const BROWSE_UP_VALUE = "browse:up";
export const ADD_PROJECT_ROW_ICON_CLASS = "size-4 text-muted-foreground/80";

/*
 * CDXC:AddProject 2026-08-18:
 * The dialog's action buttons are titlebar chrome, not inset controls: each one
 * fills its container's full height, sits flush against the container edge, and
 * carries a single side border as the only separator. A row of them therefore
 * reads as one connected strip the way the titlebar Tips actions do, instead of
 * as floating pills with gaps around them.
 */
export const ADD_PROJECT_ACTION_ADDON_CLASS =
  "h-full gap-0 self-stretch p-0 has-[>button]:ml-0 has-[>button]:mr-0";
export const ADD_PROJECT_ACTION_BUTTON_CLASS =
  "h-full self-stretch border-y-0 border-r-0 border-l border-l-border/70 px-3 text-sm";

/*
 * CDXC:AddProject 2026-08-19:
 * The path bar is the dialog's only text field and it is autofocused, so the
 * shared InputGroup focus treatment (ring + accent border) would draw a
 * permanent highlight frame around the whole strip. Keep the resting border and
 * drop the focus ring instead of hiding focus outright: the caret already shows
 * where typing lands.
 */
export const ADD_PROJECT_PATH_BAR_CLASS =
  "h-10 bg-input/30 has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0";

export type AddProjectBusyKind =
  "add" | "clone" | "createFolder" | "lookup" | "preview";

export interface AddProjectCloneFlow {
  readonly remoteUrl: string;
  readonly repository: AddProjectRepositoryInfo | null;
  readonly repositoryInput: string;
  readonly source: AddProjectSourceId;
  readonly step: "destination" | "repository" | "review";
}

export interface AddProjectCloneOptions {
  readonly branchName: string;
  readonly cloneMainOnly: boolean;
  readonly shallowClone: boolean;
}

export const DEFAULT_CLONE_OPTIONS: AddProjectCloneOptions = {
  branchName: "",
  cloneMainOnly: false,
  shallowClone: false,
};

export type AddProjectView =
  | { readonly kind: "machines" }
  | { readonly kind: "sources"; readonly machineId: string }
  | {
      readonly initialQuery: string;
      readonly kind: "browse";
      readonly machineId: string;
    }
  | { readonly kind: "clone"; readonly machineId: string };

export interface AddProjectRow {
  readonly dataAttributes?: Readonly<Record<string, string>>;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly field: string;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
  readonly searchTerms?: readonly string[];
  readonly submenu?: boolean;
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly value: string;
}

export function buildInitialViewStack(
  options: readonly AddProjectMachineOption[],
  initialMachineId: string | undefined,
): AddProjectView[] {
  if (options.length === 0) {
    return [];
  }
  const preselected = initialMachineId
    ? options.find((option) => option.machineId === initialMachineId)
    : undefined;
  if (preselected) {
    return [{ kind: "sources", machineId: preselected.machineId }];
  }
  if (options.length === 1) {
    return [{ kind: "sources", machineId: options[0].machineId }];
  }
  return [{ kind: "machines" }];
}

export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return fallback;
}

export function cssEscape(value: string): string {
  return value.replace(/["\\]/gu, "\\$&");
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

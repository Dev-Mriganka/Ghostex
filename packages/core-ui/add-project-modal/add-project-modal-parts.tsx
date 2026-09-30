import {
  IconBrandAzure,
  IconBrandBitbucket,
  IconBrandGithub,
  IconBrandGitlab,
  IconDeviceDesktop,
  IconLink,
  IconServer,
} from "@tabler/icons-react";
import { type ReactNode } from "react";
import type { AddProjectMachineOption, AddProjectSourceId } from "./types";
import { ADD_PROJECT_ROW_ICON_CLASS } from "./add-project-modal-model";

/*
 * CDXC:AddProject 2026-07-31:
 * Footer hints render their keys as key caps so the shortcut row reads as
 * chrome instead of a run-on sentence ("Enter Select Backspace Back Esc Close").
 */
export function AddProjectFooterHint({
  keys,
  label,
}: {
  readonly keys: string;
  readonly label: string;
}): ReactNode {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        {keys.split(" ").map((key) => (
          <kbd
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-none border border-border/70 bg-muted/60 px-1.5 font-sans text-sm leading-none text-muted-foreground"
            key={key}
          >
            {key}
          </kbd>
        ))}
      </span>
      {label}
    </span>
  );
}

export function machineIcon(option: AddProjectMachineOption): ReactNode {
  const isLocal = option.machineId === "local";
  return isLocal ? (
    <IconDeviceDesktop className={ADD_PROJECT_ROW_ICON_CLASS} />
  ) : (
    <IconServer className={ADD_PROJECT_ROW_ICON_CLASS} />
  );
}

export function sourceIcon(source: AddProjectSourceId): ReactNode {
  switch (source) {
    case "azure-devops":
      return <IconBrandAzure className={ADD_PROJECT_ROW_ICON_CLASS} />;
    case "bitbucket":
      return <IconBrandBitbucket className={ADD_PROJECT_ROW_ICON_CLASS} />;
    case "github":
      return <IconBrandGithub className={ADD_PROJECT_ROW_ICON_CLASS} />;
    case "gitlab":
      return <IconBrandGitlab className={ADD_PROJECT_ROW_ICON_CLASS} />;
    default:
      return <IconLink className={ADD_PROJECT_ROW_ICON_CLASS} />;
  }
}

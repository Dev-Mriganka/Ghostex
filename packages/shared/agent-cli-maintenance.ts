import catalog from './agent-cli-catalog.json';

/**
 * CDXC:AgentProviders 2026-09-14 DECISION:
 * User: install and update agent CLIs from the Agents page, using each CLI's own commands, and link to each agent's installation docs.
 * ZCode uses npm install -g zcode-app-cli@latest, launches with zcode, and links to https://github.com/kingsword09/zcode-cli.
 * SEE-ALSO: agent-cli-catalog.json is also embedded by server/src/agent_cli/catalog.rs.
 */
export const AGENT_CLI_CATALOG: readonly AgentCliCatalogEntry[] = catalog;

/** One row of agent-cli-catalog.json: the agent's binary, docs, and the package sources gxserver can install from. */
export type AgentCliCatalogEntry = {
  agentId: string;
  binary: string;
  docsUrl: string;
  npmPackage?: string;
  npmFlags?: string[];
  packageManagers?: string[];
  brewFormula?: string;
  brewCask?: boolean;
  wingetId?: string;
  miseTool?: string;
  versionArgs?: string[];
  native?: {
    install: string;
    update?: string;
    windowsInstall?: string;
    /** Variables the official installer and updater need (`CODEX_NON_INTERACTIVE`). */
    env?: Record<string, string>;
    /** Lowercase `/`-separated path fragments only the official installer produces. */
    pathMarkers?: string[];
    /** Commands the official installer needs besides curl, per platform family. */
    requires?: { windows?: string[]; unix?: string[] };
    /** The macOS installer copies an app into /Applications. */
    needsApplicationsFolder?: boolean;
    /** Tooltip wording for an inline script not worth showing verbatim. */
    plan?: string;
  };
  /** A sentence every install method's tooltip adds. */
  installNote?: string;
  /** The update kills running processes of the CLI. */
  updateStopsSessions?: boolean;
  /** Folders the official installer uses (`~` and `%VAR%` expanded by gxserver), searched even when not on PATH. */
  installDirs?: { windows?: string[]; unix?: string[] };
  /** The vendor's release channel for "update available": plain text, or one field of a JSON reply. */
  latestVersion?: { url: string; jsonField?: string };
};

/**
 * The install command shown when no gxserver connection can compute the real method list (the copy-the-command
 * path of the onboarding Install guide): the agent's first package manager, otherwise its official installer,
 * otherwise Homebrew. Same order gxserver's own catalog uses after mise.
 */
export function agentCliCatalogInstallCommand(entry: AgentCliCatalogEntry): string | undefined {
  if (entry.npmPackage) {
    const manager = entry.packageManagers?.[0] ?? 'npm';
    const verb = manager === 'pnpm' ? 'add' : 'install';
    const flags = manager === 'npm' && entry.npmFlags?.length ? `${entry.npmFlags.join(' ')} ` : '';
    return `${manager} ${verb} -g ${flags}${entry.npmPackage}@latest`;
  }
  if (entry.native?.install) return entry.native.install;
  if (entry.brewFormula) return `brew install ${entry.brewCask ? '--cask ' : ''}${entry.brewFormula}`;
  return undefined;
}

export type AgentCliRequest = {
  /** `addToPath` puts an installed CLI's folder on the user's PATH when its installer did not. */
  action: 'read' | 'start' | 'addToPath';
  agentId: string;
  operation?: 'install' | 'update';
  methodId?: string;
};

export type AgentCliMethod = {
  id: string;
  label: string;
  command: string;
  unavailableReason?: string;
  /** Tooltip text: exactly what one click does, including anything Ghostex installs first (absent from older gxservers). */
  plan?: string;
  /** A tool Ghostex installs before running `command` (see packages/shared/managed-tools.ts). */
  prerequisite?: 'node' | 'homebrew' | 'systemTools';
  /** Linux commands `systemTools` installs first. */
  systemTools?: string[];
};

export type AgentCliJob = {
  id: string;
  operation: 'install' | 'update';
  command: string;
  /** `queued` waits for another agent's install or update: gxserver runs one at a time. */
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  output: string;
  error?: string;
};

export type AgentCliState = {
  agentId: string;
  platform: string;
  executablePath?: string;
  version?: string;
  versionError?: string;
  detectedMethodId?: string;
  /** The installer's folder holding the CLI when new terminals will not find it (not on PATH). */
  pathDirectory?: string;
  /** Newest release on the vendor's channel (or npm), when the agent publishes one. */
  latestVersion?: string;
  /** `latestVersion` is newer than the installed `version`. */
  updateAvailable?: boolean;
  methods: AgentCliMethod[];
  job?: AgentCliJob;
};

/**
 * The tooltip of a method's Install or Update button: why it cannot run, otherwise gxserver's plan (what one click
 * does, including anything Ghostex installs first), otherwise the bare command from an older gxserver.
 * SEE-ALSO: apps/desktop/src/app/window/settings_modal/tabs/agents/cli.rs and window/onboarding/agent_cli.rs repeat it.
 */
export function agentCliMethodTooltip(method: AgentCliMethod | undefined): string | undefined {
  if (!method) return undefined;
  return method.unavailableReason ?? method.plan ?? method.command;
}

/** The short note after a method's name when Ghostex installs a tool first ("npm, installs Node.js first"). */
export function agentCliPrerequisiteSuffix(method: AgentCliMethod | undefined): string | undefined {
  switch (method?.prerequisite) {
    case 'node':
      return 'installs Node.js first';
    case 'homebrew':
      return 'installs Homebrew first';
    case 'systemTools': {
      const tools = (method.systemTools?.length ? method.systemTools : ['curl'])
        .map((tool) => (tool === 'ca-certificates' ? 'certificates' : tool))
        .join(', ');
      return `installs ${tools} first`;
    }
    default:
      return undefined;
  }
}

/** A method's name with its prerequisite note, as the method pickers and status lines show it. */
export function agentCliMethodLabel(method: AgentCliMethod): string {
  const suffix = agentCliPrerequisiteSuffix(method);
  return suffix ? `${method.label}, ${suffix}` : method.label;
}

/** A job that has not finished yet: waiting its turn or running. */
export function isAgentCliJobActive(job: AgentCliJob | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

export type AgentCliConnection = {
  id: string;
  label: string;
  request: (request: AgentCliRequest) => Promise<AgentCliState>;
  /** Every catalog agent's state in one round trip (`action: 'list'`). */
  list?: () => Promise<AgentCliState[]>;
};

import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ManagedToolId, ManagedToolOperation, ManagedToolState } from '@/packages/shared/managed-tools';
import type { ManagedToolsConnection } from '../../managed-tools/transport';
import { ManagedToolsSection } from './managed-tools-section';

const meta = { title: 'Modals/Settings Tools', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;

/** Not installed, installing, installed by Ghostex with an update, installed by you, and unavailable. */
function initialTools(): ManagedToolState[] {
  return [
    {
      id: 'node',
      label: 'Node.js and npm',
      description: 'Runs agent CLIs that install with npm, such as Gemini, Pi and Qoder.',
      supported: true,
      installed: false,
      installPlan:
        "Downloads the current Node.js LTS from nodejs.org, checks it against the published checksum, puts it in Ghostex's tools folder and adds it to the end of your PATH. No password needed.",
      needsPassword: false,
      actions: ['install'],
    },
    {
      id: 'uv',
      label: 'uv',
      description:
        'Python package installer from Astral. Ghostex uses it to install Claude Swap for switching Claude accounts, and it downloads the Python Claude Swap needs. uv and uvx also work in your terminals.',
      supported: true,
      installed: false,
      installPlan:
        "Downloads uv from Astral's GitHub releases, checks it against the published checksum and puts it in Ghostex's tools folder. No password needed.",
      needsPassword: false,
      actions: [],
      job: {
        id: 'job-uv',
        operation: 'install',
        status: 'running',
        output: "Installing uv 0.12.19 from Astral's GitHub releases.\nDownloading uv (18 MB)…\n  40%\n",
      },
    },
    {
      id: 'homebrew',
      label: 'Homebrew',
      description: 'The Mac package manager. Ghostex installs it when an install you choose runs through Homebrew.',
      supported: true,
      installed: false,
      installPlan:
        "Runs Homebrew's official installer from brew.sh. macOS asks for your password once; Homebrew also installs Apple's Command Line Tools if they are missing, which can take several minutes.",
      needsPassword: true,
      unavailableReason:
        'Installing Homebrew needs an administrator account on this Mac. Ask an administrator to install Homebrew from brew.sh.',
      actions: [],
    },
    {
      id: 'beads',
      label: 'Beads',
      description: 'The bd command behind the Project board.',
      supported: true,
      installed: true,
      source: 'ghostex',
      version: '1.2.0',
      latestVersion: '1.3.0',
      updateAvailable: true,
      executablePath: '/Users/you/.local/share/ghostex/tools/bin/bd',
      installPlan: 'Downloads Beads from the Beads GitHub releases.',
      needsPassword: false,
      actions: ['update', 'reinstall', 'uninstall'],
    },
    {
      id: 'gh',
      label: 'GitHub CLI',
      description: 'Lets Add Project clone and list your GitHub repositories.',
      supported: true,
      installed: true,
      source: 'system',
      version: '2.97.0',
      executablePath: '/opt/homebrew/bin/gh',
      installPlan: "Downloads GitHub CLI from GitHub's official releases.",
      needsPassword: false,
      actions: [],
    },
    {
      id: 'glab',
      label: 'GitLab CLI',
      description: 'Lets Add Project clone and list your GitLab repositories.',
      supported: true,
      installed: true,
      source: 'ghostex',
      version: '1.119.0',
      latestVersion: '1.119.0',
      updateAvailable: false,
      installPlan: "Downloads GitLab CLI from GitLab's official releases.",
      needsPassword: false,
      actions: ['update', 'reinstall', 'uninstall'],
    },
    {
      id: 'systemTools',
      label: 'System tools',
      description: 'curl, certificates, unzip and git, which agent installers need on Linux.',
      supported: false,
      unsupportedReason: 'System tools are installed by Ghostex only on Linux.',
      installed: false,
      installPlan: '',
      needsPassword: false,
      actions: [],
    },
  ];
}

function Preview() {
  const connection = useMemo<ManagedToolsConnection>(() => {
    const tools = new Map<ManagedToolId, ManagedToolState>(initialTools().map((tool) => [tool.id, tool]));
    const finish = (id: ManagedToolId, operation: ManagedToolOperation) => {
      const tool = tools.get(id)!;
      tool.job = { ...tool.job!, status: 'succeeded', finishedAt: new Date().toISOString() };
      if (operation === 'uninstall') {
        tool.installed = false;
        tool.version = undefined;
        tool.actions = ['install'];
      } else {
        tool.installed = true;
        tool.source = 'ghostex';
        tool.version = tool.latestVersion ?? '1.0.0';
        tool.updateAvailable = false;
        tool.actions = ['update', 'reinstall', 'uninstall'];
      }
    };
    return {
      id: 'preview',
      label: 'This computer',
      list: async () => structuredClone([...tools.values()]),
      request: async (request) => {
        const tool = tools.get(request.tool)!;
        if (request.action === 'start') {
          tool.job = {
            id: `job-${Date.now()}`,
            operation: request.operation,
            status: 'running',
            output: `Downloading ${tool.label}…\n`,
          };
          setTimeout(() => finish(request.tool, request.operation), 3000);
        }
        return structuredClone(tool);
      },
    };
  }, []);
  return (
    <div className='ghostex-settings-shadcn mx-auto min-h-screen w-full max-w-3xl p-4 text-foreground'>
      <p className='mb-4 text-sm text-muted-foreground'>
        Interactive preview. Install, update, reinstall and uninstall simulate a job without changing your computer.
      </p>
      <ManagedToolsSection connection={connection} onRunTerminalCommand={() => undefined} />
    </div>
  );
}

export const Tools: StoryObj = { render: () => <Preview /> };

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  IconBox,
  IconCloud,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconKey,
  IconMicroscope,
  IconPlayerPause,
  IconPlus,
  IconRefresh,
  IconServer,
  IconSparkles,
  IconTerminal2,
  IconTrash,
} from '@tabler/icons-react';
import { Button } from '@/packages/components/ui/button';
import { GXSERVER_PROTOCOL_VERSION, gxserverRpcErrorMessage } from '@/packages/shared/gxserver-protocol';
import { AGENTBOX_PROVIDER_IDS } from '@/packages/shared/ghostex-settings';
import {
  SelectField,
  SettingButton,
  SettingsInput,
  SettingDescriptionTooltip,
  SettingsListItem,
  SettingsNativeScrollArea,
  SettingsSection,
} from '../fields';
import { SettingsTabSearch, hasVisibleSettingsSearchResult, shouldShowSetting } from '../search';

/** One provider in `/api/agentbox` `status` (wire contract 3 of docs/2026-10-01/agentbox/PLAN.md). */
export type AgentboxProviderStatus = {
  configured?: boolean;
  description?: string;
  detail?: string;
  hint?: string;
  id: string;
  kind?: 'local' | 'cloud' | 'remoteDocker';
  label?: string;
  prepared?: boolean;
  ready?: boolean;
};

export type AgentboxStatus = {
  agentSignIns?: { claude?: boolean; codex?: boolean };
  checkedAt?: string;
  dockerReady?: boolean;
  error?: string | null;
  installed?: boolean;
  portlessInstalled?: boolean;
  providers?: AgentboxProviderStatus[];
  supported?: boolean;
  version?: string;
};

export type AgentboxBox = {
  agent?: string;
  name: string;
  projectId?: string;
  provider?: string;
  sessionId?: string;
  sessionTitle?: string;
  state?: string;
  webUrl?: string;
};

/** gxserver's `/api/agentbox` on this computer. */
export type AgentboxConnection = {
  request: (params: Record<string, unknown>) => Promise<unknown>;
};

let connectionSource: (() => AgentboxConnection | undefined) | undefined;
const connectionListeners = new Set<() => void>();
let connectionRevision = 0;

/** Replaces the bootstrap connection (Storybook mocks). */
export function setAgentboxConnectionSource(source: () => AgentboxConnection | undefined): void {
  connectionSource = source;
  connectionRevision++;
  connectionListeners.forEach((listener) => listener());
}

function bootstrapConnection(): AgentboxConnection | undefined {
  if (connectionSource) return connectionSource();
  const bootstrap = (
    window as unknown as { ghostexGpui?: { gxserverBootstrap?: { baseUrl: string; authToken: string } } }
  ).ghostexGpui?.gxserverBootstrap;
  if (!bootstrap?.baseUrl || !bootstrap.authToken) return undefined;
  return {
    request: async (params) => {
      const response = await fetch(`${bootstrap.baseUrl}/api/agentbox`, {
        body: JSON.stringify({ params, protocolVersion: GXSERVER_PROTOCOL_VERSION }),
        headers: {
          authorization: `Bearer ${bootstrap.authToken}`,
          'content-type': 'application/json',
          'x-gxserver-protocol-version': String(GXSERVER_PROTOCOL_VERSION),
        },
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
      });
      const envelope = (await response.json()) as { ok: boolean; result: unknown };
      if (!response.ok || !envelope.ok) {
        throw new Error(gxserverRpcErrorMessage(envelope) ?? 'The agentbox request failed.');
      }
      return envelope.result;
    },
  };
}

function useAgentboxConnection(): AgentboxConnection | undefined {
  const revision = useSyncExternalStore(
    (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    () => connectionRevision
  );
  return useMemo(() => (revision >= 0 ? bootstrapConnection() : undefined), [revision]);
}

const PROVIDER_COPY: Record<string, { description: string; label: string }> = {
  docker: { description: 'On this computer. Free, and needs Docker running.', label: 'Docker' },
  hetzner: { description: 'A cloud server for each box.', label: 'Hetzner' },
  vercel: { description: 'A cloud sandbox with a public preview link.', label: 'Vercel' },
  daytona: { description: 'A cloud sandbox.', label: 'Daytona' },
  e2b: { description: 'A cloud sandbox with a public preview link.', label: 'E2B' },
  digitalocean: { description: 'A cloud server for each box.', label: 'DigitalOcean' },
};

type ProviderRowModel = {
  configured?: boolean;
  description: string;
  detail?: string;
  id: string;
  kind: 'local' | 'cloud' | 'remoteDocker' | 'remoteDockerSetup';
  label: string;
  ready?: boolean;
};

/** The built-in providers, every registered server, and the row that adds one (native: model.rs). */
export function agentboxProviderRows(status: AgentboxStatus | undefined): ProviderRowModel[] {
  const reported = status?.providers ?? [];
  const rows: ProviderRowModel[] = AGENTBOX_PROVIDER_IDS.map((id) => {
    const row = reported.find((candidate) => candidate.id === id);
    return {
      configured: row?.configured,
      description: PROVIDER_COPY[id].description,
      detail: row?.detail ?? row?.hint,
      id,
      kind: id === 'docker' ? 'local' : 'cloud',
      label: PROVIDER_COPY[id].label,
      ready: row?.ready,
    };
  });
  for (const row of reported) {
    if (!row.id.startsWith('docker:')) continue;
    rows.push({
      configured: row.configured,
      description: 'Your server over SSH.',
      detail: row.detail ?? row.hint,
      id: row.id,
      kind: 'remoteDocker',
      label: row.label ?? row.id.slice('docker:'.length),
      ready: row.ready,
    });
  }
  rows.push({
    description: 'Docker on a server you reach over SSH. Add it once by name.',
    id: 'remote-docker',
    kind: 'remoteDockerSetup',
    label: 'Your own server (SSH)',
  });
  return rows;
}

/** A provider row's short state and what its tooltip adds about that state (native: providers.rs). */
function providerState(row: ProviderRowModel, dockerReady: boolean | undefined): { extra?: string; state?: string } {
  if (row.ready === undefined || row.kind === 'remoteDockerSetup') return {};
  if (row.ready) return { extra: row.kind === 'remoteDocker' ? row.detail : undefined, state: 'Ready' };
  if (row.kind === 'local') {
    return dockerReady === false
      ? { extra: 'Start Docker Desktop, OrbStack or Colima, then Refresh.', state: 'Docker not running' }
      : { extra: row.detail, state: 'Not set up' };
  }
  if (row.kind === 'cloud') return { state: row.configured ? 'Logged in, needs Prepare' : 'Not set up' };
  return { extra: row.detail, state: 'Not reachable' };
}

/** What a provider row's info icon explains: the provider and what its buttons do. */
function providerTooltip(row: ProviderRowModel, extra: string | undefined): string {
  const base =
    row.kind === 'local'
      ? `${row.description} Set Up builds the box image once.`
      : row.kind === 'cloud'
        ? `${row.description} Log In asks for an API token from your ${row.label} account; Prepare builds its base image once. Cloud boxes bill while they exist.`
        : row.kind === 'remoteDocker'
          ? `${row.description} Check tests that boxes can run there.`
          : `${row.description} Add Server registers it by a name and its SSH address (user@host, host:port, or a name from ~/.ssh/config). The server needs Docker, and the terminal may ask you to trust its key.`;
  return extra ? `${base} ${extra}` : base;
}

/**
 * A row label with the hover-revealed info icon. Rows show no subtitle text (CDXC:Settings
 * 2026-09-09 DECISION in fields/primitives.tsx): every explanation sits in that tooltip, and a
 * row's detail carries only its short live state.
 */
function RowTitle({ description, label }: { description: string; label: string }) {
  return (
    <span className='settings-row-label-line flex flex-wrap items-center gap-2'>
      <span>{label}</span>
      <SettingDescriptionTooltip description={description} label={label} />
    </span>
  );
}

const ALIAS_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SSH_PATTERN = /^[A-Za-z0-9._@:-]{1,253}$/;

function label(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/[-_]/g, ' ');
}

/**
 * The React twin of Settings > Cloud Boxes. The desktop renders the native page
 * (apps/desktop/src/app/window/settings_modal/tabs/cloud_boxes.rs); this copy keeps the page in
 * Storybook and in the search rows Ghostex Help is generated from.
 *
 * CDXC:AgentBox 2026-10-01 SEE-ALSO: the native page carries the user's decision; keep the two
 * pages' sections, rows and buttons the same.
 */
export function CloudBoxesSettingsTab({
  defaultLocation,
  defaultLocationModified,
  onDefaultLocationChange,
  onDefaultLocationReset,
  onOpenUrl,
  onRunTerminalCommand,
  onSetUpForMe,
  search,
  searchEmptyState,
}: {
  defaultLocation: string;
  defaultLocationModified?: boolean;
  onDefaultLocationChange: (value: string) => void;
  onDefaultLocationReset?: () => void;
  onOpenUrl?: (url: string) => void;
  /** Runs one setup step in a command-pane terminal; the desktop asks gxserver for the command text. */
  onRunTerminalCommand?: (command: string, args?: Record<string, string>) => void;
  onSetUpForMe?: () => void;
  search: SettingsTabSearch;
  searchEmptyState?: ReactNode;
}) {
  const connection = useAgentboxConnection();
  const [status, setStatus] = useState<AgentboxStatus>();
  const [statusError, setStatusError] = useState<string>();
  const [statusLoading, setStatusLoading] = useState(false);
  const [boxes, setBoxes] = useState<AgentboxBox[]>();
  const [boxesError, setBoxesError] = useState<string>();
  const [addingServer, setAddingServer] = useState(false);
  const [serverAlias, setServerAlias] = useState('');
  const [serverSsh, setServerSsh] = useState('');
  const [confirmDestroy, setConfirmDestroy] = useState<string>();

  const loadStatus = useCallback(
    (refresh: boolean) => {
      if (!connection) return;
      setStatusLoading(true);
      connection
        .request({ action: 'status', refresh })
        .then((result) => {
          setStatus(result as AgentboxStatus);
          setStatusError(undefined);
        })
        .catch((error: unknown) => setStatusError(error instanceof Error ? error.message : String(error)))
        .finally(() => setStatusLoading(false));
    },
    [connection]
  );
  const loadBoxes = useCallback(() => {
    if (!connection) return;
    connection
      .request({ action: 'list' })
      .then((result) => {
        setBoxes(((result as { boxes?: AgentboxBox[] }).boxes ?? []).filter((box) => Boolean(box.name)));
        setBoxesError(undefined);
      })
      .catch((error: unknown) => setBoxesError(error instanceof Error ? error.message : String(error)));
  }, [connection]);
  useEffect(() => {
    loadStatus(false);
    loadBoxes();
  }, [loadBoxes, loadStatus]);

  const show = (section: string, key: string) =>
    search.sections[section] ? shouldShowSetting(search.sections[section], key) : true;
  const sectionVisible = (section: string) =>
    search.sections[section] ? hasVisibleSettingsSearchResult(search.sections[section]) : true;
  const supported = status?.supported !== false;
  const installed = status?.installed;
  const blockedReason = installed === false ? 'Install agentbox first.' : undefined;
  const providerRows = agentboxProviderRows(status);
  const runStep = (command: string, args?: Record<string, string>) => onRunTerminalCommand?.(command, args);

  const statusState = !connection
    ? 'Server not reachable'
    : statusError
      ? `Ghostex could not read agentbox status: ${statusError}`
      : !status
        ? 'Checking…'
        : !supported
          ? 'Needs macOS or Linux'
          : installed === false
            ? 'Not installed'
            : [
                status.version ? `Version ${status.version}` : 'Installed',
                status.dockerReady === true
                  ? 'Docker running'
                  : status.dockerReady === false
                    ? 'Docker not running'
                    : '',
                status.error ? 'Last check failed' : '',
              ]
                .filter(Boolean)
                .join(' · ');
  const statusTooltip = [
    'agentbox is the free, open-source command line tool Ghostex uses to run boxes. Run Check shows its own health check.',
    !connection ? 'Ghostex could not reach its server on this computer.' : '',
    statusError ? `Ghostex could not read agentbox status: ${statusError}` : '',
    status && !supported ? 'Boxes run on macOS and Linux. On Windows, use Ghostex inside WSL.' : '',
    status && installed === false ? 'Install adds it with npm.' : '',
    status?.dockerReady === false ? "Docker isn't running, so boxes on this computer can't start." : '',
    status?.portlessInstalled ? 'Box web apps open at https://<box>.localhost.' : '',
    status?.error ? `The last check failed: ${status.error}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const statusTone =
    !connection || statusError || installed === false || !supported || status?.dockerReady === false || status?.error
      ? 'warning'
      : status
        ? 'success'
        : 'neutral';

  const locationOptions = [
    { label: 'This computer', value: 'local' },
    ...providerRows
      .filter((row) => row.kind !== 'remoteDockerSetup')
      .map((row) => {
        const base =
          row.kind === 'local'
            ? 'Docker on this computer'
            : row.kind === 'remoteDocker'
              ? `${row.label} (your server)`
              : row.label;
        return { label: row.ready === false ? `${base} (not set up)` : base, value: `agentbox:${row.id}` };
      }),
  ];
  if (!locationOptions.some((option) => option.value === defaultLocation)) {
    locationOptions.push({ label: defaultLocation, value: defaultLocation });
  }

  return (
    <SettingsNativeScrollArea className='h-full min-h-0'>
      <div className='settings-page-width flex flex-col gap-6 px-5 pb-5'>
        {search.tab.isSearching && !hasVisibleSettingsSearchResult(search.tab) ? searchEmptyState : null}
        {sectionVisible('overview') ? (
          <SettingsSection
            description='Run an agent session in an isolated box on this computer (Docker), in the cloud, or on your own server. Ghostex uses agentbox, a free open-source command line tool.'
            title='Cloud Boxes'
          >
            {show('overview', 'agentboxStatus') ? (
              <SettingsListItem
                detail={statusState}
                icon={<IconBox aria-hidden='true' size={17} />}
                status={statusTone}
                title={<RowTitle description={statusTooltip} label='agentbox' />}
              >
                {connection && installed === false && supported ? (
                  <SettingButton disabledReason='' onClick={() => runStep('install')} type='button' variant='outline'>
                    <IconDownload aria-hidden='true' data-icon='inline-start' />
                    Install agentbox
                  </SettingButton>
                ) : null}
                {connection && installed === true && supported ? (
                  <SettingButton disabledReason='' onClick={() => runStep('doctor')} type='button' variant='outline'>
                    <IconMicroscope aria-hidden='true' data-icon='inline-start' />
                    Run Check
                  </SettingButton>
                ) : null}
                {connection ? (
                  <SettingButton
                    disabled={statusLoading}
                    disabledReason='Checking agentbox…'
                    onClick={() => {
                      loadStatus(true);
                      loadBoxes();
                    }}
                    type='button'
                    variant='ghost'
                  >
                    <IconRefresh aria-hidden='true' data-icon='inline-start' />
                    Refresh
                  </SettingButton>
                ) : null}
              </SettingsListItem>
            ) : null}
            {show('overview', 'agentboxSetUpForMe') && supported ? (
              <SettingsListItem
                icon={<IconSparkles aria-hidden='true' size={17} />}
                title={
                  <RowTitle
                    description='An agent installs agentbox, asks which clouds you want, creates the API tokens in your browser, and signs Claude and Codex in for boxes. It asks before anything that costs money.'
                    label='Set it up for me'
                  />
                }
              >
                <SettingButton disabledReason='' onClick={onSetUpForMe} type='button' variant='outline'>
                  <IconSparkles aria-hidden='true' data-icon='inline-start' />
                  Set It Up for Me
                </SettingButton>
              </SettingsListItem>
            ) : null}
            {show('overview', 'agentboxWhatIsABox') ? (
              <SettingsListItem
                icon={<IconInfoCircle aria-hidden='true' size={17} />}
                title={
                  <RowTitle
                    description="An isolated copy of your project where an agent works without touching this computer. Your agent's settings, skills and Codex sign-in go with it, and the box's web app opens here on your computer."
                    label='What is a box?'
                  />
                }
              >
                <SettingButton
                  disabledReason=''
                  onClick={() => onOpenUrl?.('https://github.com/madarco/agentbox')}
                  type='button'
                  variant='ghost'
                >
                  <IconExternalLink aria-hidden='true' data-icon='inline-start' />
                  agentbox on GitHub
                </SettingButton>
              </SettingsListItem>
            ) : null}
          </SettingsSection>
        ) : null}
        {supported && sectionVisible('providers') ? (
          <SettingsSection
            description='Docker on this computer is free. Cloud boxes bill while they exist.'
            title='Where boxes run'
          >
            {providerRows
              .filter((row) =>
                show(
                  'providers',
                  row.kind === 'remoteDocker' || row.kind === 'remoteDockerSetup'
                    ? 'agentboxRemoteDocker'
                    : 'agentboxProviders'
                )
              )
              .flatMap((row) => {
                const { extra, state } = providerState(row, status?.dockerReady);
                const Icon = row.kind === 'local' ? IconBox : row.kind === 'cloud' ? IconCloud : IconServer;
                const quiet = row.ready === true ? 'ghost' : 'outline';
                const items = [
                  <SettingsListItem
                    detail={state}
                    icon={<Icon aria-hidden='true' size={17} />}
                    key={row.id}
                    status={
                      row.kind === 'remoteDockerSetup'
                        ? 'neutral'
                        : row.ready === true
                          ? 'success'
                          : row.ready === false && (row.kind !== 'cloud' || row.configured)
                            ? 'warning'
                            : 'neutral'
                    }
                    title={<RowTitle description={providerTooltip(row, extra)} label={row.label} />}
                  >
                    {row.kind === 'local' ? (
                      <SettingButton
                        disabled={Boolean(blockedReason)}
                        disabledReason={blockedReason ?? ''}
                        onClick={() => runStep('setup', { provider: 'docker' })}
                        type='button'
                        variant={quiet}
                      >
                        <IconDownload aria-hidden='true' data-icon='inline-start' />
                        Set Up
                      </SettingButton>
                    ) : null}
                    {row.kind === 'cloud' ? (
                      <>
                        <SettingButton
                          disabled={Boolean(blockedReason)}
                          disabledReason={blockedReason ?? ''}
                          onClick={() => runStep('login', { provider: row.id })}
                          type='button'
                          variant={row.configured ? 'ghost' : 'outline'}
                        >
                          <IconKey aria-hidden='true' data-icon='inline-start' />
                          Log In
                        </SettingButton>
                        <SettingButton
                          disabled={Boolean(blockedReason) || row.configured === false}
                          disabledReason={blockedReason ?? 'Log in first.'}
                          onClick={() => runStep('prepare', { provider: row.id })}
                          type='button'
                          variant={quiet}
                        >
                          <IconBox aria-hidden='true' data-icon='inline-start' />
                          Prepare
                        </SettingButton>
                      </>
                    ) : null}
                    {row.kind === 'remoteDocker' ? (
                      <SettingButton
                        disabled={Boolean(blockedReason)}
                        disabledReason={blockedReason ?? ''}
                        onClick={() => runStep('remoteDockerDoctor', { host: row.id.slice('docker:'.length) })}
                        type='button'
                        variant={quiet}
                      >
                        <IconTerminal2 aria-hidden='true' data-icon='inline-start' />
                        Check
                      </SettingButton>
                    ) : null}
                    {row.kind === 'remoteDockerSetup' && !addingServer ? (
                      <SettingButton
                        disabled={Boolean(blockedReason)}
                        disabledReason={blockedReason ?? ''}
                        onClick={() => setAddingServer(true)}
                        type='button'
                        variant='outline'
                      >
                        <IconPlus aria-hidden='true' data-icon='inline-start' />
                        Add Server
                      </SettingButton>
                    ) : null}
                  </SettingsListItem>,
                ];
                if (row.kind === 'remoteDockerSetup' && addingServer) {
                  const aliasOk = ALIAS_PATTERN.test(serverAlias);
                  const sshOk = SSH_PATTERN.test(serverSsh) && !serverSsh.startsWith('-');
                  items.push(
                    <div className='flex flex-col gap-2.5 px-5 py-3.5' key='add-server'>
                      <label className='flex items-center gap-2.5'>
                        <span className='text-muted-foreground w-14 shrink-0 text-[13px]'>Name</span>
                        <SettingsInput
                          onChange={(event) => setServerAlias(event.target.value.trim())}
                          placeholder='my-server'
                          value={serverAlias}
                        />
                      </label>
                      <label className='flex items-center gap-2.5'>
                        <span className='text-muted-foreground w-14 shrink-0 text-[13px]'>SSH</span>
                        <SettingsInput
                          className='font-mono'
                          onChange={(event) => setServerSsh(event.target.value.trim())}
                          placeholder='user@host, host:port, or a name from ~/.ssh/config'
                          value={serverSsh}
                        />
                      </label>
                      <div className='flex items-center justify-end gap-2'>
                        <Button onClick={() => setAddingServer(false)} type='button' variant='ghost'>
                          Cancel
                        </Button>
                        <SettingButton
                          disabled={Boolean(blockedReason) || !aliasOk || !sshOk}
                          disabledReason={blockedReason ?? 'Fill in a name and how SSH reaches the server.'}
                          onClick={() => {
                            runStep('remoteDockerAdd', { alias: serverAlias, ssh: serverSsh });
                            setAddingServer(false);
                            setServerAlias('');
                            setServerSsh('');
                          }}
                          type='button'
                          variant='outline'
                        >
                          <IconPlus aria-hidden='true' data-icon='inline-start' />
                          Add
                        </SettingButton>
                      </div>
                    </div>
                  );
                }
                return items;
              })}
          </SettingsSection>
        ) : null}
        {supported && sectionVisible('agentSignIn') ? (
          <SettingsSection description="Your agent's settings and skills go with every box." title='Agent sign-in'>
            {(
              [
                {
                  agent: 'claude',
                  key: 'agentboxClaudeSignIn',
                  signedIn: status?.agentSignIns?.claude,
                  title: 'Claude in boxes',
                  description:
                    'Claude needs its own one-time sign-in for boxes, so Claude on this computer stays signed in. Every box uses it.',
                },
                {
                  agent: 'codex',
                  key: 'agentboxCodexSignIn',
                  signedIn: status?.agentSignIns?.codex,
                  title: 'Codex in boxes',
                  description:
                    'Boxes on this computer reuse your Codex sign-in. Sign in here if Codex is not signed in on this computer, or for cloud boxes.',
                },
              ] as const
            )
              .filter((row) => show('agentSignIn', row.key))
              .map((row) => (
                <SettingsListItem
                  detail={row.signedIn === true ? 'Signed in' : row.signedIn === false ? 'Not signed in' : undefined}
                  icon={<IconKey aria-hidden='true' size={17} />}
                  key={row.agent}
                  status={row.signedIn === true ? 'success' : row.signedIn === false ? 'warning' : 'neutral'}
                  title={<RowTitle description={row.description} label={row.title} />}
                >
                  <SettingButton
                    disabled={Boolean(blockedReason)}
                    disabledReason={blockedReason ?? ''}
                    onClick={() => runStep('agentLogin', { agent: row.agent })}
                    type='button'
                    variant={row.signedIn === true ? 'ghost' : 'outline'}
                  >
                    <IconKey aria-hidden='true' data-icon='inline-start' />
                    {row.signedIn === true ? 'Sign In Again' : 'Sign In'}
                  </SettingButton>
                </SettingsListItem>
              ))}
          </SettingsSection>
        ) : null}
        {supported && sectionVisible('newThreads') && show('newThreads', 'agentboxDefaultLocation') ? (
          <SettingsSection description='Pick a box location once it shows Ready above.' title='New threads'>
            <SelectField
              description='Where new threads run unless you pick another location.'
              isModified={defaultLocationModified}
              label='Default location'
              onChange={onDefaultLocationChange}
              onResetToDefault={onDefaultLocationReset}
              options={locationOptions}
              triggerWidth='15rem'
              value={defaultLocation}
            />
          </SettingsSection>
        ) : null}
        {supported && installed !== false && sectionVisible('boxes') && show('boxes', 'agentboxBoxes') ? (
          <SettingsSection
            actions={
              <SettingButton disabledReason='' onClick={loadBoxes} type='button' variant='ghost'>
                <IconRefresh aria-hidden='true' data-icon='inline-start' />
                Refresh
              </SettingButton>
            }
            title='Your boxes'
          >
            {boxesError ? (
              <SettingsListItem
                detail={`Ghostex could not read your boxes: ${boxesError}`}
                icon={<IconBox aria-hidden='true' size={17} />}
                status='warning'
                title={<RowTitle description={`Ghostex could not read your boxes: ${boxesError}`} label='Boxes' />}
              />
            ) : !boxes ? (
              <SettingsListItem
                detail='Reading your boxes…'
                icon={<IconBox aria-hidden='true' size={17} />}
                title='Boxes'
              />
            ) : boxes.length === 0 ? (
              <SettingsListItem
                icon={<IconBox aria-hidden='true' size={17} />}
                title={
                  <RowTitle
                    description='Pick a box location under Run on when you start a new thread.'
                    label='No boxes yet'
                  />
                }
              />
            ) : (
              boxes.flatMap((box) => {
                const running = box.state === 'running' || box.state === 'starting';
                const facts = [
                  box.agent
                    ? label(box.agent, { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode', pi: 'Pi' })
                    : '',
                  box.provider
                    ? label(box.provider, {
                        ...Object.fromEntries(
                          Object.entries(PROVIDER_COPY).map(([id, copy]) => [id, copy.label] as const)
                        ),
                        'remote-docker': 'Your server',
                      })
                    : '',
                  box.state ? label(box.state, {}) : '',
                  box.sessionId
                    ? box.sessionTitle
                      ? `Session: ${box.sessionTitle}`
                      : 'Linked to a Ghostex session'
                    : '',
                ].filter(Boolean);
                const items = [
                  <SettingsListItem
                    detail={facts.join(' · ')}
                    icon={<IconBox aria-hidden='true' size={17} />}
                    key={box.name}
                    status={running ? 'success' : 'neutral'}
                    title={
                      <RowTitle
                        description={`The agentbox box ${box.name}. Open Web App opens the app it serves on this computer. Stop keeps its work; Destroy deletes it, and a cloud box stops billing.`}
                        label={box.name}
                      />
                    }
                  >
                    <SettingButton
                      disabled={!box.sessionId && !box.webUrl}
                      disabledReason='This box has no web app.'
                      onClick={() => {
                        if (box.sessionId && box.projectId && connection) {
                          void connection
                            .request({
                              action: 'openTarget',
                              projectId: box.projectId,
                              sessionId: box.sessionId,
                              target: 'web',
                            })
                            .then((result) => {
                              const url = (result as { url?: string }).url;
                              if (url) onOpenUrl?.(url);
                            });
                        } else if (box.webUrl) {
                          onOpenUrl?.(box.webUrl);
                        }
                      }}
                      type='button'
                      variant='outline'
                    >
                      <IconExternalLink aria-hidden='true' data-icon='inline-start' />
                      Open Web App
                    </SettingButton>
                    {running ? (
                      <SettingButton
                        disabledReason=''
                        onClick={() =>
                          void connection?.request({ action: 'stop', boxName: box.name }).finally(loadBoxes)
                        }
                        type='button'
                        variant='ghost'
                      >
                        <IconPlayerPause aria-hidden='true' data-icon='inline-start' />
                        Stop
                      </SettingButton>
                    ) : null}
                    <SettingButton
                      disabledReason=''
                      onClick={() => setConfirmDestroy(confirmDestroy === box.name ? undefined : box.name)}
                      type='button'
                      variant='ghost'
                    >
                      <IconTrash aria-hidden='true' data-icon='inline-start' />
                      Destroy
                    </SettingButton>
                  </SettingsListItem>,
                ];
                if (confirmDestroy === box.name) {
                  items.push(
                    <SettingsListItem
                      detail={
                        <span style={{ whiteSpace: 'normal' }}>
                          Deletes the box and any work in it that was not pushed.
                        </span>
                      }
                      key={`${box.name}-destroy`}
                      status='warning'
                      title={`Destroy ${box.name}?`}
                    >
                      <Button onClick={() => setConfirmDestroy(undefined)} type='button' variant='ghost'>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          setConfirmDestroy(undefined);
                          void connection?.request({ action: 'destroy', boxName: box.name }).finally(loadBoxes);
                        }}
                        type='button'
                        variant='destructive'
                      >
                        <IconTrash aria-hidden='true' data-icon='inline-start' />
                        Destroy
                      </Button>
                    </SettingsListItem>
                  );
                }
                return items;
              })
            )}
          </SettingsSection>
        ) : null}
        {sectionVisible('howTo') ? (
          <SettingsSection title='How it works'>
            <div className='text-muted-foreground flex flex-col gap-1.5 px-5 py-3.5 text-[13px]'>
              {show('howTo', 'agentboxStartThread') ? (
                <p>Start a box: in New Thread, pick a place under Run on.</p>
              ) : null}
              {show('howTo', 'agentboxWebApp') ? (
                <p>
                  Open its web app: right-click the session and choose Open Box Web App. An agentbox.yaml with
                  services.web.expose.port starts your dev server.
                </p>
              ) : null}
              {show('howTo', 'agentboxBilling') ? (
                <p>Cloud boxes bill until you stop or destroy them. Deleting a session stops its box.</p>
              ) : null}
            </div>
          </SettingsSection>
        ) : null}
      </div>
    </SettingsNativeScrollArea>
  );
}

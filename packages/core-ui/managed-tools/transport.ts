import { useMemo, useSyncExternalStore } from 'react';
import { GXSERVER_PROTOCOL_VERSION, gxserverRpcErrorMessage } from '@/packages/shared/gxserver-protocol';
import type { ManagedToolsRequest, ManagedToolState } from '@/packages/shared/managed-tools';

/** gxserver's `/api/managedTools` on one computer. */
export type ManagedToolsConnection = {
  id: string;
  label: string;
  request: (request: Exclude<ManagedToolsRequest, { action: 'list' }>) => Promise<ManagedToolState>;
  list: (fresh?: boolean) => Promise<ManagedToolState[]>;
};

let source: (() => ManagedToolsConnection[]) | undefined;
const listeners = new Set<() => void>();
let revision = 0;

export function notifyManagedToolsConnectionsChanged(): void {
  revision++;
  listeners.forEach((listener) => listener());
}

/** Replaces the bootstrap connection (Storybook mocks, hosts that proxy gxserver themselves). */
export function setManagedToolsConnectionSource(value: () => ManagedToolsConnection[]): void {
  source = value;
  notifyManagedToolsConnectionsChanged();
}

function getConnections(): ManagedToolsConnection[] {
  if (source) return source();
  const bootstrap = (
    window as unknown as {
      ghostexGpui?: {
        gxserverBootstrap?: { baseUrl: string; authToken: string };
      };
    }
  ).ghostexGpui?.gxserverBootstrap;
  if (!bootstrap?.baseUrl || !bootstrap.authToken) return [];
  const post = async <T>(params: ManagedToolsRequest): Promise<T> => {
    const response = await fetch(`${bootstrap.baseUrl}/api/managedTools`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bootstrap.authToken}`,
        'content-type': 'application/json',
        'x-gxserver-protocol-version': String(GXSERVER_PROTOCOL_VERSION),
      },
      body: JSON.stringify({ params, protocolVersion: GXSERVER_PROTOCOL_VERSION }),
      signal: AbortSignal.timeout(60_000),
    });
    const envelope = (await response.json()) as { ok: boolean; result: T };
    if (!response.ok || !envelope.ok) throw new Error(gxserverRpcErrorMessage(envelope) ?? 'The tools request failed.');
    return envelope.result;
  };
  return [
    {
      id: 'local',
      label: 'This computer',
      request: (params) => post<ManagedToolState>(params),
      list: async (fresh) => (await post<{ tools: ManagedToolState[] }>({ action: 'list', fresh })).tools,
    },
  ];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** This computer's connection, or undefined where the page cannot reach gxserver. */
export function useManagedToolsConnection(): ManagedToolsConnection | undefined {
  const currentRevision = useSyncExternalStore(subscribe, () => revision);
  return useMemo(() => getConnections()[0], [currentRevision]);
}

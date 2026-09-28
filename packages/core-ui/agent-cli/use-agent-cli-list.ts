import { useCallback, useEffect, useState } from 'react';
import type { AgentCliConnection, AgentCliState } from '@/packages/shared/agent-cli-maintenance';

/**
 * Every catalog agent's CLI state from one `list` request, read when `active` turns on and on `refresh`. Rows use
 * it for their collapsed Install CLI / Update CLI actions; an expanded row still reads and polls its own agent.
 */
export function useAgentCliList(
  connection: AgentCliConnection | undefined,
  active: boolean
): { states: ReadonlyMap<string, AgentCliState>; refresh: () => void } {
  const [states, setStates] = useState<ReadonlyMap<string, AgentCliState>>(new Map());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const list = connection?.list;
    if (!active || !list) return;
    let current = true;
    list().then(
      (agents) => {
        if (current) setStates(new Map(agents.map((state) => [state.agentId, state])));
      },
      () => {
        // Rows fall back to hook status; the expanded controls show the real error.
      }
    );
    return () => {
      current = false;
    };
  }, [active, connection, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { states, refresh };
}

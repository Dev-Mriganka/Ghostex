import { useEffect, useState } from 'react';
import { useAgentCliConnections } from './transport';

/**
 * The answers already read, per connection and agent. A read goes through the same gxserver
 * detection the Agents page uses (`/api/agentCliMaintenance`, server/src/agent_cli/), which runs a
 * login shell and the CLI's version command, so a page that mounts again reuses the answer instead.
 */
const installedByConnection = new Map<string, Map<string, Promise<boolean>>>();

/**
 * Which of these agent CLIs this computer has on its PATH. Empty until the answer arrives, and empty
 * when there is no gxserver connection. `agentIds` must be a stable array.
 */
export function useInstalledAgentClis(agentIds: readonly string[]): ReadonlySet<string> {
  const connection = useAgentCliConnections()[0];
  const [installed, setInstalled] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!connection || !agentIds.length) return;
    let answers = installedByConnection.get(connection.id);
    if (!answers) installedByConnection.set(connection.id, (answers = new Map()));
    const cache = answers;
    let active = true;
    void Promise.all(
      agentIds.map(async (agentId) => {
        let answer = cache.get(agentId);
        if (!answer) {
          answer = connection
            .request({ action: 'read', agentId })
            .then((state) => Boolean(state.executablePath))
            // A failed read is asked again next time rather than remembered as "not installed".
            .catch(() => {
              cache.delete(agentId);
              return false;
            });
          cache.set(agentId, answer);
        }
        return (await answer) ? agentId : undefined;
      })
    ).then((found) => {
      if (active) setInstalled(new Set(found.filter((agentId): agentId is string => Boolean(agentId))));
    });
    return () => {
      active = false;
    };
  }, [connection, agentIds]);
  return installed;
}

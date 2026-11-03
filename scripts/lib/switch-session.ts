import { randomUUID } from 'node:crypto';
import { MemoryCursorStore, SwitchConnection, SwitchOps, type RoomContext } from '@said/switch-client';
import type { SaidConfig } from '@said/runtime';

export interface RoomSession {
  ops: SwitchOps;
  context: RoomContext;
  connectionId: string;
}

/**
 * Opens a short-lived connection for `agentId`, claims the room (`connect_to_room`), runs `fn`, and closes.
 *
 * Switch lets one connection per agent hold a room: claiming it takes the room from any other
 * live session of the SAME agent. So callers must only use this while the service that normally owns
 * that agent (the notary for `said`, the builder for `builder`) is stopped. `doctor` checks that
 * and falls back to the notary's own API when it is running.
 */
export async function withRoomSession<T>(
  config: Pick<SaidConfig, 'switchUrl' | 'roomId'>,
  creds: { agentId: string; apiKey: string },
  fn: (session: RoomSession) => Promise<T>,
): Promise<T> {
  const connectionId = randomUUID();
  const credentials = { baseUrl: config.switchUrl, agentId: creds.agentId, apiKey: creds.apiKey };
  const connection = new SwitchConnection({
    creds: credentials,
    connectionId,
    rooms: [config.roomId],
    filter: 'addressed',
    cursorStore: new MemoryCursorStore(),
    client: { name: 'said-scripts', version: '0.1.0' },
    onEvent: async () => undefined,
    maxBackoffMs: 2000,
  });
  await connection.start();
  try {
    const ops = new SwitchOps(credentials, { connectionId });
    const context = await ops.connectToRoom(config.roomId);
    return await fn({ ops, context, connectionId });
  } finally {
    await connection.stop();
  }
}

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MemoryCursorStore, SwitchConnection, SwitchOps } from '@said/switch-client';

const agents = JSON.parse(readFileSync('/workspace/switch-live/said-agents.json', 'utf8'));
const roomId = JSON.parse(readFileSync('/workspace/switch-live/said-room.json', 'utf8')).room.id as string;
const docId = JSON.parse(readFileSync('/workspace/switch-live/live-probe-evidence.json', 'utf8')).doc.document_id as string;
const evidence: string[] = [];
const note = (s: string): void => {
  evidence.push(s);
  console.log(s);
};

async function withAgent(
  name: 'said' | 'builder',
  fn: (ops: SwitchOps) => Promise<void>,
): Promise<void> {
  const a = agents[name];
  const connectionId = randomUUID();
  const creds = {
    baseUrl: 'http://127.0.0.1:8000',
    agentId: a.id as string,
    apiKey: a.api_key as string,
  };
  const ops = new SwitchOps(creds, { connectionId });
  const conn = new SwitchConnection({
    creds,
    connectionId,
    rooms: [roomId],
    filter: 'all',
    cursorStore: new MemoryCursorStore(),
    client: { name: `said-${name}-probe`, version: '0.1.0' },
    onEvent: async () => {},
  });
  await conn.start();
  try {
    await fn(ops);
  } finally {
    await conn.stop().catch(() => undefined);
  }
}

await withAgent('builder', async (ops) => {
  await ops.connectToRoom(roomId);
  try {
    await ops.updateRoomDocument({ documentId: docId, content: '# TAMPERED by builder\n' });
    note('FAIL: builder update unexpectedly succeeded');
  } catch (err) {
    note(`PASS: builder update rejected: ${String(err).slice(0, 400)}`);
  }
  try {
    const r = await ops.call('delete_room_document', { document_id: docId });
    note(`FAIL: builder delete unexpectedly ok: ${JSON.stringify(r)}`);
  } catch (err) {
    note(`PASS: builder delete rejected: ${String(err).slice(0, 400)}`);
  }
});

await withAgent('said', async (ops) => {
  await ops.connectToRoom(roomId);
  const upd = await ops.updateRoomDocument({
    documentId: docId,
    content: '# Said Ledger\n\nLive probe revision 2 (said still owns it)\n',
  });
  note(`PASS: said update ok: ${JSON.stringify(upd)}`);
});

writeFileSync('/workspace/switch-live/live-doc-auth.json', JSON.stringify({ docId, roomId, evidence }, null, 2));
note('done');

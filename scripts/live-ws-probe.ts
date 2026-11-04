import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MemoryCursorStore, SwitchConnection, SwitchOps } from '@said/switch-client';

const agents = JSON.parse(readFileSync('/workspace/switch-live/said-agents.json', 'utf8'));
const room = JSON.parse(readFileSync('/workspace/switch-live/said-room.json', 'utf8')).room;
const said = agents.said;
const roomId = room.id as string;
const connectionId = randomUUID();
const creds = { baseUrl: 'http://127.0.0.1:8000', agentId: said.id as string, apiKey: said.api_key as string };
const events: unknown[] = [];
const ops = new SwitchOps(creds, { connectionId });
const store = new MemoryCursorStore();
const evidence: string[] = [];
const note = (s: string): void => {
  evidence.push(s);
  console.log(s);
};

const conn = new SwitchConnection({
  creds,
  connectionId,
  rooms: [roomId],
  filter: 'all',
  cursorStore: store,
  client: { name: 'said-live-probe', version: '0.1.0' },
  onEvent: async (e) => {
    events.push(e);
    console.log('EVENT', JSON.stringify(e).slice(0, 400));
  },
  onState: (s) => console.log('STATE', JSON.stringify(s)),
  logger: {
    info: (...a: unknown[]) => console.log('INFO', ...a),
    warn: (...a: unknown[]) => console.warn('WARN', ...a),
    error: (...a: unknown[]) => console.error('ERR', ...a),
  },
});

try {
  note(`opening ws connectionId=${connectionId} room=${roomId}`);
  await conn.start();
  note(`connected status=${JSON.stringify(conn.status)}`);

  const ctx = await ops.connectToRoom(roomId);
  note(`connect_to_room ok keys=${Object.keys(ctx as object).join(',')}`);

  const post = await ops.postMessage('Said live: drafting scope probe');
  note(`post_message event_id=${(post as { event_id?: string }).event_id}`);

  const doc = await ops.createRoomDocument({
    name: 'said-ledger',
    description: 'Signed consent ledger (agent-owned)',
    instructions: 'Only the Said agent may update this document. Humans must not edit it.',
    content: '# Said Ledger\n\nLive probe revision 0\n\n```said-ledger\n{"probe":true}\n```\n',
  });
  note(`create_room_document document_id=${(doc as { document_id?: string }).document_id}`);

  const documentId = (doc as { document_id: string }).document_id;
  const upd = await ops.updateRoomDocument({
    documentId,
    content: '# Said Ledger\n\nLive probe revision 1 (agent update)\n',
  });
  note(`update_room_document by creator: ${JSON.stringify(upd)}`);

  const loaded = await ops.loadInternalDocuments([documentId]);
  note(`load_internal_documents count=${(loaded as unknown[]).length}`);

  writeFileSync(
    '/workspace/switch-live/live-probe-evidence.json',
    JSON.stringify({ connectionId, roomId, doc, upd, loaded, events: events.slice(0, 20), evidence }, null, 2),
  );
  note('wrote evidence');
} catch (err) {
  console.error('PROBE_FAIL', err);
  writeFileSync(
    '/workspace/switch-live/live-probe-evidence.json',
    JSON.stringify({ error: String(err), stack: (err as Error).stack, evidence, events }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await conn.stop().catch(() => undefined);
}

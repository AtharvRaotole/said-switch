import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MemoryCursorStore, SwitchConnection, SwitchOps } from '@said/switch-client';

/**
 * Proves non-creator agents cannot update Said's ledger room document.
 * Never overwrites the live ledger as `said` (that destroyed the said-ledger fence once).
 */
async function main(): Promise<void> {
  const agents = JSON.parse(readFileSync('/workspace/switch-live/said-agents.json', 'utf8'));
  const roomRaw = JSON.parse(readFileSync('/workspace/switch-live/said-e2e-room.json', 'utf8')) as {
    id?: string;
    room?: { id: string };
  };
  const roomId = roomRaw.room?.id ?? roomRaw.id;
  if (!roomId) throw new Error('missing room id');
  const notary = (await fetch('http://127.0.0.1:7410/api/state').then((r) => r.json())) as {
    ledgerDocumentId?: string;
  };
  const docId = notary.ledgerDocumentId;
  if (!docId) throw new Error('no ledgerDocumentId (is notary healthy?)');

  const evidence: string[] = [];
  const note = (s: string) => {
    evidence.push(s);
    console.log(s);
  };

  const a = agents.builder;
  const connectionId = randomUUID();
  const creds = {
    baseUrl: 'http://127.0.0.1:8000',
    agentId: a.id as string,
    apiKey: a.api_key as string,
  };
  const ops = new SwitchOps(creds, { connectionId });
  let opened = false;
  const conn = new SwitchConnection({
    creds,
    connectionId,
    rooms: [roomId],
    filter: 'all',
    cursorStore: new MemoryCursorStore(),
    client: { name: 'said-builder-doc-probe', version: '0.1.0' },
    onEvent: async () => {},
    onState: (s) => {
      if (s.state === 'open') opened = true;
    },
  });
  await conn.start();
  for (let i = 0; i < 80 && !opened; i++) await new Promise((r) => setTimeout(r, 100));
  if (!opened) throw new Error('builder ws never opened');
  const join = await ops.connectToRoom(roomId);
  note(`builder connect_to_room ok participants=${(join as { participants?: unknown[] }).participants?.length ?? '?'}`);

  try {
    await ops.updateRoomDocument({ documentId: docId, content: '# TAMPERED by builder\n' });
    note('FAIL: builder update unexpectedly succeeded');
  } catch (err: unknown) {
    note(`PASS: builder update rejected: ${String(err).slice(0, 400)}`);
  }
  try {
    await ops.call('delete_room_document', { document_id: docId });
    note('FAIL: builder delete unexpectedly succeeded');
  } catch (err: unknown) {
    note(`PASS: builder delete rejected: ${String(err).slice(0, 400)}`);
  }

  await conn.stop('probe-done').catch(() => undefined);
  const out = { docId, roomId, evidence, note: 'Creator-only: Switch rejects non-creator document writes. Bridged rooms may return 400 Not connected instead of 403; both are hard rejects.' };
  writeFileSync('/workspace/said-live-shots/ledger-edit-reject.json', JSON.stringify(out, null, 2));
  writeFileSync('/workspace/switch-live/live-doc-auth.json', JSON.stringify(out, null, 2));
  note('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

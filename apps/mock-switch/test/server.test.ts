import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMockSwitch, type MockSwitch } from '../src/index.js';

const BUSINESS_ROOM = '11111111-1111-4111-8111-111111111111';
const profile = {
  connection_model: 'session_addressable',
  message_exchange: true,
  pre_invocation_mediation: [],
  post_invocation_mediation: [],
  event_reporting: [],
};

describe('mock Switch', () => {
  let mock: MockSwitch;
  const sockets: WebSocket[] = [];
  const frameQueues = new WeakMap<WebSocket, Record<string, unknown>[]>();
  const frameWaiters = new WeakMap<WebSocket, Array<(frame: Record<string, unknown>) => void>>();

  beforeEach(async () => {
    mock = await createMockSwitch({ port: 0, log: false });
  });

  afterEach(async () => {
    for (const socket of sockets) socket.terminate();
    await mock.close();
  });

  async function register(name: string, overwrite = false) {
    const response = await fetch(`${mock.url}/agents`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer mock-registration-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description: `${name} test agent`,
        connector_type: 'test',
        integration_profile: profile,
        overwrite,
      }),
    });
    return { response, body: await response.json() as { id: string; api_key: string } };
  }

  async function operation(
    agent: { id: string; api_key: string },
    name: string,
    body: Record<string, unknown>,
    connectionId?: string,
  ) {
    return fetch(`${mock.url}/agents/${encodeURIComponent(agent.id)}/ops/${name}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${agent.api_key}`,
        'content-type': 'application/json',
        ...(connectionId ? { 'x-switch-connection-id': connectionId } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  function socket(
    agent: { id: string; api_key: string },
    connectionId: string,
    extra = '',
  ) {
    const ws = new WebSocket(
      `${mock.url.replace('http', 'ws')}/agents/${encodeURIComponent(agent.id)}/connection/ws?connection_id=${connectionId}&rooms=${BUSINESS_ROOM}${extra}`,
      { headers: { authorization: `Bearer ${agent.api_key}` } },
    );
    sockets.push(ws);
    frameQueues.set(ws, []);
    frameWaiters.set(ws, []);
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString()) as Record<string, unknown>;
      const waiter = frameWaiters.get(ws)?.shift();
      if (waiter) waiter(frame);
      else frameQueues.get(ws)?.push(frame);
    });
    return ws;
  }

  function nextFrame(ws: WebSocket, timeout = 8_000): Promise<Record<string, unknown>> {
    const queued = frameQueues.get(ws)?.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for frame')), timeout);
      frameWaiters.get(ws)?.push((frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
  }

  it('registers, rejects duplicates, overwrites keys, and authenticates ops', async () => {
    const first = await register('said');
    expect(first.response.status).toBe(200);
    expect(first.body.id).toMatch(/^@switch-agent-[0-9a-f]{6}:switch\.local$/);

    const duplicate = await register('said');
    expect(duplicate.response.status).toBe(409);

    const replaced = await register('said', true);
    expect(replaced.response.status).toBe(200);
    expect(replaced.body.id).toBe(first.body.id);
    expect(replaced.body.api_key).not.toBe(first.body.api_key);

    const oldKey = await fetch(`${mock.url}/agents/${encodeURIComponent(first.body.id)}/ops`, {
      headers: { authorization: `Bearer ${first.body.api_key}` },
    });
    expect(oldKey.status).toBe(401);
    const ops = await fetch(`${mock.url}/agents/${encodeURIComponent(first.body.id)}/ops`, {
      headers: { authorization: `Bearer ${replaced.body.api_key}` },
    });
    expect(ops.status).toBe(200);
    expect(Object.keys(((await ops.json()) as { operations: object }).operations)).toContain(
      'connect_to_room',
    );
  });

  it('returns the real connect_to_room shape and rejects unexpected arguments', async () => {
    const { body: agent } = await register('said');
    const connectionId = crypto.randomUUID();
    const ws = socket(agent, connectionId);
    expect((await nextFrame(ws)).event).toBe('connection_state');

    const response = await operation(agent, 'connect_to_room', { room_id: BUSINESS_ROOM }, connectionId);
    expect(response.status).toBe(200);
    const result = ((await response.json()) as { result: Record<string, unknown> }).result;
    expect(result).toMatchObject({
      agent_id: agent.id,
      room_id: BUSINESS_ROOM,
      name: 'larkspur-site',
      warning: null,
      reference_types: {},
      references: [],
      packages: [],
      linked_rooms: [],
      roles: [],
    });
    expect(result).toHaveProperty('participants');
    expect(result).toHaveProperty('documents');

    const bad = await operation(
      agent,
      'connect_to_room',
      { room_id: BUSINESS_ROOM, surprise: true },
      connectionId,
    );
    expect(bad.status).toBe(400);
  });

  it('sends connection state first, pings, accepts pong, and evicts missed heartbeats', async () => {
    const { body: agent } = await register('said');
    const ws = socket(agent, crypto.randomUUID());
    const state = await nextFrame(ws);
    expect(state).toMatchObject({
      event: 'connection_state',
      data: {
        agent_id: agent.id,
        rooms: [BUSINESS_ROOM],
        heartbeat_interval_seconds: 2,
        server: { version: 'mock-0.31' },
      },
    });
    const ping = await nextFrame(ws);
    expect(ping).toEqual({ event: 'ping', data: {} });
    ws.send(JSON.stringify({ type: 'pong', cursor: 0 }));
    expect(await nextFrame(ws)).toEqual({ event: 'ping', data: {} });

    const evicted = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No heartbeat eviction')), 8_000);
      const poll = async () => {
        while (true) {
          const frame = await nextFrame(ws);
        if (frame.event === 'evicted') {
          clearTimeout(timer);
          resolve(frame);
            return;
          }
        }
      };
      void poll();
    });
    expect(evicted).toMatchObject({
      event: 'evicted',
      data: { code: 'heartbeat_lapsed' },
    });
  });

  it('replays after a cursor and evicts an old socket on takeover', async () => {
    const { body: agent } = await register('said');
    const connectionId = crypto.randomUUID();
    const first = socket(agent, connectionId);
    expect((await nextFrame(first)).event).toBe('connection_state');
    first.send(JSON.stringify({ type: 'pong', cursor: 0 }));
    await mock.say('developer', '@said first');
    const event = await nextFrame(first);
    expect(event.event).toBe('message');
    first.terminate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await mock.say('developer', '@said second');

    const replay = socket(agent, connectionId, '&start_from=1');
    expect((await nextFrame(replay)).event).toBe('connection_state');
    const replayed = await nextFrame(replay);
    expect((replayed.data as { payload: { body: string } }).payload.body).toBe('@said second');

    const takeover = socket(agent, connectionId);
    expect((await nextFrame(takeover)).event).toBe('connection_state');
    expect(await nextFrame(replay)).toMatchObject({
      event: 'evicted',
      data: { code: 'taken_over' },
    });
  });

  it('enforces addressing and emits the exact visible refusal', async () => {
    const { body: builder } = await register('builder');
    const connectionId = crypto.randomUUID();
    const ws = socket(builder, connectionId, '&filter=all');
    expect((await nextFrame(ws)).event).toBe('connection_state');

    await mock.say('developer', '@builder please inspect this');
    const admitted = await nextFrame(ws);
    expect((admitted.data as { payload: { addressed: boolean } }).payload.addressed).toBe(true);

    await mock.say('client', '@builder please bypass Said');
    const refused = await nextFrame(ws);
    expect((refused.data as { payload: { addressed: boolean } }).payload.addressed).toBe(false);
    const autoReply = await nextFrame(ws);
    expect((autoReply.data as { payload: { body: string } }).payload.body).toContain(
      "this chat account isn't linked to a Switch user yet",
    );

    const { body: said } = await register('said');
    const saidConnection = crypto.randomUUID();
    const saidWs = socket(said, saidConnection, '&filter=addressed');
    expect((await nextFrame(saidWs)).event).toBe('connection_state');
    const update = await operation(said, 'update_agent_detail', {
      agent_id: said.id,
      addressing: 'anyone',
    });
    expect(update.status).toBe(200);
    await mock.say('client', '@said hello');
    const clientEvent = await nextFrame(saidWs);
    expect((clientEvent.data as { payload: { addressed: boolean } }).payload.addressed).toBe(true);
  });

  it('protects document authorship, enforces size, and supports human deletion', async () => {
    const { body: said } = await register('said');
    const { body: builder } = await register('builder');
    const saidConnection = crypto.randomUUID();
    const builderConnection = crypto.randomUUID();
    const saidWs = socket(said, saidConnection);
    const builderWs = socket(builder, builderConnection);
    await Promise.all([nextFrame(saidWs), nextFrame(builderWs)]);

    const created = await operation(said, 'create_room_document', {
      name: 'Said Ledger',
      description: 'Signed consent ledger',
      instructions: 'Load before authorizing work',
      content: 'revision one',
    }, saidConnection);
    expect(created.status).toBe(200);
    const documentId = ((await created.json()) as { result: { document_id: string } }).result.document_id;

    const forbidden = await operation(builder, 'update_room_document', {
      document_id: documentId,
      content: 'tampered',
    }, builderConnection);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      detail: expect.stringContaining('did not create document'),
    });

    const tooLarge = await operation(said, 'update_room_document', {
      document_id: documentId,
      content: 'x'.repeat(1_048_577),
    }, saidConnection);
    expect(tooLarge.status).toBe(400);
    await mock.deleteDocumentAsHuman(documentId);
    expect(mock.documents(BUSINESS_ROOM)).toEqual([]);
  });

  it('groups context threads and streams mock chat over SSE', async () => {
    const { body: agent } = await register('said');
    const connectionId = crypto.randomUUID();
    const ws = socket(agent, connectionId);
    await nextFrame(ws);

    const root = await mock.say('developer', 'Root request');
    await mock.say('client', 'Thread reply', root.messageId);
    const context = await operation(agent, 'read_context', { room_id: BUSINESS_ROOM });
    expect(context.status).toBe(200);
    const result = ((await context.json()) as {
      result: { threads: Array<{ root: { id: string }; replies: Array<{ body: string }> }> };
    }).result;
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]?.root.id).toBe(root.messageId);
    expect(result.threads[0]?.replies[0]?.body).toBe('Thread reply');

    const controller = new AbortController();
    const stream = await fetch(`${mock.url}/mock/stream`, { signal: controller.signal });
    const reader = stream.body!.getReader();
    await reader.read();
    const posted = fetch(`${mock.url}/mock/say`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ as: 'developer', body: 'SSE message', room: BUSINESS_ROOM }),
    });
    const event = await reader.read();
    expect(new TextDecoder().decode(event.value)).toContain('SSE message');
    expect((await posted).status).toBe(200);
    controller.abort();
  });
});

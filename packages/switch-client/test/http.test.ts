import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SwitchApiError, SwitchOps, health, registerAgent } from '../src/index.js';
import { FakeSwitch } from './fake-switch.js';
import type { SwitchAgentCredentials } from '../src/index.js';

let fake: FakeSwitch;
let creds: SwitchAgentCredentials;

beforeEach(async () => {
  fake = await FakeSwitch.start();
  creds = { baseUrl: fake.baseUrl, agentId: 'agent-1', apiKey: 'agent-key' };
});

afterEach(async () => {
  await fake.close();
});

describe('health', () => {
  it('is true on 200 and false otherwise', async () => {
    fake.httpHandler = () => ({ status: 200, json: { status: 'ok' } });
    expect(await health(fake.baseUrl)).toBe(true);
    fake.httpHandler = () => ({ status: 401 });
    expect(await health(fake.baseUrl)).toBe(false);
    expect(await health('http://127.0.0.1:1')).toBe(false);
    expect(fake.requests[0]?.path).toBe('/health');
  });
});

describe('registerAgent', () => {
  it('posts the documented body with the registration key as bearer', async () => {
    fake.httpHandler = () => ({ status: 200, json: { id: 'agent-9', api_key: 'sk-secret' } });
    const result = await registerAgent({
      baseUrl: `${fake.baseUrl}/`,
      registrationKey: 'reg-key',
      name: 'said',
      description: 'Consent notary',
      displayName: 'Said',
      overwrite: true,
    });
    expect(result).toEqual({ id: 'agent-9', apiKey: 'sk-secret' });

    const req = fake.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/agents');
    expect(req.headers.authorization).toBe('Bearer reg-key');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.body).toEqual({
      name: 'said',
      description: 'Consent notary',
      connector_type: 'said-custom',
      display_name: 'Said',
      overwrite: true,
      integration_profile: {
        connection_model: 'always_on',
        message_exchange: true,
        pre_invocation_mediation: [],
        post_invocation_mediation: [],
        event_reporting: [],
      },
    });
  });

  it('omits optional fields and honours connectorType', async () => {
    fake.httpHandler = () => ({ status: 200, json: { id: 'a', api_key: 'k' } });
    await registerAgent({
      baseUrl: fake.baseUrl,
      registrationKey: 'reg',
      name: 'builder',
      description: 'd',
      connectorType: 'custom-x',
    });
    const body = fake.requests[0]!.body as Record<string, unknown>;
    expect(body.connector_type).toBe('custom-x');
    expect('display_name' in body).toBe(false);
    expect('overwrite' in body).toBe(false);
  });

  it('throws SwitchApiError with status and body on a conflict', async () => {
    fake.httpHandler = () => ({ status: 409, json: { detail: 'Agent said already exists' } });
    const err = await registerAgent({
      baseUrl: fake.baseUrl,
      registrationKey: 'reg',
      name: 'said',
      description: 'd',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SwitchApiError);
    expect((err as SwitchApiError).status).toBe(409);
    expect((err as SwitchApiError).body).toEqual({ detail: 'Agent said already exists' });
    expect((err as SwitchApiError).message).toContain('already exists');
  });
});

describe('SwitchOps', () => {
  it('sends bearer + connection id header, unwrapped args, and returns body.result', async () => {
    fake.httpHandler = () => ({ status: 200, json: { result: { event_id: 'e-1' } } });
    const ops = new SwitchOps(creds, { connectionId: 'conn-1' });
    const result = await ops.call<{ event_id: string }>('post_message', { body: 'hello' });
    expect(result).toEqual({ event_id: 'e-1' });

    const req = fake.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/agents/agent-1/ops/post_message');
    expect(req.headers.authorization).toBe('Bearer agent-key');
    expect(req.headers['x-switch-connection-id']).toBe('conn-1');
    expect(req.body).toEqual({ body: 'hello' });
  });

  it('omits the connection header until one is set, and setConnectionId(null) removes it', async () => {
    const ops = new SwitchOps(creds);
    await ops.call('list_rooms');
    expect(fake.requests[0]!.headers['x-switch-connection-id']).toBeUndefined();
    expect(fake.requests[0]!.body).toEqual({});
    ops.setConnectionId('c2');
    await ops.call('list_rooms');
    expect(fake.requests[1]!.headers['x-switch-connection-id']).toBe('c2');
    ops.setConnectionId(null);
    await ops.call('list_rooms');
    expect(fake.requests[2]!.headers['x-switch-connection-id']).toBeUndefined();
  });

  it('throws SwitchApiError on non-2xx, keeping status and body', async () => {
    fake.httpHandler = () => ({ status: 409, json: { detail: 'Unknown or dead connection' } });
    const ops = new SwitchOps(creds, { connectionId: 'dead' });
    const err = await ops.call('post_message', { body: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SwitchApiError);
    expect((err as SwitchApiError).status).toBe(409);
    expect((err as SwitchApiError).body).toEqual({ detail: 'Unknown or dead connection' });
  });

  it('rejects a 200 without a result envelope', async () => {
    fake.httpHandler = () => ({ status: 200, json: { nope: true } });
    await expect(new SwitchOps(creds).call('x')).rejects.toBeInstanceOf(SwitchApiError);
  });

  it('listOps returns the operations registry', async () => {
    fake.httpHandler = () => ({
      status: 200,
      json: { operations: { post_message: { description: 'Send', input_schema: { type: 'object' } } } },
    });
    const ops = await new SwitchOps(creds).listOps();
    expect(ops.post_message?.description).toBe('Send');
    expect(fake.requests[0]!.path).toBe('/agents/agent-1/ops');
    expect(fake.requests[0]!.method).toBe('GET');
    expect(fake.requests[0]!.headers.authorization).toBe('Bearer agent-key');
  });

  it('maps typed helpers onto the real operation argument names', async () => {
    const ops = new SwitchOps(creds, { connectionId: 'c' });
    const last = (): { path: string; body: unknown } => {
      const r = fake.requests.at(-1)!;
      return { path: r.path, body: r.body };
    };

    await ops.connectToRoom('room-1');
    expect(last()).toEqual({ path: '/agents/agent-1/ops/connect_to_room', body: { room_id: 'room-1' } });

    await ops.postMessage('hi');
    expect(last().body).toEqual({ body: 'hi' });
    await ops.postMessage('hi', 'thread-1');
    expect(last().body).toEqual({ body: 'hi', thread_id: 'thread-1' });
    await ops.postMessage('hi', null);
    expect(last().body).toEqual({ body: 'hi' });

    await ops.sendTargetedMessage('do it', ['builder'], 't');
    expect(last()).toEqual({
      path: '/agents/agent-1/ops/send_targeted_message',
      body: { body: 'do it', target_names: ['builder'], thread_id: 't' },
    });

    await ops.readContext({ limit: 5, since: '2026-01-01T00:00:00Z', roomId: 'r2' });
    expect(last()).toEqual({
      path: '/agents/agent-1/ops/read_context',
      body: { limit: 5, since: '2026-01-01T00:00:00Z', room_id: 'r2' },
    });
    await ops.readContext();
    expect(last().body).toEqual({});

    await ops.listParticipants();
    expect(last().path).toBe('/agents/agent-1/ops/list_participants');

    await ops.createRoomDocument({ name: 'Ledger', description: 'd', instructions: 'i', content: 'c' });
    expect(last().body).toEqual({ name: 'Ledger', description: 'd', instructions: 'i', content: 'c' });

    await ops.updateRoomDocument({ documentId: 'doc-1', content: 'new' });
    expect(last()).toEqual({
      path: '/agents/agent-1/ops/update_room_document',
      body: { document_id: 'doc-1', content: 'new' },
    });

    await ops.loadInternalDocuments(['doc-1']);
    expect(last().body).toEqual({ ids: ['doc-1'] });

    await ops.updateAgentDetail({ agentId: 'agent-1', addressing: 'anyone' });
    expect(last()).toEqual({
      path: '/agents/agent-1/ops/update_agent_detail',
      body: { agent_id: 'agent-1', addressing: 'anyone' },
    });

    await ops.getAgentDetail();
    expect(last().body).toEqual({ agent_id: 'agent-1' });
    await ops.getAgentDetail('other');
    expect(last().body).toEqual({ agent_id: 'other' });

    await ops.listRooms();
    expect(last()).toEqual({ path: '/agents/agent-1/ops/list_rooms', body: {} });
  });

  it('createInternalRoom posts create_room with internal_only and no bridge', async () => {
    fake.httpHandler = () => ({ status: 200, json: { result: { id: 'room-demo', name: 'Said demo' } } });
    const ops = new SwitchOps(creds, { connectionId: 'c' });
    await expect(ops.createInternalRoom({ name: 'Said demo', description: 'Read only demo', agentNames: ['said', 'builder'] })).resolves.toEqual({
      id: 'room-demo',
      name: 'Said demo',
    });
    expect(fake.requests[0]!.path).toBe('/agents/agent-1/ops/create_room');
    expect(fake.requests[0]!.body).toEqual({
      name: 'Said demo',
      description: 'Read only demo',
      agent_names: ['said', 'builder'],
      internal_only: true,
    });
    expect(JSON.stringify(fake.requests[0]!.body)).not.toMatch(/bridge_id|user_names/);
  });

  it('postMessageDirect posts {room_id, content} without a connection header', async () => {
    fake.httpHandler = () => ({ status: 200, json: { ok: true, event_id: 'e-7' } });
    const ops = new SwitchOps(creds, { connectionId: 'c' });
    expect(await ops.postMessageDirect('room-1', 'hello')).toEqual({ ok: true, event_id: 'e-7' });
    const req = fake.requests[0]!;
    expect(req.path).toBe('/agents/agent-1/message');
    expect(req.headers.authorization).toBe('Bearer agent-key');
    expect(req.headers['x-switch-connection-id']).toBeUndefined();
    expect(req.body).toEqual({ room_id: 'room-1', content: 'hello' });
  });

  it('uses an injected fetch implementation', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ result: 42 }), { status: 200 });
    }) as typeof fetch;
    const ops = new SwitchOps(creds, { fetchImpl });
    expect(await ops.call('anything')).toBe(42);
    expect(calls).toEqual([`${fake.baseUrl}/agents/agent-1/ops/anything`]);
  });
});

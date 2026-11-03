import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryCursorStore, SwitchConnection } from '../src/index.js';
import type { ConnectionOptions, ConnectionStatus, CursorStore, SwitchDomainEvent } from '../src/index.js';
import { FakeSwitch, sleep, waitFor } from './fake-switch.js';

type Save = { cursor: number; generation: number | null };

/** A store that records every save and the order it happened in relative to the test's own markers. */
class RecordingStore implements CursorStore {
  saves: Save[] = [];
  timeline: string[] = [];
  private inner = new MemoryCursorStore();

  constructor(initial?: Save) {
    if (initial) void this.inner.save(initial);
  }

  load(): Promise<{ cursor: number | null; generation: number | null }> {
    return this.inner.load();
  }

  async save(s: Save): Promise<void> {
    this.saves.push(s);
    this.timeline.push(`save:${s.cursor}`);
    await this.inner.save(s);
  }
}

const silentLogger = { info() {}, warn() {}, error() {} };

let fake: FakeSwitch;
const live: SwitchConnection[] = [];

beforeEach(async () => {
  fake = await FakeSwitch.start();
});

afterEach(async () => {
  await Promise.all(live.splice(0).map((c) => c.stop()));
  await fake.close();
});

function connect(overrides: Partial<ConnectionOptions> & Pick<ConnectionOptions, 'onEvent'>): {
  conn: SwitchConnection;
  states: ConnectionStatus[];
  store: RecordingStore;
} {
  const states: ConnectionStatus[] = [];
  const store = (overrides.cursorStore as RecordingStore | undefined) ?? new RecordingStore();
  const conn = new SwitchConnection({
    creds: { baseUrl: fake.baseUrl, agentId: 'agent-1', apiKey: 'agent-key' },
    connectionId: 'conn-uuid-1',
    rooms: ['room-1'],
    filter: 'all',
    cursorStore: store,
    onState: (s) => states.push(s),
    logger: silentLogger,
    maxBackoffMs: 30,
    handlerRetryDelayMs: 5,
    ...overrides,
  });
  live.push(conn);
  return { conn, states, store };
}

const kinds = (states: ConnectionStatus[]): string[] => states.map((s) => s.state);

describe('opening the connection', () => {
  it('sends the documented query params and bearer header, and reports connection_state', async () => {
    const { conn, states } = connect({
      onEvent: async () => {},
      rooms: ['room-1', 'room-2'],
      filter: 'addressed',
      scope: 'single',
      client: { name: 'said', version: '0.1.0' },
    });
    await conn.start();

    expect(fake.sockets).toHaveLength(1);
    const s = fake.sockets[0]!;
    expect(s.path).toBe('/agents/agent-1/connection/ws');
    expect(s.headers.authorization).toBe('Bearer agent-key');
    expect(Object.fromEntries(s.query)).toEqual({
      connection_id: 'conn-uuid-1',
      rooms: 'room-1,room-2',
      filter: 'addressed',
      scope: 'single',
      start_from: 'head',
      client: 'said',
      client_version: '0.1.0',
    });

    expect(conn.status).toEqual({
      state: 'open',
      rooms: ['room-1', 'room-2'],
      cursor: 10,
      generation: 1,
      serverVersion: { version: '0.31.0' },
    });
    expect(kinds(states)).toEqual(['connecting', 'open']);
  });

  it('derives wss from an https base url', async () => {
    const { conn } = connect({
      onEvent: async () => {},
      creds: { baseUrl: 'https://127.0.0.1:1/prefix/', agentId: 'a b', apiKey: 'k' },
    });
    // Nothing listens with TLS there; the open fails and keeps retrying. Only the URL matters.
    const internal = conn as unknown as { buildUrl(): string };
    expect(internal.buildUrl()).toMatch(
      /^wss:\/\/127\.0\.0\.1:1\/prefix\/agents\/a%20b\/connection\/ws\?connection_id=conn-uuid-1&rooms=room-1&filter=all&scope=single&start_from=head$/,
    );
  });

  it('adopts the server cursor and persists it with the generation', async () => {
    const { conn, store } = connect({ onEvent: async () => {} });
    await conn.start();
    await waitFor(() => store.saves.length > 0, 'initial save');
    expect(store.saves[0]).toEqual({ cursor: 10, generation: 1 });
  });

  it('resumes with the saved cursor and generation on a fresh process', async () => {
    const store = new RecordingStore({ cursor: 41, generation: 6 });
    fake.onSocket = (info) => fake.sendState(info, { cursor: 41, generation: 6 });
    const { conn } = connect({ onEvent: async () => {}, cursorStore: store });
    await conn.start();
    const q = fake.sockets[0]!.query;
    expect(q.get('start_from')).toBe('41');
    expect(q.get('expected_generation')).toBe('6');
  });

  it('start() twice is an error', async () => {
    const { conn } = connect({ onEvent: async () => {} });
    await conn.start();
    await expect(conn.start()).rejects.toThrow(/already started/);
  });
});

describe('event delivery', () => {
  it('maps message, command and room_join frames', async () => {
    const seen: SwitchDomainEvent[] = [];
    fake.onSocket = (info) => {
      fake.sendState(info);
      fake.message(info, 11, 'hello world', { thread_id: 't1', attachments: [{ filename: 'a.png' }], addressed: false });
      fake.event(info, 12, 'command', { command: 'reset', args: '', user_id: '@u:s', user_name: 'bob', thread_id: null });
      fake.event(info, 13, 'room_join', { member: '@u2:s', member_name: 'carol', timestamp: 99, listening: true });
    };
    const { conn } = connect({ onEvent: async (e) => void seen.push(e) });
    await conn.start();
    await waitFor(() => seen.length === 3, 'three events');

    expect(seen[0]).toMatchObject({
      kind: 'message',
      sequence: 11,
      roomId: 'room-1',
      threadId: 't1',
      messageId: 'm11',
      sender: '@switch-user-ab:switch',
      senderName: 'alice',
      body: 'hello world',
      timestamp: 1_700_000_000_011,
      addressed: false,
      attachments: [{ filename: 'a.png' }],
    });
    expect((seen[0] as { raw: { channel_type: string } }).raw.channel_type).toBe('channel_public');
    expect(seen[1]).toMatchObject({
      kind: 'command',
      sequence: 12,
      command: 'reset',
      args: '',
      userId: '@u:s',
      userName: 'bob',
      threadId: null,
    });
    expect(seen[2]).toMatchObject({
      kind: 'room_join',
      sequence: 13,
      member: '@u2:s',
      memberName: 'carol',
      timestamp: 99,
      listening: true,
    });
  });

  it('processes events one at a time, in order, saving the cursor only after each handler resolves', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const gates = new Map<number, () => void>();
    const store = new RecordingStore();

    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 0 });
      fake.message(info, 1, 'one');
      fake.message(info, 2, 'two');
      fake.message(info, 3, 'three');
    };
    const { conn } = connect({
      cursorStore: store,
      onEvent: async (e) => {
        active++;
        maxActive = Math.max(maxActive, active);
        order.push(`start:${e.sequence}`);
        store.timeline.push(`start:${e.sequence}`);
        await new Promise<void>((resolve) => gates.set(e.sequence, resolve));
        store.timeline.push(`end:${e.sequence}`);
        order.push(`end:${e.sequence}`);
        active--;
      },
    });
    await conn.start();

    await waitFor(() => gates.has(1), 'handler for 1');
    await sleep(40);
    // Event 1 is still running: nothing past it started and no cursor beyond the initial one was saved.
    expect(order).toEqual(['start:1']);
    expect(store.saves.every((s) => s.cursor < 1 || s.cursor === 0)).toBe(true);
    expect(store.saves.some((s) => s.cursor === 1)).toBe(false);

    gates.get(1)!();
    await waitFor(() => gates.has(2), 'handler for 2');
    expect(store.saves.at(-1)?.cursor).toBe(1);
    gates.get(2)!();
    await waitFor(() => gates.has(3), 'handler for 3');
    gates.get(3)!();
    await waitFor(() => store.saves.at(-1)?.cursor === 3, 'cursor 3 saved');

    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3']);
    expect(maxActive).toBe(1);
    // end:N always precedes save:N
    for (const n of [1, 2, 3]) {
      expect(store.timeline.indexOf(`end:${n}`)).toBeLessThan(store.timeline.indexOf(`save:${n}`));
    }
    expect(store.saves.at(-1)).toEqual({ cursor: 3, generation: 1 });
  });

  it('drops replayed sequences it has already accepted', async () => {
    const seen: number[] = [];
    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 0 });
      fake.message(info, 1, 'a');
      fake.message(info, 2, 'b');
      fake.message(info, 2, 'b again');
      fake.message(info, 1, 'a again');
      fake.message(info, 3, 'c');
    };
    const { conn } = connect({ onEvent: async (e) => void seen.push(e.sequence) });
    await conn.start();
    await waitFor(() => seen.length >= 3, 'events');
    await sleep(30);
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('handler failures', () => {
  it('retries a failing handler without advancing past it', async () => {
    let calls = 0;
    const store = new RecordingStore();
    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 0 });
      fake.message(info, 1, 'flaky');
    };
    const { conn } = connect({
      cursorStore: store,
      onEvent: async () => {
        calls++;
        if (calls < 3) throw new Error('boom');
      },
    });
    await conn.start();
    await waitFor(() => store.saves.some((s) => s.cursor === 1), 'cursor 1');
    expect(calls).toBe(3);
  });

  it('after 3 failures logs a warning, advances past the event, and keeps going', async () => {
    const warns: string[] = [];
    const errors: string[] = [];
    const handled: number[] = [];
    const store = new RecordingStore();
    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 0 });
      fake.message(info, 1, 'poison');
      fake.message(info, 2, 'fine');
    };
    const { conn } = connect({
      cursorStore: store,
      logger: { info() {}, warn: (m) => warns.push(String(m)), error: (m) => errors.push(String(m)) },
      onEvent: async (e) => {
        handled.push(e.sequence);
        if (e.sequence === 1) throw new Error('always');
      },
    });
    await conn.start();
    await waitFor(() => store.saves.some((s) => s.cursor === 2), 'cursor 2');

    expect(handled).toEqual([1, 1, 1, 2]);
    expect(errors.filter((m) => m.includes('onEvent failed'))).toHaveLength(3);
    expect(warns.some((m) => m.includes('SKIPPING event 1'))).toBe(true);
    expect(store.saves.map((s) => s.cursor)).toContain(1);
  });
});

describe('liveness', () => {
  it('answers pings while a slow handler is still running, with the highest processed cursor', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let started = false;
    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 7 });
      fake.message(info, 8, 'slow');
    };
    const { conn } = connect({
      onEvent: async () => {
        started = true;
        await gate;
      },
    });
    await conn.start();
    await waitFor(() => started, 'handler to start');

    const info = fake.sockets[0]!;
    fake.ping(info);
    await waitFor(() => info.received.length >= 1, 'pong during slow handler', 1000);
    expect(info.received[0]).toEqual({ type: 'pong', cursor: 7 });

    fake.ping(info);
    await waitFor(() => info.received.length >= 2, 'second pong');
    expect(info.received[1]).toEqual({ type: 'pong', cursor: 7 });

    release();
    await waitFor(() => (conn as unknown as { cursor: number }).cursor === 8, 'cursor 8');
    fake.ping(info);
    await waitFor(() => info.received.length >= 3, 'third pong');
    expect(info.received[2]).toEqual({ type: 'pong', cursor: 8 });
  });

  it('reconnects when nothing, not even a ping, arrives within the idle timeout', async () => {
    const { conn, states } = connect({ onEvent: async () => {}, idleTimeoutMs: 120 });
    await conn.start();
    await waitFor(() => fake.sockets.length >= 2, 'second connection', 3000);
    expect(states.some((s) => s.state === 'reconnecting' && /no frames/.test(s.reason))).toBe(true);
  });
});

describe('reconnecting', () => {
  it('after a server drop, reopens with the same connection id, start_from=cursor and expected_generation', async () => {
    const seen: number[] = [];
    fake.onSocket = (info) => {
      if (info.index === 0) {
        fake.sendState(info, { cursor: 0, generation: 5 });
        fake.message(info, 1, 'a');
        fake.message(info, 2, 'b');
      } else {
        fake.sendState(info, { cursor: 2, generation: 6 });
        // The server replays what it holds after the cursor; one is a duplicate of the processed ones.
        fake.message(info, 2, 'b replay');
        fake.message(info, 3, 'c');
      }
    };
    const { conn, states, store } = connect({ onEvent: async (e) => void seen.push(e.sequence) });
    await conn.start();
    await waitFor(() => store.saves.at(-1)?.cursor === 2, 'cursor 2');

    fake.sockets[0]!.ws.terminate();
    await waitFor(() => fake.sockets.length === 2, 'reconnect');
    const second = fake.sockets[1]!;
    expect(second.query.get('connection_id')).toBe('conn-uuid-1');
    expect(second.query.get('start_from')).toBe('2');
    expect(second.query.get('expected_generation')).toBe('5');
    expect(second.query.get('rooms')).toBe('room-1');
    expect(second.headers.authorization).toBe('Bearer agent-key');

    await waitFor(() => store.saves.at(-1)?.cursor === 3, 'cursor 3');
    expect(seen).toEqual([1, 2, 3]);
    expect(store.saves.at(-1)).toEqual({ cursor: 3, generation: 6 });
    expect(kinds(states)).toEqual(expect.arrayContaining(['open', 'reconnecting', 'connecting']));
    const re = states.find((s) => s.state === 'reconnecting');
    expect(re).toMatchObject({ state: 'reconnecting', attempt: 1 });
  });

  it('keeps retrying with growing attempts while the server refuses the socket, then recovers', async () => {
    fake.closeOnOpenWith = { code: 1012, reason: 'service restart' };
    const { conn, states } = connect({ onEvent: async () => {} });
    const started = conn.start();
    await waitFor(() => fake.sockets.length >= 3, 'three attempts');
    fake.closeOnOpenWith = null;
    await started;

    const attempts = states.filter((s) => s.state === 'reconnecting').map((s) => (s as { attempt: number }).attempt);
    expect(attempts.slice(0, 3)).toEqual([1, 2, 3]);
    expect(conn.status.state).toBe('open');
    // Backoff respects the configured cap (30ms) plus jitter bounds.
    for (const s of states) if (s.state === 'reconnecting') expect(s.delayMs).toBeLessThanOrEqual(30);
  });

  it('reconnects after evicted heartbeat_lapsed', async () => {
    fake.onSocket = (info) => {
      fake.sendState(info);
      if (info.index === 0) {
        fake.frame(info, 'evicted', { code: 'heartbeat_lapsed', reason: 'heartbeat lapsed', room_id: null });
        info.ws.close(1000);
      }
    };
    const { conn, states } = connect({ onEvent: async () => {} });
    await conn.start();
    await waitFor(() => fake.sockets.length === 2, 'reconnect');
    await waitFor(() => conn.status.state === 'open' && fake.sockets.length === 2, 'reopened');
    expect(states.some((s) => s.state === 'reconnecting' && /heartbeat_lapsed/.test(s.reason))).toBe(true);
    expect(states.some((s) => s.state === 'stopped')).toBe(false);
  });

  it('treats a 409 refusal about a missing stream as recoverable but "room already held" as fatal', async () => {
    let n = 0;
    fake.onSocket = (info) => {
      n++;
      if (n === 1) {
        fake.frame(info, 'refused', { status: 409, detail: { code: 'no_stream', message: 'no stream attached' } });
        info.ws.close(4409);
      } else {
        fake.frame(info, 'refused', { status: 409, detail: 'room r is already held by connection x' });
        info.ws.close(4409);
      }
    };
    const { conn, states } = connect({ onEvent: async () => {} });
    await expect(conn.start()).rejects.toThrow(/stopped before opening/);
    expect(fake.sockets).toHaveLength(2);
    expect(states.at(-1)).toMatchObject({ state: 'stopped', fatal: true });
  });
});

describe('permanent stops', () => {
  it('stops for good on evicted taken_over and never reconnects', async () => {
    const seen: number[] = [];
    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 0 });
      fake.message(info, 1, 'before');
      fake.frame(info, 'evicted', { code: 'taken_over', reason: 'another stream took over', room_id: null });
      info.ws.close(1000);
    };
    const { conn, states } = connect({ onEvent: async (e) => void seen.push(e.sequence) });
    await conn.start();
    await waitFor(() => conn.status.state === 'stopped', 'stopped');

    expect(conn.status).toMatchObject({ state: 'stopped', fatal: true });
    expect((conn.status as { reason: string }).reason).toMatch(/taken_over/);
    await sleep(200);
    expect(fake.sockets).toHaveLength(1);
    expect(kinds(states)).not.toContain('reconnecting');
  });

  it('stops for good on close code 4401 (bad key), and start() rejects', async () => {
    fake.closeOnOpenWith = { code: 4401, reason: 'Invalid API key' };
    const { conn } = connect({ onEvent: async () => {} });
    await expect(conn.start()).rejects.toThrow(/4401/);
    expect(conn.status).toMatchObject({ state: 'stopped', fatal: true });
    await sleep(150);
    expect(fake.sockets).toHaveLength(1);
  });

  it('stops for good on evicted closed (agent deleted) but recovers from "could not be recorded"', async () => {
    fake.onSocket = (info) => {
      fake.sendState(info);
      fake.frame(
        info,
        'evicted',
        info.index === 0
          ? { code: 'closed', reason: 'the connection could not be recorded', room_id: null }
          : { code: 'closed', reason: 'the agent was deleted', room_id: null },
      );
      info.ws.close(1000);
    };
    const { conn } = connect({ onEvent: async () => {} });
    await conn.start();
    await waitFor(() => conn.status.state === 'stopped', 'stopped');
    expect(fake.sockets).toHaveLength(2);
    expect(conn.status).toMatchObject({ state: 'stopped', fatal: true });
  });

  it('stop() ends the connection without a fatal flag and does not reconnect', async () => {
    const { conn, states } = connect({ onEvent: async () => {} });
    await conn.start();
    await conn.stop();
    expect(conn.status).toEqual({ state: 'stopped', reason: 'stopped by caller', fatal: false });
    await sleep(100);
    expect(fake.sockets).toHaveLength(1);
    expect(kinds(states).filter((k) => k === 'stopped')).toHaveLength(1);
  });
});

describe('gaps', () => {
  it('adopts resumed_at as the cursor, reports a gap status, and continues from there', async () => {
    const seen: number[] = [];
    fake.onSocket = (info) => {
      fake.sendState(info, { cursor: 500 });
      fake.frame(info, 'gap', {
        from_sequence: 500,
        resumed_at: 40,
        resumed_position: { s: 40 },
        rooms: ['room-1'],
        all_rooms: true,
        reason: 'the server restarted since your last connection',
      });
      // Numbering restarted below the old cursor: these must still be delivered.
      fake.message(info, 41, 'after gap');
    };
    const { conn, states, store } = connect({ onEvent: async (e) => void seen.push(e.sequence) });
    await conn.start();
    await waitFor(() => store.saves.at(-1)?.cursor === 41, 'cursor 41');

    const gap = states.find((s) => s.state === 'gap');
    expect(gap).toEqual({
      state: 'gap',
      fromSequence: 500,
      resumedAt: 40,
      reason: 'the server restarted since your last connection',
    });
    expect(store.saves.map((s) => s.cursor)).toContain(40);
    expect(seen).toEqual([41]);
    expect(conn.status.state).toBe('open');
  });
});

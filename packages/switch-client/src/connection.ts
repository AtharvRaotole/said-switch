import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { CursorStore } from './cursor-store.js';
import { trimBase } from './http.js';
import type {
  SwitchAgentCredentials,
  SwitchCommandEvent,
  SwitchDomainEvent,
  SwitchJoinEvent,
  SwitchMessageEvent,
} from './types.js';

export interface ConnectionLogger {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

export interface ConnectionOptions {
  creds: SwitchAgentCredentials;
  /** Stable UUID, persisted by the caller and reused on every reconnect. */
  connectionId: string;
  /** Claimed on the open URL (takeover). */
  rooms: string[];
  filter: 'all' | 'addressed';
  scope?: 'single' | 'all';
  cursorStore: CursorStore;
  client?: { name: string; version: string };
  /** Awaited; events are processed strictly one at a time, in order. */
  onEvent: (e: SwitchDomainEvent) => Promise<void>;
  onState?: (s: ConnectionStatus) => void;
  logger?: ConnectionLogger;
  /** Reconnect backoff cap. Default 15000. */
  maxBackoffMs?: number;
  /** Delay before re-running a failed `onEvent` (multiplied by the attempt number). Default 250. */
  handlerRetryDelayMs?: number;
  /** Reconnect when no frame at all (not even a ping) arrives for this long. Default 45000. */
  idleTimeoutMs?: number;
}

export type ConnectionStatus =
  | { state: 'connecting' }
  | { state: 'open'; rooms: string[]; cursor: number | null; generation: number; serverVersion: unknown }
  | { state: 'reconnecting'; attempt: number; delayMs: number; reason: string }
  | { state: 'gap'; fromSequence: number; resumedAt: number; reason: string }
  | { state: 'stopped'; reason: string; fatal: boolean };

/** After this many failed `onEvent` runs for one event, it is logged loudly and skipped. */
const MAX_HANDLER_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const HANDSHAKE_TIMEOUT_MS = 10_000;

interface Outcome {
  fatal: boolean;
  reason: string;
}

interface Frame {
  event?: unknown;
  data?: Record<string, unknown>;
  id?: unknown;
  type?: unknown;
}

type QueueItem =
  | { kind: 'event'; sequence: number; event: SwitchDomainEvent | null }
  | { kind: 'gap'; fromSequence: number; resumedAt: number; reason: string };

/** Per-socket state: what has been learned from frames about why/if this socket should be retried. */
interface Socket {
  ws: WebSocket;
  opened: boolean;
  decision: Outcome | null;
  idle: NodeJS.Timeout | null;
}

const RECOVERABLE_EVICTIONS = new Set(['heartbeat_lapsed', 'no_stream', 'unfenced', 'connection_error']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nullableStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function describe(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isRecord(v) && typeof v.message === 'string') return v.message;
  return v === undefined ? '' : JSON.stringify(v);
}

export class SwitchConnection {
  private readonly o: ConnectionOptions;
  private readonly logger: ConnectionLogger;
  private readonly maxBackoffMs: number;
  private readonly handlerRetryDelayMs: number;
  private readonly idleTimeoutMs: number;

  private _status: ConnectionStatus = { state: 'connecting' };
  private cursor: number | null = null;
  private generation: number | null = null;
  private rooms: string[] = [];
  private serverVersion: unknown = null;
  /** Highest sequence accepted into the queue: replays after a reconnect overlap it and are dropped. */
  private highestEnqueued: number | null = null;

  private queue: QueueItem[] = [];
  private wake: (() => void) | null = null;
  private saveChain: Promise<void> = Promise.resolve();

  private started = false;
  private stopped = false;
  private everOpened = false;
  private first: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private sock: Socket | null = null;
  private sockOpenedLast = false;
  private runPromise: Promise<void> = Promise.resolve();
  private workerPromise: Promise<void> = Promise.resolve();
  private readonly cancelSleeps = new Set<() => void>();

  constructor(opts: ConnectionOptions) {
    this.o = opts;
    this.logger = opts.logger ?? { info() {}, warn() {}, error() {} };
    this.maxBackoffMs = opts.maxBackoffMs ?? 15_000;
    this.handlerRetryDelayMs = opts.handlerRetryDelayMs ?? 250;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 45_000;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  /** Resolves after the first `connection_state` frame; rejects if the connection stops fatally first. */
  async start(): Promise<void> {
    if (this.started) throw new Error('SwitchConnection already started');
    this.started = true;
    const saved = await this.o.cursorStore.load();
    this.cursor = saved.cursor;
    this.generation = saved.generation;
    this.highestEnqueued = saved.cursor;
    const first = new Promise<void>((resolve, reject) => {
      this.first = { resolve, reject };
    });
    this.workerPromise = this.worker();
    this.runPromise = this.run();
    return first;
  }

  async stop(): Promise<void> {
    this.finish('stopped by caller', false);
    await Promise.allSettled([this.runPromise, this.workerPromise]);
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  private setStatus(s: ConnectionStatus): void {
    this._status = s;
    try {
      this.o.onState?.(s);
    } catch (err) {
      this.logger.error('[switch-client] onState threw', err);
    }
  }

  private openStatus(): ConnectionStatus {
    return {
      state: 'open',
      rooms: [...this.rooms],
      cursor: this.cursor,
      generation: this.generation ?? 0,
      serverVersion: this.serverVersion,
    };
  }

  private finish(reason: string, fatal: boolean): void {
    if (this.stopped) return;
    this.stopped = true;
    this.queue = [];
    for (const cancel of [...this.cancelSleeps]) cancel();
    this.wake?.();
    const sock = this.sock;
    if (sock) {
      sock.decision ??= { fatal, reason };
      try {
        if (sock.ws.readyState === WebSocket.OPEN) {
          sock.ws.close(1000, 'client stop');
          setTimeout(() => sock.ws.terminate(), 1000).unref();
        } else {
          sock.ws.terminate();
        }
      } catch {
        // Already closed.
      }
    }
    if (!this.everOpened) this.first?.reject(new Error(`Switch connection stopped before opening: ${reason}`));
    this.setStatus({ state: 'stopped', reason, fatal });
    if (fatal) this.logger.error(`[switch-client] stopped permanently: ${reason}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.cancelSleeps.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.cancelSleeps.add(done);
    });
  }

  private backoffMs(attempt: number): number {
    const exp = Math.min(this.maxBackoffMs, BASE_BACKOFF_MS * 2 ** (attempt - 1));
    const jittered = Math.round(exp * (0.75 + Math.random() * 0.5));
    return Math.max(1, Math.min(this.maxBackoffMs, jittered));
  }

  private async run(): Promise<void> {
    let attempt = 0;
    while (!this.stopped) {
      this.setStatus({ state: 'connecting' });
      const outcome = await this.connectOnce();
      if (this.stopped) return;
      if (outcome.fatal) {
        this.finish(outcome.reason, true);
        return;
      }
      attempt = this.sockOpenedLast ? 1 : attempt + 1;
      const delayMs = this.backoffMs(attempt);
      this.logger.warn(`[switch-client] connection lost (${outcome.reason}); reconnecting in ${delayMs}ms`);
      this.setStatus({ state: 'reconnecting', attempt, delayMs, reason: outcome.reason });
      await this.sleep(delayMs);
    }
  }

  // ── socket ───────────────────────────────────────────────────────────────

  private buildUrl(): string {
    const { creds } = this.o;
    const url = new URL(trimBase(creds.baseUrl));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/agents/${encodeURIComponent(creds.agentId)}/connection/ws`;
    const q = url.searchParams;
    q.set('connection_id', this.o.connectionId);
    q.set('rooms', this.o.rooms.join(','));
    q.set('filter', this.o.filter);
    q.set('scope', this.o.scope ?? 'single');
    q.set('start_from', this.cursor === null ? 'head' : String(this.cursor));
    if (this.generation !== null) q.set('expected_generation', String(this.generation));
    if (this.o.client) {
      q.set('client', this.o.client.name);
      q.set('client_version', this.o.client.version);
    }
    return url.toString();
  }

  private connectOnce(): Promise<Outcome> {
    return new Promise<Outcome>((resolve) => {
      const ws = new WebSocket(this.buildUrl(), {
        headers: { authorization: `Bearer ${this.o.creds.apiKey}` },
        handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      });
      const sock: Socket = { ws, opened: false, decision: null, idle: null };
      this.sock = sock;
      this.sockOpenedLast = false;
      let lastError = '';

      const armIdle = (): void => {
        if (sock.idle) clearTimeout(sock.idle);
        sock.idle = setTimeout(() => {
          sock.decision ??= { fatal: false, reason: `no frames for ${this.idleTimeoutMs}ms` };
          ws.terminate();
        }, this.idleTimeoutMs);
      };

      ws.on('unexpected-response', (_req, res) => {
        const status = res.statusCode ?? 0;
        res.resume();
        const fatal = status === 401 || status === 403 || status === 404;
        sock.decision ??= { fatal, reason: `WebSocket upgrade refused with HTTP ${status}` };
        ws.terminate();
      });
      ws.on('open', armIdle);
      ws.on('message', (data: RawData) => {
        armIdle();
        this.onFrame(sock, data);
      });
      ws.on('error', (err: Error) => {
        lastError = err.message;
      });
      ws.on('close', (code: number, reason: Buffer) => {
        if (sock.idle) clearTimeout(sock.idle);
        if (this.sock === sock) this.sock = null;
        this.sockOpenedLast = sock.opened;
        resolve(sock.decision ?? this.outcomeForClose(code, reason.toString('utf8'), lastError));
      });
    });
  }

  private outcomeForClose(code: number, reason: string, lastError: string): Outcome {
    if (code === 4401) return { fatal: true, reason: `unauthorized (4401): ${reason || 'bad API key'}` };
    if (code >= 4400 && code < 4500) return { fatal: true, reason: `refused (${code}): ${reason}` };
    if (code === 1000) return { fatal: false, reason: 'server closed the socket' };
    const detail = lastError || reason;
    return { fatal: false, reason: `socket closed (${code})${detail ? `: ${detail}` : ''}` };
  }

  private onFrame(sock: Socket, data: RawData): void {
    let frame: Frame;
    try {
      const parsed: unknown = JSON.parse(data.toString());
      if (!isRecord(parsed)) return;
      frame = parsed;
    } catch {
      this.logger.warn('[switch-client] ignoring a frame that is not JSON');
      return;
    }
    const d = isRecord(frame.data) ? frame.data : {};

    // Answer before anything else, and never behind event processing.
    if (frame.event === 'ping' || frame.type === 'ping') {
      try {
        sock.ws.send(JSON.stringify({ type: 'pong', cursor: this.cursor ?? 0 }));
      } catch (err) {
        this.logger.warn('[switch-client] could not send pong', err);
      }
      return;
    }

    switch (frame.event) {
      case 'connection_state':
        this.onConnectionState(sock, d);
        return;
      case 'message':
      case 'command':
      case 'room_join':
        this.enqueueDomain(frame, d);
        return;
      case 'gap': {
        const resumedAt = num(d.resumed_at, NaN);
        const fromSequence = num(d.from_sequence, 0);
        const reason = str(d.reason, 'gap');
        if (!Number.isFinite(resumedAt)) {
          this.logger.warn('[switch-client] gap frame without resumed_at; ignored', d);
          return;
        }
        // Whatever numbering followed the gap, new events are judged against resumed_at.
        this.highestEnqueued = resumedAt;
        this.push({ kind: 'gap', fromSequence, resumedAt, reason });
        return;
      }
      case 'evicted':
        sock.decision ??= this.outcomeForEviction(str(d.code), str(d.reason));
        return;
      case 'refused':
        sock.decision ??= this.outcomeForRefusal(num(d.status, 0), d.detail);
        return;
      case 'subscription_changed':
        if (Array.isArray(d.rooms)) {
          this.rooms = d.rooms.filter((r): r is string => typeof r === 'string');
          this.setStatus(this.openStatus());
        }
        this.logger.info(`[switch-client] subscription changed: ${str(d.reason)}`);
        return;
      case 'room_released':
        this.logger.warn(`[switch-client] room released to another connection: ${str(d.room_id)}`);
        return;
      default:
        // A domain event kind this client does not know still occupies a sequence number.
        if (typeof frame.id === 'number') {
          this.highestEnqueuedAccept(frame.id, () => this.push({ kind: 'event', sequence: frame.id as number, event: null }));
        } else {
          this.logger.info(`[switch-client] ignoring frame "${String(frame.event)}"`);
        }
    }
  }

  private onConnectionState(sock: Socket, d: Record<string, unknown>): void {
    if (typeof d.generation === 'number') this.generation = d.generation;
    this.rooms = Array.isArray(d.rooms) ? d.rooms.filter((r): r is string => typeof r === 'string') : [];
    this.serverVersion = d.server ?? null;
    if (this.cursor === null && typeof d.cursor === 'number') {
      this.cursor = d.cursor;
      this.highestEnqueued = d.cursor;
      this.persist();
    } else if (this.generation !== null && this.cursor !== null) {
      this.persist();
    }
    sock.opened = true;
    this.everOpened = true;
    this.setStatus(this.openStatus());
    this.first?.resolve();
  }

  private outcomeForEviction(code: string, reason: string): Outcome {
    const why = `evicted (${code || 'unknown'}): ${reason}`;
    if (code === 'taken_over') return { fatal: true, reason: why };
    if (RECOVERABLE_EVICTIONS.has(code)) return { fatal: false, reason: why };
    if (code === 'closed') {
      // The server could not record the connection: transient. Deleted agent / controller-run: permanent.
      return { fatal: !/could not be recorded/i.test(reason), reason: why };
    }
    if (code === 'launch_superseded') return { fatal: true, reason: why };
    this.logger.warn(`[switch-client] unknown eviction code ${code}; treating as recoverable`);
    return { fatal: false, reason: why };
  }

  private outcomeForRefusal(status: number, detail: unknown): Outcome {
    const reason = `refused (${status}): ${describe(detail)}`;
    if (status >= 500) return { fatal: false, reason };
    if (status === 409) {
      const code = isRecord(detail) ? str(detail.code) : '';
      if (code === 'taken_over') return { fatal: true, reason };
      const transient = code === 'no_stream' || code === 'unfenced' || /heartbeat|no stream/i.test(describe(detail));
      return { fatal: !transient, reason };
    }
    return { fatal: true, reason };
  }

  // ── domain events ────────────────────────────────────────────────────────

  private enqueueDomain(frame: Frame, d: Record<string, unknown>): void {
    const sequence = typeof frame.id === 'number' ? frame.id : typeof d.sequence === 'number' ? d.sequence : null;
    if (sequence === null) {
      this.logger.error('[switch-client] domain event without a sequence number; dropped', frame);
      return;
    }
    this.highestEnqueuedAccept(sequence, () => {
      this.push({ kind: 'event', sequence, event: this.mapEvent(sequence, d) });
    });
  }

  private highestEnqueuedAccept(sequence: number, accept: () => void): void {
    if (this.highestEnqueued !== null && sequence <= this.highestEnqueued) return; // replay overlap
    this.highestEnqueued = sequence;
    accept();
  }

  private mapEvent(sequence: number, d: Record<string, unknown>): SwitchDomainEvent | null {
    const p = isRecord(d.payload) ? d.payload : {};
    const roomId = str(d.room_id);
    switch (d.type) {
      case 'message': {
        const e: SwitchMessageEvent = {
          kind: 'message',
          sequence,
          roomId,
          threadId: nullableStr(p.thread_id),
          messageId: str(p.message_id),
          sender: str(p.sender),
          senderName: str(p.sender_name),
          body: str(p.body),
          timestamp: num(p.timestamp),
          addressed: p.addressed === true,
          attachments: Array.isArray(p.attachments) ? p.attachments : [],
          raw: d,
        };
        return e;
      }
      case 'command': {
        const e: SwitchCommandEvent = {
          kind: 'command',
          sequence,
          roomId,
          command: str(p.command),
          args: p.args ?? '',
          userId: str(p.user_id),
          userName: str(p.user_name),
          threadId: nullableStr(p.thread_id),
          raw: d,
        };
        return e;
      }
      case 'room_join': {
        const e: SwitchJoinEvent = {
          kind: 'room_join',
          sequence,
          roomId,
          member: str(p.member),
          memberName: str(p.member_name),
          timestamp: num(p.timestamp),
          listening: p.listening === true,
          raw: d,
        };
        return e;
      }
      default:
        this.logger.warn(`[switch-client] unknown domain event type "${String(d.type)}" at ${sequence}; skipping`);
        return null;
    }
  }

  private push(item: QueueItem): void {
    if (this.stopped) return;
    this.queue.push(item);
    this.wake?.();
  }

  private nextItem(): Promise<QueueItem | null> {
    return new Promise<QueueItem | null>((resolve) => {
      const take = (): void => {
        this.wake = null;
        if (this.stopped) return resolve(null);
        const item = this.queue.shift();
        if (item) return resolve(item);
        this.wake = take;
      };
      take();
    });
  }

  /** Strictly sequential: one `onEvent` at a time, in arrival order, independent of the socket's ping handling. */
  private async worker(): Promise<void> {
    for (;;) {
      const item = await this.nextItem();
      if (item === null) return;
      if (item.kind === 'gap') {
        this.cursor = item.resumedAt;
        await this.persist();
        this.logger.warn(`[switch-client] gap from ${item.fromSequence}, resumed at ${item.resumedAt}: ${item.reason}`);
        this.setStatus({
          state: 'gap',
          fromSequence: item.fromSequence,
          resumedAt: item.resumedAt,
          reason: item.reason,
        });
        if (!this.stopped && this.sock?.opened) this.setStatus(this.openStatus());
        continue;
      }
      const advance = await this.handle(item.sequence, item.event);
      if (!advance) return;
      this.cursor = item.sequence;
      await this.persist();
    }
  }

  /** Returns false when the connection stopped mid-retry, so the event must not be skipped. */
  private async handle(sequence: number, event: SwitchDomainEvent | null): Promise<boolean> {
    if (event === null) return true;
    for (let attempt = 1; attempt <= MAX_HANDLER_ATTEMPTS; attempt++) {
      try {
        await this.o.onEvent(event);
        return true;
      } catch (err) {
        this.logger.error(`[switch-client] onEvent failed for sequence ${sequence} (attempt ${attempt}/${MAX_HANDLER_ATTEMPTS})`, err);
        if (attempt === MAX_HANDLER_ATTEMPTS) break;
        await this.sleep(this.handlerRetryDelayMs * attempt);
        if (this.stopped) return false;
      }
    }
    this.logger.warn(
      `[switch-client] SKIPPING event ${sequence} (${event.kind}) after ${MAX_HANDLER_ATTEMPTS} failed attempts; it will not be retried`,
    );
    return true;
  }

  /** Saves the current cursor/generation; saves are serialised and a failure is logged, never thrown. */
  private persist(): Promise<void> {
    this.saveChain = this.saveChain.then(async () => {
      if (this.cursor === null) return;
      try {
        await this.o.cursorStore.save({ cursor: this.cursor, generation: this.generation });
      } catch (err) {
        this.logger.error('[switch-client] cursor store save failed', err);
      }
    });
    return this.saveChain;
  }
}

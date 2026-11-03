import { createServer } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface SocketInfo {
  ws: WebSocket;
  index: number;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  /** Every JSON frame the client sent on this socket. */
  received: Array<Record<string, unknown>>;
}

export interface HttpReply {
  status: number;
  json?: unknown;
}

/** A tiny in-process stand-in for Switch's agent bridge: HTTP routes plus the connection WebSocket. */
export class FakeSwitch {
  readonly requests: RecordedRequest[] = [];
  readonly sockets: SocketInfo[] = [];
  /** Decides each HTTP reply. Default: 200 `{result: {}}`. */
  httpHandler: (req: RecordedRequest) => HttpReply = () => ({ status: 200, json: { result: {} } });
  /** Called for each accepted WebSocket. Default: sends a `connection_state` frame. */
  onSocket: (info: SocketInfo) => void = (info) => this.sendState(info);
  /** When set, upgrades are accepted and immediately closed with this code instead of reaching `onSocket`. */
  closeOnOpenWith: { code: number; reason?: string } | null = null;

  private readonly server: Server;
  private readonly wss = new WebSocketServer({ noServer: true });
  private port = 0;

  private constructor() {
    this.server = createServer((req, res) => void this.handleHttp(req, res));
    this.server.on('upgrade', (req, socket, head) => {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.handleSocket(ws, req));
    });
  }

  static async start(): Promise<FakeSwitch> {
    const fake = new FakeSwitch();
    await new Promise<void>((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    fake.port = (fake.server.address() as AddressInfo).port;
    return fake;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async close(): Promise<void> {
    for (const client of this.wss.clients) client.terminate();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const recorded: RecordedRequest = {
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: req.headers,
      body,
    };
    this.requests.push(recorded);
    const reply = this.httpHandler(recorded);
    res.statusCode = reply.status;
    if (reply.json !== undefined) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply.json));
    } else {
      res.end();
    }
  }

  private handleSocket(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const info: SocketInfo = {
      ws,
      index: this.sockets.length,
      path: url.pathname,
      query: url.searchParams,
      headers: req.headers,
      received: [],
    };
    this.sockets.push(info);
    ws.on('message', (data) => {
      try {
        info.received.push(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch {
        // Not JSON; ignore.
      }
    });
    if (this.closeOnOpenWith) {
      ws.close(this.closeOnOpenWith.code, this.closeOnOpenWith.reason ?? '');
      return;
    }
    this.onSocket(info);
  }

  sendState(
    info: SocketInfo,
    state: { cursor?: number; generation?: number; rooms?: string[] } = {},
  ): void {
    this.frame(info, 'connection_state', {
      connection_id: info.query.get('connection_id'),
      agent_id: 'agent-1',
      generation: state.generation ?? info.index + 1,
      scope: info.query.get('scope') ?? 'single',
      filter: info.query.get('filter') ?? 'all',
      spawn_capable: false,
      rooms: state.rooms ?? (info.query.get('rooms') ?? '').split(',').filter(Boolean),
      cursor: state.cursor ?? 10,
      protocol: 9,
      heartbeat_interval_seconds: 10,
      server: { version: '0.31.0' },
      client: {},
    });
  }

  frame(info: SocketInfo, event: string, data: unknown, id?: number): void {
    const msg: Record<string, unknown> = { event, data };
    if (id !== undefined) msg.id = id;
    info.ws.send(JSON.stringify(msg));
  }

  ping(info: SocketInfo): void {
    this.frame(info, 'ping', {});
  }

  /** A domain event frame, shaped as the real server writes it (`encode_ws`). */
  event(
    info: SocketInfo,
    sequence: number,
    type: 'message' | 'command' | 'room_join',
    payload: Record<string, unknown>,
    roomId = 'room-1',
  ): void {
    this.frame(
      info,
      type,
      { type, room_id: roomId, bridge_id: null, channel_type: 'channel_public', payload, sequence },
      sequence,
    );
  }

  message(info: SocketInfo, sequence: number, body: string, extra: Record<string, unknown> = {}): void {
    this.event(info, sequence, 'message', {
      addressed: true,
      sender: '@switch-user-ab:switch',
      sender_name: 'alice',
      message_id: `m${sequence}`,
      body,
      timestamp: 1_700_000_000_000 + sequence,
      thread_id: null,
      attachments: [],
      ...extra,
    });
  }
}

export async function waitFor(predicate: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

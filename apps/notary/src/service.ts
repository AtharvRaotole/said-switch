import type { AddressInfo } from 'node:net';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { serve, type ServerType } from '@hono/node-server';
import { z } from 'zod';
import {
  applyExecutionReceipt,
  applyMessage,
  emptyLedger,
  extractFencedJson,
  fenceJson,
  jobIdFor,
  parseIntent,
  parseLedgerDocument,
  publicKeyFromPrivate,
  recordHandoff,
  renderLedgerDocument,
  ROLES_BY_MODE,
  signLedger,
  signStartToken,
  verifyReceipt,
  verifySignedLedger,
  exportSignedAgreementReceipt,
  renderAgreementReceiptMarkdown,
  appendAudit,
  commitChange,
  setDisplayTimeZone,
  type Agreement,
  type Effect,
  type ExecutionReceipt,
  type InboundMessage,
  type Ledger,
  type Party,
  type Role,
  type RoomMode,
  type SignedLedger,
} from '@said/core';
import {
  createLogger,
  loadConfig,
  loadEnrollment,
  loadOrCreateKeyPair,
  loadPublicKeys,
  loadSecrets,
  ports,
  requestHasSharedSecret,
  sharedSecretRequired,
  type Enrollment,
  type Logger,
  type PublicKeys,
  type SaidConfig,
} from '@said/runtime';
import {
  actorMatches,
  SwitchConnection,
  SwitchOps,
  type ConnectionStatus,
  type SwitchDomainEvent,
  type SwitchMessageEvent,
} from '@said/switch-client';
import { toInbound } from './inbound.js';
import { NotaryStateStore, type Binding } from './state-store.js';
import {
  LEDGER_DESCRIPTION,
  LEDGER_INSTRUCTIONS,
  LEDGER_NAME,
  alreadyEnrolled,
  badCode,
  bothEnrolled,
  codeUsed,
  agentsCannotEnroll,
  rosterUnconfirmed,
  enrollmentIncomplete,
  enrolledWaiting,
  tooManyCodes,
  ledgerAlreadyThere,
  noEnrollmentFile,
  plain,
  receiptBadSignature,
  receiptIgnoredSender,
  receiptNoKey,
  receiptUnreadable,
  samePerson,
  startDeliveryFailed,
  startMessage,
  stoppedAuthorizing,
  wrongRoom,
} from './text.js';

const START_TTL_MS = 10 * 60 * 1000;
const CHAT_LIMIT = 100;

const checkSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  durationMs: z.number(),
  detail: z.string(),
});

const receiptSchema = z.object({
  type: z.literal('said.receipt/v1'),
  roomId: z.string(),
  agreementId: z.string(),
  jobId: z.string(),
  status: z.enum(['READY', 'RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED']),
  worker: z.enum(['claude', 'codex', 'scripted']).nullable(),
  baseCommit: z.string().nullable(),
  resultCommit: z.string().nullable(),
  changedPaths: z.array(z.string()),
  checks: z.array(checkSchema),
  error: z.string().nullable(),
  at: z.number(),
  keyId: z.string(),
  signature: z.string(),
});

export interface EnrollmentRoleView {
  role: Role;
  label: string;
  bound: boolean;
  senderId?: string;
}

/** `GET /api/state` and every SSE `state` event. */
export interface NotaryApiState {
  mode: 'live' | 'offline';
  switch: { url: string; connected: boolean; version: string | null };
  room: { id: string; name: string };
  notaryPublicKey: string;
  keyId: string;
  signedLedger: SignedLedger | null;
  ledgerDocumentId: string | null;
  enrollment: { roles: EnrollmentRoleView[] } | null;
  halted: { reason: string } | null;
}

export interface ChatEvent {
  messageId: string;
  senderName: string;
  body: string;
  timestamp: number;
  fromAgent: boolean;
}

export interface NotaryHandle {
  url: string;
  stop(): Promise<void>;
}

export interface StartNotaryOptions {
  port?: number;
  log?: Logger;
}

type Sink = (event: 'state' | 'chat', data: unknown) => void;
type Adopt = { ok: true; signed: SignedLedger } | { ok: false; reason: string };

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function versionOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && 'version' in value) {
    const version = (value as { version?: unknown }).version;
    if (typeof version === 'string' && version.trim()) return version;
  }
  return null;
}

function orderedParties(mode: RoomMode, parties: Party[]): Party[] {
  const order = ROLES_BY_MODE[mode];
  return [...parties].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

function nextJobId(agreement: Agreement): string | null {
  const exec = agreement.execution;
  if (exec && exec.status !== 'FAILED') return null;
  const previous = exec ? Number(/-(\d+)$/.exec(exec.jobId)?.[1] ?? '0') : 0;
  if (!Number.isFinite(previous)) return null;
  return jobIdFor(agreement.id, previous + 1);
}

export async function startNotary(opts: StartNotaryOptions = {}): Promise<NotaryHandle> {
  const log = opts.log ?? createLogger('notary');
  setDisplayTimeZone(process.env.SAID_TIMEZONE);
  const config = await loadConfig();
  const secretGate = sharedSecretRequired({ mode: config.mode });
  if (!secretGate.ok) throw new Error(secretGate.reason);
  if (config.mode === 'live' && !secretGate.secret) {
    log.warn('SAID_HTTP_ALLOW_INSECURE=1: live HTTP APIs are open on loopback (no shared secret).');
  }
  const secrets = await loadSecrets();
  const publicKeys = await loadPublicKeys();
  const key = await loadOrCreateKeyPair('notary');
  const derived = await publicKeyFromPrivate(key.privateKey);
  const keyOk =
    derived === key.publicKey && key.publicKey === publicKeys.notary.publicKey && key.keyId === publicKeys.notary.keyId;
  if (config.mode === 'offline') {
    log.info(`Offline mode. Talking to a mock Switch at ${config.switchUrl}. This is a simulation, not Switch.`);
  } else {
    log.info(`Live mode. Talking to Switch at ${config.switchUrl}.`);
  }
  if (!keyOk) log.error('Notary signing key does not match the pinned public key. Said will not authorize.');

  const store = await NotaryStateStore.open(log);
  const notary = new NotaryApp({
    config,
    secretsApiKey: secrets.saidApiKey,
    publicKeys,
    key,
    keyOk,
    store,
    log,
    port: opts.port ?? ports.notary,
  });
  try {
    return await notary.start();
  } catch (err) {
    await notary.stop().catch(() => undefined);
    throw err;
  }
}

class NotaryApp {
  private readonly config: SaidConfig;
  private readonly publicKeys: PublicKeys;
  private readonly key: { keyId: string; privateKey: string };
  private readonly keyOk: boolean;
  private readonly store: NotaryStateStore;
  private readonly log: Logger;
  private readonly ops: SwitchOps;
  private readonly connection: SwitchConnection;
  private readonly agentIds: Set<string>;
  private readonly agentNames: Set<string>;
  private readonly sinks = new Set<Sink>();
  private readonly chat: ChatEvent[] = [];
  private readonly aborters = new Set<() => void>();

  private readonly port: number;
  private chain: Promise<void> = Promise.resolve();
  private server: ServerType | null = null;
  private url = '';
  private stopping = false;
  private connected = false;
  private version: string | null = null;
  private roomName: string;
  private signed: SignedLedger | null = null;
  private docId: string | null;
  private halted: { reason: string } | null = null;
  private enrollmentLogged = false;
  private enrollFails = new Map<string, number>();

  constructor(input: {
    config: SaidConfig;
    secretsApiKey: string;
    publicKeys: PublicKeys;
    key: { keyId: string; privateKey: string };
    keyOk: boolean;
    store: NotaryStateStore;
    log: Logger;
    port: number;
  }) {
    this.config = input.config;
    this.publicKeys = input.publicKeys;
    this.key = { keyId: input.key.keyId, privateKey: input.key.privateKey };
    this.keyOk = input.keyOk;
    this.store = input.store;
    this.log = input.log;
    this.port = input.port;
    const savedFails = input.store.snapshot().enrollFails ?? {};
    this.enrollFails = new Map(Object.entries(savedFails).filter(([, n]) => typeof n === 'number' && n > 0));
    this.roomName = input.config.roomName ?? 'Unnamed room';
    this.docId = input.store.snapshot().ledgerDocumentId;
    this.agentIds = new Set([input.config.said.agentId]);
    if (input.config.builder) this.agentIds.add(input.config.builder.agentId);
    this.agentNames = new Set([input.config.said.name.toLowerCase()]);
    if (input.config.builder) this.agentNames.add(input.config.builder.name.toLowerCase());
    const connectionId = input.store.snapshot().connectionId;
    const creds = { baseUrl: input.config.switchUrl, agentId: input.config.said.agentId, apiKey: input.secretsApiKey };
    this.ops = new SwitchOps(creds, { connectionId });
    this.connection = new SwitchConnection({
      creds,
      connectionId,
      rooms: [input.config.roomId],
      filter: 'all',
      scope: 'single',
      cursorStore: input.store,
      client: { name: 'said', version: '0.1.0' },
      onEvent: (event) => this.run(() => this.handle(event)),
      onState: (status) => this.onConnectionStatus(status),
      logger: input.log,
    });
  }

  async start(): Promise<NotaryHandle> {
    await this.listen(this.port);
    await this.run(async () => {
      await this.connection.start();
      await this.loadExisting();
    });
    return { url: this.url, stop: () => this.stop() };
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    await this.connection.stop().catch((err: unknown) => this.log.error('connection stop failed', plain(msg(err))));
    for (const abort of this.aborters) abort();
    const server = this.server;
    if (!server) return;
    const closable = server as ServerType & { closeAllConnections?: () => void };
    await new Promise<void>((resolve) => {
      closable.close(() => resolve());
      closable.closeAllConnections?.();
    });
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async listen(port: number): Promise<void> {
    const app = this.http();
    const info = await new Promise<AddressInfo>((resolve, reject) => {
      const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (address) => {
        if (address && typeof address !== 'string') resolve(address);
        else reject(new Error('Notary HTTP server did not bind a TCP port'));
      });
      server.on('error', reject);
      this.server = server;
    });
    this.url = `http://127.0.0.1:${info.port}`;
    const where = this.config.mode === 'offline' ? 'offline simulation' : 'live';
    this.log.info(`Notary API listening on ${this.url} (${where})`);
  }

  /** Local console API. Binds 127.0.0.1. Live mode requires SAID_HTTP_SHARED_SECRET unless SAID_HTTP_ALLOW_INSECURE=1. */
  private http(): Hono {
    const allowed = new Set([
      'http://localhost:7400',
      'http://localhost:7300',
      'http://127.0.0.1:7400',
      'http://127.0.0.1:7300',
      `http://localhost:${ports.console}`,
      `http://127.0.0.1:${ports.console}`,
    ]);
    const app = new Hono();
    const required = sharedSecretRequired({ mode: this.config.mode });
    if (!required.ok) throw new Error(required.reason);
    const sharedSecret = required.secret;
    app.use(
      '*',
      cors({
        origin: (origin) => (allowed.has(origin) ? origin : null),
      }),
    );
    app.use('*', async (c, next) => {
      if (!sharedSecret) return next();
      if (c.req.method === 'OPTIONS') return next();
      if (c.req.path === '/health') return next();
      if (requestHasSharedSecret(c.req.raw.headers, sharedSecret, c.req.url)) return next();
      return c.json({ error: 'unauthorized', reason: 'Missing or invalid shared secret' }, 401);
    });
    app.get('/health', (c) => {
      if (this.config.mode === 'offline') return c.json({ status: 'ok', mock: true, simulation: true });
      return c.json({ status: 'ok' });
    });
    app.get('/api/state', async (c) => c.json(await this.apiState()));
    app.get('/api/receipt', async (c) => {
      if (!this.signed || this.halted) return c.json({ error: 'no_ledger' }, 404);
      const agreementId = c.req.query('agreementId') ?? null;
      const receipt = await exportSignedAgreementReceipt({
        signed: this.signed,
        privateKey: this.key.privateKey,
        keyId: this.key.keyId,
        issuedAt: Date.now(),
        agreementId,
      });
      if (!receipt) return c.json({ error: 'no_agreement' }, 404);
      // Persist an audit trail entry on the in-memory ledger and re-sign.
      const next = structuredClone(this.signed.payload);
      appendAudit(next, {
        kind: 'receipt_exported',
        at: Date.now(),
        actor: 'said',
        ref: receipt.agreementId,
        summary: `Exported signed agreement receipt for ${receipt.agreementId}`,
      });
      commitChange(next, Date.now(), null);
      this.signed = await signLedger(next, this.key.keyId, this.key.privateKey);
      const format = (c.req.query('format') ?? 'json').toLowerCase();
      if (format === 'markdown' || format === 'md') {
        return c.text(renderAgreementReceiptMarkdown(receipt), 200, { 'content-type': 'text/markdown; charset=utf-8' });
      }
      return c.json(receipt);
    });
    app.get('/api/events', (c) => {
      return streamSSE(c, async (stream) => {
        let queue = Promise.resolve();
        const send = (event: string, data: unknown) => {
          queue = queue.then(async () => {
            if (stream.aborted) return;
            await stream.writeSSE({ event, data: JSON.stringify(data) });
          });
        };
        const sink: Sink = (event, data) => {
          send(event, data);
        };
        this.sinks.add(sink);
        const done = new Promise<void>((resolve) => {
          const abort = () => {
            stream.abort();
            resolve();
          };
          this.aborters.add(abort);
          stream.onAbort(() => {
            this.aborters.delete(abort);
            resolve();
          });
        });
        try {
          send('state', await this.apiState());
          for (const message of this.chat) send('chat', message);
          await done;
        } finally {
          this.sinks.delete(sink);
        }
      });
    });
    return app;
  }

  private onConnectionStatus(status: ConnectionStatus): void {
    if (status.state === 'open') {
      const was = this.connected;
      this.connected = true;
      this.version = versionOf(status.serverVersion);
      if (!was) {
        const target = this.config.mode === 'offline' ? 'the mock Switch simulation' : 'Switch';
        this.log.info(`Connected to ${target} at ${this.config.switchUrl}.`);
      }
    } else if (status.state === 'connecting' || status.state === 'reconnecting' || status.state === 'stopped') {
      this.connected = false;
      if (status.state === 'reconnecting') {
        const target = this.config.mode === 'offline' ? 'the mock Switch simulation' : 'Switch';
        this.log.warn(`Connection lost. Reconnecting to ${target}.`);
      }
    }
    void this.emitState().catch((err: unknown) => this.log.error('state event failed', plain(msg(err))));
  }

  private async emitState(): Promise<void> {
    const data = await this.apiState();
    for (const sink of this.sinks) sink('state', data);
  }

  private emitChat(message: ChatEvent): void {
    this.chat.push(message);
    if (this.chat.length > CHAT_LIMIT) this.chat.shift();
    for (const sink of this.sinks) sink('chat', message);
  }

  private async apiState(): Promise<NotaryApiState> {
    const snap = this.store.snapshot();
    return {
      mode: this.config.mode,
      switch: { url: this.config.switchUrl, connected: this.connected, version: this.version },
      room: { id: this.config.roomId, name: this.roomName },
      notaryPublicKey: this.publicKeys.notary.publicKey,
      keyId: this.publicKeys.notary.keyId,
      signedLedger: this.halted ? null : this.signed,
      ledgerDocumentId: snap.ledgerDocumentId,
      enrollment: await this.enrollmentView(),
      halted: this.halted,
    };
  }

  private async loadEnrollmentFile(): Promise<Enrollment | null> {
    try {
      return await loadEnrollment();
    } catch (err) {
      if (!this.enrollmentLogged) {
        this.enrollmentLogged = true;
        this.log.error('enrollment.json is invalid', plain(msg(err)));
      }
      return null;
    }
  }

  private async enrollmentView(): Promise<NotaryApiState['enrollment']> {
    const enrollment = await this.loadEnrollmentFile();
    const file = enrollment && enrollment.roomId === this.config.roomId ? enrollment : null;
    const parties = this.signed?.payload.parties ?? [];
    const bindings = this.store.snapshot().bindings;
    if (!file && parties.length === 0 && bindings.length === 0) return null;
    const roles = file
      ? file.codes
      : parties.length > 0
        ? parties.map((p) => ({ role: p.role, label: p.label, code: '' }))
        : bindings.map((b) => ({ role: b.role, label: b.label, code: b.code }));
    return {
      roles: roles.map((role) => {
        const party = parties.find((p) => p.role === role.role);
        const binding = bindings.find((b) => b.role === role.role);
        const senderId = party?.senderId || binding?.senderId;
        const view: EnrollmentRoleView = {
          role: role.role,
          label: party?.label || role.label,
          bound: Boolean(senderId),
        };
        if (senderId) view.senderId = senderId;
        return view;
      }),
    };
  }

  private async loadExisting(): Promise<void> {
    const room = await this.ops.connectToRoom(this.config.roomId);
    if (room.name) this.roomName = this.config.roomName ?? room.name;
    for (const participant of room.participants) {
      if (participant.type === 'agent') this.agentIds.add(participant.id);
    }
    if (!this.keyOk) {
      await this.markHalted('Said cannot sign because the signing key does not match the pinned public key.', true);
      return;
    }
    const named = room.documents.filter((d) => d.name === LEDGER_NAME);
    const savedId = this.store.snapshot().ledgerDocumentId;
    if (savedId) {
      const adopted = await this.tryAdopt(savedId);
      if (!adopted.ok) await this.markHalted(adopted.reason, true);
      return;
    }
    if (named.length > 1) {
      await this.markHalted('More than one room document is named Said Ledger. Said will not guess which one to trust.', true);
      return;
    }
    if (named.length === 1) {
      const adopted = await this.tryAdopt(named[0]!.id);
      if (!adopted.ok) await this.markHalted(adopted.reason, true);
    }
  }

  private async tryAdopt(documentId: string): Promise<Adopt> {
    let content: string | undefined;
    try {
      const docs = await this.ops.loadInternalDocuments([documentId]);
      content = docs[0]?.content;
    } catch (err) {
      this.log.error('could not load ledger document', plain(msg(err)));
      return { ok: false, reason: 'The ledger document is missing or could not be read.' };
    }
    if (typeof content !== 'string' || content.length === 0) {
      return { ok: false, reason: 'The ledger document is missing or empty.' };
    }
    let signed: SignedLedger;
    try {
      signed = parseLedgerDocument(content);
    } catch (err) {
      return { ok: false, reason: `The ledger document is malformed. ${plain(msg(err))}` };
    }
    const verdict = await verifySignedLedger(signed, this.publicKeys.notary.publicKey);
    if (!verdict.ok) return { ok: false, reason: `The ledger signature does not check. ${plain(verdict.reason)}` };
    if (signed.payload.roomId !== this.config.roomId) {
      return { ok: false, reason: 'The ledger belongs to a different room.' };
    }
    this.signed = signed;
    this.docId = documentId;
    await this.store.update({
      ledgerDocumentId: documentId,
      revision: signed.payload.revision,
      digest: signed.digest,
    });
    await this.emitState();
    return { ok: true, signed };
  }

  private async markHalted(reason: string, announce: boolean): Promise<void> {
    const clean = plain(reason);
    const changed = !this.halted || this.halted.reason !== clean;
    this.halted = { reason: clean };
    this.signed = null;
    if (changed) await this.emitState();
    this.log.error('authorization stopped', clean);
    if (announce) await this.reply(stoppedAuthorizing(clean));
  }

  private async reply(body: string, threadId: string | null = null): Promise<void> {
    try {
      await this.ops.postMessage(body, threadId);
    } catch (err) {
      this.log.error('could not post room reply', plain(msg(err)));
    }
  }

  private async handle(event: SwitchDomainEvent): Promise<void> {
    if (this.stopping || event.kind !== 'message') return;
    if (event.roomId && event.roomId !== this.config.roomId) return;
    try {
      await this.handleMessage(event);
    } catch (err) {
      this.log.error('failed to handle message', plain(msg(err)));
    }
  }

  private async handleMessage(event: SwitchMessageEvent): Promise<void> {
    const inbound = toInbound(event, this.agentIds, this.agentNames);
    this.emitChat({
      messageId: inbound.messageId,
      senderName: inbound.senderName,
      body: inbound.body,
      timestamp: inbound.timestamp,
      fromAgent: inbound.fromAgent,
    });
    if (inbound.autoReply) return;
    if (extractFencedJson(inbound.body, 'said-receipt') !== null) {
      await this.handleReceipt(inbound);
      return;
    }
    if (inbound.fromAgent) return;
    if (this.halted) {
      if (this.worthReply(inbound)) await this.reply(stoppedAuthorizing(this.halted.reason), inbound.threadId);
      return;
    }
    if (!this.keyOk) {
      await this.markHalted('Said cannot sign because the signing key does not match the pinned public key.', true);
      return;
    }
    if (!this.signed) {
      await this.handleEnrollment(inbound);
      return;
    }
    if (this.docId) {
      const adopted = await this.tryAdopt(this.docId);
      if (!adopted.ok) {
        await this.markHalted(adopted.reason, true);
        return;
      }
    }
    if (parseIntent(inbound.body, { saidName: this.config.said.name }).kind === 'enroll') {
      await this.reply(ledgerAlreadyThere(), inbound.threadId);
      return;
    }
    if (!this.signed) {
      await this.markHalted('The ledger document is missing. Said will not create a replacement.', true);
      return;
    }
    const result = applyMessage(this.signed.payload, inbound, {
      guardedAgents: this.config.builder ? [this.config.builder.name] : [],
      saidName: this.config.said.name,
      now: Date.now(),
    });
    await this.applyResult(result.ledger, result.effects);
  }

  private worthReply(inbound: InboundMessage): boolean {
    const intent = parseIntent(inbound.body, { saidName: this.config.said.name });
    if (intent.kind !== 'none' && intent.kind !== 'enroll') return true;
    if (intent.kind === 'enroll') return true;
    return this.isBypass(inbound);
  }

  private isBypass(inbound: InboundMessage): boolean {
    if (this.config.roomMode !== 'business' || !this.config.builder || inbound.addressedToSaid) return false;
    return inbound.mentions.includes(this.config.builder.name.toLowerCase());
  }

  private async handleEnrollment(inbound: InboundMessage): Promise<void> {
    const intent = parseIntent(inbound.body, { saidName: this.config.said.name });
    if (intent.kind !== 'enroll') {
      if (intent.kind !== 'none' || this.isBypass(inbound)) {
        const waiting = await this.waitingLabels();
        await this.reply(enrollmentIncomplete(waiting), inbound.threadId);
      }
      return;
    }
    const enrollment = await this.loadEnrollmentFile();
    if (!enrollment) {
      await this.reply(noEnrollmentFile(), inbound.threadId);
      return;
    }
    if (enrollment.roomId !== this.config.roomId) {
      await this.reply(wrongRoom(), inbound.threadId);
      return;
    }
    const kind = inbound.fromAgent ? 'agent' : await this.rosterKind(inbound.senderId, inbound.senderName);
    if (kind === 'agent') {
      await this.reply(agentsCannotEnroll(), inbound.threadId);
      return;
    }
    if (kind === 'unknown') {
      await this.reply(rosterUnconfirmed(), inbound.threadId);
      return;
    }
    const fails = this.enrollFails.get(inbound.senderId) ?? 0;
    if (fails >= 8) {
      await this.reply(tooManyCodes(), inbound.threadId);
      return;
    }
    const allowed = new Set<Role>(ROLES_BY_MODE[this.config.roomMode]);
    let bindings = this.store.snapshot().bindings.filter((b) => enrollment.codes.some((c) => c.role === b.role && c.code === b.code));
    const entry = enrollment.codes.find((c) => c.code === intent.code);
    if (!entry || !allowed.has(entry.role)) {
      await this.recordEnrollFail(inbound.senderId, fails + 1);
      await this.reply(badCode(), inbound.threadId);
      return;
    }
    await this.recordEnrollFail(inbound.senderId, 0);
    const sameRole = bindings.find((b) => b.role === entry.role);
    if (sameRole && sameRole.senderId === inbound.senderId) {
      const other = enrollment.codes.find((c) => c.role !== entry.role);
      await this.reply(alreadyEnrolled(entry.label, other?.label ?? 'the other person'), inbound.threadId);
      return;
    }
    if (sameRole) {
      await this.reply(codeUsed(sameRole.label), inbound.threadId);
      return;
    }
    const otherRole = bindings.find((b) => b.senderId === inbound.senderId);
    if (otherRole) {
      await this.reply(samePerson(otherRole.label), inbound.threadId);
      return;
    }
    bindings = [...bindings, { role: entry.role, label: entry.label, senderId: inbound.senderId, code: entry.code }];
    await this.store.update({ bindings });
    await this.emitState();
    if (bindings.length < 2) {
      const other = enrollment.codes.find((c) => c.role !== entry.role);
      await this.reply(enrolledWaiting(entry.label, other?.label ?? 'the other person'), inbound.threadId);
      return;
    }
    await this.createInitial(bindings);
  }

  /**
   * Enrollment refuses anyone Said cannot see on the live roster.
   * A failed lookup does not count as a person: an agent that joined after
   * connect must not be able to spend a code while the roster is stale.
   */
  private async recordEnrollFail(senderId: string, count: number): Promise<void> {
    if (count <= 0) this.enrollFails.delete(senderId);
    else this.enrollFails.set(senderId, count);
    const enrollFails: Record<string, number> = {};
    for (const [id, n] of this.enrollFails) enrollFails[id] = n;
    await this.store.update({ enrollFails });
  }

    private async rosterKind(senderId: string, senderName: string): Promise<'agent' | 'person' | 'unknown'> {
    if (this.agentIds.has(senderId) || this.agentNames.has(senderName.trim().toLowerCase())) return 'agent';
    try {
      const room = await this.ops.connectToRoom(this.config.roomId);
      for (const participant of room.participants) {
        if (participant.type === 'agent') {
          this.agentIds.add(participant.id);
          if (participant.name) this.agentNames.add(participant.name.toLowerCase());
        }
      }
      // Live Switch: message.sender is a Matrix actor id; connect_to_room lists UUID ids.
      // Match bridged humans (and agents) by roster name when the ids differ.
      const match = room.participants.find((participant) =>
        actorMatches({
          senderId,
          senderName,
          id: participant.id,
          name: participant.name,
        }),
      );
      if (!match) return 'unknown';
      return match.type === 'agent' ? 'agent' : 'person';
    } catch (err) {
      this.log.warn('could not refresh the room participants before enrollment', plain(msg(err)));
      return 'unknown';
    }
  }

  private async waitingLabels(): Promise<string[]> {
    const enrollment = await this.loadEnrollmentFile();
    if (!enrollment || enrollment.roomId !== this.config.roomId) return [];
    const bound = new Set(this.store.snapshot().bindings.map((b) => b.role));
    return enrollment.codes.filter((c) => !bound.has(c.role)).map((c) => c.label);
  }

  private async createInitial(bindings: Binding[]): Promise<void> {
    if (this.halted || !this.keyOk) {
      await this.markHalted(this.halted?.reason ?? 'Said cannot sign because the signing key does not match the pinned public key.', true);
      return;
    }
    const room = await this.ops.connectToRoom(this.config.roomId);
    const named = room.documents.filter((d) => d.name === LEDGER_NAME);
    if (named.length > 1) {
      await this.markHalted('More than one room document is named Said Ledger. Said will not guess which one to trust.', true);
      return;
    }
    if (named.length === 1) {
      const adopted = await this.tryAdopt(named[0]!.id);
      if (!adopted.ok) {
        await this.markHalted(adopted.reason, true);
        return;
      }
      await this.reply(bothEnrolled(adopted.signed.payload.parties[0]?.label ?? 'Both people', adopted.signed.payload.parties[1]?.label ?? 'are enrolled', this.config.mode === 'offline'));
      return;
    }
    let payload: Ledger;
    try {
      payload = emptyLedger({
        deploymentId: this.config.deploymentId,
        roomId: this.config.roomId,
        mode: this.config.roomMode,
        parties: orderedParties(
          this.config.roomMode,
          bindings.map((b) => ({ role: b.role, label: b.label, senderId: b.senderId })),
        ),
        now: Date.now(),
      });
    } catch (err) {
      await this.markHalted(plain(msg(err)), true);
      return;
    }
    const signed = await signLedger(payload, this.key.keyId, this.key.privateKey);
    const stored = await this.persist(signed, true);
    if (!stored) return;
    const labels = stored.payload.parties.map((p) => p.label);
    await this.reply(bothEnrolled(labels[0] ?? 'The first person', labels[1] ?? 'the second person', this.config.mode === 'offline'));
  }

  private async applyResult(ledger: Ledger | null, effects: Effect[]): Promise<void> {
    let next = ledger;
    let handoff: { agreementId: string; jobId: string; threadId: string | null } | null = null;
    if (next && this.config.roomMode === 'business' && this.config.builder) {
      const effect = effects.find((e): e is Extract<Effect, { kind: 'handoff' }> => e.kind === 'handoff');
      if (effect) {
        const agreement = next.agreements.find((a) => a.id === effect.agreementId);
        const jobId = agreement ? nextJobId(agreement) : null;
        if (agreement && jobId) {
          next = recordHandoff(next, { agreementId: agreement.id, jobId, now: Date.now() });
          handoff = { agreementId: agreement.id, jobId, threadId: effect.threadId };
        }
      }
    }
    if (next) {
      const signed = await signLedger(next, this.key.keyId, this.key.privateKey);
      const stored = await this.persist(signed, false);
      if (!stored) return;
    }
    for (const effect of effects) {
      if (effect.kind === 'reply') await this.reply(effect.body, effect.threadId);
    }
    if (handoff && this.signed && !this.halted) await this.sendStart(handoff);
  }

  private async persist(signed: SignedLedger, create: boolean): Promise<SignedLedger | null> {
    const content = renderLedgerDocument(signed);
    try {
      if (create) {
        const created = await this.ops.createRoomDocument({
          name: LEDGER_NAME,
          description: LEDGER_DESCRIPTION,
          instructions: LEDGER_INSTRUCTIONS,
          content,
        });
        this.docId = created.document_id;
      } else if (!this.docId) {
        await this.markHalted('The ledger document is missing. Said will not create a replacement.', true);
        return null;
      } else {
        await this.ops.updateRoomDocument({ documentId: this.docId, content });
      }
    } catch (err) {
      await this.markHalted(`Said could not write the ledger. ${plain(msg(err))}`, true);
      return null;
    }
    const adopted = await this.tryAdopt(this.docId!);
    if (!adopted.ok) {
      await this.markHalted(adopted.reason, true);
      return null;
    }
    if (adopted.signed.digest !== signed.digest) {
      await this.markHalted('The ledger read back with a different digest than the one just written.', true);
      return null;
    }
    return adopted.signed;
  }

  private async sendStart(job: { agreementId: string; jobId: string; threadId: string | null }): Promise<void> {
    if (!this.signed || !this.docId || !this.config.builder || this.config.roomMode !== 'business') return;
    const agreement = this.signed.payload.agreements.find((a) => a.id === job.agreementId);
    if (!agreement) return;
    const now = Date.now();
    const expiresAt = now + START_TTL_MS;
    const token = await signStartToken(
      {
        type: 'said.start/v1',
        roomId: this.config.roomId,
        agreementId: agreement.id,
        jobId: job.jobId,
        termsHash: agreement.termsHash,
        ledgerRevision: this.signed.payload.revision,
        ledgerDocumentId: this.docId,
        issuedAt: now,
        expiresAt,
        keyId: this.key.keyId,
      },
      this.key.privateKey,
    );
    try {
      const body = startMessage(
        { agreementId: agreement.id, jobId: job.jobId, expiresAt, keyId: this.key.keyId },
        fenceJson('said-start', token),
      );
      await this.ops.sendTargetedMessage(body, [this.config.builder.name], job.threadId);
    } catch (err) {
      this.log.error('could not send start authorization', plain(msg(err)));
      await this.reply(startDeliveryFailed(), job.threadId);
    }
  }

  private async handleReceipt(inbound: InboundMessage): Promise<void> {
    const raw = extractFencedJson<unknown>(inbound.body, 'said-receipt');
    if (!receiptSchema.safeParse(raw).success || !raw || typeof raw !== 'object') {
      await this.reply(receiptUnreadable(), inbound.threadId);
      return;
    }
    const builder = this.config.builder;
    if (
      !builder ||
      !inbound.fromAgent ||
      !actorMatches({
        senderId: inbound.senderId,
        senderName: inbound.senderName,
        id: builder.agentId,
        name: builder.name,
      })
    ) {
      await this.reply(receiptIgnoredSender(), inbound.threadId);
      return;
    }
    const builderKey = this.publicKeys.builder;
    if (!builderKey) {
      await this.reply(receiptNoKey(), inbound.threadId);
      return;
    }
    const receipt = raw as ExecutionReceipt;
    let verified = false;
    try {
      verified = await verifyReceipt(receipt, builderKey.publicKey);
    } catch (err) {
      this.log.error('receipt verification failed', plain(msg(err)));
    }
    if (!verified) {
      await this.reply(receiptBadSignature(), inbound.threadId);
      return;
    }
    if (this.halted || !this.signed || !this.docId) {
      await this.reply(stoppedAuthorizing(this.halted?.reason ?? 'There is no signed ledger yet.'), inbound.threadId);
      return;
    }
    const adopted = await this.tryAdopt(this.docId);
    if (!adopted.ok) {
      await this.markHalted(adopted.reason, true);
      return;
    }
    const result = applyExecutionReceipt(adopted.signed.payload, receipt, Date.now());
    if (!result.ledger) return;
    const signed = await signLedger(result.ledger, this.key.keyId, this.key.privateKey);
    const stored = await this.persist(signed, false);
    if (!stored) return;
    for (const effect of result.effects) {
      if (effect.kind === 'reply') await this.reply(effect.body, effect.threadId);
    }
  }
}

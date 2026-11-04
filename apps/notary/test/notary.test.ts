import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  extractFencedJson,
  fenceJson,
  parseLedgerDocument,
  signReceipt,
  verifySignedLedger,
  verifyStartToken,
  type KeyPair,
  type StartToken,
} from '@said/core';
import { createMockSwitch, type MockSwitch } from '@said/mock-switch';
import { loadOrCreateKeyPair, saveConfig, saveEnrollment, savePublicKeys, saveSecrets } from '@said/runtime';
import { MemoryCursorStore, SwitchConnection, SwitchOps, registerAgent } from '@said/switch-client';
import { startNotary, type NotaryApiState, type NotaryHandle } from '../src/index.js';

const BUSINESS = '11111111-1111-4111-8111-111111111111';
const PERSONAL = '22222222-2222-4222-8222-222222222222';
const RIYA = '@switch-user-riya01:switch.local';
const DANA = '@switch-user-dana02:switch.local';
const SAM = '@switch-user-sam03:switch.local';
const ALEX = '@switch-user-alex04:switch.local';
const REGISTRATION_KEY = 'mock-registration-key';

const silent = { info() {}, warn() {}, error() {} };
const scratch = fileURLToPath(new URL('./.tmp/', import.meta.url));
let previousHome: string | undefined;
let homeSet = false;

interface Boot {
  home: string;
  mock: MockSwitch;
  notary: NotaryHandle;
  notaryKey: KeyPair;
  builderKey: KeyPair;
  said: { id: string; apiKey: string };
  builder: { id: string; apiKey: string };
}

async function boot(opts: { personal?: boolean; badLedger?: boolean } = {}): Promise<Boot> {
  await mkdir(scratch, { recursive: true });
  const home = await mkdtemp(join(scratch, 'home-'));
  previousHome = process.env.SAID_HOME;
  process.env.SAID_HOME = home;
  homeSet = true;
  const mock = await createMockSwitch({ port: 0, log: false });
  let notary: NotaryHandle | null = null;
  try {
    const said = await registerAgent({
      baseUrl: mock.url,
      registrationKey: REGISTRATION_KEY,
      name: 'said',
      description: 'Said test notary',
      displayName: 'Said',
    });
    const builder = await registerAgent({
      baseUrl: mock.url,
      registrationKey: REGISTRATION_KEY,
      name: 'builder',
      description: 'Builder test agent',
      displayName: 'Builder',
    });
    const saidOps = new SwitchOps({ baseUrl: mock.url, agentId: said.id, apiKey: said.apiKey });
    await saidOps.updateAgentDetail({ agentId: said.id, addressing: 'anyone' });
    const builderOps = new SwitchOps({ baseUrl: mock.url, agentId: builder.id, apiKey: builder.apiKey });
    await builderOps.updateAgentDetail({ agentId: builder.id, addressing: 'owner_and_owner_agents' });

    const notaryKey = await loadOrCreateKeyPair('notary');
    const builderKey = await loadOrCreateKeyPair('builder');
    await savePublicKeys({
      notary: { keyId: notaryKey.keyId, publicKey: notaryKey.publicKey },
      builder: { keyId: builderKey.keyId, publicKey: builderKey.publicKey },
    });
    await saveSecrets({ saidApiKey: said.apiKey, builderApiKey: builder.apiKey });
    const personal = opts.personal === true;
    await saveConfig({
      mode: 'offline',
      switchUrl: mock.url,
      deploymentId: 'dep-test',
      roomId: personal ? PERSONAL : BUSINESS,
      roomName: personal ? 'weekend-plans' : 'larkspur-site',
      roomMode: personal ? 'personal' : 'business',
      said: { agentId: said.id, name: 'said' },
      builder: personal ? null : { agentId: builder.id, name: 'builder' },
      worker: 'scripted',
    });
    await saveEnrollment({
      roomId: personal ? PERSONAL : BUSINESS,
      createdAt: Date.now(),
      codes: personal
        ? [
            { role: 'partnerA', label: 'Sam', code: 'SAM00001' },
            { role: 'partnerB', label: 'Alex', code: 'ALEX0001' },
          ]
        : [
            { role: 'developer', label: 'Riya', code: 'RIYA0001' },
            { role: 'client', label: 'Dana', code: 'DANA0001' },
          ],
    });
    if (opts.badLedger) await plantBadLedger(mock.url, said);
    notary = await startNotary({ port: 0, log: silent });
    return { home, mock, notary, notaryKey, builderKey, said, builder };
  } catch (err) {
    await notary?.stop().catch(() => undefined);
    await mock.close().catch(() => undefined);
    throw err;
  }
}

async function plantBadLedger(baseUrl: string, said: { id: string; apiKey: string }): Promise<void> {
  const connectionId = crypto.randomUUID();
  const ops = new SwitchOps({ baseUrl, agentId: said.id, apiKey: said.apiKey }, { connectionId });
  const conn = new SwitchConnection({
    creds: { baseUrl, agentId: said.id, apiKey: said.apiKey },
    connectionId,
    rooms: [BUSINESS],
    filter: 'all',
    cursorStore: new MemoryCursorStore(),
    onEvent: async () => {},
    logger: silent,
    maxBackoffMs: 200,
  });
  await conn.start();
  try {
    await ops.connectToRoom(BUSINESS);
    await ops.createRoomDocument({
      name: 'Said Ledger',
      description: 'broken',
      instructions: 'broken',
      content: 'this document is not a signed ledger',
    });
  } finally {
    await conn.stop();
  }
}

async function closeBoot(env: Boot | null): Promise<void> {
  if (!env) return;
  await env.notary.stop().catch(() => undefined);
  await env.mock.close().catch(() => undefined);
}

async function getState(url: string): Promise<NotaryApiState> {
  const res = await fetch(`${url}/api/state`);
  if (!res.ok) throw new Error(`GET /api/state returned ${res.status}`);
  return (await res.json()) as NotaryApiState;
}

function saidBodies(mock: MockSwitch): string[] {
  return mock.messages().filter((m) => m.sender_name === 'said' && m.switch_generated !== true).map((m) => m.body);
}

async function waitFor(label: string, pred: () => Promise<boolean>, timeoutMs = 12_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe('notary on mock Switch', () => {
  let env: Boot | null = null;

  afterEach(async () => {
    const home = env?.home;
    await closeBoot(env);
    env = null;
    if (home) await rm(home, { recursive: true, force: true });
    if (homeSet) {
      if (previousHome === undefined) delete process.env.SAID_HOME;
      else process.env.SAID_HOME = previousHome;
      homeSet = false;
    }
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('binds participant ids and creates a signed ledger only after both enroll', async () => {
    env = await boot();
    const { mock, notary, notaryKey, home } = env;

    await mock.say('developer', '@said enroll RIYA0001');
    await mock.say('developer', '@said enroll DANA0001');
    await waitFor('same person rejected', async () => saidBodies(mock).some((body) => body.includes('You are already enrolled as Riya')));

    const one = await getState(notary.url);
    expect(one.signedLedger).toBeNull();
    expect(one.enrollment?.roles).toEqual([
      { role: 'developer', label: 'Riya', bound: true, senderId: RIYA },
      { role: 'client', label: 'Dana', bound: false },
    ]);

    await mock.say('developer', '@said Propose: Add dark mode | Terms: +2 days, +$400');
    await waitFor('enrollment incomplete', async () => saidBodies(mock).some((body) => body.includes('Enrollment is not finished')));
    expect((await getState(notary.url)).signedLedger).toBeNull();
    expect(mock.documents(BUSINESS)).toHaveLength(0);

    await mock.say('client', '@said enroll DANA0001');
    await waitFor('signed ledger', async () => (await getState(notary.url)).signedLedger?.payload.parties.length === 2);

    const state = await getState(notary.url);
    const signed = state.signedLedger;
    expect(signed).not.toBeNull();
    expect(signed!.payload.parties).toEqual([
      { role: 'developer', label: 'Riya', senderId: RIYA },
      { role: 'client', label: 'Dana', senderId: DANA },
    ]);
    expect(signed!.payload.drafts).toHaveLength(0);
    expect(await verifySignedLedger(signed!, notaryKey.publicKey)).toEqual({ ok: true });

    const docs = mock.documents(BUSINESS);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.name).toBe('Said Ledger');
    const readBack = parseLedgerDocument(docs[0]!.content);
    expect(readBack.digest).toBe(signed!.digest);

    expect(state).toMatchObject({
      mode: 'offline',
      switch: { url: mock.url, connected: true, version: 'mock-0.31' },
      room: { id: BUSINESS, name: 'larkspur-site' },
      notaryPublicKey: notaryKey.publicKey,
      keyId: notaryKey.keyId,
      ledgerDocumentId: docs[0]!.id,
      halted: null,
    });
    expect(state.enrollment?.roles.every((role) => role.bound === true)).toBe(true);

    const disk = JSON.parse(await readFile(join(home, 'notary-state.json'), 'utf8')) as Record<string, unknown>;
    expect(disk.connectionId).toEqual(expect.any(String));
    expect(disk.cursor).toEqual(expect.any(Number));
    expect(disk.generation).toEqual(expect.any(Number));
    expect(disk.ledgerDocumentId).toBe(docs[0]!.id);
    expect(disk.revision).toBe(signed!.payload.revision);
    expect(disk.digest).toBe(signed!.digest);

    const health = (await fetch(`${notary.url}/health`).then((res) => res.json())) as Record<string, unknown>;
    expect(health.status).toBe('ok');
    expect(health.mock === true || health.simulation === true).toBe(true);

    const cors = await fetch(`${notary.url}/api/state`, { headers: { origin: 'http://localhost:7400' } });
    expect(cors.headers.get('access-control-allow-origin')).toBe('http://localhost:7400');

    const stream = await fetch(`${notary.url}/api/events`);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const reader = stream.body!.getReader();
    let text = '';
    const deadline = Date.now() + 4_000;
    while (!text.includes('event: state') && Date.now() < deadline) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    await reader.cancel().catch(() => undefined);
    expect(text).toContain('event: state');
    expect(text).toContain('"mode":"offline"');

    for (const body of saidBodies(mock)) expect(body).not.toMatch(/[—–]/);
    expect(saidBodies(mock).some((body) => body.includes('offline simulation'))).toBe(true);
  });

  it('logs a bypass of @builder as a draft and does not hand off', async () => {
    env = await boot();
    const { mock, notary } = env;
    await mock.say('developer', '@said enroll RIYA0001');
    await mock.say('client', '@said enroll DANA0001');
    await waitFor('enrolled', async () => (await getState(notary.url)).signedLedger?.payload.parties.length === 2);

    await mock.say('client', "@builder Also add dark mode while you're in there");
    await waitFor('refusal', async () => (await getState(notary.url)).signedLedger?.payload.refusals.length === 1);

    const ledger = (await getState(notary.url)).signedLedger!.payload;
    expect(ledger.agreements).toHaveLength(0);
    expect(ledger.refusals).toHaveLength(1);
    expect(ledger.refusals[0]).toMatchObject({ target: 'builder', draftId: 'DRF-001' });
    expect(ledger.drafts[0]).toMatchObject({ id: 'DRF-001', status: 'NEEDS_TERMS' });
    expect(ledger.drafts[0]!.scope.toLowerCase()).toContain('dark mode');
    expect(mock.messages().some((m) => m.body.includes('said-start'))).toBe(false);
    expect(saidBodies(mock).some((body) => body.includes('Nothing has started'))).toBe(true);
    for (const body of saidBodies(mock)) expect(body).not.toMatch(/[—–]/);
  });

  it('sends a valid start token after both accept, and only the builder receipt updates the ledger', async () => {
    env = await boot();
    const { mock, notary, notaryKey, builderKey, builder } = env;
    await mock.say('developer', '@said enroll RIYA0001');
    await mock.say('client', '@said enroll DANA0001');
    await waitFor('enrolled', async () => (await getState(notary.url)).signedLedger?.payload.parties.length === 2);

    await mock.say('developer', '@said Propose: Add dark mode | Terms: +2 days, +$400');
    await waitFor('pending draft', async () => (await getState(notary.url)).signedLedger?.payload.drafts[0]?.status === 'PENDING');

    await mock.say('developer', '@said Accept DRF-001 v1');
    await waitFor('developer approval', async () => {
      const draft = (await getState(notary.url)).signedLedger?.payload.drafts[0];
      return Boolean(draft?.approvals.developer);
    });
    expect((await getState(notary.url)).signedLedger!.payload.agreements).toHaveLength(0);
    expect(mock.messages().some((m) => m.body.includes('said-start'))).toBe(false);

    await mock.say('client', '@said I accept DRF-001 v1');
    await waitFor('start token', async () => mock.messages().some((m) => m.body.includes('said-start')));

    const state = await getState(notary.url);
    const agreement = state.signedLedger!.payload.agreements[0]!;
    expect(agreement.id).toBe('AGR-001');
    expect(agreement.execution?.status).toBe('READY');
    expect(agreement.execution?.jobId).toBe('JOB-AGR-001-1');

    const targeted = mock.messages().filter((m) => m.body.includes('said-start'));
    expect(targeted).toHaveLength(1);
    expect(targeted[0]!.sender).toBe(env!.said.id);
    expect(targeted[0]!.body).toContain('Agreement AGR-001 is locked');
    const token = extractFencedJson<StartToken>(targeted[0]!.body, 'said-start');
    expect(token).not.toBeNull();
    expect(await verifyStartToken(token!, notaryKey.publicKey)).toBe(true);
    expect(token).toMatchObject({
      type: 'said.start/v1',
      roomId: BUSINESS,
      agreementId: 'AGR-001',
      jobId: 'JOB-AGR-001-1',
      termsHash: agreement.termsHash,
      ledgerRevision: state.signedLedger!.payload.revision,
      ledgerDocumentId: state.ledgerDocumentId,
      keyId: notaryKey.keyId,
    });

    const receipt = await signReceipt(
      {
        type: 'said.receipt/v1',
        roomId: BUSINESS,
        agreementId: 'AGR-001',
        jobId: 'JOB-AGR-001-1',
        status: 'COMPLETED',
        worker: 'scripted',
        baseCommit: 'a'.repeat(40),
        resultCommit: 'b'.repeat(40),
        changedPaths: ['src/App.tsx'],
        checks: [{ name: 'typecheck', ok: true, durationMs: 12, detail: 'ok' }],
        error: null,
        at: Date.now(),
        keyId: builderKey.keyId,
      },
      builderKey.privateKey,
    );
    const fenced = fenceJson('said-receipt', receipt);
    await mock.say('client', fenced);
    await waitFor('human receipt ignored', async () => saidBodies(mock).some((body) => body.includes('did not come from the builder')));
    expect((await getState(notary.url)).signedLedger!.payload.agreements[0]!.execution!.status).toBe('READY');

    const connectionId = crypto.randomUUID();
    const ops = new SwitchOps({ baseUrl: mock.url, agentId: builder.id, apiKey: builder.apiKey }, { connectionId });
    const conn = new SwitchConnection({
      creds: { baseUrl: mock.url, agentId: builder.id, apiKey: builder.apiKey },
      connectionId,
      rooms: [BUSINESS],
      filter: 'addressed',
      cursorStore: new MemoryCursorStore(),
      onEvent: async () => {},
      logger: silent,
      maxBackoffMs: 200,
    });
    await conn.start();
    try {
      await ops.connectToRoom(BUSINESS);
      await ops.postMessage(fenced);
      await waitFor('receipt recorded', async () => (await getState(notary.url)).signedLedger?.payload.agreements[0]?.execution?.status === 'COMPLETED');
    } finally {
      await conn.stop();
    }

    await waitFor('completed announcement', async () =>
      saidBodies(mock).some((body) => body.toLowerCase().includes('completed')),
    );
    const done = (await getState(notary.url)).signedLedger!;
    expect(done.payload.agreements[0]!.execution).toMatchObject({
      jobId: 'JOB-AGR-001-1',
      status: 'COMPLETED',
      resultCommit: 'b'.repeat(40),
    });
    expect(await verifySignedLedger(done, notaryKey.publicKey)).toEqual({ ok: true });
    expect(saidBodies(mock).some((body) => body.toLowerCase().includes('completed'))).toBe(true);
    for (const body of saidBodies(mock)) expect(body).not.toMatch(/[—–]/);
  });

  it('refuses to authorize when the ledger document is malformed and does not replace it', async () => {
    env = await boot({ badLedger: true });
    const { mock, notary } = env;
    await waitFor('halt announced', async () => saidBodies(mock).some((body) => body.includes('stopped authorizing')));

    const before = mock.documents(BUSINESS);
    expect(before).toHaveLength(1);
    const original = before[0]!.content;

    await mock.say('developer', '@said enroll RIYA0001');
    await mock.say('client', '@said enroll DANA0001');
    await mock.say('developer', '@said Propose: Add dark mode | Terms: +2 days, +$400');
    await waitFor('refused the proposal', async () => saidBodies(mock).filter((body) => body.includes('stopped authorizing')).length >= 2);

    const state = await getState(notary.url);
    expect(state.signedLedger).toBeNull();
    expect(state.halted?.reason.toLowerCase()).toMatch(/malformed|signature|unreadable|missing|does not check/);
    const docs = mock.documents(BUSINESS);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.content).toBe(original);
    expect(mock.messages().some((m) => m.body.includes('said-start'))).toBe(false);
    for (const body of saidBodies(mock)) expect(body).not.toMatch(/[—–]/);
  });

  it('does not hand off in a personal room', async () => {
    env = await boot({ personal: true });
    const { mock, notary } = env;
    await mock.say('sam', '@said enroll SAM00001');
    await mock.say('alex', '@said enroll ALEX0001');
    await waitFor('personal ledger', async () => (await getState(notary.url)).signedLedger?.payload.parties.length === 2);

    const enrolled = await getState(notary.url);
    expect(enrolled.signedLedger!.payload.parties.map((p) => p.senderId)).toEqual([SAM, ALEX]);

    await mock.say('sam', '@said Propose: Plan the picnic | Terms: Saturday at noon');
    await waitFor('picnic draft', async () => (await getState(notary.url)).signedLedger?.payload.drafts[0]?.status === 'PENDING');
    await mock.say('sam', '@said Accept DRF-001 v1');
    await mock.say('alex', '@said I accept DRF-001 v1');
    await waitFor('personal agreement', async () => (await getState(notary.url)).signedLedger?.payload.agreements.length === 1);

    const ledger = (await getState(notary.url)).signedLedger!.payload;
    expect(ledger.agreements[0]!.execution).toBeNull();
    expect(mock.messages().some((m) => m.body.includes('said-start'))).toBe(false);
    for (const body of saidBodies(mock)) expect(body).not.toMatch(/[—–]/);
  });

  it('refuses an agent that joins after connect, and locks an account after eight wrong codes', async () => {
    env = await boot();
    const { mock, notary } = env;
    const intruder = await registerAgent({
      baseUrl: mock.url,
      registrationKey: REGISTRATION_KEY,
      name: 'intruder',
      description: 'Late agent',
      displayName: 'Intruder',
    });
    const posted = await fetch(`${mock.url}/agents/${intruder.id}/message`, {
      method: 'POST',
      headers: { authorization: `Bearer ${intruder.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ room_id: BUSINESS, content: '@said enroll RIYA0001' }),
    });
    expect(posted.ok).toBe(true);
    await waitFor('agent refused', async () => saidBodies(mock).some((body) => body.includes('not for an agent')));

    for (let i = 0; i < 8; i++) await mock.say('developer', '@said enroll NOPE0000');
    await waitFor('eight wrong codes', async () => saidBodies(mock).filter((body) => body.includes('does not match')).length >= 8);
    await mock.say('developer', '@said enroll RIYA0001');
    await waitFor('locked out', async () => saidBodies(mock).some((body) => body.includes('Too many wrong codes')));

    const state = await getState(notary.url);
    expect(state.signedLedger).toBeNull();
    expect(state.enrollment?.roles.every((role) => role.bound === false)).toBe(true);
  });
});

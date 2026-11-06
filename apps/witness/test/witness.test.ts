import { describe, expect, it, vi } from 'vitest';
import { PRIVATE_TELEGRAM_ROOM_ID } from '../src/constants.js';
import {
  assertDemoHome,
  assertDemoNotaryUrl,
  assertDemoRoomId,
  assertDemoSwitchUrl,
  DemoGuardError,
} from '../src/ports.js';
import { readDemoState } from '../src/read.js';
import { createWitnessApp } from '../src/server.js';
import { projectWitness } from '../src/view.js';

const DEMO_ROOM = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-06T13:00:00.000Z';
const EVENT = '2026-11-06T12:00:00.000Z';

function liveState(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'live',
    switch: { url: 'http://127.0.0.1:8100', connected: true, version: '0.31.0' },
    room: { id: DEMO_ROOM, name: 'Said demo' },
    notaryPublicKey: 'secret-public-key',
    keyId: 'said-notary-key',
    ledgerDocumentId: 'doc-secret',
    enrollment: { roles: [{ role: 'developer', senderId: '@switch-user-riya:localhost', code: 'ABCD1234' }] },
    halted: null,
    signedLedger: {
      digest: 'abc',
      signature: 'c2lnbmF0dXJl',
      keyId: 'said-notary-key',
      payload: {
        roomId: DEMO_ROOM,
        updatedAt: Date.parse(EVENT),
        parties: [{ role: 'developer', label: 'Riya', senderId: '@switch-mattermost-user:localhost' }],
        drafts: [
          {
            id: 'DRF-001',
            version: 1,
            scope: 'Add dark mode',
            terms: '+2 days, +$400',
            status: 'LOCKED',
            request: { senderId: '@switch-user-dana:localhost', text: '@said enroll ABCD1234' },
            approvals: {
              developer: { senderId: '@switch-user-riya:localhost', text: 'Accept DRF-001 v1' },
              client: { senderId: '@switch-user-dana:localhost', text: 'Accept DRF-001 v1' },
            },
          },
        ],
        agreements: [
          {
            id: 'AGR-001',
            draftId: 'DRF-001',
            version: 1,
            terms: '+2 days, +$400',
            execution: {
              jobId: 'JOB-AGR-001-1',
              status: 'COMPLETED',
              worker: 'scripted',
              resultCommit: '5dfc874abc',
              checks: [
                { name: 'typecheck', ok: true, detail: 'secret log @switch-user-riya:localhost' },
                { name: 'build', ok: true, detail: 'ok' },
              ],
            },
          },
        ],
      },
    },
    ...extra,
  };
}

describe('demo guards', () => {
  it('pins the demo notary and switch and refuses reserved ports', () => {
    expect(assertDemoNotaryUrl('http://127.0.0.1:8110')).toBe('http://127.0.0.1:8110');
    expect(assertDemoSwitchUrl('http://127.0.0.1:8100')).toBe('http://127.0.0.1:8100');
    for (const raw of [
      'http://127.0.0.1:7410',
      'http://127.0.0.1:8000',
      'http://127.0.0.1:7420',
      'http://127.0.0.1:7400',
      'http://10.0.0.8:8110',
      'https://127.0.0.1:8110',
      'http://127.0.0.1:8110/?url=http://evil',
      'http://user:pass@127.0.0.1:8110',
    ]) {
      expect(() => assertDemoNotaryUrl(raw)).toThrow(DemoGuardError);
    }
    expect(() => assertDemoRoomId(PRIVATE_TELEGRAM_ROOM_ID)).toThrow(/private room/);
    expect(() => assertDemoHome('/tmp/.said')).toThrow(/\.said-demo/);
    expect(() => assertDemoHome('/tmp/.said-live')).toThrow(/\.said-demo/);
    expect(() => assertDemoHome('/work/.said-demo')).not.toThrow();
  });
});

describe('projectWitness', () => {
  it('publishes the whitelist and drops private fields', () => {
    const view = projectWitness(liveState(), { now: NOW, demoRoomId: DEMO_ROOM });
    expect(view.live).toBe(true);
    expect(view.source).toBe('switch');
    expect(view.access).toBe('read-only');
    expect(view.label).toBe('Read only');
    expect(view.writes).toBe(false);
    expect(view.worker).toBe('scripted');
    expect(view.heartbeatAt).toBe(NOW);
    expect(view.lastEventAt).toBe(EVENT);
    expect(view.heartbeatAt).not.toBe(view.lastEventAt);
    expect(view.drafts).toEqual([{ id: 'DRF-001', version: 1, scope: 'Add dark mode', terms: '+2 days, +$400', status: 'LOCKED' }]);
    expect(view.acceptances).toEqual([{ draftId: 'DRF-001', version: 1, developer: true, client: true }]);
    expect(view.lock).toMatchObject({ agreementId: 'AGR-001', draftId: 'DRF-001' });
    expect(view.work).toMatchObject({ jobId: 'JOB-AGR-001-1', status: 'COMPLETED', worker: 'scripted', resultCommit: '5dfc874' });
    const raw = JSON.stringify(view);
    expect(raw).not.toContain(PRIVATE_TELEGRAM_ROOM_ID);
    expect(raw).not.toContain('@switch-');
    expect(raw).not.toContain('enroll');
    expect(raw).not.toContain('signature');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('senderId');
    expect(raw).not.toContain('notaryPublicKey');
    expect(raw).not.toMatch(/said-start|apiKey|BEGIN /);
  });

  it('shows a connected room with no ledger as live and eventless', () => {
    const state = liveState();
    delete state.signedLedger;
    const view = projectWitness(state, { now: NOW, demoRoomId: DEMO_ROOM });
    expect(view.live).toBe(true);
    expect(view.source).toBe('switch');
    expect(view.lastEventAt).toBeNull();
    expect(view.heartbeatAt).toBe(NOW);
    expect(view.drafts).toEqual([]);
    expect(view.lock).toBeNull();
    expect(view.work).toBeNull();
    expect(view.worker).toBeNull();
  });

  it('fails closed for the private room, mock mode, codex, and the current switch port', () => {
    expect(projectWitness(liveState({ room: { id: PRIVATE_TELEGRAM_ROOM_ID, name: 'Telegram' } }), { now: NOW, demoRoomId: PRIVATE_TELEGRAM_ROOM_ID }).live).toBe(false);
    expect(projectWitness(liveState({ mode: 'offline' }), { now: NOW, demoRoomId: DEMO_ROOM })).toMatchObject({
      live: false,
      source: 'offline',
      drafts: [],
    });
    const codex = liveState();
    const agreements = (codex.signedLedger as { payload: { agreements: Array<{ execution: { worker: string } }> } }).payload.agreements;
    agreements[0]!.execution.worker = 'codex';
    expect(projectWitness(codex, { now: NOW, demoRoomId: DEMO_ROOM }).reason).toBe('Demo worker must be scripted');
    expect(projectWitness(liveState({ switch: { url: 'http://127.0.0.1:8000', connected: true, version: '0.31.0' } }), { now: NOW, demoRoomId: DEMO_ROOM }).source).toBe('offline');
    expect(projectWitness(liveState({ switch: { url: 'http://127.0.0.1:8100', connected: false, version: '0.31.0' } }), { now: NOW, demoRoomId: DEMO_ROOM }).reason).toBe('Switch is not connected');
    expect(projectWitness(null, { now: NOW, demoRoomId: DEMO_ROOM })).toMatchObject({ live: false, heartbeatAt: null });
  });
});

describe('witness HTTP', () => {
  it('is read only, ignores query overrides, and hides thrown errors', async () => {
    const readState = vi.fn(async () => liveState());
    const app = createWitnessApp({ readState, demoRoomId: DEMO_ROOM, now: () => NOW, allowOrigin: 'https://said-switch.pages.dev' });

    const ok = await app.request('http://127.0.0.1:8130/api/witness', { headers: { origin: 'https://said-switch.pages.dev' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://said-switch.pages.dev');
    expect(readState).toHaveBeenCalledTimes(1);

    const evil = await app.request('http://127.0.0.1:8130/api/witness', { headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    expect(readState).toHaveBeenCalledTimes(2);

    const redirected = await app.request('http://127.0.0.1:8130/api/witness?url=http://127.0.0.1:7410&upstream=http://example');
    expect(redirected.status).toBe(400);
    expect(await redirected.json()).toEqual({ error: 'request refused' });
    expect(readState).toHaveBeenCalledTimes(2);

    for (const path of ['/api/jobs', '/api/state', '/api/events', '/api/witness/start']) {
      const res = await app.request(`http://127.0.0.1:8130${path}`, { method: 'POST', body: '{"prompt":"rm"}' });
      expect(res.status).toBe(404);
    }
    const posted = await app.request('http://127.0.0.1:8130/api/witness', { method: 'POST' });
    expect(posted.status).toBe(404);
    expect(readState).toHaveBeenCalledTimes(2);

    const health = await app.request('http://127.0.0.1:8130/health');
    expect(await health.json()).toEqual({ status: 'ok', role: 'witness', writes: false });
  });

  it('turns a reader failure into an offline view with no stack', async () => {
    const app = createWitnessApp({
      demoRoomId: DEMO_ROOM,
      now: () => NOW,
      readState: async () => {
        throw new Error('socket hang up at /Users/private/.env SAID_HTTP_SHARED_SECRET=super');
      },
    });
    const res = await app.request('http://127.0.0.1:8130/api/witness');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toMatch(/super|hang up|\.env|at \//);
    expect(JSON.parse(body)).toMatchObject({ live: false, source: 'offline', reason: 'Demo source is not ready', drafts: [] });
  });
});

describe('readDemoState', () => {
  it('reads only the pinned notary path and sends the secret as a header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ mode: 'live' }), { status: 200 }));
    await readDemoState({ notaryUrl: 'http://127.0.0.1:8110', secret: 'demo-secret', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8110/api/state', {
      method: 'GET',
      headers: { accept: 'application/json', 'x-said-shared-secret': 'demo-secret' },
      redirect: 'error',
    });
    await expect(readDemoState({ notaryUrl: 'http://127.0.0.1:7410', secret: '', fetchImpl })).rejects.toThrow(DemoGuardError);
  });
});

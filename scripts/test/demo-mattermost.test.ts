import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DemoGuardError } from '@said/witness';
import {
  FIXTURE_CLIENT,
  FIXTURE_DEVELOPER,
  assertFixtureTargets,
  createFixtureRoom,
  driveFixtureConsent,
  fixtureRoomArgs,
  fixtureUsers,
  httpMattermostClient,
  provisionFixtureUsers,
} from '../lib/demo-mattermost.js';

const CHANNEL = 'abcdefghijklmnopqrstuvwxyz';

describe('fixture targets', () => {
  it('allows only the demo Mattermost and demo notary', () => {
    expect(assertFixtureTargets({ mattermostUrl: 'http://127.0.0.1:8165', notaryUrl: 'http://127.0.0.1:8110' })).toEqual({
      mattermostUrl: 'http://127.0.0.1:8165',
      notaryUrl: 'http://127.0.0.1:8110',
    });
    expect(() => assertFixtureTargets({ mattermostUrl: 'http://127.0.0.1:8065', notaryUrl: 'http://127.0.0.1:8110' })).toThrow(DemoGuardError);
    expect(() => assertFixtureTargets({ mattermostUrl: 'http://127.0.0.1:8165', notaryUrl: 'http://127.0.0.1:7410' })).toThrow(DemoGuardError);
  });
});

describe('fixture room', () => {
  it('asks Switch for a private Mattermost room and names the fixture accounts', async () => {
    const calls: Array<{ op: string; args: Record<string, unknown> }> = [];
    const room = await createFixtureRoom({
      call: async (op, args) => {
        calls.push({ op, args });
        if (op === 'list_bridges') return [{ id: 'bridge-mm', type: 'mattermost' }];
        return { id: 'room-fixture', name: 'Said fixture demo' };
      },
    });
    expect(room).toEqual({ id: 'room-fixture', name: 'Said fixture demo' });
    expect(calls[1]?.args).toEqual(fixtureRoomArgs('bridge-mm'));
    expect(JSON.stringify(calls)).not.toContain('internal_only');
    expect(JSON.stringify(calls)).not.toContain('8bab483d');
  });
});

describe('fixture consent over HTTP', () => {
  let server: Server;
  const posts: string[] = [];
  let locked = false;

  afterEach(async () => {
    posts.length = 0;
    locked = false;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates fixture users and waits for the notary to record AGR-001', async () => {
    server = createServer((req, res) => {
      const url = req.url ?? '';
      if (req.method === 'POST' && url === '/api/v4/users/login') {
        res.setHeader('Token', 'local-token');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"id":"u","username":"fixture"}');
        return;
      }
      if (req.method === 'POST' && url === '/api/v4/users') {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"id":"u"}');
        return;
      }
      if (req.method === 'POST' && url === '/api/v4/posts') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { message?: string };
          posts.push(body.message ?? '');
          if (posts.length === 6) locked = true;
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end('{"id":"p"}');
        });
        return;
      }
      if (req.method === 'GET' && url === '/api/state') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(locked ? { signedLedger: { payload: { agreements: [{ id: 'AGR-001' }] } } } : { signedLedger: null }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const users = fixtureUsers({ developer: 'pw-dev', client: 'pw-client' });
    const client = {
      async request(path: string, init: { method: string; token?: string; body?: unknown }) {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (init.token) headers.authorization = `Bearer ${init.token}`;
        const res = await fetch(`${base}${path}`, {
          method: init.method,
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        const token = res.headers.get('Token');
        const json = (await res.json()) as unknown;
        return { status: res.status, json, token };
      },
    };
    await provisionFixtureUsers(client, { username: 'admin', password: 'admin-pw' }, users);
    await driveFixtureConsent({
      client,
      channelId: CHANNEL,
      users,
      codes: { developer: 'DEVCODE1', client: 'CLICODE1' },
      readNotary: async () => {
        const res = await fetch(`${base}/api/state`);
        return res.json() as Promise<unknown>;
      },
    });
    expect(posts.map((message) => message.replace(/enroll\s+\S+/, 'enroll [code]'))).toEqual([
      '@said enroll [code]',
      '@said enroll [code]',
      "@builder Also add dark mode while you're in there",
      'Terms DRF-001: +2 days, +$400',
      'Accept DRF-001 v1',
      'Accept DRF-001 v1',
    ]);
    expect(posts.join('\n')).toContain('DEVCODE1');
    expect(() => httpMattermostClient('http://127.0.0.1:8065')).toThrow(DemoGuardError);
    expect(FIXTURE_DEVELOPER).toBe('fixture-developer');
    expect(FIXTURE_CLIENT).toBe('fixture-client');
  });
});

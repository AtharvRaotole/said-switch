import { assertDemoMattermostUrl, assertDemoNotaryUrl, DemoGuardError } from '@said/witness';

export const FIXTURE_DEVELOPER = 'fixture-developer';
export const FIXTURE_CLIENT = 'fixture-client';
export const FIXTURE_ROOM_NAME = 'Said fixture demo';
export const FIXTURE_LINES = [
  'builder-ask',
  'terms',
  'developer-accept',
  'client-accept',
] as const;

export interface FixtureUser {
  username: typeof FIXTURE_DEVELOPER | typeof FIXTURE_CLIENT;
  email: string;
  password: string;
}

export interface MattermostClient {
  request(path: string, init: { method: string; token?: string; body?: unknown }): Promise<{ status: number; json: unknown; token: string | null }>;
}

export function httpMattermostClient(baseUrl: string, fetchImpl: typeof fetch = fetch): MattermostClient {
  const origin = assertDemoMattermostUrl(baseUrl);
  return {
    async request(path, init) {
      if (!path.startsWith('/api/v4/')) throw new DemoGuardError('Mattermost path is not an API path');
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (init.token) headers.authorization = `Bearer ${init.token}`;
      const res = await fetchImpl(`${origin}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: 'error',
      });
      const token = res.headers.get('Token') || res.headers.get('token');
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          json = null;
        }
      }
      return { status: res.status, json, token };
    },
  };
}

/** The two local accounts. Passwords stay with the caller and are never logged here. */
export function fixtureUsers(passwords: { developer: string; client: string }): FixtureUser[] {
  return [
    { username: FIXTURE_DEVELOPER, email: 'fixture-developer@localhost.invalid', password: passwords.developer },
    { username: FIXTURE_CLIENT, email: 'fixture-client@localhost.invalid', password: passwords.client },
  ];
}

export function fixtureRoomArgs(bridgeId: string): Record<string, unknown> {
  return {
    name: FIXTURE_ROOM_NAME,
    description: 'Local Mattermost fixture accounts. Not two people.',
    agent_names: ['said', 'builder'],
    user_names: [FIXTURE_DEVELOPER, FIXTURE_CLIENT],
    channel_type: 'channel_private',
    bridge_id: bridgeId,
  };
}

export async function createFixtureRoom(ops: {
  call: (op: string, args: Record<string, unknown>) => Promise<unknown>;
}): Promise<{ id: string; name: string }> {
  const bridges = await ops.call('list_bridges', {});
  if (!Array.isArray(bridges)) throw new DemoGuardError('Demo Switch did not list bridges');
  const mattermost = bridges.find((item) => item && typeof item === 'object' && (item as { type?: unknown }).type === 'mattermost');
  const bridgeId = mattermost && typeof mattermost === 'object' ? (mattermost as { id?: unknown }).id : undefined;
  if (typeof bridgeId !== 'string' || !bridgeId) throw new DemoGuardError('Demo Switch has no Mattermost bridge');
  const created = await ops.call('create_room', fixtureRoomArgs(bridgeId));
  const id = created && typeof created === 'object' ? (created as { id?: unknown }).id : undefined;
  const name = created && typeof created === 'object' ? (created as { name?: unknown }).name : undefined;
  if (typeof id !== 'string' || typeof name !== 'string') throw new DemoGuardError('create_room did not return a room');
  return { id, name };
}

export function assertFixtureTargets(input: { mattermostUrl: string; notaryUrl: string }): { mattermostUrl: string; notaryUrl: string } {
  return {
    mattermostUrl: assertDemoMattermostUrl(input.mattermostUrl),
    notaryUrl: assertDemoNotaryUrl(input.notaryUrl),
  };
}

async function login(client: MattermostClient, username: string, password: string): Promise<string> {
  const res = await client.request('/api/v4/users/login', {
    method: 'POST',
    body: { login_id: username, password },
  });
  if (res.status !== 200 || !res.token) throw new DemoGuardError(`Mattermost login failed for ${username}`);
  return res.token;
}

/** Create the fixture accounts with the same admin call Switch 0.31 setup uses. */
export async function findFixtureChannel(client: MattermostClient, admin: { username: string; password: string }, teamName: string): Promise<string> {
  const adminToken = await login(client, admin.username, admin.password);
  const team = await client.request(`/api/v4/teams/name/${encodeURIComponent(teamName)}`, { method: 'GET', token: adminToken });
  const teamId = team.json && typeof team.json === 'object' ? (team.json as { id?: unknown }).id : undefined;
  if (team.status !== 200 || typeof teamId !== 'string') throw new DemoGuardError('Demo team was not found');
  const channels = await client.request(`/api/v4/teams/${encodeURIComponent(teamId)}/channels`, { method: 'GET', token: adminToken });
  if (channels.status !== 200 || !Array.isArray(channels.json)) throw new DemoGuardError('Demo channels were not readable');
  const match = channels.json.find((item) => item && typeof item === 'object' && (item as { display_name?: unknown }).display_name === FIXTURE_ROOM_NAME);
  const id = match && typeof match === 'object' ? (match as { id?: unknown }).id : undefined;
  if (typeof id !== 'string' || !/^[a-z0-9]{26}$/.test(id)) throw new DemoGuardError('Fixture channel was not found');
  return id;
}

export async function provisionFixtureUsers(client: MattermostClient, admin: { username: string; password: string }, users: FixtureUser[]): Promise<void> {
  const adminToken = await login(client, admin.username, admin.password);
  for (const user of users) {
    const created = await client.request('/api/v4/users', {
      method: 'POST',
      token: adminToken,
      body: { username: user.username, email: user.email, password: user.password },
    });
    if (created.status !== 201 && created.status !== 400) {
      throw new DemoGuardError(`Mattermost user create failed for ${user.username}`);
    }
    await login(client, user.username, user.password);
  }
}

export interface DriveInput {
  client: MattermostClient;
  channelId: string;
  users: FixtureUser[];
  /** Enrollment codes already issued for this demo room. Not logged. */
  codes: { developer: string; client: string };
  readNotary: () => Promise<unknown>;
}

function locked(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false;
  const agreements = (state as { signedLedger?: { payload?: { agreements?: unknown } } }).signedLedger?.payload?.agreements;
  if (!Array.isArray(agreements)) return false;
  return agreements.some((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === 'AGR-001');
}

/**
 * Post the fixed consent lines as the fixture accounts, then wait until the
 * notary's own state shows AGR-001. This function does not write a ledger.
 */
export async function driveFixtureConsent(input: DriveInput): Promise<void> {
  if (!/^[a-z0-9]{26}$/.test(input.channelId)) throw new DemoGuardError('Demo channel id is not a Mattermost id');
  const developer = input.users.find((user) => user.username === FIXTURE_DEVELOPER);
  const clientUser = input.users.find((user) => user.username === FIXTURE_CLIENT);
  if (!developer || !clientUser) throw new DemoGuardError('Fixture accounts are incomplete');
  const developerToken = await login(input.client, developer.username, developer.password);
  const clientToken = await login(input.client, clientUser.username, clientUser.password);
  const posts: Array<{ token: string; message: string }> = [
    { token: developerToken, message: `@said enroll ${input.codes.developer}` },
    { token: clientToken, message: `@said enroll ${input.codes.client}` },
    { token: clientToken, message: "@builder Also add dark mode while you're in there" },
    { token: developerToken, message: 'Terms DRF-001: +2 days, +$400' },
    { token: developerToken, message: 'Accept DRF-001 v1' },
    { token: clientToken, message: 'Accept DRF-001 v1' },
  ];
  for (const post of posts) {
    const res = await input.client.request('/api/v4/posts', {
      method: 'POST',
      token: post.token,
      body: { channel_id: input.channelId, message: post.message },
    });
    if (res.status !== 201) throw new DemoGuardError('Mattermost post failed');
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (locked(await input.readNotary())) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new DemoGuardError('The demo notary did not record AGR-001');
}

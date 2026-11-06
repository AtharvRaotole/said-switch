/**
 * Create two local Mattermost fixture accounts on the demo server, and
 * optionally post the fixed consent lines through the Mattermost API.
 * Fixture accounts are not people. Refuses every port except 8165 and 8110.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSecrets, saveConfig, saveSecrets } from '@said/runtime';
import { SwitchOps, registerAgent } from '@said/switch-client';
import { assertDemoHome, DemoGuardError } from '@said/witness';
import { deploymentIdFor } from './lib/deployment.js';
import { demoLaunchFrom } from './lib/demo-guard.js';
import {
  assertFixtureTargets,
  createFixtureRoom,
  driveFixtureConsent,
  findFixtureChannel,
  fixtureUsers,
  httpMattermostClient,
  provisionFixtureUsers,
} from './lib/demo-mattermost.js';

async function main(): Promise<void> {
  const home = process.env.SAID_HOME?.trim() || '';
  assertDemoHome(home);
  const targets = assertFixtureTargets({
    mattermostUrl: process.env.MATTERMOST_URL?.trim() || 'http://127.0.0.1:8165',
    notaryUrl: process.env.SAID_DEMO_NOTARY_URL?.trim() || 'http://127.0.0.1:8110',
  });
  const adminUser = process.env.MATTERMOST_ADMIN_USER?.trim() || '';
  const adminPassword = process.env.MATTERMOST_ADMIN_PASSWORD?.trim() || '';
  if (!adminUser || !adminPassword) throw new DemoGuardError('Set MATTERMOST_ADMIN_USER and MATTERMOST_ADMIN_PASSWORD for the demo server');
  const admin = { username: adminUser, password: adminPassword };
  const accountsPath = join(home, 'fixture-accounts.json');
  let users = fixtureUsers({
    developer: randomBytes(18).toString('base64url'),
    client: randomBytes(18).toString('base64url'),
  });
  try {
    const saved = JSON.parse(await readFile(accountsPath, 'utf8')) as { users?: Array<{ username?: string; email?: string; password?: string }> };
    const developer = saved.users?.find((user) => user.username === 'fixture-developer');
    const clientUser = saved.users?.find((user) => user.username === 'fixture-client');
    if (developer?.password && clientUser?.password && developer.email && clientUser.email) {
      users = [
        { username: 'fixture-developer', email: developer.email, password: developer.password },
        { username: 'fixture-client', email: clientUser.email, password: clientUser.password },
      ];
    }
  } catch {
    // First run writes the file below.
  }
  const client = httpMattermostClient(targets.mattermostUrl);
  await provisionFixtureUsers(client, admin, users);
  await mkdir(home, { recursive: true });
  await writeFile(accountsPath, `${JSON.stringify({ accounts: 'demo-fixtures', users }, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write('Fixture accounts are ready. Passwords stay in .said-demo/fixture-accounts.json. These are not people.\n');

  if (process.env.SWITCH_REGISTRATION_KEY?.trim() && process.env.SWITCH_URL?.trim()) {
    const launch = demoLaunchFrom(process.env);
    process.env.SAID_HOME = launch.home;
    const agentsPath = join(launch.home, 'demo-agents.json');
    let said: { id: string; apiKey: string };
    let builder: { id: string; apiKey: string };
    try {
      const saved = JSON.parse(await readFile(agentsPath, 'utf8')) as { saidId?: unknown; builderId?: unknown };
      const secrets = await loadSecrets();
      if (typeof saved.saidId !== 'string' || typeof saved.builderId !== 'string' || !secrets.builderApiKey) throw new Error('incomplete');
      said = { id: saved.saidId, apiKey: secrets.saidApiKey };
      builder = { id: saved.builderId, apiKey: secrets.builderApiKey };
    } catch {
      said = await registerAgent({
        baseUrl: launch.switchUrl,
        registrationKey: launch.registrationKey,
        name: 'said',
        description: 'Said demo notary for fixture accounts.',
        displayName: 'said',
      });
      builder = await registerAgent({
        baseUrl: launch.switchUrl,
        registrationKey: launch.registrationKey,
        name: 'builder',
        description: 'Said demo builder. Scripted worker only.',
        displayName: 'builder',
      });
      await saveSecrets({ saidApiKey: said.apiKey, builderApiKey: builder.apiKey });
      await writeFile(agentsPath, `${JSON.stringify({ saidId: said.id, builderId: builder.id }, null, 2)}\n`, { mode: 0o600 });
    }
    const room = await createFixtureRoom(new SwitchOps({ baseUrl: launch.switchUrl, agentId: said.id, apiKey: said.apiKey }));
    await saveConfig({
      mode: 'live',
      switchUrl: launch.switchUrl,
      deploymentId: deploymentIdFor(launch.switchUrl),
      roomId: room.id,
      roomName: room.name,
      roomMode: 'business',
      said: { agentId: said.id, name: 'said' },
      builder: { agentId: builder.id, name: 'builder' },
      worker: 'scripted',
    });
    await writeFile(join(home, 'demo-room.json'), `${JSON.stringify({ id: room.id, name: room.name, accounts: 'demo-fixtures' }, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`Fixture room ${room.id}. Export SAID_DEMO_ROOM_ID and SAID_ROOM_ID to that id.\n`);
  }

  if (!process.argv.includes('--drive')) return;
  const roomId = process.env.SAID_DEMO_ROOM_ID?.trim() || '';
  if (roomId === '8bab483d-b9b1-4dc6-8f3c-8323fcd7916b') throw new DemoGuardError('Refusing the private room');
  const enrollment = JSON.parse(await readFile(join(home, 'enrollment.json'), 'utf8')) as {
    codes?: Array<{ role?: string; code?: string }>;
  };
  const developer = enrollment.codes?.find((item) => item.role === 'developer')?.code;
  const clientCode = enrollment.codes?.find((item) => item.role === 'client')?.code;
  if (!developer || !clientCode) throw new DemoGuardError('Demo enrollment codes are missing. Run npm run enroll against .said-demo first.');
  const channelId = await findFixtureChannel(client, admin, process.env.MATTERMOST_TEAM_NAME?.trim() || 'switch');
  await driveFixtureConsent({
    client,
    channelId,
    users,
    codes: { developer, client: clientCode },
    readNotary: async () => {
      const headers: Record<string, string> = { accept: 'application/json' };
      const secret = process.env.SAID_DEMO_HTTP_SECRET?.trim();
      if (secret) headers['x-said-shared-secret'] = secret;
      const res = await fetch(`${targets.notaryUrl}/api/state`, { headers, redirect: 'error' });
      if (!res.ok) throw new DemoGuardError('Demo notary did not answer');
      return res.json() as Promise<unknown>;
    },
  });
  process.stdout.write('The demo notary recorded AGR-001 from fixture accounts. This is not two people consenting.\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : 'Fixture setup failed'}\n`);
  process.exit(1);
});
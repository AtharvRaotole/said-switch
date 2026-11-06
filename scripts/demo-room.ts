/**
 * Create an internal-only room on the dedicated demo Switch (port 8100).
 * No messaging bridge, no usernames, no Telegram bot.
 * Run only with SAID_HOME=.said-demo and SWITCH_URL=http://127.0.0.1:8100.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSecrets, saveConfig, saveSecrets } from '@said/runtime';
import { SwitchApiError, SwitchOps, registerAgent } from '@said/switch-client';
import { deploymentIdFor } from './lib/deployment.js';
import { demoLaunchFrom } from './lib/demo-guard.js';

const SAID_DESCRIPTION = 'Said demo notary. Read only public view. Scripted worker.';
const BUILDER_DESCRIPTION = 'Said demo builder. Scripted worker only.';

async function main(): Promise<void> {
  const launch = demoLaunchFrom(process.env);
  process.env.SAID_HOME = launch.home;
  await mkdir(launch.home, { recursive: true });

  const agentsPath = join(launch.home, 'demo-agents.json');
  let said: { id: string; apiKey: string };
  let builder: { id: string; apiKey: string };
  try {
    const saved = JSON.parse(await readFile(agentsPath, 'utf8')) as { saidId?: unknown; builderId?: unknown };
    const secrets = await loadSecrets();
    if (typeof saved.saidId !== 'string' || typeof saved.builderId !== 'string' || !secrets.builderApiKey) {
      throw new Error('incomplete');
    }
    said = { id: saved.saidId, apiKey: secrets.saidApiKey };
    builder = { id: saved.builderId, apiKey: secrets.builderApiKey };
  } catch {
    said = await registerAgent({
      baseUrl: launch.switchUrl,
      registrationKey: launch.registrationKey,
      name: 'said',
      description: SAID_DESCRIPTION,
      displayName: 'said',
    });
    builder = await registerAgent({
      baseUrl: launch.switchUrl,
      registrationKey: launch.registrationKey,
      name: 'builder',
      description: BUILDER_DESCRIPTION,
      displayName: 'builder',
    });
    await saveSecrets({ saidApiKey: said.apiKey, builderApiKey: builder.apiKey });
    await writeFile(agentsPath, `${JSON.stringify({ saidId: said.id, builderId: builder.id }, null, 2)}\n`, { mode: 0o600 });
  }

  const room = await new SwitchOps({ baseUrl: launch.switchUrl, agentId: said.id, apiKey: said.apiKey }).createInternalRoom({
    name: 'Said demo',
    description: 'Internal demo room for the read-only witness. No messaging bridge.',
    agentNames: ['said', 'builder'],
  });
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
  await writeFile(join(launch.home, 'demo-room.json'), `${JSON.stringify({ id: room.id, name: room.name }, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Demo room ${room.id} written to ${launch.home}/demo-room.json\n`);
  process.stdout.write('Export SAID_DEMO_ROOM_ID and SAID_ROOM_ID to that id, then run npm run register with SAID_HOME=.said-demo.\n');
}

main().catch((err: unknown) => {
  if (err instanceof SwitchApiError) {
    process.stderr.write(`Switch refused demo room setup (${err.status}).\n`);
  } else {
    process.stderr.write(`${err instanceof Error ? err.message : 'Demo room setup failed'}\n`);
  }
  process.exit(1);
});

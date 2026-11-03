/**
 * `npm run register` — live mode: registers `said` and `builder` on a real Switch server, sets who may
 * address them, saves config.json + secrets.json, and checks they are in the room.
 *
 *   npm run register                 # first time
 *   npm run register -- --overwrite  # rotate keys of agents that already exist (ids stay)
 *   npm run register -- --no-builder # personal room: only Said
 */
import {
  ConfigMissingError,
  loadConfig,
  loadEnv,
  loadSecrets,
  saveConfig,
  saveSecrets,
  type SaidConfig,
} from '@said/runtime';
import { SwitchApiError, SwitchOps, health } from '@said/switch-client';
import { parseFlags } from './lib/args.js';
import { deploymentIdFor, normalizeSwitchUrl } from './lib/deployment.js';
import { c, die, errorMessage, fail, fixLine, info, ok, out, step, warn } from './lib/output.js';
import {
  ensureAddressing,
  manualAddressingFix,
  registerOne,
  RegistrationConflictError,
  roomIdsOf,
  type AddressingOutcome,
  type AgentHandle,
  type RegisteredAgent,
} from './lib/register.js';

const SAID_DESCRIPTION =
  'Said: bilateral consent notary. Turns requests into numbered drafts and records a signed agreement only when both enrolled parties accept the same terms.';
const BUILDER_DESCRIPTION =
  'Said builder: runs a coding agent only on a signed Said authorization, after re-verifying both approvals itself.';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    die(
      `${name} is not set.`,
      `Put it in .env (see docs/SETUP_LIVE.md §3). ${name === 'SAID_ROOM_ID' ? 'Switch Console shows the room id in the room settings.' : ''}`.trim(),
    );
  }
  return value;
}

function describeOutcome(o: AddressingOutcome): void {
  const how = o.method === 'unchanged' ? 'already set' : o.method === 'self' ? 'set with its own key' : o.method === 'peer' ? "set with the other agent's key" : 'NOT set';
  const line = `${o.name}: addressing ${c.bold(String(o.effective ?? 'unknown'))} (${how})`;
  if (o.method === 'manual') fail(line);
  else ok(line);
  for (const n of o.notes) info(c.dim(n));
}

async function main(): Promise<void> {
  const { values: flags } = parseFlags({
    overwrite: { type: 'boolean' },
    'no-builder': { type: 'boolean' },
  });
  loadEnv();

  const switchUrl = required('SWITCH_URL').replace(/\/+$/, '');
  const registrationKey = required('SWITCH_REGISTRATION_KEY');
  const roomId = required('SAID_ROOM_ID');
  const saidName = process.env.SAID_AGENT_NAME?.trim() || 'said';
  const builderName = process.env.BUILDER_AGENT_NAME?.trim() || 'builder';
  const roomMode = (process.env.SAID_MODE?.trim() || 'business') as SaidConfig['roomMode'];
  const worker = (process.env.SAID_WORKER?.trim() || 'claude') as SaidConfig['worker'];
  if (roomMode !== 'business' && roomMode !== 'personal') die(`SAID_MODE must be "business" or "personal", got "${roomMode}".`);
  if (!['claude', 'codex', 'scripted'].includes(worker)) die(`SAID_WORKER must be claude, codex or scripted, got "${worker}".`);
  if (flags['no-builder'] && roomMode === 'business') {
    die('--no-builder only makes sense for a personal room.', 'Set SAID_MODE=personal in .env, or drop the flag.');
  }
  const withBuilder = roomMode === 'business';

  step('Checking the Switch server');
  try {
    new URL(switchUrl);
  } catch {
    die(`SWITCH_URL "${switchUrl}" is not a valid URL.`, 'Example: http://localhost:8000');
  }
  if (!(await health(switchUrl))) {
    fail(`GET ${switchUrl}/health did not answer 200.`);
    fixLine('SWITCH_URL must be the agent bridge base URL of your Switch server (the address Switch Console shows for the server).');
    fixLine('It is NOT the Gateway/admin web URL or the Mattermost URL. Open `<SWITCH_URL>/health` in a browser: it should say ok.');
    fixLine('Is the server running? Switch Console should say "Running locally".');
    process.exit(1);
  }
  ok(`Switch answers at ${switchUrl}`);

  // Reuse working credentials from a previous run (keys are shown only once by Switch).
  let existing: { config: SaidConfig; saidKey: string; builderKey: string | null } | null = null;
  try {
    const [config, secrets] = await Promise.all([loadConfig(), loadSecrets()]);
    if (config.mode === 'live' && normalizeSwitchUrl(config.switchUrl) === normalizeSwitchUrl(switchUrl)) {
      existing = { config, saidKey: secrets.saidApiKey, builderKey: secrets.builderApiKey };
    }
  } catch (err) {
    if (!(err instanceof ConfigMissingError)) warn(`Ignoring unreadable saved config: ${errorMessage(err)}`);
  }

  const keyWorks = async (creds: { agentId: string; apiKey: string }): Promise<boolean> => {
    try {
      await new SwitchOps({ baseUrl: switchUrl, ...creds }).listOps();
      return true;
    } catch {
      return false;
    }
  };

  step('Registering agents');
  const overwrite = flags.overwrite === true;
  let said!: RegisteredAgent;
  let builder: RegisteredAgent | undefined;
  try {
    said = await registerOne(
      {
        baseUrl: switchUrl,
        registrationKey,
        name: saidName,
        description: SAID_DESCRIPTION,
        displayName: 'Said',
        overwrite,
        existing: existing && existing.config.said.name === saidName ? { agentId: existing.config.said.agentId, apiKey: existing.saidKey } : null,
      },
      { keyWorks },
    );
    ok(`${saidName}: ${said.reused ? 'already registered, reusing saved key' : overwrite ? 'registered (--overwrite: any older key was replaced)' : 'registered'} (agent ${said.id})`);
    if (withBuilder) {
      builder = await registerOne(
        {
          baseUrl: switchUrl,
          registrationKey,
          name: builderName,
          description: BUILDER_DESCRIPTION,
          displayName: 'Said Builder',
          overwrite,
          existing:
            existing?.config.builder && existing.builderKey && existing.config.builder.name === builderName
              ? { agentId: existing.config.builder.agentId, apiKey: existing.builderKey }
              : null,
        },
        { keyWorks },
      );
      ok(`${builderName}: ${builder.reused ? 'already registered, reusing saved key' : overwrite ? 'registered (--overwrite: any older key was replaced)' : 'registered'} (agent ${builder.id})`);
    }
  } catch (err) {
    if (err instanceof RegistrationConflictError) die(err.message);
    if (err instanceof SwitchApiError && (err.status === 401 || err.status === 403)) {
      die(`Switch refused the registration key (${err.status}).`, 'Create a key of type "registration" in the Switch Gateway → API Keys, and put it in SWITCH_REGISTRATION_KEY.');
    }
    die(`Registration failed: ${errorMessage(err)}`);
  }

  // Persist immediately: the API keys exist nowhere else.
  const saidOps = new SwitchOps({ baseUrl: switchUrl, agentId: said.id, apiKey: said.apiKey });
  const builderOps = builder ? new SwitchOps({ baseUrl: switchUrl, agentId: builder.id, apiKey: builder.apiKey }) : null;
  let roomName: string | null = null;
  try {
    roomName = (await saidOps.listRooms()).find((r) => r.room_id === roomId)?.name ?? null;
  } catch {
    // listing is a convenience only
  }
  await saveSecrets({ saidApiKey: said.apiKey, builderApiKey: builder?.apiKey ?? null });
  await saveConfig({
    mode: 'live',
    switchUrl,
    deploymentId: deploymentIdFor(switchUrl),
    roomId,
    roomName,
    roomMode,
    said: { agentId: said.id, name: saidName },
    builder: builder ? { agentId: builder.id, name: builderName } : null,
    worker,
  });
  ok('Saved config.json and secrets.json (secrets are mode 0600 and git-ignored)');

  step('Setting who may address each agent');
  const saidHandle: AgentHandle = { name: saidName, id: said.id, ops: saidOps };
  const builderHandle: AgentHandle | null = builder && builderOps ? { name: builderName, id: builder.id, ops: builderOps } : null;
  let blocked = false;
  try {
    const saidOutcome = await ensureAddressing(saidHandle, 'anyone', builderHandle);
    describeOutcome(saidOutcome);
    if (saidOutcome.method === 'manual') {
      blocked = true;
      fixLine(`${manualAddressingFix(saidName, 'anyone')}`);
      fixLine('Without this the client (who is not linked to Switch) cannot talk to Said, and Switch will refuse them in the room.');
    }
    if (builderHandle) {
      const builderOutcome = await ensureAddressing(builderHandle, 'owner_and_owner_agents', saidHandle);
      describeOutcome(builderOutcome);
      if (builderOutcome.method === 'manual') {
        blocked = true;
        fixLine(`${manualAddressingFix(builderName, 'owner_and_owner_agents')}`);
      }
    }
  } catch (err) {
    die(`Could not read or set addressing: ${errorMessage(err)}`, 'If this says 401, an API key is wrong: rerun with --overwrite.');
  }

  step('Checking room membership');
  const missing: string[] = [];
  for (const handle of [saidHandle, ...(builderHandle ? [builderHandle] : [])]) {
    try {
      const rooms = roomIdsOf(await handle.ops.getAgentDetail(handle.id));
      if (rooms === null) {
        warn(`${handle.name}: could not read its room list; verify with \`npm run doctor\``);
      } else if (rooms.includes(roomId)) {
        ok(`${handle.name} is in room ${roomName ?? roomId}`);
      } else {
        missing.push(handle.name);
        warn(`${handle.name} is not in room ${roomName ?? roomId} yet`);
      }
    } catch (err) {
      warn(`${handle.name}: room check failed: ${errorMessage(err)}`);
    }
  }
  if (missing.length > 0) {
    out();
    info('Type these in the Mattermost channel of that room (as the developer):');
    for (const name of missing) out(`    ${c.bold(`!invite-agent @${name}`)}`);
    info('Then run `npm run doctor` to confirm.');
  }

  out();
  if (blocked) {
    process.exitCode = 1;
    fail('Registered, but addressing needs a manual change (above). Rerun `npm run doctor` after making it.');
  } else if (missing.length === 0) {
    ok('Registration complete. Next: npm run enroll -- --developer "Riya" --client "Dana" --wait');
  } else {
    ok('Registration complete. Invite the agents (above), then: npm run enroll -- --developer "Riya" --client "Dana" --wait');
  }
}

main().catch((err) => die(errorMessage(err)));

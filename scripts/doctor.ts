/**
 * `npm run doctor` — a readable ✓ / ✖ / ! checklist, each failure with a one-line fix.
 * Exits non-zero when any check is ✖ (warnings do not fail). Never prints secret values.
 *
 *   npm run doctor
 *   npm run doctor -- --offline     # checks the offline demo state (.said-offline, work-offline)
 */
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { verifySignedLedger, type SignedLedger } from '@said/core';
import {
  loadConfig,
  loadEnv,
  loadKeyPair,
  loadPublicKeys,
  loadSecrets,
  paths,
  ports,
  repoRoot,
  type PublicKeys,
  type SaidConfig,
  type Secrets,
} from '@said/runtime';
import { SwitchApiError, SwitchOps, health } from '@said/switch-client';
import { parseFlags } from './lib/args.js';
import { BASELINE_TAG } from './lib/client-repo.js';
import { dirtyEntries, head, isGitRepo, tagExists } from './lib/git.js';
import { fetchJson, isUp } from './lib/http.js';
import { loadLedger } from './lib/ledger.js';
import { MIN_NODE_LABEL, nodeVersionOk } from './lib/node-version.js';
import { c, errorMessage, out, sym } from './lib/output.js';
import { effectivePolicy, roomIdsOf } from './lib/register.js';
import { withRoomSession } from './lib/switch-session.js';
import { ledgerPointer, readNotaryState } from './lib/state.js';
import { findOnPath, versionOf } from './lib/which.js';

type Status = 'ok' | 'warn' | 'fail';
interface Outcome {
  status: Status;
  detail?: string;
  fix?: string | string[];
}

const tally = { ok: 0, warn: 0, fail: 0 };

function print(title: string, o: Outcome): void {
  tally[o.status]++;
  const mark = o.status === 'ok' ? sym.ok : o.status === 'warn' ? sym.warn : sym.fail;
  out(`${mark} ${title}${o.detail ? c.dim(` — ${o.detail}`) : ''}`);
  if (o.status !== 'ok' && o.fix) for (const f of Array.isArray(o.fix) ? o.fix : [o.fix]) out(`    ${c.dim('fix:')} ${f}`);
}

async function check(title: string, fn: () => Promise<Outcome>): Promise<Outcome> {
  let result: Outcome;
  try {
    result = await fn();
  } catch (err) {
    result = { status: 'fail', detail: errorMessage(err) };
  }
  print(title, result);
  return result;
}

const ok = (detail?: string): Outcome => ({ status: 'ok', detail });
const warn = (detail: string, fix?: string | string[]): Outcome => ({ status: 'warn', detail, fix });
const fail = (detail: string, fix?: string | string[]): Outcome => ({ status: 'fail', detail, fix });

function authHint(err: unknown, agent: string): string | null {
  return err instanceof SwitchApiError && (err.status === 401 || err.status === 403)
    ? `${agent}'s API key was refused (${err.status}): run \`npm run register -- --overwrite\` to issue a new one.`
    : null;
}

async function main(): Promise<void> {
  const { values: flags } = parseFlags({ offline: { type: 'boolean' } });
  if (flags.offline) {
    process.env.SAID_HOME = process.env.SAID_OFFLINE_HOME ?? '.said-offline';
    process.env.SAID_WORK = process.env.SAID_OFFLINE_WORK ?? 'work-offline';
  }
  loadEnv();
  out(c.bold(`Said doctor${flags.offline ? ' (offline demo state)' : ''}`));
  out(c.dim(`state: ${paths.home}`));
  out();

  await check('Node version', async () =>
    nodeVersionOk() ? ok(process.versions.node) : fail(`${process.versions.node} is too old`, `Install Node ${MIN_NODE_LABEL} or newer.`),
  );

  // Configuration files.
  let config: SaidConfig | null = null;
  let secrets: Secrets | null = null;
  let publicKeys: PublicKeys | null = null;

  const configRes = await check('Config (config.json)', async () => {
    config = await loadConfig();
    return ok(`${config.mode} mode, ${config.roomMode} room, worker ${config.worker}`);
  });
  if (configRes.status === 'fail') {
    out(`    ${c.dim('fix:')} run \`npm run register\` (live) or \`npm run demo:offline\` (simulation)`);
  }
  const offline = (config as SaidConfig | null)?.mode === 'offline';

  await check('.env file', async () => {
    if (existsSync(join(repoRoot, '.env'))) {
      const missing = ['SWITCH_URL', 'SWITCH_REGISTRATION_KEY', 'SAID_ROOM_ID'].filter((k) => !process.env[k]?.trim());
      if (offline || missing.length === 0) return ok();
      return warn(`${missing.join(', ')} not set`, 'Fill them in .env (only needed for `npm run register`, not for running).');
    }
    return offline ? ok('not needed for the offline simulation') : fail('missing', 'Run `npm run setup`.');
  });

  await check('Secrets (secrets.json)', async () => {
    secrets = await loadSecrets();
    const mode = (await stat(paths.secrets)).mode & 0o777;
    if (mode & 0o077) return warn(`file mode is ${mode.toString(8)}, readable by others`, `chmod 600 ${paths.secrets}`);
    const cfg = config as SaidConfig | null;
    if (cfg?.builder && !secrets.builderApiKey) return fail('builder API key is missing', 'Run `npm run register`.');
    return ok('API keys present, file mode 0600');
  });

  await check('Signing keys and pinned public keys', async () => {
    publicKeys = await loadPublicKeys();
    const notary = await loadKeyPair('notary');
    if (notary.publicKey !== publicKeys.notary.publicKey) {
      return fail('public-keys.json does not match the notary private key', 'Run `npm run setup` (rewrites public-keys.json from the keys on disk).');
    }
    const cfg = config as SaidConfig | null;
    if (cfg?.builder) {
      if (!publicKeys.builder) return fail('builder public key is not pinned', 'Run `npm run setup`.');
      const builder = await loadKeyPair('builder');
      if (builder.publicKey !== publicKeys.builder.publicKey) {
        return fail('public-keys.json does not match the builder private key', 'Run `npm run setup`.');
      }
    }
    return ok(`notary ${publicKeys.notary.keyId}${publicKeys.builder ? `, builder ${publicKeys.builder.keyId}` : ''}`);
  });

  const cfg = config as SaidConfig | null;
  const sec = secrets as Secrets | null;
  const pub = publicKeys as PublicKeys | null;

  // Switch.
  let switchUp = false;
  if (cfg) {
    const res = await check(`${offline ? 'Mock Switch (SIMULATION)' : 'Switch server'} reachable`, async () => {
      switchUp = await health(cfg.switchUrl);
      return switchUp
        ? ok(cfg.switchUrl)
        : fail(
            `GET ${cfg.switchUrl}/health did not answer 200`,
            offline
              ? 'Start the simulation with `npm run demo:offline`.'
              : [
                  'Start the server (Switch Console should say "Running locally").',
                  'SWITCH_URL must be the agent bridge base URL, not the Gateway/admin URL or the Mattermost URL.',
                ],
          );
    });
    void res;
  }

  // Agents.
  const handles: Array<{ role: 'said' | 'builder'; name: string; id: string; ops: SwitchOps }> = [];
  if (cfg && sec) {
    handles.push({ role: 'said', name: cfg.said.name, id: cfg.said.agentId, ops: new SwitchOps({ baseUrl: cfg.switchUrl, agentId: cfg.said.agentId, apiKey: sec.saidApiKey }) });
    if (cfg.builder && sec.builderApiKey) {
      handles.push({ role: 'builder', name: cfg.builder.name, id: cfg.builder.agentId, ops: new SwitchOps({ baseUrl: cfg.switchUrl, agentId: cfg.builder.agentId, apiKey: sec.builderApiKey }) });
    }
  }
  const details = new Map<string, unknown>();
  const keyOk = new Set<string>();

  if (switchUp) {
    for (const h of handles) {
      const r = await check(`API key works: ${h.name}`, async () => {
        try {
          await h.ops.listOps();
          keyOk.add(h.role);
          return ok();
        } catch (err) {
          return fail(authHint(err, h.name) ?? errorMessage(err), 'Run `npm run register -- --overwrite`.');
        }
      });
      void r;
    }
    for (const h of handles.filter((x) => keyOk.has(x.role))) {
      try {
        details.set(h.role, await h.ops.getAgentDetail(h.id));
      } catch {
        // reported below
      }
    }
    for (const h of handles.filter((x) => keyOk.has(x.role))) {
      const want = h.role === 'said' ? 'anyone' : 'owner_and_owner_agents';
      await check(`Addressing: ${h.name} → ${want}`, async () => {
        const policy = effectivePolicy(details.get(h.role));
        if (policy === want) return ok();
        const choice = want === 'anyone' ? 'Anyone' : 'Me and my agents';
        return fail(`effective policy is ${policy ?? 'unreadable'}`, [
          'Run `npm run register` (tries self-update, then the other agent\'s key).',
          `Or by hand: Switch Console → Your Agents → ${h.name} → Settings → "Who can talk to your agent" → ${choice}.`,
        ]);
      });
    }
    for (const h of handles.filter((x) => keyOk.has(x.role))) {
      await check(`In the room: ${h.name}`, async () => {
        const rooms = roomIdsOf(details.get(h.role));
        if (rooms === null) return warn('could not read its room list', 'Check in Switch Console that the agent is in the room.');
        return rooms.includes(cfg!.roomId)
          ? ok(cfg!.roomName ?? cfg!.roomId)
          : fail('not a member of the configured room', `In the Mattermost channel type: !invite-agent @${h.name}`);
      });
    }
  }

  // Ledger.
  const notaryUrl = `http://localhost:${ports.notary}`;
  const notaryRunning = await isUp(`${notaryUrl}/health`);
  if (cfg && pub) {
    await check('Ledger document: present, signed, matches notary state', async () => {
      const pointer = ledgerPointer(await readNotaryState());
      if (!pointer.ledgerDocumentId) {
        return warn('no ledger yet (enrollment not completed)', 'Run `npm run enroll -- --developer "Riya" --client "Dana" --wait` and have both type their line.');
      }
      let signed: SignedLedger;
      let source: string;
      if (notaryRunning) {
        // Taking the room for a second connection would evict the running notary, so read through its API.
        const state = await fetchJson<{ signedLedger: SignedLedger | null; ledgerDocumentId: string | null; halted?: { reason: string } | null }>(`${notaryUrl}/api/state`);
        if (state.halted) return fail(`Said has halted: ${state.halted.reason}`, 'Fix the cause, then restart the notary; `npm run reset -- --force` archives a broken ledger.');
        if (!state.signedLedger) return fail('the notary reports no ledger although one was created', 'Restart the notary and check its log.');
        const verdict = await verifySignedLedger(state.signedLedger, pub.notary.publicKey);
        if (!verdict.ok) return fail(`signature invalid: ${verdict.reason}`, 'The ledger was altered or signed by another key. Do not trust it; `npm run reset -- --force` archives it.');
        signed = state.signedLedger;
        source = 'via the running notary';
      } else if (switchUp && keyOk.has('said')) {
        const said = handles.find((h) => h.role === 'said')!;
        const loaded = await withRoomSession(cfg, { agentId: said.id, apiKey: sec!.saidApiKey }, (s) =>
          loadLedger(s.ops, pointer.ledgerDocumentId!, pub.notary.publicKey),
        );
        if (!loaded.ok) return fail(loaded.reason, 'If the document was deleted or edited, `npm run reset -- --force` archives it and creates a fresh ledger.');
        signed = loaded.signed;
        source = 'read from the room document';
      } else {
        return warn('cannot check the document (Switch unreachable or Said key invalid)');
      }
      if (signed.payload.roomId !== cfg.roomId) return fail(`ledger is for room ${signed.payload.roomId}, not ${cfg.roomId}`);
      if (pointer.revision !== null && signed.payload.revision < pointer.revision) {
        return fail(`ledger revision ${signed.payload.revision} is older than the notary last saw (${pointer.revision}): possible rollback`);
      }
      if (pointer.revision === signed.payload.revision && pointer.digest && pointer.digest !== signed.digest) {
        return fail('same revision but a different digest than notary-state.json');
      }
      return ok(`revision ${signed.payload.revision}, ${signed.payload.drafts.length} draft(s), ${signed.payload.agreements.length} agreement(s), signature verified (${source})`);
    });
  }

  // Worker and client repo (business rooms).
  if (cfg?.builder) {
    await check(`Worker CLI: ${cfg.worker}`, async () => {
      if (cfg.worker === 'scripted') {
        return warn('scripted worker: the change comes from a fixture patch, not an AI', 'Set SAID_WORKER=claude or codex for the live demo.');
      }
      if (!findOnPath(cfg.worker)) {
        return fail(`\`${cfg.worker}\` is not on PATH`, cfg.worker === 'claude'
          ? 'npm install -g @anthropic-ai/claude-code, then run `claude` once to sign in (or set SAID_WORKER=codex).'
          : 'npm install -g @openai/codex, then `codex login` (or set SAID_WORKER=claude).');
      }
      const version = versionOf(cfg.worker);
      return version ? ok(version) : fail(`\`${cfg.worker} --version\` failed`, `Run \`${cfg.worker}\` once interactively to finish signing in.`);
    });

    const repo = paths.clientRepo;
    await check('Client repo', async () => {
      if (!existsSync(repo)) return fail(`${repo} does not exist`, 'Run `npm run setup`.');
      if (!(await isGitRepo(repo))) return fail('not a git repository of its own', `Move ${repo} away and run \`npm run setup\`.`);
      const problems: string[] = [];
      if (!(await tagExists(repo, BASELINE_TAG))) problems.push('no `baseline` tag');
      if (!existsSync(join(repo, 'node_modules'))) problems.push('no node_modules (run `npm install` inside it)');
      const dirty = await dirtyEntries(repo);
      if (dirty.length > 0) problems.push(`${dirty.length} uncommitted change(s): the builder refuses to run on a dirty repo`);
      if (problems.length > 0) return fail(problems.join('; '), 'Commit or stash local edits; `npm run setup` on a fresh copy restores the baseline.');
      return ok(`clean at ${(await head(repo)).slice(0, 7)}, baseline tag present, dependencies installed`);
    });
  }

  // Local services.
  const services: Array<[string, string, boolean]> = [
    ['Notary', `${notaryUrl}/health`, true],
    ...(cfg?.builder ? ([['Builder', `http://localhost:${ports.builder}/health`, true]] as Array<[string, string, boolean]>) : []),
    ['Said Console', `http://localhost:${ports.console}/`, false],
  ];
  for (const [name, url, hasHealth] of services) {
    await check(`${name} answering on ${new URL(url).host}`, async () =>
      (await isUp(url))
        ? ok()
        : warn('not running', `Start it with ${offline ? '`npm run demo:offline`' : '`npm run dev`'}${hasHealth ? '' : ' (the console is optional for the flow, needed for the demo)'}.`),
    );
  }

  out();
  const parts = [`${tally.ok} ok`, tally.warn ? `${tally.warn} warning(s)` : null, tally.fail ? `${tally.fail} failed` : null].filter(Boolean);
  out(tally.fail === 0 ? `${sym.ok} ${c.bold('Ready.')} ${parts.join(', ')}` : `${sym.fail} ${c.bold('Not ready.')} ${parts.join(', ')}`);
  process.exitCode = tally.fail === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`${sym.fail} doctor crashed: ${errorMessage(err)}`);
  process.exit(2);
});

/**
 * The offline demo stack: mock Switch (in-process) + notary + builder (+ console + client site), all driven
 * only through entrypoints, env and SAID_HOME. Used by `scripts/demo-offline.ts` and the end-to-end test.
 *
 * Everything here is a SIMULATION of Switch and says so.
 */
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Ledger, SignedLedger } from '@said/core';
import { createMockSwitch, type MockSwitch } from '@said/mock-switch';
import {
  loadOrCreateKeyPair,
  paths,
  ports,
  resolveServicePorts,
  repoRoot,
  saveConfig,
  saveEnrollment,
  savePublicKeys,
  saveSecrets,
  type Enrollment,
  type SaidConfig,
} from '@said/runtime';
import { SwitchOps } from '@said/switch-client';
import { prepareClientRepo } from './client-repo.js';
import { deploymentIdFor } from './deployment.js';
import { buildEnrollment, enrollLine } from './enrollment.js';
import { resetClientRepo } from './git.js';
import { fetchJson, pollUntil, sleep, waitForUp } from './http.js';
import { c } from './output.js';
import { startService, stopAll, diedReason, type Service } from './proc.js';
import { ensureAddressing, registerOne, roomIdsOf } from './register.js';
import { findOnPath } from './which.js';

export const OFFLINE_ROOM_ID = '11111111-1111-4111-8111-111111111111';
export const MOCK_REGISTRATION_KEY = 'mock-registration-key';
export type Worker = SaidConfig['worker'];

export interface WorkerChoice {
  worker: Worker;
  /** Why this worker was picked (printed). */
  reason: string;
  /** True when the code change will come from a fixture patch, not an AI. */
  scripted: boolean;
}

/** `SAID_WORKER` if set and usable, else `claude` on PATH, else `codex` on PATH, else `scripted`. */
export function chooseWorker(requested: string | undefined, onPath: (cmd: string) => boolean = (cmd) => findOnPath(cmd) !== null): WorkerChoice {
  const want = requested?.trim();
  if (want === 'scripted') return { worker: 'scripted', reason: 'SAID_WORKER=scripted', scripted: true };
  if (want === 'claude' || want === 'codex') {
    if (onPath(want)) return { worker: want, reason: `SAID_WORKER=${want}`, scripted: false };
    return { worker: 'scripted', reason: `SAID_WORKER=${want} but \`${want}\` is not on PATH`, scripted: true };
  }
  if (want) throw new Error(`SAID_WORKER must be claude, codex or scripted, got "${want}".`);
  if (onPath('claude')) return { worker: 'claude', reason: '`claude` found on PATH', scripted: false };
  if (onPath('codex')) return { worker: 'codex', reason: '`codex` found on PATH', scripted: false };
  return { worker: 'scripted', reason: 'neither `claude` nor `codex` is on PATH', scripted: true };
}

export interface OfflineOptions {
  /** State dir, relative to the repo root unless absolute. Default `.said-offline`. */
  home?: string;
  /** Work dir (client repo + jobs). Default `work-offline`. */
  work?: string;
  /** Skip the console and client-site dev servers. */
  headless?: boolean;
  /** Forces the worker (tests use `scripted`). Default: `chooseWorker(process.env.SAID_WORKER)`. */
  worker?: Worker;
  /** `install` (default) runs `npm install` in the client copy; `link` symlinks the template's node_modules. */
  dependencies?: 'install' | 'link';
  /** Delete the work dir first (otherwise an existing clean client repo is reset to its baseline). */
  fresh?: boolean;
  /** Do not print the services' output. */
  quiet?: boolean;
  log?: (line: string) => void;
}

export interface OfflineStack {
  mock: MockSwitch;
  mockUrl: string;
  worker: WorkerChoice;
  enrollment: Enrollment;
  urls: { chat: string; console: string | null; site: string | null; notary: string; builder: string };
  services: Service[];
  config: SaidConfig;
  home: string;
  work: string;
  notaryPublicKey: string;
  /** The notary's `/api/state`. */
  notaryState(): Promise<NotaryApiState>;
  jobs(): Promise<BuilderJob[]>;
  stop(): Promise<void>;
}

export interface NotaryApiState {
  mode: string;
  switch: { connected: boolean };
  signedLedger: SignedLedger | null;
  ledgerDocumentId: string | null;
  halted?: { reason: string } | null;
}

export interface BuilderJob {
  jobId: string;
  agreementId: string;
  status: string;
  error: string | null;
  resultCommit: string | null;
  changedPaths: string[];
}

function abs(p: string): string {
  return isAbsolute(p) ? p : resolve(repoRoot, p);
}

/** Refuses to wipe anything that looks like live state. */
async function wipeOfflineHome(home: string): Promise<void> {
  if (home === repoRoot || home === resolve(repoRoot, '.said') || home === '/') {
    throw new Error(`Refusing to reset ${home}: that is not offline-demo state.`);
  }
  const configPath = resolve(home, 'config.json');
  if (existsSync(configPath)) {
    try {
      const mode = (JSON.parse(await readFile(configPath, 'utf8')) as { mode?: string }).mode;
      if (mode === 'live') throw new Error(`Refusing to wipe ${home}: its config.json is a LIVE configuration.`);
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(`Refusing to wipe ${home}: config.json is unreadable.`, { cause: err });
      throw err;
    }
  }
  await rm(home, { recursive: true, force: true });
}

async function waitAgentLive(ops: SwitchOps, agentId: string, roomId: string, aborted: () => string | null): Promise<void> {
  await pollUntil(
    'the agent to connect to the mock room',
    async () => {
      const detail = (await ops.getAgentDetail(agentId)) as { rooms?: Array<{ room_id?: string; status?: string }> };
      return detail.rooms?.some((r) => r.room_id === roomId && r.status === 'live') ?? false;
    },
    { timeoutMs: 30_000, intervalMs: 200, aborted },
  );
}

export async function startOfflineStack(opts: OfflineOptions = {}): Promise<OfflineStack> {
  const log = opts.log ?? (() => undefined);
  const home = abs(opts.home ?? process.env.SAID_OFFLINE_HOME ?? '.said-offline');
  const work = abs(opts.work ?? process.env.SAID_OFFLINE_WORK ?? 'work-offline');
  const previousEnv = { home: process.env.SAID_HOME, work: process.env.SAID_WORK };
  process.env.SAID_HOME = home;
  process.env.SAID_WORK = work;

  const services: Service[] = [];
  let mock: MockSwitch | null = null;
  const restoreEnv = () => {
    if (previousEnv.home === undefined) delete process.env.SAID_HOME;
    else process.env.SAID_HOME = previousEnv.home;
    if (previousEnv.work === undefined) delete process.env.SAID_WORK;
    else process.env.SAID_WORK = previousEnv.work;
  };
  const stop = async () => {
    await stopAll(services);
    await mock?.close().catch(() => undefined);
    mock = null;
    restoreEnv();
  };

  try {
    const worker = opts.worker
      ? ({ worker: opts.worker, reason: 'forced by the caller', scripted: opts.worker === 'scripted' } as WorkerChoice)
      : chooseWorker(process.env.SAID_WORKER);

    // 1. Fresh state. The simulation is in memory, so old keys/cursors/ledger pointers would not match.
    log('resetting offline state');
    await wipeOfflineHome(home);
    if (opts.fresh) await rm(work, { recursive: true, force: true });

    // 2. Client repo: reuse a clean one (reset to baseline) or create it.
    const repo = paths.clientRepo;
    if (existsSync(repo)) {
      log('client repo exists: resetting it to the baseline (history is tagged, never discarded)');
      await resetClientRepo(repo);
    }
    const prepared = await prepareClientRepo({ target: repo, template: paths.clientTemplate, dependencies: opts.dependencies, log });
    for (const note of prepared.notes) log(`note: ${note}`);

    // 3. Ports: prefer defaults; if the live stack (or anything else) holds them, pick free ones.
    const resolved = await resolveServicePorts(process.env);
    const portEnvName: Record<string, string> = {
      console: 'CONSOLE_PORT',
      notary: 'NOTARY_PORT',
      builder: 'BUILDER_PORT',
      mockSwitch: 'MOCK_SWITCH_PORT',
      clientSite: 'CLIENT_SITE_PORT',
    };
    for (const [name, change] of Object.entries(resolved.replaced)) {
      log(`port ${name}: ${change.from} busy → using ${change.to} (override with ${portEnvName[name] ?? name})`);
    }
    const mockPort = resolved.ports.mockSwitch;
    mock = await createMockSwitch({ port: mockPort, log: !opts.quiet });
    const mockUrl = mock.url;

    // 4. Register `said` and `builder` against it and set who may address them.
    const mkOps = (agentId: string, apiKey: string) => new SwitchOps({ baseUrl: mockUrl, agentId, apiKey });
    const keyWorks = async () => false;
    const saidReg = await registerOne(
      { baseUrl: mockUrl, registrationKey: MOCK_REGISTRATION_KEY, name: 'said', description: 'Said (offline simulation): bilateral consent notary', displayName: 'Said', overwrite: true, existing: null },
      { keyWorks },
    );
    const builderReg = await registerOne(
      { baseUrl: mockUrl, registrationKey: MOCK_REGISTRATION_KEY, name: 'builder', description: 'Said builder (offline simulation)', displayName: 'Said Builder', overwrite: true, existing: null },
      { keyWorks },
    );
    const saidOps = mkOps(saidReg.id, saidReg.apiKey);
    const builderOps = mkOps(builderReg.id, builderReg.apiKey);
    const saidHandle = { name: 'said', id: saidReg.id, ops: saidOps };
    const builderHandle = { name: 'builder', id: builderReg.id, ops: builderOps };
    const addressing = [
      await ensureAddressing(saidHandle, 'anyone', builderHandle),
      await ensureAddressing(builderHandle, 'owner_and_owner_agents', saidHandle),
    ];
    for (const a of addressing) {
      if (a.method === 'manual') throw new Error(`Could not set addressing for ${a.name} on the simulator: ${a.notes.join('; ')}`);
    }
    for (const h of [saidHandle, builderHandle]) {
      const rooms = roomIdsOf(await h.ops.getAgentDetail(h.id));
      if (!rooms?.includes(OFFLINE_ROOM_ID)) throw new Error(`${h.name} is not in the simulated business room`);
    }

    // 5. Config, secrets, keys, enrollment.
    const config: SaidConfig = {
      mode: 'offline',
      switchUrl: mockUrl,
      deploymentId: deploymentIdFor(mockUrl),
      roomId: OFFLINE_ROOM_ID,
      roomName: 'larkspur-site',
      roomMode: 'business',
      said: { agentId: saidReg.id, name: 'said' },
      builder: { agentId: builderReg.id, name: 'builder' },
      worker: worker.worker,
    };
    await saveConfig(config);
    await saveSecrets({ saidApiKey: saidReg.apiKey, builderApiKey: builderReg.apiKey });
    const notaryKey = await loadOrCreateKeyPair('notary');
    const builderKey = await loadOrCreateKeyPair('builder');
    await savePublicKeys({
      notary: { keyId: notaryKey.keyId, publicKey: notaryKey.publicKey },
      builder: { keyId: builderKey.keyId, publicKey: builderKey.publicKey },
    });
    const enrollment = buildEnrollment(OFFLINE_ROOM_ID, { roomMode: 'business', labels: { developer: 'Riya', client: 'Dana' } });
    await saveEnrollment(enrollment);

    // 6. Start the services as child processes: entrypoints + env + SAID_HOME only.
    const env: Record<string, string> = {
      SAID_HOME: home,
      SAID_WORK: work,
      NOTARY_PORT: String(resolved.ports.notary),
      BUILDER_PORT: String(resolved.ports.builder),
      CONSOLE_PORT: String(resolved.ports.console),
      CLIENT_SITE_PORT: String(resolved.ports.clientSite),
      MOCK_SWITCH_PORT: String(mockPort),
      SAID_WORKER: worker.worker,
      // Offline simulation: no shared-secret gate (loopback mock).
      SAID_HTTP_ALLOW_INSECURE: '1',
    };
    const tsx = (name: string, entry: string) =>
      startService({ name, command: process.execPath, args: ['--import', 'tsx', entry], cwd: repoRoot, env, logs: !opts.quiet });

    const notary = tsx('notary', 'apps/notary/src/main.ts');
    services.push(notary);
    const builder = tsx('builder', 'apps/builder/src/main.ts');
    services.push(builder);

    const notaryUrl = `http://localhost:${resolved.ports.notary}`;
    const builderUrl = `http://localhost:${resolved.ports.builder}`;
    await waitForUp(`${notaryUrl}/health`, { aborted: diedReason(notary), timeoutMs: 60_000 });
    await waitForUp(`${builderUrl}/health`, { aborted: diedReason(builder), timeoutMs: 60_000 });
    await waitAgentLive(saidOps, saidReg.id, OFFLINE_ROOM_ID, diedReason(notary));
    await waitAgentLive(builderOps, builderReg.id, OFFLINE_ROOM_ID, diedReason(builder));

    let consoleUrl: string | null = null;
    let siteUrl: string | null = null;
    if (!opts.headless) {
      const consoleSvc = startService({
        name: 'console',
        command: 'npm',
        args: ['-w', '@said/console', 'run', 'dev'],
        cwd: repoRoot,
        env: { ...env, VITE_NOTARY_URL: notaryUrl, VITE_BUILDER_URL: builderUrl },
        logs: !opts.quiet,
      });
      services.push(consoleSvc);
      const siteSvc = startService({ name: 'site', command: 'npm', args: ['run', 'dev'], cwd: repo, env, logs: !opts.quiet });
      services.push(siteSvc);
      const consoleCandidate = `http://localhost:${resolved.ports.console}`;
      const siteCandidate = `http://localhost:${resolved.ports.clientSite}`;
      await waitForUp(consoleCandidate, { aborted: diedReason(consoleSvc), timeoutMs: 90_000 }).then(
        () => (consoleUrl = consoleCandidate),
        (err: Error) => log(`${c.yellow('!')} Said Console did not start: ${err.message.split('\n')[0]}`),
      );
      await waitForUp(siteCandidate, { aborted: diedReason(siteSvc), timeoutMs: 90_000 }).then(
        () => (siteUrl = siteCandidate),
        (err: Error) => log(`${c.yellow('!')} Client site did not start: ${err.message.split('\n')[0]}`),
      );
    }

    // 7. Both parties enroll through the simulated chat.
    const [dev, client] = enrollment.codes;
    await mock.say('developer', enrollLine('said', dev!.code));
    await mock.say('client', enrollLine('said', client!.code));

    const stack: OfflineStack = {
      mock,
      mockUrl,
      worker,
      enrollment,
      urls: { chat: mockUrl, console: consoleUrl, site: siteUrl, notary: notaryUrl, builder: builderUrl },
      services,
      config,
      home,
      work,
      notaryPublicKey: notaryKey.publicKey,
      notaryState: () => fetchJson<NotaryApiState>(`${notaryUrl}/api/state`),
      async jobs() {
        const body = await fetchJson<BuilderJob[] | { jobs?: BuilderJob[] }>(`${builderUrl}/api/jobs`);
        const jobs = Array.isArray(body) ? body : body.jobs;
        if (!Array.isArray(jobs)) throw new Error('Builder /api/jobs returned an unexpected shape');
        return jobs;
      },
      stop,
    };
    return stack;
  } catch (err) {
    await stop();
    throw err;
  }
}

// ── the scripted story ────────────────────────────────────────────────────────────────────────

export interface StoryOptions {
  /** Pause between steps so a human can watch. Default 1500 ms. */
  pauseMs?: number;
  /** How long to wait for the builder to finish (real AI workers need minutes). */
  jobTimeoutMs?: number;
  print?: (line: string) => void;
}

export const STORY_LINES = {
  bypass: "@builder Also add dark mode while you're in there",
  terms: 'Terms DRF-001: +2 days, +$400',
  developerAccepts: 'Accept DRF-001 v1',
  dispute: 'Wait, I thought we agreed dark mode was free?',
  clientAccepts: 'I accept DRF-001 v1',
} as const;

class StoryFailure extends Error {
  constructor(step: string, detail: string) {
    super(`Story step failed: ${step}: ${detail}`);
    this.name = 'StoryFailure';
  }
}

/** Plays the dark-mode story end to end; throws `StoryFailure` as soon as an expectation is not met. */
export async function playStory(stack: OfflineStack, opts: StoryOptions = {}): Promise<{ ledger: Ledger; job: BuilderJob }> {
  const print = opts.print ?? (() => undefined);
  const pause = () => sleep(opts.pauseMs ?? 1500);
  const dead = () => {
    const gone = stack.services.find((s) => s.exited !== null);
    return gone ? `${gone.name} ${gone.exited}\n${gone.tail(10).join('\n')}` : null;
  };
  const ledgerNow = async () => (await stack.notaryState()).signedLedger?.payload ?? null;
  const waitLedger = (what: string, pred: (l: Ledger) => boolean, timeoutMs = 30_000) =>
    pollUntil<Ledger>(
      what,
      async () => {
        const l = await ledgerNow();
        return l && pred(l) ? l : null;
      },
      { timeoutMs, intervalMs: 250, aborted: dead },
    ).catch((err: Error) => {
      throw new StoryFailure(what, err.message);
    });
  const say = (as: 'developer' | 'client', text: string) => {
    print(`  ${c.bold(as === 'developer' ? 'Riya (developer)' : 'Dana (client)')}: ${text}`);
    return stack.mock.say(as, text);
  };

  print(c.bold('\nWaiting for both parties to be enrolled…'));
  const initial = await waitLedger('both parties enrolled and the signed ledger created', (l) => l.parties.length === 2);
  print(`  ✓ ledger created for ${initial.parties.map((p) => `${p.label} (${p.role})`).join(' and ')}`);
  await pause();

  print(c.bold('\n1. The client bypasses the developer and asks the builder directly'));
  await say('client', STORY_LINES.bypass);
  const afterBypass = await waitLedger('bypass refused and logged, request recorded as an unapproved draft', (l) => l.refusals.length >= 1 && l.drafts.length >= 1);
  const draft = afterBypass.drafts[0]!;
  if (draft.id !== 'DRF-001') throw new StoryFailure('draft numbering', `expected DRF-001, got ${draft.id}`);
  if (draft.status !== 'NEEDS_TERMS') throw new StoryFailure('draft status', `expected NEEDS_TERMS, got ${draft.status}`);
  if (afterBypass.agreements.length !== 0) throw new StoryFailure('bypass', 'an agreement exists although nobody accepted anything');
  print('  ✓ refusal logged; DRF-001 exists and needs terms; nothing was authorized');
  const switchRefusal = stack.mock.messages(stack.config.roomId).some((m) => m.switch_generated === true);
  print(switchRefusal ? '  ✓ the simulator refused the client visibly in the room (as Switch does)' : '  ! no simulator auto-reply seen (informational)');
  await pause();

  print(c.bold('\n2. The developer sets the terms'));
  await say('developer', STORY_LINES.terms);
  await waitLedger('DRF-001 PENDING with the terms', (l) => {
    const d = l.drafts.find((x) => x.id === 'DRF-001');
    return d?.status === 'PENDING' && d.terms === '+2 days, +$400';
  });
  print('  ✓ DRF-001 v1 is PENDING with terms "+2 days, +$400" (a proposal, not an approval)');
  await pause();

  print(c.bold('\n3. The developer accepts'));
  await say('developer', STORY_LINES.developerAccepts);
  const afterDev = await waitLedger('developer approval recorded', (l) => Boolean(l.drafts.find((x) => x.id === 'DRF-001')?.approvals.developer));
  if (afterDev.agreements.length !== 0) throw new StoryFailure('developer accept', 'work was authorized after only one acceptance');
  print('  ✓ one approval recorded; still waiting for the client; nothing started');
  await pause();

  print(c.bold('\n4. The client disputes: "I thought we agreed it was free"'));
  const saidMessagesBefore = stack.mock.messages(stack.config.roomId).filter((m) => m.sender_name === 'said').length;
  await say('client', STORY_LINES.dispute);
  const reply = await pollUntil<string>(
    "Said's answer from the ledger",
    async () => {
      const mine = stack.mock.messages(stack.config.roomId).filter((m) => m.sender_name === 'said');
      return mine.length > saidMessagesBefore ? mine[mine.length - 1]!.body : null;
    },
    { timeoutMs: 20_000, intervalMs: 250, aborted: dead },
  ).catch((err: Error) => {
    throw new StoryFailure('dispute answered', err.message);
  });
  if (!/DRF-001/.test(reply) || !reply.includes('+2 days, +$400')) {
    throw new StoryFailure('dispute answered', `reply does not quote DRF-001 and its terms from the ledger: ${reply.slice(0, 200)}`);
  }
  const afterDispute = await ledgerNow();
  if (afterDispute?.agreements.length) throw new StoryFailure('dispute', 'a dispute must never lock an agreement');
  print(`  ✓ Said answered from the signed ledger: ${reply.split('\n')[0]!.slice(0, 120)}`);
  await pause();

  print(c.bold('\n5. The client accepts the same version'));
  await say('client', STORY_LINES.clientAccepts);
  const locked = await waitLedger('agreement locked', (l) => l.agreements.length === 1);
  const agreement = locked.agreements[0]!;
  print(`  ✓ ${agreement.id} locked (${agreement.terms}, hash ${agreement.termsHash.slice(0, 10)}…); the builder was handed a signed start authorization`);

  print(c.bold('\n6. The builder re-verifies everything and does the work'));
  const jobTimeout = opts.jobTimeoutMs ?? 120_000;
  let lastStatus = '';
  const job = await pollUntil<BuilderJob>(
    `the builder job for ${agreement.id} to finish`,
    async () => {
      const found = (await stack.jobs()).find((j) => j.agreementId === agreement.id);
      if (found && found.status !== lastStatus) {
        lastStatus = found.status;
        print(`  … ${found.jobId}: ${found.status}`);
      }
      if (found?.status === 'FAILED') throw new StoryFailure('builder job', `${found.jobId} FAILED: ${found.error ?? 'no reason given'}`);
      return found?.status === 'COMPLETED' ? found : null;
    },
    { timeoutMs: jobTimeout, intervalMs: 500, aborted: dead },
  ).catch((err: Error) => {
    if (err instanceof StoryFailure) throw err;
    throw new StoryFailure('builder job', err.message);
  });
  print(`  ✓ ${job.jobId} COMPLETED${job.resultCommit ? ` as ${job.resultCommit.slice(0, 7)}` : ''}: ${job.changedPaths.join(', ')}`);

  const done = await waitLedger('the signed execution receipt recorded in the ledger', (l) => l.agreements[0]?.execution?.status === 'COMPLETED');
  print(`  ✓ the ledger records execution COMPLETED (revision ${done.revision}, signature verified in the console)`);
  return { ledger: done, job };
}

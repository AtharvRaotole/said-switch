import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fenceJson,
  generateKeyPair,
  jobIdFor,
  recordHandoff,
  renderLedgerDocument,
  signLedger,
  signStartToken,
  type Party,
} from '@said/core';
import { DANA, RIYA } from '../../../packages/core/test/helpers.js';
import { playDemoScript } from '../../../packages/core/test/demo-script-room.js';
import { paths, type SaidConfig } from '@said/runtime';
import { authorizeStart } from '../src/authorize.js';
import { createBuilder } from '../src/controller.js';
import { execCommand } from '../src/exec.js';
import { BuilderStateStore } from '../src/state.js';
import { runConfiguredWorker } from '../src/workers.js';

const SAID_ID = 'said-agent-uuid';
const SAID_TRANSPORT = '@switch-agent-a1b2c3d4:localhost';
const DANA_TELEGRAM = '@switch-telegram-9f3a1c2e-dana:localhost';
const NATIVE = { riya: RIYA, dana: DANA };
const TELEGRAM = {
  riya: { role: 'developer', label: 'Riya', senderId: '@switch-telegram-9f3a1c2e-riya:localhost' } satisfies Party,
  dana: { role: 'client', label: 'Dana', senderId: DANA_TELEGRAM } satisfies Party,
};

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout;
}

async function initClientRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await cp(join(paths.clientTemplate, 'src'), join(dir, 'src'), { recursive: true });
  await cp(join(paths.clientTemplate, 'index.html'), join(dir, 'index.html'));
  await writeFile(join(dir, '.gitignore'), 'node_modules\ndist\n*.log\n.DS_Store\n');
  await writeFile(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'larkspur-site',
        private: true,
        type: 'module',
        scripts: { typecheck: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' },
      },
      null,
      2,
    )}\n`,
  );
  git(dir, ['init', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', 'baseline']);
}

async function sealed(parties: { riya: Party; dana: Party }) {
  const played = playDemoScript(parties);
  const ledger = recordHandoff(played.room.ledger, {
    agreementId: 'AGR-001',
    jobId: jobIdFor('AGR-001', 1),
    now: played.room.ledger.updatedAt,
  });
  const notary = await generateKeyPair('said-notary-test');
  const signed = await signLedger(ledger, notary.keyId, notary.privateKey);
  const agreement = signed.payload.agreements[0]!;
  const now = agreement.lockedAt + 5_000;
  const token = await signStartToken(
    {
      type: 'said.start/v1',
      roomId: signed.payload.roomId,
      agreementId: agreement.id,
      jobId: jobIdFor(agreement.id, 1),
      termsHash: agreement.termsHash,
      ledgerRevision: signed.payload.revision,
      ledgerDocumentId: 'doc-ledger',
      issuedAt: now,
      expiresAt: now + 600_000,
      keyId: notary.keyId,
    },
    notary.privateKey,
  );
  const body = `Start authorization for **${agreement.id}**.\n${fenceJson('said-start', token)}`;
  const bookkeeping = played.steps[0]!.replies[0]!;
  return { played, notary, signed, body, bookkeeping, now, document: renderLedgerDocument(signed), roomId: signed.payload.roomId };
}

function config(roomId: string): SaidConfig {
  return {
    mode: 'live',
    switchUrl: 'http://127.0.0.1:8000',
    deploymentId: 'dep-test',
    roomId,
    roomName: 'larkspur',
    roomMode: 'business',
    said: { agentId: SAID_ID, name: 'said' },
    builder: { agentId: 'builder-uuid', name: 'builder' },
    worker: 'scripted',
  };
}

describe('demo script reaches the builder', () => {
  it('recognizes Said on the native UUID and on the Telegram transport id, and ignores a human replay', async () => {
    for (const parties of [NATIVE, TELEGRAM]) {
      const auth = await sealed(parties);
      const native = await authorizeStart({
        senderId: SAID_ID,
        senderName: 'not-said',
        saidAgentId: SAID_ID,
        saidAgentName: 'said',
        body: auth.body,
        notaryPublicKey: auth.notary.publicKey,
        expectedRoomId: auth.roomId,
        now: auth.now,
        loadLedgerDocument: async () => auth.document,
      });
      expect(native.ok).toBe(true);

      const telegram = await authorizeStart({
        senderId: SAID_TRANSPORT,
        senderName: 'said',
        saidAgentId: SAID_ID,
        saidAgentName: 'said',
        body: auth.body,
        notaryPublicKey: auth.notary.publicKey,
        expectedRoomId: auth.roomId,
        now: auth.now,
        loadLedgerDocument: async () => auth.document,
      });
      expect(telegram.ok).toBe(true);

      const bookkeeping = await authorizeStart({
        senderId: SAID_TRANSPORT,
        senderName: 'said',
        saidAgentId: SAID_ID,
        saidAgentName: 'said',
        body: auth.bookkeeping,
        notaryPublicKey: auth.notary.publicKey,
        expectedRoomId: auth.roomId,
        now: auth.now,
        loadLedgerDocument: async () => auth.document,
      });
      expect(bookkeeping).toMatchObject({ ok: false, reason: expect.stringMatching(/chat message is not permission/) });
      expect(bookkeeping).toMatchObject({ ok: false, reason: expect.not.stringMatching(/not from Said/) });

      const human = await authorizeStart({
        senderId: DANA_TELEGRAM,
        senderName: 'said',
        saidAgentId: SAID_ID,
        saidAgentName: 'said',
        allowSaidNameFallback: true,
        body: auth.body,
        notaryPublicKey: auth.notary.publicKey,
        expectedRoomId: auth.roomId,
        now: auth.now,
        loadLedgerDocument: async () => auth.document,
      });
      expect(human).toMatchObject({ ok: false, reason: expect.stringMatching(/not from Said/) });
    }
  });

  it.each([
    ['native', SAID_ID, 'mallory'],
    ['telegram', SAID_TRANSPORT, 'said'],
  ] as const)('runs the scripted worker when Said posts the start on the %s path', async (_label, senderId, senderName) => {
    const auth = await sealed(TELEGRAM);
    const root = await mkdtemp(join(tmpdir(), 'said-demo-'));
    dirs.push(root);
    const repo = join(root, 'repo');
    await initClientRepo(repo);
    const { store } = await BuilderStateStore.open(join(root, 'builder-state.json'));
    const notes: string[] = [];
    const builderKey = await generateKeyPair('said-builder-test');
    const builder = createBuilder({
      config: config(auth.roomId),
      notaryPublicKey: auth.notary.publicKey,
      builderKey,
      worker: 'scripted',
      clientRepo: repo,
      jobsDir: join(root, 'jobs'),
      fixturePatch: paths.fixturePatch,
      state: store,
      now: () => auth.now,
      loadLedgerDocument: async () => auth.document,
      postMessage: async (body) => {
        notes.push(body);
      },
      sendTargetedToSaid: async (body) => {
        notes.push(body);
      },
      execCommand,
      runWorker: runConfiguredWorker,
    });

    await builder.ingest({
      messageId: 'bookkeeping',
      roomId: auth.roomId,
      senderId,
      senderName,
      body: auth.bookkeeping,
      threadId: null,
      timestamp: auth.now,
    });
    expect(notes.join('\n')).not.toMatch(/not from Said/);
    expect(builder.listJobs()).toHaveLength(0);

    await builder.ingest({
      messageId: 'start',
      roomId: auth.roomId,
      senderId,
      senderName,
      body: auth.body,
      threadId: null,
      timestamp: auth.now,
    });
    expect(builder.listJobs()).toEqual([expect.objectContaining({ status: 'COMPLETED', jobId: jobIdFor('AGR-001', 1) })]);
    expect(git(repo, ['show', 'HEAD:src/App.tsx'])).toContain('larkspur-theme');

    await builder.ingest({
      messageId: 'spoof',
      roomId: auth.roomId,
      senderId: DANA_TELEGRAM,
      senderName: 'said',
      body: auth.body,
      threadId: null,
      timestamp: auth.now,
    });
    expect(notes.join('\n')).toMatch(/not from Said/);
    expect(builder.listJobs()).toHaveLength(1);
  });
});

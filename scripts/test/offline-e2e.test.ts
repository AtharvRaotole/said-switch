import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseLedgerDocument, verifySignedLedger } from '@said/core';
import { repoRoot } from '@said/runtime';
import { commitCount, changedFiles, dirtyEntries } from '../lib/git.js';
import { LEDGER_NAME } from '../lib/ledger.js';
import { playStory, startOfflineStack, type OfflineStack } from '../lib/offline.js';

/**
 * End to end: the real notary and builder processes, the mock Switch, the scripted worker (no AI),
 * in throwaway SAID_HOME / SAID_WORK directories and on free ports. Needs the notary and builder entrypoints
 * and an installed demo/client-site (the client copy symlinks its node_modules, so no network is used).
 * Set SAID_E2E=0 to skip it.
 */
const entrypoints = ['apps/notary/src/main.ts', 'apps/builder/src/main.ts'].every((f) => existsSync(join(repoRoot, f)));
const clientInstalled = existsSync(join(repoRoot, 'demo', 'client-site', 'node_modules'));
const enabled = process.env.SAID_E2E !== '0' && (entrypoints || process.env.SAID_E2E === '1') && clientInstalled;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

const ALLOWED = /^(src\/.+\.(tsx|ts|css)|index\.html)$/;

describe.skipIf(!enabled)('offline demo end to end (scripted worker, headless)', () => {
  let stack: OfflineStack;
  let root = '';
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'said-e2e-'));
    const env: Record<string, string> = {
      MOCK_SWITCH_PORT: String(await freePort()),
      NOTARY_PORT: String(await freePort()),
      BUILDER_PORT: String(await freePort()),
      CONSOLE_PORT: String(await freePort()),
      CLIENT_SITE_PORT: String(await freePort()),
    };
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    stack = await startOfflineStack({
      home: join(root, 'said'),
      work: join(root, 'work'),
      headless: true,
      worker: 'scripted',
      dependencies: 'link',
      quiet: true,
    });
  }, 120_000);

  afterAll(async () => {
    await stack?.stop();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (root) await rm(root, { recursive: true, force: true });
  }, 30_000);

  it('plays the dark-mode story to COMPLETED and leaves one allowlisted commit and a verifiable ledger', async () => {
    expect(stack.worker.worker).toBe('scripted');
    const lines: string[] = [];
    const { ledger, job } = await playStory(stack, { pauseMs: 0, jobTimeoutMs: 150_000, print: (l) => lines.push(l) });

    expect(job.status).toBe('COMPLETED');
    expect(ledger.agreements).toHaveLength(1);
    expect(ledger.agreements[0]!.execution?.status).toBe('COMPLETED');
    expect(ledger.refusals).toHaveLength(1);

    // The client repo got exactly one new commit, touching only allowlisted files, and is still clean.
    const repo = join(root, 'work', 'client-site');
    expect(await commitCount(repo, 'baseline..main')).toBe(1);
    const files = await changedFiles(repo, 'baseline', 'main');
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f, `unexpected changed file ${f}`).toMatch(ALLOWED);
    expect(await dirtyEntries(repo)).toEqual([]);

    // The ledger the mock stores verifies with the notary public key.
    const doc = stack.mock.documents(stack.config.roomId).find((d) => d.name === LEDGER_NAME);
    expect(doc, 'Said Ledger document').toBeDefined();
    const signed = parseLedgerDocument(doc!.content);
    expect(await verifySignedLedger(signed, stack.notaryPublicKey)).toEqual({ ok: true });
    expect(signed.payload.agreements[0]!.execution?.status).toBe('COMPLETED');
    expect(signed.payload.revision).toBe(ledger.revision);
    expect(lines.join('\n')).toContain('COMPLETED');
  }, 240_000);
});

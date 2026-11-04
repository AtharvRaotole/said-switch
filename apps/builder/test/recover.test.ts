import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { recoverInFlightJobs } from '../src/recover.js';
import { BuilderStateStore } from '../src/state.js';
import { freshSteps } from '../src/types.js';
import type { JobRecord } from '../src/types.js';

const git = promisify(execFile);
const silent = { info() {}, warn() {}, error() {} };
let root = '';

async function run(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await git('git', ['-c', 'user.name=Said Test', '-c', 'user.email=test@said.local', '-c', 'commit.gpgsign=false', ...args], { cwd });
  return stdout.trim();
}

function job(jobId: string, baseCommit: string): JobRecord {
  return {
    jobId,
    agreementId: 'AGR-001',
    status: 'RUNNING',
    worker: 'scripted',
    steps: freshSteps(1),
    baseCommit,
    resultCommit: null,
    changedPaths: [],
    error: null,
    startedAt: 1,
    finishedAt: null,
    checks: [],
    threadId: null,
    receiptSent: false,
  };
}

describe('recoverInFlightJobs', () => {
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = '';
  });

  it('completes only the builder commit, and says the receipt is missing', async () => {
    root = await mkdtemp(join(tmpdir(), 'said-recover-'));
    const repo = join(root, 'repo');
    await run(root, ['init', '-b', 'main', repo]);
    await run(repo, ['commit', '--allow-empty', '-m', 'base']);
    const base = await run(repo, ['rev-parse', 'HEAD']);
    const jobId = 'JOB-AGR-001-1';
    await run(repo, ['checkout', '-b', `said/${jobId}`]);
    await run(repo, ['commit', '--allow-empty', '-m', `said: Add dark mode (AGR-001, ${jobId})`]);
    await run(repo, ['checkout', 'main']);
    await run(repo, ['merge', '--ff-only', `said/${jobId}`]);

    const { store } = await BuilderStateStore.open(join(root, 'builder-state.json'));
    await store.update((state) => {
      state.jobs.push(job(jobId, base));
    });
    await recoverInFlightJobs(store, repo, silent);
    const done = store.snapshot().jobs[0]!;
    expect(done.status).toBe('COMPLETED');
    expect(done.resultCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(done.error).toMatch(/has not confirmed a receipt/);
  });

  it('does not treat a hand merge as this job', async () => {
    root = await mkdtemp(join(tmpdir(), 'said-recover-'));
    const repo = join(root, 'repo');
    await run(root, ['init', '-b', 'main', repo]);
    await run(repo, ['commit', '--allow-empty', '-m', 'base']);
    const base = await run(repo, ['rev-parse', 'HEAD']);
    const jobId = 'JOB-AGR-001-1';
    await run(repo, ['checkout', '-b', `said/${jobId}`]);
    await run(repo, ['commit', '--allow-empty', '-m', 'hand merge of other work']);
    await run(repo, ['checkout', 'main']);
    await run(repo, ['merge', '--ff-only', `said/${jobId}`]);

    const { store } = await BuilderStateStore.open(join(root, 'builder-state.json'));
    await store.update((state) => {
      state.jobs.push(job(jobId, base));
    });
    await recoverInFlightJobs(store, repo, silent);
    const done = store.snapshot().jobs[0]!;
    expect(done.status).toBe('FAILED');
    expect(done.resultCommit).toBeNull();
    expect(done.error).toMatch(/not this job/);
  });
});

import { lstat, mkdir, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { checkStartAuthorization, parseLedgerDocument, verifySignedLedger, verifyStartToken } from '@said/core';
import type { CheckResult, StartToken, WorkerKind } from '@said/core';
import { inspectChanges } from './allowlist.js';
import type { ExecCommand } from './exec.js';
import { parsePorcelainZ } from './porcelain.js';
import { commitSubject } from './prompt.js';
import { tail } from './text.js';
import type { JobRecord, JobStepKey, JobStepState, LogStream } from './types.js';
import { JobFailed, type WorkerContext } from './workers.js';

const SAFE_JOB = /^JOB-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/;

export interface RunJobInput {
  jobId: string;
  agreementId: string;
  scope: string;
  terms: string;
  token: StartToken;
  worker: WorkerKind;
  prompt: string;
  clientRepo: string;
  jobsDir: string;
  fixturePatch: string;
  notaryPublicKey: string;
  expectedRoomId: string;
  now: () => number;
  execCommand: ExecCommand;
  loadLedgerDocument: (documentId: string) => Promise<string>;
  runWorker: (ctx: WorkerContext) => Promise<void>;
  progress: (line: string) => Promise<void>;
  log: (stream: LogStream, line: string) => void;
  patch: (fn: (job: JobRecord) => void) => Promise<void>;
}

export async function runJob(input: RunJobInput): Promise<void> {
  if (!SAFE_JOB.test(input.jobId)) throw new JobFailed('The job id has unexpected characters.', 'worktree');

  const baseCommit = (await git(input, input.clientRepo, ['rev-parse', 'HEAD'], 'worktree')).trim();
  await input.patch((job) => {
    job.baseCommit = baseCommit;
  });

  await input.progress('Preparing an isolated work folder.');
  await mark(input, 'worktree', 'running', null);
  const dirty = parsePorcelainZ(await git(input, input.clientRepo, ['status', '--porcelain=v1', '-z', '-uall'], 'worktree'));
  if (dirty.length > 0) {
    throw new JobFailed('The client repo has uncommitted changes, so I did not start the job.', 'worktree');
  }

  await mkdir(input.jobsDir, { recursive: true });
  const worktree = join(input.jobsDir, input.jobId);
  await git(
    input,
    input.clientRepo,
    ['worktree', 'add', '-b', `said/${input.jobId}`, worktree, baseCommit],
    'worktree',
  );
  await linkDependencies(input, worktree);
  await mark(input, 'worktree', 'passed', worktree);

  const workerLine =
    input.worker === 'scripted'
      ? 'Running the scripted worker (no AI).'
      : input.worker === 'claude'
        ? 'Running Claude Code in the work folder.'
        : 'Running Codex in the work folder.';
  await input.progress(workerLine);
  await mark(input, 'worker', 'running', null);
  await input.runWorker({
    worker: input.worker,
    worktree,
    prompt: input.prompt,
    fixturePatch: input.fixturePatch,
    execCommand: input.execCommand,
    log: input.log,
  });
  const workerHead = (await git(input, worktree, ['rev-parse', 'HEAD'], 'worker')).trim();
  if (workerHead !== baseCommit) {
    throw new JobFailed('The worker made a git commit. The builder is the only one that commits.', 'worker');
  }
  await mark(input, 'worker', 'passed', workerLine);

  await input.progress('Checking that only allowed files changed.');
  await mark(input, 'paths', 'running', null);
  const changed = [
    ...new Set(parsePorcelainZ(await git(input, worktree, ['status', '--porcelain=v1', '-z', '-uall'], 'paths'))),
  ].sort();
  if (changed.length === 0) throw new JobFailed('The worker did not change any files.', 'paths');
  const violations = await inspectChanges(worktree, changed);
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.path}: ${v.reason}`).join(' ');
    throw new JobFailed(detail, 'paths');
  }
  await input.patch((job) => {
    job.changedPaths = changed;
  });
  await mark(input, 'paths', 'passed', changed.join(', '));

  await input.patch((job) => {
    job.status = 'VALIDATING';
  });
  await input.progress('Running typecheck.');
  await runCheck(input, worktree, 'typecheck');
  await input.progress('Running the production build.');
  await runCheck(input, worktree, 'build');

  await input.progress('Checking the agreement is still locked.');
  await assertStillLocked(input);
  const headNow = (await git(input, input.clientRepo, ['rev-parse', 'HEAD'], 'applied')).trim();
  if (headNow !== baseCommit) {
    throw new JobFailed('The site moved while the job ran. I did not apply the change.', 'applied');
  }

  await input.progress('Applying the change onto the site.');
  await mark(input, 'applied', 'running', null);
  await git(input, worktree, ['add', '-A', '--', ...changed], 'applied');
  await git(
    input,
    worktree,
    [
      '-c',
      'user.name=Said Builder',
      '-c',
      'user.email=builder@said.local',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      commitSubject(input.scope, input.agreementId, input.jobId),
    ],
    'applied',
  );
  const resultCommit = (await git(input, worktree, ['rev-parse', 'HEAD'], 'applied')).trim();
  const headBeforeMerge = (await git(input, input.clientRepo, ['rev-parse', 'HEAD'], 'applied')).trim();
  if (headBeforeMerge !== baseCommit) {
    throw new JobFailed('The site moved while the job ran. I did not apply the change.', 'applied');
  }
  await git(input, input.clientRepo, ['merge', '--ff-only', resultCommit], 'applied');
  const merged = (await git(input, input.clientRepo, ['rev-parse', 'HEAD'], 'applied')).trim();
  if (merged !== resultCommit) {
    throw new JobFailed('The fast-forward merge did not land on the job commit.', 'applied');
  }

  await input.patch((job) => {
    job.status = 'COMPLETED';
    job.resultCommit = resultCommit;
    job.changedPaths = changed;
    job.error = null;
    job.finishedAt = input.now();
  });
  await mark(input, 'applied', 'passed', resultCommit);
}

async function runCheck(input: RunJobInput, worktree: string, name: 'typecheck' | 'build'): Promise<void> {
  await mark(input, name, 'running', null);
  const started = input.now();
  let result;
  try {
    result = await input.execCommand('npm', ['run', name], worktree, (line) => input.log('check', line));
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'The check could not be started.';
    const check: CheckResult = { name, ok: false, durationMs: Math.max(0, input.now() - started), detail: tail(detail) };
    await input.patch((job) => {
      job.checks.push(check);
    });
    await mark(input, name, 'failed', check.detail);
    throw new JobFailed(detail, name);
  }
  const durationMs = Math.max(0, input.now() - started);
  const detail = tail(result.output) || 'no output';
  const check: CheckResult = { name, ok: result.code === 0, durationMs, detail };
  await input.patch((job) => {
    job.checks.push(check);
  });
  const summary = `${check.ok ? 'Passed' : 'Failed'} in ${durationMs}ms. ${detail}`;
  if (!check.ok) {
    await mark(input, name, 'failed', summary);
    throw new JobFailed(`${name} failed.`, name);
  }
  await mark(input, name, 'passed', summary);
}

async function assertStillLocked(input: RunJobInput): Promise<void> {
  const tokenVerified = await verifyStartToken(input.token, input.notaryPublicKey).catch(() => false);
  if (!tokenVerified) throw new JobFailed('The start token no longer matches the pinned notary key.', 'applied');
  let content: string;
  try {
    content = await input.loadLedgerDocument(input.token.ledgerDocumentId);
  } catch {
    throw new JobFailed('I could not reload the ledger.', 'applied');
  }
  let signed;
  try {
    signed = parseLedgerDocument(content);
  } catch {
    throw new JobFailed('The ledger document is not readable.', 'applied');
  }
  const verified = await verifySignedLedger(signed, input.notaryPublicKey);
  if (!verified.ok) throw new JobFailed(verified.reason, 'applied');
  const decision = checkStartAuthorization({
    signedLedgerVerified: true,
    ledger: signed.payload,
    token: input.token,
    tokenVerified,
    expectedRoomId: input.expectedRoomId,
    expectedParties: null,
    now: input.now(),
  });
  if (!decision.ok) throw new JobFailed(decision.reason, 'applied');
}

async function linkDependencies(input: RunJobInput, worktree: string): Promise<void> {
  const source = join(input.clientRepo, 'node_modules');
  let info;
  try {
    info = await lstat(source);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new JobFailed(err instanceof Error ? err.message : 'Could not read node_modules.', 'worktree');
  }
  if (!info.isDirectory() && !info.isSymbolicLink()) return;
  const dest = join(worktree, 'node_modules');
  await symlink(source, dest, 'dir');
  const ignored = await input.execCommand('git', ['--no-pager', 'check-ignore', '-q', '--', 'node_modules'], worktree, () => undefined);
  if (ignored.code !== 0) {
    await unlink(dest);
    throw new JobFailed(
      'node_modules is not gitignored in the client repo, so I removed the dependency link and stopped.',
      'worktree',
    );
  }
}

async function git(input: RunJobInput, cwd: string, args: string[], step: JobFailed['step']): Promise<string> {
  let result;
  try {
    result = await input.execCommand('git', ['--no-pager', ...args], cwd, () => undefined);
  } catch (err) {
    throw new JobFailed(err instanceof Error ? err.message : 'git failed to start.', step);
  }
  if (result.code !== 0) throw new JobFailed(tail(result.output) || `git ${args[0] ?? 'command'} failed.`, step);
  return result.output;
}

async function mark(input: RunJobInput, key: JobStepKey, state: JobStepState, detail: string | null): Promise<void> {
  const t = input.now();
  await input.patch((job) => {
    const step = job.steps.find((item) => item.key === key);
    if (!step) return;
    if (state === 'running') {
      step.state = 'running';
      step.startedAt = t;
      step.detail = detail;
      return;
    }
    step.state = state;
    step.startedAt ??= t;
    step.finishedAt = t;
    step.detail = detail;
  });
}

export { JobFailed };

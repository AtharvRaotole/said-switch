import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';

/** Fixed identity for commits created by operator scripts (never the operator's own git config). */
export const SETUP_AUTHOR = { name: 'Said Setup', email: 'setup@said.local' } as const;

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} failed (${code}): ${stderr.trim() || 'no output'}`);
    this.name = 'GitError';
  }
}

export class DirtyRepoError extends Error {
  constructor(
    readonly repo: string,
    readonly entries: string[],
  ) {
    super(
      `${repo} has uncommitted changes (${entries.length}): ${entries.slice(0, 5).join(', ')}${entries.length > 5 ? ', …' : ''}. ` +
        'Said never discards uncommitted work: commit or stash them first.',
    );
    this.name = 'DirtyRepoError';
  }
}

export function git(cwd: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new GitError(args, code, stderr))));
  });
}

/** True only when `dir` is the top level of its own repo (not merely a folder inside another repo). */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const top = (await git(dir, ['rev-parse', '--show-toplevel'])).trim();
    return (await realpath(top)) === (await realpath(dir));
  } catch {
    return false;
  }
}

/** Paths with uncommitted changes (including untracked files). Empty when clean. */
export async function dirtyEntries(dir: string): Promise<string[]> {
  const out = await git(dir, ['status', '--porcelain=v1', '--untracked-files=all']);
  return out.split('\n').filter(Boolean);
}

export async function assertClean(dir: string): Promise<void> {
  const entries = await dirtyEntries(dir);
  if (entries.length > 0) throw new DirtyRepoError(dir, entries);
}

export async function head(dir: string): Promise<string> {
  return (await git(dir, ['rev-parse', 'HEAD'])).trim();
}

export async function tagExists(dir: string, tag: string): Promise<boolean> {
  try {
    await git(dir, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

export async function commitCount(dir: string, range: string): Promise<number> {
  return Number((await git(dir, ['rev-list', '--count', range])).trim());
}

export async function changedFiles(dir: string, from: string, to: string): Promise<string[]> {
  return (await git(dir, ['diff', '--name-only', from, to])).split('\n').filter(Boolean);
}

const authorEnv = {
  GIT_AUTHOR_NAME: SETUP_AUTHOR.name,
  GIT_AUTHOR_EMAIL: SETUP_AUTHOR.email,
  GIT_COMMITTER_NAME: SETUP_AUTHOR.name,
  GIT_COMMITTER_EMAIL: SETUP_AUTHOR.email,
};

/** `git init -b main`, commit everything with the fixed author, tag it. Returns the commit. */
export async function initWithBaseline(dir: string, message: string, tag: string): Promise<string> {
  await git(dir, ['init', '-b', 'main']);
  await git(dir, ['config', 'user.name', SETUP_AUTHOR.name]);
  await git(dir, ['config', 'user.email', SETUP_AUTHOR.email]);
  await git(dir, ['config', 'commit.gpgsign', 'false']);
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-m', message], authorEnv);
  await git(dir, ['tag', tag]);
  return head(dir);
}

export function timestampTag(prefix: string, date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${prefix}${stamp}`;
}

export interface ResetResult {
  /** Tag that preserves the pre-reset HEAD, or null when HEAD already was the baseline. */
  archivedAs: string | null;
  previousHead: string;
  newHead: string;
}

/**
 * Starts a fresh run in the client repo without destroying anything: refuses when the working
 * tree is dirty, tags the current HEAD `run-<timestamp>`, then `git checkout -B main baseline`.
 */
export async function resetClientRepo(dir: string, opts: { baselineTag?: string; now?: Date } = {}): Promise<ResetResult> {
  const baseline = opts.baselineTag ?? 'baseline';
  if (!(await isGitRepo(dir))) throw new Error(`${dir} is not a git repository. Run \`npm run setup\`.`);
  if (!(await tagExists(dir, baseline))) {
    throw new Error(`${dir} has no \`${baseline}\` tag, so there is nothing safe to reset to. Run \`npm run setup\` on a fresh copy.`);
  }
  await assertClean(dir);

  const previousHead = await head(dir);
  const baselineCommit = (await git(dir, ['rev-parse', `${baseline}^{commit}`])).trim();
  let archivedAs: string | null = null;
  if (previousHead !== baselineCommit) {
    let tag = timestampTag('run-', opts.now);
    for (let n = 2; await tagExists(dir, tag); n++) tag = `${timestampTag('run-', opts.now)}-${n}`;
    await git(dir, ['tag', tag, previousHead]);
    archivedAs = tag;
  }
  // `checkout -B main` moves the `main` branch; keep its old tip reachable too when HEAD was elsewhere.
  try {
    const mainTip = (await git(dir, ['rev-parse', '--verify', '--quiet', 'refs/heads/main'])).trim();
    if (mainTip && mainTip !== previousHead && mainTip !== baselineCommit) {
      await git(dir, ['tag', `${archivedAs ?? timestampTag('run-', opts.now)}-main`, mainTip]);
    }
  } catch {
    // no local `main` branch: nothing to preserve
  }
  await git(dir, ['checkout', '-q', '-B', 'main', baseline]);
  return { archivedAs, previousHead, newHead: await head(dir) };
}

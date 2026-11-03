import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareClientRepo } from '../lib/client-repo.js';
import {
  DirtyRepoError,
  assertClean,
  commitCount,
  dirtyEntries,
  git,
  head,
  initWithBaseline,
  isGitRepo,
  resetClientRepo,
  tagExists,
} from '../lib/git.js';
import { archiveJobArtifacts } from '../lib/jobs-archive.js';
import { paths } from '@said/runtime';

const dirs: string[] = [];
async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'said-scripts-'));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function makeRepo(): Promise<string> {
  const dir = await tmp();
  await writeFile(join(dir, 'a.txt'), 'one\n');
  await initWithBaseline(dir, 'baseline: test', 'baseline');
  return dir;
}

async function commitFile(dir: string, name: string, text: string): Promise<void> {
  await writeFile(join(dir, name), text);
  await git(dir, ['add', '-A']);
  await git(dir, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', `edit ${name}`]);
}

describe('git helpers', () => {
  it('initWithBaseline commits with the fixed author and tags baseline', async () => {
    const dir = await makeRepo();
    expect(await isGitRepo(dir)).toBe(true);
    expect(await tagExists(dir, 'baseline')).toBe(true);
    expect((await git(dir, ['log', '-1', '--format=%an <%ae>'])).trim()).toBe('Said Setup <setup@said.local>');
    expect(await dirtyEntries(dir)).toEqual([]);
  });

  it('does not mistake a folder inside another repo for a repo of its own', async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, 'sub'));
    expect(await isGitRepo(join(dir, 'sub'))).toBe(false);
  });

  it('refuses to reset a dirty repo and leaves the work untouched (modified and untracked)', async () => {
    const dir = await makeRepo();
    await commitFile(dir, 'b.txt', 'two\n');
    await writeFile(join(dir, 'a.txt'), 'edited, not committed\n');
    await expect(resetClientRepo(dir)).rejects.toBeInstanceOf(DirtyRepoError);
    expect(await dirtyEntries(dir)).toHaveLength(1);
    expect(await commitCount(dir, 'baseline..HEAD')).toBe(1);

    await git(dir, ['checkout', '--', 'a.txt']);
    await writeFile(join(dir, 'untracked.txt'), 'x');
    await expect(assertClean(dir)).rejects.toThrow(/uncommitted/);
    await expect(resetClientRepo(dir)).rejects.toBeInstanceOf(DirtyRepoError);
    expect(existsSync(join(dir, 'untracked.txt'))).toBe(true);
  });

  it('resets a clean repo to baseline after tagging the old HEAD', async () => {
    const dir = await makeRepo();
    await commitFile(dir, 'b.txt', 'two\n');
    const old = await head(dir);
    const result = await resetClientRepo(dir, { now: new Date(2026, 10, 3, 18, 15, 9) });
    expect(result.archivedAs).toBe('run-20261103-181509');
    expect(result.previousHead).toBe(old);
    expect((await git(dir, ['rev-parse', 'run-20261103-181509'])).trim()).toBe(old);
    expect(await commitCount(dir, 'baseline..main')).toBe(0);
    expect(existsSync(join(dir, 'b.txt'))).toBe(false);
    expect((await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()).toBe('main');
  });

  it('keeps the old main tip when HEAD was on another branch', async () => {
    const dir = await makeRepo();
    await commitFile(dir, 'b.txt', 'two\n');
    const mainTip = await head(dir);
    await git(dir, ['checkout', '-q', '-b', 'side', 'baseline']);
    await commitFile(dir, 'c.txt', 'three\n');
    const result = await resetClientRepo(dir, { now: new Date(2026, 0, 2, 3, 4, 5) });
    expect(result.archivedAs).toBe('run-20260102-030405');
    expect((await git(dir, ['rev-parse', 'run-20260102-030405-main'])).trim()).toBe(mainTip);
  });

  it('is a no-op archive when already at baseline, and never reuses a tag name', async () => {
    const dir = await makeRepo();
    expect((await resetClientRepo(dir)).archivedAs).toBeNull();
    const when = new Date(2026, 5, 6, 7, 8, 9);
    await commitFile(dir, 'b.txt', '1');
    expect((await resetClientRepo(dir, { now: when })).archivedAs).toBe('run-20260606-070809');
    await commitFile(dir, 'c.txt', '2');
    expect((await resetClientRepo(dir, { now: when })).archivedAs).toBe('run-20260606-070809-2');
  });

  it('refuses to reset without a baseline tag', async () => {
    const dir = await makeRepo();
    await git(dir, ['tag', '-d', 'baseline']);
    await expect(resetClientRepo(dir)).rejects.toThrow(/baseline/);
  });
});

describe('job artifact archive', () => {
  it('moves job worktrees and tags + removes their branches so job ids can be reused', async () => {
    const repo = await makeRepo();
    const jobs = join(await tmp(), 'jobs');
    await mkdir(jobs, { recursive: true });
    await git(repo, ['worktree', 'add', join(jobs, 'JOB-AGR-001-1'), '-b', 'said/JOB-AGR-001-1', 'baseline']);
    await mkdir(join(jobs, 'JOB-AGR-002-1'));
    await writeFile(join(jobs, 'JOB-AGR-002-1', 'notes.txt'), 'leftover');

    const report = await archiveJobArtifacts({ repo, jobsDir: jobs, archiveRoot: join(jobs, '..', 'jobs-archive'), stamp: '20261103-181500' });
    expect(report.warnings).toEqual([]);
    expect(report.movedJobs.sort()).toEqual(['JOB-AGR-001-1', 'JOB-AGR-002-1']);
    expect(existsSync(join(jobs, 'JOB-AGR-001-1'))).toBe(false);
    expect(existsSync(join(jobs, '..', 'jobs-archive', '20261103-181500', 'JOB-AGR-001-1', 'a.txt'))).toBe(true);
    expect(await tagExists(repo, 'archive-20261103-181500-JOB-AGR-001-1')).toBe(true);
    expect((await git(repo, ['branch', '--list', 'said/*'])).trim()).toBe('');
    // the same job id can be created again
    await git(repo, ['worktree', 'add', join(jobs, 'JOB-AGR-001-1'), '-b', 'said/JOB-AGR-001-1', 'baseline']);
  });
});

describe('client repo preparation', () => {
  const template = paths.clientTemplate;
  const installed = existsSync(join(template, 'node_modules'));

  it.skipIf(!installed)('creates a clean baseline repo (node_modules symlink and dist are ignored)', async () => {
    const target = join(await tmp(), 'client-site');
    const first = await prepareClientRepo({ target, template, dependencies: 'link' });
    expect(first.created).toBe(true);
    expect(await isGitRepo(target)).toBe(true);
    expect(await tagExists(target, 'baseline')).toBe(true);
    expect((await git(target, ['log', '-1', '--format=%s'])).trim()).toBe('baseline: Larkspur landing page (light only)');
    expect(await dirtyEntries(target)).toEqual([]);
    expect(existsSync(join(target, 'node_modules'))).toBe(true);
    expect(existsSync(join(target, 'dist'))).toBe(false);
    const tracked = (await git(target, ['ls-files'])).split('\n');
    expect(tracked).toContain('src/App.tsx');
    expect(tracked.some((f) => f.startsWith('node_modules'))).toBe(false);

    // idempotent: an existing repo is not touched
    const headBefore = await head(target);
    await writeFile(join(target, 'src', 'App.tsx'), '// operator edit\n', { flag: 'a' });
    const second = await prepareClientRepo({ target, template, dependencies: 'link' });
    expect(second.created).toBe(false);
    expect(await head(target)).toBe(headBefore);
    expect(await dirtyEntries(target)).toHaveLength(1);
  });

  it('refuses a directory that exists but is not a repo of its own', async () => {
    const dir = await tmp();
    await expect(prepareClientRepo({ target: dir, template, dependencies: 'link' })).rejects.toThrow(/not a git repository/);
  });
});

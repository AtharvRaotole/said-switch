import { existsSync } from 'node:fs';
import { mkdir, readdir, realpath, rename } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { git } from './git.js';

export interface ArchiveReport {
  archiveDir: string | null;
  movedJobs: string[];
  taggedBranches: string[];
  warnings: string[];
}

async function registeredWorktrees(repo: string): Promise<string[]> {
  const out = await git(repo, ['worktree', 'list', '--porcelain']);
  return out
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
}

/**
 * Moves leftover builder job folders (`work/jobs/*`) into `work/jobs-archive/<stamp>/` and keeps their
 * `said/<jobId>` branches reachable as tags before deleting the branches, so the next run can reuse
 * the same job ids without losing evidence of the previous one.
 */
export async function archiveJobArtifacts(opts: {
  repo: string;
  jobsDir: string;
  archiveRoot: string;
  stamp: string;
}): Promise<ArchiveReport> {
  const report: ArchiveReport = { archiveDir: null, movedJobs: [], taggedBranches: [], warnings: [] };
  const archiveDir = join(opts.archiveRoot, opts.stamp);

  if (existsSync(opts.jobsDir)) {
    const jobsReal = await realpath(opts.jobsDir);
    const registered = new Set<string>();
    for (const wt of await registeredWorktrees(opts.repo)) {
      const real = await realpath(wt).catch(() => resolve(wt));
      if (real.startsWith(jobsReal + sep)) registered.add(real);
    }
    for (const entry of await readdir(opts.jobsDir)) {
      const from = join(opts.jobsDir, entry);
      const target = join(archiveDir, entry);
      await mkdir(archiveDir, { recursive: true });
      report.archiveDir = archiveDir;
      try {
        if (registered.has(join(jobsReal, entry))) {
          await git(opts.repo, ['worktree', 'move', from, target]);
          // Free the `said/<jobId>` branch (a branch cannot be deleted while a worktree has it checked out).
          await git(target, ['checkout', '-q', '--detach']).catch(() => undefined);
        } else {
          await rename(from, target);
        }
        report.movedJobs.push(entry);
      } catch (err) {
        report.warnings.push(`could not archive ${from}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await git(opts.repo, ['worktree', 'prune']).catch(() => undefined);
  }

  const branches = (await git(opts.repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/said/']))
    .split('\n')
    .filter(Boolean);
  for (const branch of branches) {
    const tag = `archive-${opts.stamp}-${basename(branch)}`;
    try {
      await git(opts.repo, ['tag', tag, branch]);
      await git(opts.repo, ['branch', '-D', branch]);
      report.taggedBranches.push(`${branch} → ${tag}`);
    } catch (err) {
      report.warnings.push(`could not archive branch ${branch}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return report;
}

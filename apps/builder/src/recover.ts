import type { Logger } from '@said/runtime';
import { execCommand } from './exec.js';
import { BuilderStateStore } from './state.js';
import { plain } from './text.js';

const SAFE_JOB = /^JOB-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/;

/**
 * After a crash, do not leave a job looking runnable.
 * A merged branch counts only when HEAD is that branch and the commit subject
 * names this job. The local job is then completed, and the error stays until
 * a receipt was actually sent. A hand merge of other work does not count.
 */
export async function recoverInFlightJobs(state: BuilderStateStore, clientRepo: string, log: Logger): Promise<void> {
  const stuck = state.snapshot().jobs.filter((job) => job.status === 'RUNNING' || job.status === 'VALIDATING');
  for (const job of stuck) {
    let merged: string | null = null;
    let foreign = false;
    if (SAFE_JOB.test(job.jobId)) {
      try {
        const head = await rev(clientRepo, ['rev-parse', 'HEAD']);
        const tip = await rev(clientRepo, ['rev-parse', `said/${job.jobId}`]);
        const subject = await rev(clientRepo, ['log', '-1', '--format=%s']);
        if (head && tip && head === tip && job.baseCommit && head !== job.baseCommit) {
          if (subject?.includes(job.jobId)) merged = head;
          else foreign = true;
        }
      } catch {
        merged = null;
        foreign = false;
      }
    }
    await state.update((current) => {
      const found = current.jobs.find((item) => item.jobId === job.jobId);
      if (!found || (found.status !== 'RUNNING' && found.status !== 'VALIDATING')) return;
      found.finishedAt = Date.now();
      if (merged) {
        found.status = 'COMPLETED';
        found.resultCommit = merged;
        found.error = found.receiptSent ? null : 'The change is on the site, but Said has not confirmed a receipt for this job.';
        log.info(`${job.jobId} was already merged. Marked completed after restart.`);
      } else if (foreign) {
        found.status = 'FAILED';
        found.error = plain('The site checkout moved, but that commit is not this job. Said was not told it finished.');
        log.warn(`${job.jobId} head is not this job's commit. Marked failed after restart.`);
      } else {
        found.status = 'FAILED';
        found.error = plain('The builder stopped before this job finished. The site checkout was left unchanged.');
        log.warn(`${job.jobId} did not finish. Marked failed after restart.`);
      }
    });
  }
}

async function rev(cwd: string, args: string[]): Promise<string | null> {
  const result = await execCommand('git', ['--no-pager', ...args], cwd, () => undefined);
  if (result.code !== 0) return null;
  return result.output.trim() || null;
}

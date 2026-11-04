import type { CheckResult, ExecutionStatus, WorkerKind } from '@said/core';

export const STEP_KEYS = [
  'authorized',
  'worktree',
  'worker',
  'paths',
  'typecheck',
  'build',
  'applied',
  'receipt',
] as const;

export type JobStepKey = (typeof STEP_KEYS)[number];
export type JobStepState = 'pending' | 'running' | 'passed' | 'failed';
export type LogStream = 'worker' | 'check' | 'system';

export interface JobStep {
  key: JobStepKey;
  state: JobStepState;
  startedAt: number | null;
  finishedAt: number | null;
  detail: string | null;
}

/** Matches `JobView` in the console. */
export interface JobView {
  jobId: string;
  agreementId: string;
  status: ExecutionStatus;
  worker: WorkerKind | null;
  steps: JobStep[];
  baseCommit: string | null;
  resultCommit: string | null;
  changedPaths: string[];
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface LogEvent {
  jobId: string;
  stream: LogStream;
  line: string;
  at: number;
}

/** Persisted job. `checks` stay off the public JobView. */
export interface JobRecord extends JobView {
  checks: CheckResult[];
  threadId: string | null;
  receiptSent: boolean;
}

export interface BuilderState {
  connectionId: string;
  cursor: number | null;
  generation: number | null;
  jobs: JobRecord[];
}

export function freshSteps(authorizedAt: number | null = null): JobStep[] {
  return STEP_KEYS.map((key) => {
    const authorized = key === 'authorized' && authorizedAt !== null;
    return {
      key,
      state: authorized ? 'passed' : 'pending',
      startedAt: authorized ? authorizedAt : null,
      finishedAt: authorized ? authorizedAt : null,
      detail: authorized ? 'Said, the signed ledger, both approvals, and the lock all check out.' : null,
    };
  });
}

export function toJobView(job: JobRecord): JobView {
  return {
    jobId: job.jobId,
    agreementId: job.agreementId,
    status: job.status,
    worker: job.worker,
    steps: job.steps.map((step) => ({ ...step })),
    baseCommit: job.baseCommit,
    resultCommit: job.resultCommit,
    changedPaths: [...job.changedPaths],
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

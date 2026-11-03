import type { Agreement, CheckResult, Execution, ExecutionStatus, WorkerKind } from '@said/core';
import type { JobStepKey, JobStepState, JobView } from '../api/types';
import { workerLabel } from './format';

export const STEP_ORDER: readonly JobStepKey[] = ['authorized', 'worktree', 'worker', 'paths', 'typecheck', 'build', 'applied', 'receipt'];

export interface PipelineStep {
  key: JobStepKey;
  label: string;
  state: JobStepState;
  startedAt: number | null;
  finishedAt: number | null;
  /** Known duration when start/finish times are not available (ledger checks). */
  durationMs: number | null;
  detail: string | null;
}

export interface Pipeline {
  /** builder: live job record. ledger: reconstructed from the signed execution record. */
  source: 'builder' | 'ledger';
  jobId: string | null;
  status: ExecutionStatus | null;
  worker: WorkerKind | null;
  steps: PipelineStep[];
  baseCommit: string | null;
  resultCommit: string | null;
  changedPaths: string[];
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export function stepLabel(key: JobStepKey, worker: WorkerKind | null): string {
  switch (key) {
    case 'authorized': return 'Authorized';
    case 'worktree': return 'Worktree';
    case 'worker': return `Coding agent · ${workerLabel(worker)}`;
    case 'paths': return 'Path check';
    case 'typecheck': return 'Typecheck';
    case 'build': return 'Build';
    case 'applied': return 'Applied';
    case 'receipt': return 'Receipt signed';
  }
}

export function jobForAgreement(agreement: Agreement, jobs: JobView[]): JobView | null {
  const mine = jobs.filter((j) => j.agreementId === agreement.id);
  const pinned = agreement.execution ? mine.find((j) => j.jobId === agreement.execution?.jobId) : undefined;
  if (pinned) return pinned;
  return mine.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;
}

export function pipelineFor(agreement: Agreement, jobs: JobView[]): Pipeline {
  const job = jobForAgreement(agreement, jobs);
  if (job) return fromJob(job);
  return fromExecution(agreement.execution);
}

function fromJob(job: JobView): Pipeline {
  const steps = STEP_ORDER.map((key): PipelineStep => {
    const step = job.steps.find((s) => s.key === key);
    return {
      key,
      label: stepLabel(key, job.worker),
      state: step?.state ?? 'pending',
      startedAt: step?.startedAt ?? null,
      finishedAt: step?.finishedAt ?? null,
      durationMs: null,
      detail: step?.detail ?? null,
    };
  });
  return {
    source: 'builder',
    jobId: job.jobId,
    status: job.status,
    worker: job.worker,
    steps,
    baseCommit: job.baseCommit,
    resultCommit: job.resultCommit,
    changedPaths: job.changedPaths,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

const CHECK_STEPS: ReadonlyArray<{ key: JobStepKey; match: RegExp }> = [
  { key: 'paths', match: /path/i },
  { key: 'typecheck', match: /type/i },
  { key: 'build', match: /build/i },
];

function fromExecution(execution: Execution | null): Pipeline {
  const worker = execution?.worker ?? null;
  const steps = STEP_ORDER.map((key): PipelineStep => ({
    key,
    label: stepLabel(key, worker),
    state: 'pending',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    detail: null,
  }));
  const at = (key: JobStepKey) => steps.find((s) => s.key === key) as PipelineStep;
  const base: Pipeline = {
    source: 'ledger',
    jobId: execution?.jobId ?? null,
    status: execution?.status ?? null,
    worker,
    steps,
    baseCommit: execution?.baseCommit ?? null,
    resultCommit: execution?.resultCommit ?? null,
    changedPaths: execution?.changedPaths ?? [],
    error: execution?.error ?? null,
    startedAt: execution?.startedAt ?? null,
    finishedAt: execution?.finishedAt ?? null,
  };
  if (!execution) return base;

  const { status } = execution;
  if (status === 'READY') {
    Object.assign(at('authorized'), { state: 'running', detail: 'Start authorization sent; waiting for the builder to verify it' });
    return base;
  }

  Object.assign(at('authorized'), { state: 'passed', detail: 'Builder verified the start token and signed ledger' });
  Object.assign(at('worktree'), { state: 'passed', detail: execution.baseCommit ? `Based on ${execution.baseCommit.slice(0, 7)}` : null });
  const workerFailed = status === 'FAILED' && execution.checks.length === 0;
  Object.assign(at('worker'), {
    state: status === 'RUNNING' ? 'running' : workerFailed ? 'failed' : 'passed',
    startedAt: status === 'RUNNING' ? execution.startedAt : null,
    detail: workerFailed ? execution.error : null,
  });
  if (status === 'RUNNING') return base;

  let blocked = false;
  for (const { key, match } of CHECK_STEPS) {
    const check: CheckResult | undefined = execution.checks.find((c) => match.test(c.name));
    const step = at(key);
    if (blocked) continue;
    if (check) {
      Object.assign(step, { state: check.ok ? 'passed' : 'failed', durationMs: check.durationMs, detail: check.detail || null });
      if (!check.ok) blocked = true;
    } else if (status === 'VALIDATING') {
      step.state = 'running';
      blocked = true;
    }
  }

  if (status === 'COMPLETED') {
    for (const step of steps) if (step.state === 'pending') step.state = 'passed';
    at('applied').detail = execution.resultCommit ? `Fast-forwarded to ${execution.resultCommit.slice(0, 7)}` : null;
  }

  if (status === 'FAILED') {
    const failed = steps.some((s) => s.state === 'failed');
    if (!failed) {
      const firstOpen = steps.find((s) => s.state === 'pending' && s.key !== 'receipt');
      if (firstOpen) Object.assign(firstOpen, { state: 'failed', detail: execution.error });
    }
    Object.assign(at('receipt'), { state: 'passed', detail: 'Failure receipt signed by the builder' });
  }
  return base;
}

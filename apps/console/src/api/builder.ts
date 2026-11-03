import { getJson, isRecord, openStream } from './sse';
import type { JobStep, JobStepKey, JobStepState, JobView, LogEvent, LogStream } from './types';

export const BUILDER_URL = (import.meta.env.VITE_BUILDER_URL || 'http://localhost:7420').replace(/\/+$/, '');

export async function fetchJobs(): Promise<JobView[]> {
  const raw = await getJson(`${BUILDER_URL}/api/jobs`);
  if (!isRecord(raw) || !Array.isArray(raw.jobs)) throw new Error('Builder /api/jobs returned an unexpected shape');
  return raw.jobs.map(parseJob).filter((job): job is JobView => job !== null);
}

export function connectBuilder(handlers: {
  onJobs: (jobs: JobView[]) => void;
  onJob: (job: JobView) => void;
  onLog: (line: LogEvent) => void;
  onOpen: () => void;
  onDown: () => void;
}): () => void {
  let alive = true;
  const resync = () => {
    fetchJobs()
      .then((jobs) => alive && handlers.onJobs(jobs))
      .catch(() => undefined);
  };
  resync();
  const close = openStream({
    url: `${BUILDER_URL}/api/jobs/stream`,
    events: {
      job: (data) => {
        const job = parseJob(data);
        if (job) handlers.onJob(job);
      },
      log: (data) => {
        const line = parseLog(data);
        if (line) handlers.onLog(line);
      },
    },
    onOpen: () => {
      handlers.onOpen();
      resync();
    },
    onDown: handlers.onDown,
  });
  return () => {
    alive = false;
    close();
  };
}

const STEP_KEYS: readonly JobStepKey[] = ['authorized', 'worktree', 'worker', 'paths', 'typecheck', 'build', 'applied', 'receipt'];
const STEP_STATES: readonly JobStepState[] = ['pending', 'running', 'passed', 'failed'];
const STATUSES = ['READY', 'RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED'] as const;
const WORKERS = ['claude', 'codex', 'scripted'] as const;
const STREAMS: readonly LogStream[] = ['worker', 'check', 'system'];

export function parseJob(raw: unknown): JobView | null {
  if (!isRecord(raw) || typeof raw.jobId !== 'string' || typeof raw.agreementId !== 'string') return null;
  const status = STATUSES.find((s) => s === raw.status);
  if (!status) return null;
  return {
    jobId: raw.jobId,
    agreementId: raw.agreementId,
    status,
    worker: WORKERS.find((w) => w === raw.worker) ?? null,
    steps: Array.isArray(raw.steps) ? raw.steps.map(parseStep).filter((s): s is JobStep => s !== null) : [],
    baseCommit: strOrNull(raw.baseCommit),
    resultCommit: strOrNull(raw.resultCommit),
    changedPaths: Array.isArray(raw.changedPaths) ? raw.changedPaths.filter((p): p is string => typeof p === 'string') : [],
    error: strOrNull(raw.error),
    startedAt: numOrNull(raw.startedAt),
    finishedAt: numOrNull(raw.finishedAt),
  };
}

function parseStep(raw: unknown): JobStep | null {
  if (!isRecord(raw)) return null;
  const key = STEP_KEYS.find((k) => k === raw.key);
  const state = STEP_STATES.find((s) => s === raw.state);
  if (!key || !state) return null;
  return {
    key,
    state,
    startedAt: numOrNull(raw.startedAt),
    finishedAt: numOrNull(raw.finishedAt),
    detail: strOrNull(raw.detail),
  };
}

export function parseLog(raw: unknown): LogEvent | null {
  if (!isRecord(raw) || typeof raw.jobId !== 'string' || typeof raw.line !== 'string') return null;
  return {
    jobId: raw.jobId,
    stream: STREAMS.find((s) => s === raw.stream) ?? 'system',
    line: raw.line,
    at: typeof raw.at === 'number' ? raw.at : Date.now(),
  };
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

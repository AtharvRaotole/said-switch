import type { ExecutionStatus, SignedLedger, WorkerKind } from '@said/core';

export type NotaryMode = 'live' | 'offline';

/** `GET /api/state` on the notary, and the payload of every SSE `state` event. */
export interface NotaryState {
  mode: NotaryMode;
  switch: { url: string; connected: boolean; version: string | null };
  room: { id: string; name: string };
  notaryPublicKey: string;
  keyId: string;
  signedLedger: SignedLedger | null;
  ledgerDocumentId: string | null;
}

/** Payload of the notary's SSE `chat` event (recent room messages). */
export interface ChatEvent {
  messageId: string;
  senderName: string;
  body: string;
  timestamp: number;
  fromAgent: boolean;
}

export type JobStepKey =
  | 'authorized'
  | 'worktree'
  | 'worker'
  | 'paths'
  | 'typecheck'
  | 'build'
  | 'applied'
  | 'receipt';

export type JobStepState = 'pending' | 'running' | 'passed' | 'failed';

export interface JobStep {
  key: JobStepKey;
  state: JobStepState;
  startedAt: number | null;
  finishedAt: number | null;
  detail: string | null;
}

/** One builder job, from `GET /api/jobs` and the builder's SSE `job` event. */
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

export type LogStream = 'worker' | 'check' | 'system';

/** Payload of the builder's SSE `log` event. */
export interface LogEvent {
  jobId: string;
  stream: LogStream;
  line: string;
  at: number;
}

/**
 * connecting: first attempt in flight. open: stream connected.
 * reconnecting: was connected, lost it, retrying. unreachable: never connected, retrying.
 */
export type LinkStatus = 'connecting' | 'open' | 'reconnecting' | 'unreachable';

export interface ConsoleData {
  source: 'live' | 'fixture';
  notaryUrl: string;
  builderUrl: string;
  notaryLink: LinkStatus;
  builderLink: LinkStatus;
  state: NotaryState | null;
  /** Set when the notary sent a ledger the console cannot render. */
  ledgerIssue: string | null;
  jobs: JobView[];
  logs: Record<string, LogEvent[]>;
  chat: ChatEvent[];
  /** Frozen clock for fixtures; null means use the real clock. */
  clock: number | null;
}

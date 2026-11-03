import { appendAudit, commitChange } from './audit';
import { executionReply } from './replies';
import type { Agreement, EngineResult, ExecutionReceipt, Ledger } from './types';

const TERMINAL = new Set(['COMPLETED', 'FAILED']);

export function recordHandoff(ledger: Ledger, input: { agreementId: string; jobId: string; now: number }): Ledger {
  const next = structuredClone(ledger);
  const agreement = next.agreements.find((a) => a.id === input.agreementId);
  if (!agreement) throw new Error(`recordHandoff: unknown agreement ${input.agreementId}`);
  if (!input.jobId.startsWith(`JOB-${agreement.id}-`)) {
    throw new Error(`recordHandoff: job ${input.jobId} does not belong to ${agreement.id}`);
  }
  const current = agreement.execution;
  if (current && (current.status === 'COMPLETED' || current.status === 'RUNNING' || current.status === 'VALIDATING')) {
    throw new Error(`recordHandoff: ${agreement.id} already has job ${current.jobId} ${current.status}`);
  }
  agreement.execution = {
    jobId: input.jobId,
    status: 'READY',
    worker: null,
    baseCommit: null,
    resultCommit: null,
    changedPaths: [],
    checks: [],
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  appendAudit(next, {
    kind: 'handoff_sent',
    at: input.now,
    actor: null,
    ref: agreement.id,
    summary: `Start authorization for ${agreement.id} sent to the builder as ${input.jobId}`,
  });
  commitChange(next, input.now, null);
  return next;
}

/** Thread of the acceptance that locked the agreement (the most recent one). */
function agreementThread(agreement: Agreement): string | null {
  const approvals = Object.values(agreement.approvals);
  approvals.sort((a, b) => b.timestamp - a.timestamp);
  return approvals[0]?.threadId ?? null;
}

export function applyExecutionReceipt(ledger: Ledger, receipt: ExecutionReceipt, now: number): EngineResult {
  const ignore: EngineResult = { ledger: null, effects: [] };
  if (receipt.roomId !== ledger.roomId) return ignore;
  const index = ledger.agreements.findIndex((a) => a.id === receipt.agreementId);
  const current = ledger.agreements[index]?.execution;
  if (!current || current.jobId !== receipt.jobId) return ignore;
  if (TERMINAL.has(current.status) || receipt.status === current.status || receipt.status === 'READY') return ignore;

  const next = structuredClone(ledger);
  const agreement = next.agreements[index]!;
  agreement.execution = {
    jobId: current.jobId,
    status: receipt.status,
    worker: receipt.worker ?? current.worker,
    baseCommit: receipt.baseCommit ?? current.baseCommit,
    resultCommit: receipt.resultCommit ?? current.resultCommit,
    changedPaths: [...receipt.changedPaths],
    checks: receipt.checks.map((c) => ({ ...c })),
    startedAt: current.startedAt ?? receipt.at,
    finishedAt: TERMINAL.has(receipt.status) ? receipt.at : null,
    error: receipt.error,
  };
  const detail =
    receipt.status === 'COMPLETED'
      ? ` · commit ${receipt.resultCommit?.slice(0, 7) ?? 'none'} · ${receipt.changedPaths.length} file(s)`
      : receipt.status === 'FAILED'
        ? ` · ${receipt.error ?? 'no reason given'}`
        : '';
  appendAudit(next, {
    kind: 'execution_update',
    at: now,
    actor: null,
    ref: agreement.id,
    summary: `${receipt.jobId} ${receipt.status}${detail}`,
  });
  commitChange(next, now, null);
  return { ledger: next, effects: [{ kind: 'reply', body: executionReply(agreement), threadId: agreementThread(agreement) }] };
}

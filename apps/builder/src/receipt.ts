import { fenceJson, signReceipt } from '@said/core';
import type { CheckResult, ExecutionReceipt, ExecutionStatus, WorkerKind } from '@said/core';
import { plain } from './text.js';

export async function signExecutionReceipt(input: {
  roomId: string;
  agreementId: string;
  jobId: string;
  status: ExecutionStatus;
  worker: WorkerKind | null;
  baseCommit: string | null;
  resultCommit: string | null;
  changedPaths: string[];
  checks: CheckResult[];
  error: string | null;
  at: number;
  keyId: string;
  privateKey: string;
}): Promise<ExecutionReceipt> {
  const { privateKey, error, ...rest } = input;
  return signReceipt(
    { type: 'said.receipt/v1', ...rest, error: error === null ? null : plain(error) },
    privateKey,
  );
}

export function receiptText(receipt: ExecutionReceipt): string {
  const lead =
    receipt.status === 'COMPLETED'
      ? `Job ${receipt.jobId} for ${receipt.agreementId} is done.`
      : receipt.status === 'FAILED'
        ? `Job ${receipt.jobId} for ${receipt.agreementId} failed. ${receipt.error ?? 'No reason given.'}`
        : `Job ${receipt.jobId} for ${receipt.agreementId} is running.`;
  return `${lead}\n${fenceJson('said-receipt', receipt)}`;
}

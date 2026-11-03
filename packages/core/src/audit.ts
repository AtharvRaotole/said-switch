import type { AuditEvent, Ledger } from './types';

export const MAX_PROCESSED_IDS = 500;

/** Mutates `ledger`: appends an audit event with the next sequence number. */
export function appendAudit(ledger: Ledger, event: Omit<AuditEvent, 'seq'>): void {
  const last = ledger.audit[ledger.audit.length - 1];
  ledger.audit.push({ seq: (last?.seq ?? 0) + 1, ...event });
}

/** Mutates `ledger`: records the processed message (if any), bumps revision and updatedAt. */
export function commitChange(ledger: Ledger, now: number, messageId: string | null): void {
  if (messageId !== null) {
    ledger.processedMessageIds = [...ledger.processedMessageIds, messageId].slice(-MAX_PROCESSED_IDS);
  }
  ledger.revision += 1;
  ledger.updatedAt = now;
}

import { canonicalJson } from './canonical';
import { sha256Hex } from './crypto';
import type { AuditEvent, Ledger } from './types';

export const MAX_PROCESSED_IDS = 500;

/** prevHash value used for the first audit event in a ledger. */
export const GENESIS_PREV_HASH = sha256Hex('said.audit.genesis/v1');

export function auditEntryHash(input: {
  prevHash: string;
  seq: number;
  kind: string;
  at: number;
  actor: string | null;
  ref: string | null;
  summary: string;
}): string {
  return sha256Hex(
    canonicalJson({
      prevHash: input.prevHash,
      seq: input.seq,
      kind: input.kind,
      at: input.at,
      actor: input.actor,
      ref: input.ref,
      summary: input.summary,
    }),
  );
}

/** Mutates `ledger`: appends an audit event with the next sequence number and hash-chain links. */
export function appendAudit(ledger: Ledger, event: Omit<AuditEvent, 'seq' | 'hash' | 'prevHash'>): void {
  const last = ledger.audit[ledger.audit.length - 1];
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS_PREV_HASH;
  const hash = auditEntryHash({
    prevHash,
    seq,
    kind: event.kind,
    at: event.at,
    actor: event.actor,
    ref: event.ref,
    summary: event.summary,
  });
  ledger.audit.push({ seq, ...event, prevHash, hash });
}

/** Walks the audit array and returns ok or the first break reason. */
export function verifyAuditChain(ledger: Ledger): { ok: true } | { ok: false; reason: string } {
  let expectedPrev = GENESIS_PREV_HASH;
  let expectedSeq = 1;
  for (const entry of ledger.audit) {
    if (entry.seq !== expectedSeq) {
      return { ok: false, reason: `Audit seq gap: expected ${expectedSeq}, got ${entry.seq}` };
    }
    if (entry.prevHash !== expectedPrev) {
      return { ok: false, reason: `Audit chain break at seq ${entry.seq}: prevHash does not match` };
    }
    const recomputed = auditEntryHash({
      prevHash: entry.prevHash,
      seq: entry.seq,
      kind: entry.kind,
      at: entry.at,
      actor: entry.actor,
      ref: entry.ref,
      summary: entry.summary,
    });
    if (entry.hash !== recomputed) {
      return { ok: false, reason: `Audit hash mismatch at seq ${entry.seq}` };
    }
    expectedPrev = entry.hash;
    expectedSeq += 1;
  }
  return { ok: true };
}

/** Mutates `ledger`: records the processed message (if any), bumps revision and updatedAt. */
export function commitChange(ledger: Ledger, now: number, messageId: string | null): void {
  if (messageId !== null) {
    ledger.processedMessageIds = [...ledger.processedMessageIds, messageId].slice(-MAX_PROCESSED_IDS);
  }
  ledger.revision += 1;
  ledger.updatedAt = now;
}

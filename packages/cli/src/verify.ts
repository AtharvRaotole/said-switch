import { readFile } from 'node:fs/promises';
import {
  parseLedgerDocument,
  verifyAgreementReceipt,
  verifyAuditChain,
  verifySignedLedger,
  type AgreementReceipt,
  type SignedLedger,
} from '@said/core';

export type VerifyTarget =
  | { kind: 'ledger'; signed: SignedLedger }
  | { kind: 'agreement-receipt'; receipt: AgreementReceipt };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse a ledger document or a standalone agreement-receipt JSON / fenced block. */
export function parseVerifyTarget(raw: string): VerifyTarget {
  const trimmed = raw.trim();
  if (trimmed.includes('```said-ledger')) {
    return { kind: 'ledger', signed: parseLedgerDocument(trimmed) };
  }
  if (trimmed.includes('```said-agreement-receipt')) {
    const m = /```said-agreement-receipt\s*\n([\s\S]*?)\n```/.exec(trimmed);
    if (!m) throw new Error('said-agreement-receipt fence is empty or malformed');
    const parsed = JSON.parse(m[1]!) as unknown;
    if (!isRecord(parsed) || parsed.type !== 'said.agreement-receipt/v1') {
      throw new Error('Fenced block is not a said.agreement-receipt/v1');
    }
    return { kind: 'agreement-receipt', receipt: parsed as unknown as AgreementReceipt };
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) throw new Error('Input must be a JSON object or a Said markdown document');
  if (parsed.type === 'said.agreement-receipt/v1') {
    return { kind: 'agreement-receipt', receipt: parsed as unknown as AgreementReceipt };
  }
  if (isRecord(parsed.payload) && typeof parsed.digest === 'string' && typeof parsed.signature === 'string') {
    return { kind: 'ledger', signed: parsed as unknown as SignedLedger };
  }
  throw new Error('Unrecognized Said document (expected ledger or agreement receipt)');
}

export async function verifyFile(
  path: string,
  publicKey: string,
): Promise<{ ok: true; summary: string } | { ok: false; reason: string }> {
  const raw = await readFile(path, 'utf8');
  let target: VerifyTarget;
  try {
    target = parseVerifyTarget(raw);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (target.kind === 'ledger') {
    const sig = await verifySignedLedger(target.signed, publicKey);
    if (!sig.ok) return sig;
    const chain = verifyAuditChain(target.signed.payload);
    if (!chain.ok) return chain;
    const l = target.signed.payload;
    return {
      ok: true,
      summary: `Ledger OK: room ${l.roomId}, revision ${l.revision}, ${l.agreements.length} agreement(s), ${l.audit.length} audit events, digest ${target.signed.digest.slice(0, 10)}`,
    };
  }
  const receipt = await verifyAgreementReceipt(target.receipt, publicKey);
  if (!receipt.ok) return receipt;
  const r = target.receipt;
  return {
    ok: true,
    summary: `Agreement receipt OK: ${r.agreementId} (${r.draftId} v${r.version}), terms hash ${r.termsHash.slice(0, 10)}`,
  };
}

import { canonicalJson } from './canonical';
import { sha256Hex, signDigest, verifyDigest } from './crypto';
import { fenceJson } from './fences';
import { formatTimeUtc, inline, shortHash } from './replies';
import type { Agreement, Ledger, SignedLedger } from './types';

export interface AgreementReceipt {
  type: 'said.agreement-receipt/v1';
  roomId: string;
  agreementId: string;
  draftId: string;
  version: number;
  scope: string;
  terms: string;
  termsHash: string;
  lockedAt: number;
  ledgerRevision: number;
  ledgerDigest: string;
  parties: Array<{ role: string; label: string; senderId: string }>;
  approvals: Array<{
    role: string;
    label: string;
    senderId: string;
    messageId: string;
    timestamp: number;
    text: string;
    termsHash: string;
  }>;
  issuedAt: number;
  keyId: string;
  signature: string;
}

function unsignedDigest(value: object): string {
  const { signature: _signature, ...unsigned } = value as Record<string, unknown>;
  return sha256Hex(canonicalJson(unsigned));
}

export function buildAgreementReceipt(input: {
  ledger: Ledger;
  agreement: Agreement;
  ledgerDigest: string;
  keyId: string;
  issuedAt: number;
}): Omit<AgreementReceipt, 'signature'> {
  const { ledger, agreement } = input;
  return {
    type: 'said.agreement-receipt/v1',
    roomId: ledger.roomId,
    agreementId: agreement.id,
    draftId: agreement.draftId,
    version: agreement.version,
    scope: agreement.scope,
    terms: agreement.terms,
    termsHash: agreement.termsHash,
    lockedAt: agreement.lockedAt,
    ledgerRevision: ledger.revision,
    ledgerDigest: input.ledgerDigest,
    parties: ledger.parties.map((p) => ({ role: p.role, label: p.label, senderId: p.senderId })),
    approvals: ledger.parties.flatMap((p) => {
      const a = agreement.approvals[p.role];
      if (!a) return [];
      return [
        {
          role: p.role,
          label: p.label,
          senderId: a.senderId,
          messageId: a.messageId,
          timestamp: a.timestamp,
          text: a.text,
          termsHash: a.termsHash,
        },
      ];
    }),
    issuedAt: input.issuedAt,
    keyId: input.keyId,
  };
}

export async function signAgreementReceipt(
  unsigned: Omit<AgreementReceipt, 'signature'>,
  privateKey: string,
): Promise<AgreementReceipt> {
  return { ...unsigned, signature: await signDigest(unsignedDigest(unsigned), privateKey) };
}

export async function verifyAgreementReceipt(
  receipt: AgreementReceipt,
  publicKey: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (receipt?.type !== 'said.agreement-receipt/v1') {
    return { ok: false, reason: 'Unexpected agreement receipt type' };
  }
  if (typeof receipt.signature !== 'string' || !receipt.signature) {
    return { ok: false, reason: 'Agreement receipt signature missing' };
  }
  try {
    const ok = await verifyDigest(unsignedDigest(receipt), receipt.signature, publicKey);
    return ok ? { ok: true } : { ok: false, reason: 'Agreement receipt signature does not verify' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export function renderAgreementReceiptMarkdown(receipt: AgreementReceipt): string {
  const lines = [
    '# Said Agreement Receipt',
    '',
    'Signed bilateral acceptance record. Anyone can verify the fenced JSON with `npm run verify -- <file> --public-key-file .said/public-keys.json`.',
    '',
    `- Agreement: **${receipt.agreementId}** (${receipt.draftId} v${receipt.version})`,
    `- Scope: ${inline(receipt.scope)}`,
    `- Terms: ${inline(receipt.terms)}`,
    `- Terms hash: \`${shortHash(receipt.termsHash)}\``,
    `- Locked: ${formatTimeUtc(receipt.lockedAt)}`,
    `- Ledger revision ${receipt.ledgerRevision} · digest \`${shortHash(receipt.ledgerDigest)}\``,
    `- Room: \`${inline(receipt.roomId)}\``,
    '',
    '## Approvals',
    '',
  ];
  for (const a of receipt.approvals) {
    lines.push(
      `- **${inline(a.label)}** (${a.role}) at ${formatTimeUtc(a.timestamp)}: "${inline(a.text)}" · msg \`${inline(a.messageId)}\``,
    );
  }
  lines.push('', fenceJson('said-agreement-receipt', receipt), '');
  return lines.join('\n');
}

/** Prefer the locked agreement named in `agreementId`, else the newest agreement. */
export function pickAgreement(ledger: Ledger, agreementId?: string | null): Agreement | null {
  if (agreementId) return ledger.agreements.find((a) => a.id === agreementId) ?? null;
  return ledger.agreements[ledger.agreements.length - 1] ?? null;
}

export async function exportSignedAgreementReceipt(input: {
  signed: SignedLedger;
  privateKey: string;
  keyId: string;
  issuedAt: number;
  agreementId?: string | null;
}): Promise<AgreementReceipt | null> {
  const agreement = pickAgreement(input.signed.payload, input.agreementId);
  if (!agreement) return null;
  const unsigned = buildAgreementReceipt({
    ledger: input.signed.payload,
    agreement,
    ledgerDigest: input.signed.digest,
    keyId: input.keyId,
    issuedAt: input.issuedAt,
  });
  return signAgreementReceipt(unsigned, input.privateKey);
}

import { appendAudit, commitChange, verifyAuditChain } from './audit';
import { canonicalJson } from './canonical';
import { sha256Hex, signDigest, verifyDigest } from './crypto';
import { fenceJson, findFencedBlocks } from './fences';
import { formatTime, inline, shortHash } from './replies';
import type { Ledger, Party, Role, RoomMode, SignedLedger } from './types';

export class LedgerFormatError extends Error {
  override name = 'LedgerFormatError';
}

export const ROLES_BY_MODE: Record<RoomMode, readonly [Role, Role]> = {
  business: ['developer', 'client'],
  personal: ['partnerA', 'partnerB'],
};

/** Throws when parties are not distinct, not valid for the mode, or more than two. */
export function assertValidParties(mode: RoomMode, parties: Party[]): void {
  const allowed: readonly Role[] = ROLES_BY_MODE[mode];
  if (parties.length > 2) throw new Error('A room has at most two parties');
  for (const p of parties) {
    if (!allowed.includes(p.role)) throw new Error(`Role ${p.role} is not valid in ${mode} mode`);
    if (!p.senderId) throw new Error(`Party ${p.label} has no senderId`);
  }
  if (new Set(parties.map((p) => p.role)).size !== parties.length) throw new Error('Party roles must be distinct');
  if (new Set(parties.map((p) => p.senderId)).size !== parties.length) throw new Error('Party senderIds must be distinct');
}

export function emptyLedger(init: {
  deploymentId: string;
  roomId: string;
  mode: RoomMode;
  parties: Party[];
  now: number;
}): Ledger {
  assertValidParties(init.mode, init.parties);
  return {
    schema: 'said.ledger/v1',
    deploymentId: init.deploymentId,
    roomId: init.roomId,
    mode: init.mode,
    parties: init.parties.map((p) => ({ ...p })),
    revision: 0,
    updatedAt: init.now,
    nextDraftSeq: 1,
    nextAgreementSeq: 1,
    nextRefusalSeq: 1,
    drafts: [],
    agreements: [],
    refusals: [],
    audit: [],
    processedMessageIds: [],
  };
}

/** Adds (or re-binds) the party for a role and audits `enrolled`. */
export function enrollParty(ledger: Ledger, party: Party, now: number): Ledger {
  const next = structuredClone(ledger);
  next.parties = [...next.parties.filter((p) => p.role !== party.role), { ...party }];
  assertValidParties(next.mode, next.parties);
  const order = ROLES_BY_MODE[next.mode];
  next.parties.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  appendAudit(next, { kind: 'enrolled', at: now, actor: party.label, ref: null, summary: `${party.label} enrolled as ${party.role}` });
  commitChange(next, now, null);
  return next;
}

export function computeTermsHash(input: {
  roomId: string;
  draftId: string;
  version: number;
  scope: string;
  terms: string | null;
}): string {
  const { roomId, draftId, version, scope, terms } = input;
  return sha256Hex(canonicalJson({ roomId, draftId, version, scope, terms }));
}

export function ledgerDigest(payload: Ledger): string {
  return sha256Hex(canonicalJson(payload));
}

export async function signLedger(payload: Ledger, keyId: string, privateKey: string): Promise<SignedLedger> {
  const digest = ledgerDigest(payload);
  return { payload, digest, keyId, signature: await signDigest(digest, privateKey) };
}

export async function verifySignedLedger(
  signed: SignedLedger,
  publicKey: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    assertSignedLedgerShape(signed);
    if (ledgerDigest(signed.payload) !== signed.digest) {
      return { ok: false, reason: 'Ledger digest does not match its payload' };
    }
    if (!(await verifyDigest(signed.digest, signed.signature, publicKey))) {
      return { ok: false, reason: 'Ledger signature does not verify with the pinned public key' };
    }
    const chain = verifyAuditChain(signed.payload);
    if (!chain.ok) return { ok: false, reason: chain.reason };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export function partyForSender(ledger: Ledger, senderId: string): Party | null {
  if (!senderId) return null;
  return ledger.parties.find((p) => p.senderId === senderId) ?? null;
}

export function renderLedgerDocument(signed: SignedLedger): string {
  const l = signed.payload;
  const lines: string[] = [
    '# Said Ledger',
    '',
    'Signed consent record for this room, kept by Said. Only the `said-ledger` block at the end is authoritative; everything above it is generated from that block.',
    '',
    `- Mode: ${l.mode} · Room: \`${inline(l.roomId)}\``,
    `- Parties: ${l.parties.map((p) => `${inline(p.label)} (${p.role})`).join(', ') || 'none enrolled'}`,
    `- Revision ${l.revision} · updated ${formatTime(l.updatedAt)}`,
    `- Digest \`${shortHash(signed.digest)}\` · key \`${inline(signed.keyId)}\``,
    `- Audit chain: ${l.audit.length} event${l.audit.length === 1 ? '' : 's'}${l.audit.length ? ` · head \`${shortHash(l.audit[l.audit.length - 1]!.hash)}\`` : ''}`,
    '',
    '## Agreements',
    '',
  ];
  if (l.agreements.length === 0) lines.push('- none yet');
  for (const a of l.agreements) {
    const exec = a.execution ? ` · ${a.execution.jobId} ${a.execution.status}` : '';
    lines.push(
      `- 🔒 **${a.id}** · ${a.draftId} v${a.version} · ${inline(a.scope)}. ${inline(a.terms)} · hash \`${shortHash(a.termsHash)}\` · locked ${formatTime(a.lockedAt)}${exec}`,
    );
  }
  lines.push('', '## Drafts', '');
  if (l.drafts.length === 0) lines.push('- none yet');
  for (const d of l.drafts) {
    const terms = d.terms === null ? 'needs terms' : `${inline(d.terms)} · hash \`${shortHash(d.termsHash)}\``;
    const approvals = Object.values(d.approvals).map((a) => `${a.role} v${a.version}`);
    lines.push(
      `- **${d.id} v${d.version}** · ${inline(d.scope)}. ${d.status} · ${terms}${approvals.length ? ` · accepted by ${approvals.join(', ')}` : ''}`,
    );
  }
  lines.push('', '## Refusals', '');
  if (l.refusals.length === 0) lines.push('- none');
  for (const r of l.refusals) {
    lines.push(
      `- ${r.id} · ${formatTime(r.at)} · ${inline(r.receipt.senderName)} addressed @${inline(r.target)} directly${r.draftId ? ` · logged as ${r.draftId}` : ''}`,
    );
  }
  lines.push('', fenceJson('said-ledger', signed), '');
  return lines.join('\n');
}

export function parseLedgerDocument(content: string): SignedLedger {
  const blocks = findFencedBlocks(content, 'said-ledger');
  if (blocks.length === 0) throw new LedgerFormatError('No said-ledger block found');
  if (blocks.length > 1) throw new LedgerFormatError('More than one said-ledger block found');
  let parsed: unknown;
  try {
    parsed = JSON.parse(blocks[0]!);
  } catch {
    throw new LedgerFormatError('said-ledger block is not valid JSON');
  }
  assertSignedLedgerShape(parsed);
  return parsed;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(msg: string): never {
  throw new LedgerFormatError(msg);
}

function assertSignedLedgerShape(value: unknown): asserts value is SignedLedger {
  if (!isObject(value)) fail('Signed ledger must be an object');
  const v = value;
  if (typeof v.digest !== 'string' || !/^[0-9a-f]{64}$/.test(v.digest)) fail('Signed ledger digest must be 64 hex chars');
  if (typeof v.keyId !== 'string') fail('Signed ledger keyId must be a string');
  if (typeof v.signature !== 'string' || v.signature.length === 0) fail('Signed ledger signature missing');
  const p = v.payload;
  if (!isObject(p)) fail('Signed ledger payload must be an object');
  if (p.schema !== 'said.ledger/v1') fail(`Unsupported ledger schema ${String(p.schema)}`);
  if (p.mode !== 'business' && p.mode !== 'personal') fail('Ledger mode must be business or personal');
  for (const key of ['deploymentId', 'roomId'] as const) {
    if (typeof p[key] !== 'string') fail(`Ledger ${key} must be a string`);
  }
  for (const key of ['revision', 'updatedAt', 'nextDraftSeq', 'nextAgreementSeq', 'nextRefusalSeq'] as const) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) fail(`Ledger ${key} must be a number`);
  }
  for (const key of ['parties', 'drafts', 'agreements', 'refusals', 'audit', 'processedMessageIds'] as const) {
    if (!Array.isArray(p[key])) fail(`Ledger ${key} must be an array`);
  }
  for (const party of p.parties as unknown[]) {
    if (!isObject(party) || typeof party.role !== 'string' || typeof party.senderId !== 'string' || typeof party.label !== 'string') {
      fail('Ledger party entries must have role, label and senderId');
    }
  }
}

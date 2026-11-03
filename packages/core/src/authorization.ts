import { computeTermsHash, ROLES_BY_MODE } from './ledger';
import type { Agreement, Ledger, Party, StartToken } from './types';

const MAX_CLOCK_SKEW_MS = 60_000;

type AuthResult = { ok: true; agreement: Agreement } | { ok: false; reason: string };

function sameParties(a: Party[], b: Party[]): boolean {
  return a.length === b.length && a.every((p) => b.some((q) => q.role === p.role && q.senderId === p.senderId));
}

/** The builder's independent check that a start token is backed by a signed, bilaterally locked agreement. */
export function checkStartAuthorization(input: {
  signedLedgerVerified: boolean;
  ledger: Ledger;
  token: StartToken;
  tokenVerified: boolean;
  expectedRoomId: string;
  expectedParties: Party[] | null;
  now: number;
}): AuthResult {
  const { ledger, token, now } = input;
  const deny = (reason: string): AuthResult => ({ ok: false, reason });

  if (!input.signedLedgerVerified) return deny('Ledger signature was not verified');
  if (!input.tokenVerified) return deny('Start token signature was not verified');
  if (token.type !== 'said.start/v1') return deny(`Unexpected token type ${String(token.type)}`);
  if (ledger.roomId !== input.expectedRoomId) return deny(`Ledger belongs to room ${ledger.roomId}, expected ${input.expectedRoomId}`);
  if (token.roomId !== input.expectedRoomId) return deny(`Token is for room ${token.roomId}, expected ${input.expectedRoomId}`);

  const agreement = ledger.agreements.find((a) => a.id === token.agreementId);
  if (!agreement) return deny(`Agreement ${token.agreementId} not found in the ledger`);
  const draft = ledger.drafts.find((d) => d.id === agreement.draftId);
  if (!draft || draft.status !== 'LOCKED' || draft.agreementId !== agreement.id) {
    return deny(`Draft ${agreement.draftId} is not LOCKED as ${agreement.id}`);
  }
  if (draft.version !== agreement.version || draft.termsHash !== agreement.termsHash) {
    return deny(`Draft ${draft.id} does not match ${agreement.id}'s version and terms hash`);
  }
  if (token.termsHash !== agreement.termsHash) return deny(`Token terms hash does not match ${agreement.id}`);
  const recomputed = computeTermsHash({
    roomId: ledger.roomId,
    draftId: agreement.draftId,
    version: agreement.version,
    scope: agreement.scope,
    terms: agreement.terms,
  });
  if (recomputed !== agreement.termsHash) return deny(`${agreement.id} terms hash does not match its scope and terms`);
  if (!token.jobId.startsWith(`JOB-${agreement.id}-`)) return deny(`Job ${token.jobId} does not belong to ${agreement.id}`);

  const roles = ROLES_BY_MODE[ledger.mode];
  if (ledger.parties.length !== 2 || new Set(ledger.parties.map((p) => p.senderId)).size !== 2) {
    return deny('Ledger does not have two distinct enrolled parties');
  }
  if (input.expectedParties && !sameParties(ledger.parties, input.expectedParties)) {
    return deny('Ledger parties do not match the pinned parties');
  }
  for (const role of roles) {
    if (!agreement.approvals[role]) return deny(`Missing ${role} approval on ${agreement.id}`);
  }
  const approvals = roles.map((role) => agreement.approvals[role]!);
  if (new Set(approvals.map((a) => a.senderId)).size !== approvals.length) {
    return deny('Both approvals come from the same participant');
  }
  for (const [i, role] of roles.entries()) {
    const approval = approvals[i]!;
    const party = ledger.parties.find((p) => p.role === role);
    if (!party || approval.role !== role || approval.senderId !== party.senderId) {
      return deny(`The ${role} approval was not made by the enrolled ${role}`);
    }
    if (approval.draftId !== agreement.draftId || approval.version !== agreement.version || approval.termsHash !== agreement.termsHash) {
      return deny(`The ${role} approval does not match ${agreement.id}'s version and terms hash`);
    }
  }

  if (token.ledgerRevision > ledger.revision) {
    return deny(`Token cites ledger revision ${token.ledgerRevision} but the document is at ${ledger.revision} (stale or rolled back)`);
  }
  if (now > token.expiresAt) return deny('Start token has expired');
  if (token.issuedAt > now + MAX_CLOCK_SKEW_MS) return deny('Start token was issued in the future');
  if (agreement.execution?.status === 'COMPLETED') {
    return deny(`${agreement.id} already completed as ${agreement.execution.jobId}`);
  }
  return { ok: true, agreement };
}

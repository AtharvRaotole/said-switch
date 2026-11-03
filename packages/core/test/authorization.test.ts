import { describe, expect, it } from 'vitest';
import { applyExecutionReceipt, checkStartAuthorization, recordHandoff } from '../src/index';
import type { Ledger, Party, StartToken } from '../src/index';
import { DANA, lockedRoom, MALLORY, RIYA, ROOM, T0 } from './helpers';

const NOW = T0 + 60_000;

function setup() {
  const ledger = recordHandoff(lockedRoom().ledger, { agreementId: 'AGR-001', jobId: 'JOB-AGR-001-1', now: T0 + 10_000 });
  const token: StartToken = {
    type: 'said.start/v1',
    roomId: ROOM,
    agreementId: 'AGR-001',
    jobId: 'JOB-AGR-001-1',
    termsHash: ledger.agreements[0]!.termsHash,
    ledgerRevision: ledger.revision,
    ledgerDocumentId: 'doc-1',
    issuedAt: NOW - 1000,
    expiresAt: NOW + 600_000,
    keyId: 'said-1',
    signature: 'verified-by-caller',
  };
  return {
    signedLedgerVerified: true,
    ledger,
    token,
    tokenVerified: true,
    expectedRoomId: ROOM,
    expectedParties: [RIYA, DANA] as Party[] | null,
    now: NOW,
  };
}

type Input = ReturnType<typeof setup>;

function deniedWith(mutate: (input: Input) => void, reason: RegExp) {
  const input = setup();
  mutate(input);
  const result = checkStartAuthorization(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(reason);
}

const agreement = (l: Ledger) => l.agreements[0]!;

describe('checkStartAuthorization', () => {
  it('authorizes a valid locked agreement', () => {
    const input = setup();
    const result = checkStartAuthorization(input);
    expect(result).toEqual({ ok: true, agreement: input.ledger.agreements[0] });
    expect(checkStartAuthorization({ ...input, expectedParties: null }).ok).toBe(true);
  });

  it('rejects an unverified ledger signature', () => deniedWith((i) => (i.signedLedgerVerified = false), /Ledger signature/));
  it('rejects an unverified token signature', () => deniedWith((i) => (i.tokenVerified = false), /token signature/));
  it('rejects a ledger from another room', () => deniedWith((i) => (i.ledger.roomId = '!other:switch.local'), /Ledger belongs to room/));
  it('rejects a token for another room', () => deniedWith((i) => (i.token.roomId = '!other:switch.local'), /Token is for room/));
  it('rejects an unknown agreement', () => deniedWith((i) => (i.token.agreementId = 'AGR-009'), /not found/));
  it('rejects a draft that is not LOCKED', () => deniedWith((i) => (i.ledger.drafts[0]!.status = 'PENDING'), /not LOCKED/));
  it('rejects a token terms hash mismatch', () => deniedWith((i) => (i.token.termsHash = 'f'.repeat(64)), /Token terms hash/));

  it('rejects an agreement whose scope no longer matches its hash', () =>
    deniedWith((i) => (agreement(i.ledger).scope = 'Add dark mode and a casino'), /does not match its scope/));

  it('rejects a job id from another agreement', () => deniedWith((i) => (i.token.jobId = 'JOB-AGR-002-1'), /does not belong/));

  it('rejects a missing role approval', () => deniedWith((i) => delete agreement(i.ledger).approvals.client, /Missing client approval/));

  it('rejects approvals from the same senderId', () =>
    deniedWith((i) => (agreement(i.ledger).approvals.client!.senderId = RIYA.senderId), /same participant/));

  it('rejects approval senderIds that do not match ledger parties', () =>
    deniedWith((i) => (agreement(i.ledger).approvals.client!.senderId = MALLORY.senderId), /not made by the enrolled client/));

  it('rejects ledger parties that do not match the pinned parties', () =>
    deniedWith((i) => (i.expectedParties = [RIYA, { ...DANA, senderId: MALLORY.senderId }]), /pinned parties/));

  it('rejects an approval termsHash that does not match the agreement', () =>
    deniedWith((i) => (agreement(i.ledger).approvals.developer!.termsHash = 'e'.repeat(64)), /developer approval does not match/));

  it('rejects an approval version that does not match the agreement', () =>
    deniedWith((i) => (agreement(i.ledger).approvals.client!.version = 2), /client approval does not match/));

  it('rejects a token newer than the ledger (rollback / stale document)', () =>
    deniedWith((i) => (i.token.ledgerRevision = i.ledger.revision + 1), /stale or rolled back/));

  it('rejects an expired token', () => deniedWith((i) => (i.now = i.token.expiresAt + 1), /expired/));
  it('rejects a token issued more than 60 s in the future', () => deniedWith((i) => (i.token.issuedAt = i.now + 61_000), /future/));

  it('allows small clock skew', () => {
    const input = setup();
    input.token.issuedAt = input.now + 30_000;
    expect(checkStartAuthorization(input).ok).toBe(true);
  });

  it('rejects an agreement whose execution already COMPLETED', () => {
    const input = setup();
    const receipt = {
      type: 'said.receipt/v1' as const,
      roomId: ROOM,
      agreementId: 'AGR-001',
      jobId: 'JOB-AGR-001-1',
      status: 'COMPLETED' as const,
      worker: 'claude' as const,
      baseCommit: null,
      resultCommit: 'abc',
      changedPaths: [],
      checks: [],
      error: null,
      at: NOW,
      keyId: 'b',
      signature: 's',
    };
    input.ledger = applyExecutionReceipt(input.ledger, receipt, NOW).ledger!;
    const result = checkStartAuthorization(input);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/already completed/) });
  });
});

import { describe, expect, it } from 'vitest';
import {
  computeTermsHash,
  emptyLedger,
  enrollParty,
  formatAgreementId,
  formatDraftId,
  generateKeyPair,
  jobIdFor,
  LedgerFormatError,
  ledgerDigest,
  normalizeDraftRef,
  parseLedgerDocument,
  partyForSender,
  renderLedgerDocument,
  signLedger,
  verifySignedLedger,
} from '../src/index';
import { DANA, lockedRoom, makeLedger, RIYA, ROOM, T0 } from './helpers';

describe('ids', () => {
  it('formats and normalizes ids', () => {
    expect(formatDraftId(1)).toBe('DRF-001');
    expect(formatAgreementId(12)).toBe('AGR-012');
    expect(jobIdFor('AGR-001', 1)).toBe('JOB-AGR-001-1');
    for (const ref of ['DRF-001', 'drf-1', 'DRF1', 'drf 1', 'Drf-0001']) expect(normalizeDraftRef(ref)).toBe('DRF-001');
    expect(normalizeDraftRef('DRF-000')).toBeNull();
    expect(normalizeDraftRef('AGR-001')).toBeNull();
  });
});

describe('ledger', () => {
  it('creates an empty ledger and validates parties', () => {
    const l = makeLedger();
    expect(l).toMatchObject({ schema: 'said.ledger/v1', revision: 0, nextDraftSeq: 1, drafts: [], processedMessageIds: [] });
    const base = { deploymentId: 'd', roomId: ROOM, now: T0 };
    expect(() => emptyLedger({ ...base, mode: 'business', parties: [RIYA, { ...DANA, senderId: RIYA.senderId }] })).toThrow(/distinct/);
    expect(() => emptyLedger({ ...base, mode: 'personal', parties: [RIYA] })).toThrow(/not valid/);
  });

  it('enrolls a party with an audit event', () => {
    const l = emptyLedger({ deploymentId: 'd', roomId: ROOM, mode: 'business', parties: [RIYA], now: T0 });
    const next = enrollParty(l, DANA, T0 + 5);
    expect(next.parties.map((p) => p.role)).toEqual(['developer', 'client']);
    expect(next.audit.at(-1)).toMatchObject({ kind: 'enrolled', seq: 1, actor: 'Dana' });
    expect(next.revision).toBe(1);
    expect(l.parties).toHaveLength(1);
  });

  it('resolves parties by exact senderId only', () => {
    const l = makeLedger();
    expect(partyForSender(l, DANA.senderId)).toEqual(DANA);
    expect(partyForSender(l, 'Dana')).toBeNull();
    expect(partyForSender(l, DANA.senderId.toUpperCase())).toBeNull();
    expect(partyForSender(l, '')).toBeNull();
  });

  it('termsHash differs across rooms with identical draft numbers', () => {
    const draft = { draftId: 'DRF-001', version: 1, scope: 'Add dark mode', terms: '+2 days, +$400' };
    const a = computeTermsHash({ roomId: '!room-a:switch.local', ...draft });
    const b = computeTermsHash({ roomId: '!room-b:switch.local', ...draft });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(computeTermsHash({ roomId: '!room-a:switch.local', ...draft, version: 2 })).not.toBe(a);
  });

  it('signs and verifies a ledger; tampering is detected', async () => {
    const kp = await generateKeyPair('said-1');
    const ledger = lockedRoom().ledger;
    const signed = await signLedger(ledger, kp.keyId, kp.privateKey);
    expect(signed.digest).toBe(ledgerDigest(ledger));
    expect(await verifySignedLedger(signed, kp.publicKey)).toEqual({ ok: true });

    const tampered = structuredClone(signed);
    tampered.payload.agreements[0]!.terms = '+0 days, free';
    expect(await verifySignedLedger(tampered, kp.publicKey)).toMatchObject({ ok: false, reason: expect.stringMatching(/digest/) });

    const other = await generateKeyPair('evil');
    const resigned = await signLedger(tampered.payload, kp.keyId, other.privateKey);
    expect(await verifySignedLedger(resigned, kp.publicKey)).toMatchObject({ ok: false, reason: expect.stringMatching(/signature/) });
  });

  it('ledger render→parse round trip', async () => {
    const kp = await generateKeyPair('said-1');
    const room = lockedRoom();
    room.say(DANA, 'Propose: Footer with ```said-ledger\n{"x":1}\n``` injected | Terms: `free`');
    const signed = await signLedger(room.ledger, kp.keyId, kp.privateKey);
    const doc = renderLedgerDocument(signed);
    expect(doc).toContain('# Said Ledger');
    expect(doc).toContain('AGR-001');
    expect(doc.match(/^```said-ledger$/gm)).toHaveLength(1);
    const parsed = parseLedgerDocument(doc);
    expect(parsed).toEqual(signed);
    expect(await verifySignedLedger(parsed, kp.publicKey)).toEqual({ ok: true });
  });

  it('parse rejects missing fence, bad JSON, duplicates and wrong shapes', async () => {
    const kp = await generateKeyPair('said-1');
    const signed = await signLedger(makeLedger(), kp.keyId, kp.privateKey);
    expect(() => parseLedgerDocument('# Said Ledger\n\nno block here')).toThrow(LedgerFormatError);
    expect(() => parseLedgerDocument('```said-ledger\n{"payload":\n```')).toThrow(/not valid JSON/);
    const doc = renderLedgerDocument(signed);
    expect(() => parseLedgerDocument(`${doc}\n${doc}`)).toThrow(/More than one/);
    expect(() => parseLedgerDocument('```said-ledger\n{"payload":{},"digest":"x","keyId":"k","signature":"s"}\n```')).toThrow(
      LedgerFormatError,
    );
    const wrongSchema = { ...signed, payload: { ...signed.payload, schema: 'said.ledger/v0' } };
    expect(() => parseLedgerDocument(`\`\`\`said-ledger\n${JSON.stringify(wrongSchema)}\n\`\`\``)).toThrow(/schema/);
    expect(() => parseLedgerDocument('```said-ledger\n{"payload":{}}')).toThrow(LedgerFormatError);
  });
});

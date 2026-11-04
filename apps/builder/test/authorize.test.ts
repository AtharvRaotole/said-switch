import { describe, expect, it } from 'vitest';
import {
  generateKeyPair,
  jobIdFor,
  renderLedgerDocument,
  signLedger,
  signStartToken,
  type StartToken,
} from '@said/core';
import { lockedRoom } from '../../../packages/core/test/helpers.js';
import { authorizeStart, isSaidSender } from '../src/authorize.js';

const SAID_ID = 'said-agent-uuid';

describe('isSaidSender', () => {
  it('accepts the Said agent UUID always', () => {
    expect(
      isSaidSender({
        senderId: SAID_ID,
        senderName: 'mallory',
        saidAgentId: SAID_ID,
        saidAgentName: 'said',
      }),
    ).toBe(true);
  });

  it('rejects a name match unless the explicit fallback flag is set', () => {
    const base = {
      senderId: '@switch-actor:matrix',
      senderName: 'said',
      saidAgentId: SAID_ID,
      saidAgentName: 'said',
    };
    expect(isSaidSender(base)).toBe(false);
    expect(isSaidSender({ ...base, allowSaidNameFallback: true })).toBe(true);
    expect(isSaidSender({ ...base, allowSaidNameFallback: true, senderName: 'Said' })).toBe(true);
    expect(isSaidSender({ ...base, allowSaidNameFallback: true, senderName: 'other' })).toBe(false);
  });
});

async function sealedStart(opts?: { allowSaidNameFallback?: boolean; senderId?: string; senderName?: string }) {
  const kp = await generateKeyPair('said-1');
  const room = lockedRoom();
  const signed = await signLedger(room.ledger, kp.keyId, kp.privateKey);
  const agreement = signed.payload.agreements[0]!;
  const token: StartToken = await signStartToken(
    {
      type: 'said.start/v1',
      roomId: signed.payload.roomId,
      agreementId: agreement.id,
      jobId: jobIdFor(agreement.id, 1),
      termsHash: agreement.termsHash,
      ledgerRevision: signed.payload.revision,
      ledgerDocumentId: 'doc-1',
      issuedAt: room.now,
      expiresAt: room.now + 60_000,
      keyId: kp.keyId,
    },
    kp.privateKey,
  );
  const body = `Start\n\`\`\`said-start\n${JSON.stringify(token)}\n\`\`\``;
  const result = await authorizeStart({
    senderId: opts?.senderId ?? SAID_ID,
    senderName: opts?.senderName,
    saidAgentId: SAID_ID,
    saidAgentName: 'said',
    allowSaidNameFallback: opts?.allowSaidNameFallback,
    body,
    notaryPublicKey: kp.publicKey,
    expectedRoomId: signed.payload.roomId,
    now: room.now,
    loadLedgerDocument: async () => renderLedgerDocument(signed),
  });
  return { result, parties: signed.payload.parties };
}

describe('authorizeStart expectedParties', () => {
  it('pins expectedParties from the signed ledger on success', async () => {
    const { result, parties } = await sealedStart();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expectedParties).toEqual(parties);
    expect(result.expectedParties).toHaveLength(2);
  });

  it('rejects a non-Said sender even when the display name says said', async () => {
    const { result } = await sealedStart({ senderId: 'impostor', senderName: 'said' });
    expect(result).toMatchObject({ ok: false });
  });

  it('accepts a Mattermost actor id only when SAID name fallback is enabled', async () => {
    const denied = await sealedStart({
      senderId: '@switch-actor:matrix',
      senderName: 'said',
    });
    expect(denied.result.ok).toBe(false);

    const allowed = await sealedStart({
      senderId: '@switch-actor:matrix',
      senderName: 'said',
      allowSaidNameFallback: true,
    });
    expect(allowed.result.ok).toBe(true);
    if (!allowed.result.ok) return;
    expect(allowed.result.expectedParties).toEqual(allowed.parties);
  });
});

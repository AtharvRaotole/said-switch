import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportSignedAgreementReceipt,
  generateKeyPair,
  renderAgreementReceiptMarkdown,
  renderLedgerDocument,
  signLedger,
} from '@said/core';
import { lockedRoom } from '../../core/test/helpers.ts';
import { parseVerifyTarget, verifyFile } from '../src/verify.ts';

describe('said verify', () => {
  it('verifies a rendered ledger and rejects a tampered chain', async () => {
    const kp = await generateKeyPair('said-1');
    const room = lockedRoom();
    const signed = await signLedger(room.ledger, kp.keyId, kp.privateKey);
    const doc = renderLedgerDocument(signed);
    const dir = await mkdtemp(join(tmpdir(), 'said-verify-'));
    const path = join(dir, 'ledger.md');
    await writeFile(path, doc);
    const ok = await verifyFile(path, kp.publicKey);
    expect(ok).toMatchObject({ ok: true });

    const target = parseVerifyTarget(doc);
    expect(target.kind).toBe('ledger');
    if (target.kind !== 'ledger') return;
    target.signed.payload.audit[0]!.summary = 'tampered';
    const badPath = join(dir, 'bad.md');
    await writeFile(badPath, renderLedgerDocument(target.signed));
    // signature still over original digest field; re-sign mismatch via digest check first
    const bad = await verifyFile(badPath, kp.publicKey);
    expect(bad.ok).toBe(false);
  });

  it('verifies an agreement receipt markdown export', async () => {
    const kp = await generateKeyPair('said-1');
    const room = lockedRoom();
    const signed = await signLedger(room.ledger, kp.keyId, kp.privateKey);
    const receipt = await exportSignedAgreementReceipt({
      signed,
      privateKey: kp.privateKey,
      keyId: kp.keyId,
      issuedAt: room.now,
    });
    expect(receipt).not.toBeNull();
    const md = renderAgreementReceiptMarkdown(receipt!);
    const dir = await mkdtemp(join(tmpdir(), 'said-receipt-'));
    const path = join(dir, 'receipt.md');
    await writeFile(path, md);
    expect(await verifyFile(path, kp.publicKey)).toMatchObject({ ok: true });
  });
});


describe('parseVerifyTarget errors', () => {
  it('rejects unrecognized input', () => {
    expect(() => parseVerifyTarget('{"hello":1}')).toThrow(/Unrecognized/);
    expect(() => parseVerifyTarget('not-json')).toThrow();
  });
});

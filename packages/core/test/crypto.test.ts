import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  extractFencedJson,
  formatTime,
  fenceJson,
  generateKeyPair,
  publicKeyFromPrivate,
  sha256Hex,
  signDigest,
  signReceipt,
  signStartToken,
  verifyDigest,
  verifyReceipt,
  verifyStartToken,
} from '../src/index';
import type { ExecutionReceipt, StartToken } from '../src/index';
import { ROOM, T0 } from './helpers';

describe('crypto', () => {
  it('computes sha256 hex of strings and bytes', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
  });

  it('generates 32-byte base64 keys', async () => {
    const kp = await generateKeyPair('said-1');
    expect(kp.keyId).toBe('said-1');
    expect(base64ToBytes(kp.privateKey)).toHaveLength(32);
    expect(base64ToBytes(kp.publicKey)).toHaveLength(32);
    expect(await publicKeyFromPrivate(kp.privateKey)).toBe(kp.publicKey);
  });

  it('sign/verify round trip', async () => {
    const kp = await generateKeyPair('k');
    const digest = sha256Hex('payload');
    const sig = await signDigest(digest, kp.privateKey);
    expect(base64ToBytes(sig)).toHaveLength(64);
    expect(await verifyDigest(digest, sig, kp.publicKey)).toBe(true);
  });

  it('tampered payload fails verification', async () => {
    const kp = await generateKeyPair('k');
    const sig = await signDigest(sha256Hex('payload'), kp.privateKey);
    expect(await verifyDigest(sha256Hex('payload!'), sig, kp.publicKey)).toBe(false);
  });

  it('wrong key fails verification', async () => {
    const a = await generateKeyPair('a');
    const b = await generateKeyPair('b');
    const digest = sha256Hex('payload');
    expect(await verifyDigest(digest, await signDigest(digest, a.privateKey), b.publicKey)).toBe(false);
  });

  it('malformed signatures and keys verify as false instead of throwing', async () => {
    const kp = await generateKeyPair('k');
    const digest = sha256Hex('x');
    expect(await verifyDigest(digest, 'not base64!', kp.publicKey)).toBe(false);
    expect(await verifyDigest(digest, 'AAAA', kp.publicKey)).toBe(false);
    expect(await verifyDigest('nothex', await signDigest(digest, kp.privateKey), kp.publicKey)).toBe(false);
  });
});

describe('start tokens and receipts', () => {
  const unsignedToken: Omit<StartToken, 'signature'> = {
    type: 'said.start/v1',
    roomId: ROOM,
    agreementId: 'AGR-001',
    jobId: 'JOB-AGR-001-1',
    termsHash: 'a'.repeat(64),
    ledgerRevision: 7,
    ledgerDocumentId: 'doc-1',
    issuedAt: T0,
    expiresAt: T0 + 600_000,
    keyId: 'said-1',
  };

  it('signs and verifies a start token, rejecting tampering and wrong keys', async () => {
    const said = await generateKeyPair('said-1');
    const other = await generateKeyPair('x');
    const token = await signStartToken(unsignedToken, said.privateKey);
    expect(await verifyStartToken(token, said.publicKey)).toBe(true);
    expect(await verifyStartToken({ ...token, ledgerRevision: 8 }, said.publicKey)).toBe(false);
    expect(await verifyStartToken({ ...token, agreementId: 'AGR-002' }, said.publicKey)).toBe(false);
    expect(await verifyStartToken(token, other.publicKey)).toBe(false);
    expect(await verifyStartToken({ ...token, extra: 1 } as StartToken, said.publicKey)).toBe(false);
  });

  it('a token survives the said-start fence round trip', async () => {
    const said = await generateKeyPair('said-1');
    const token = await signStartToken(unsignedToken, said.privateKey);
    const body = `Start authorization for **AGR-001** · job \`JOB-AGR-001-1\` · expires ${formatTime(token.expiresAt)} · key \`said-notary\` · signature attached.\n${fenceJson('said-start', token)}`;
    const parsed = extractFencedJson<StartToken>(body, 'said-start');
    expect(parsed).toEqual(token);
    expect(await verifyStartToken(parsed!, said.publicKey)).toBe(true);
    expect(extractFencedJson(body, 'said-receipt')).toBeNull();
    expect(extractFencedJson('```said-start\n{not json\n```', 'said-start')).toBeNull();
  });

  it('signs and verifies an execution receipt', async () => {
    const builder = await generateKeyPair('builder-1');
    const receipt = await signReceipt(
      {
        type: 'said.receipt/v1',
        roomId: ROOM,
        agreementId: 'AGR-001',
        jobId: 'JOB-AGR-001-1',
        status: 'COMPLETED',
        worker: 'claude',
        baseCommit: 'b'.repeat(40),
        resultCommit: 'c'.repeat(40),
        changedPaths: ['src/App.tsx'],
        checks: [{ name: 'typecheck', ok: true, durationMs: 1200, detail: 'ok' }],
        error: null,
        at: T0,
        keyId: 'builder-1',
      },
      builder.privateKey,
    );
    expect(await verifyReceipt(receipt, builder.publicKey)).toBe(true);
    const forged: ExecutionReceipt = { ...receipt, changedPaths: ['package.json'] };
    expect(await verifyReceipt(forged, builder.publicKey)).toBe(false);
  });
});

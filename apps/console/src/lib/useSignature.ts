import { ledgerDigest, verifySignedLedger, type SignedLedger } from '@said/core';
import { useEffect, useState } from 'react';
import type { NotaryState } from '../api/types';

export type SignatureStatus =
  | { kind: 'fixture' }
  | { kind: 'absent' }
  | { kind: 'checking' }
  | { kind: 'valid'; keyId: string; pinned: boolean; digest: string }
  | { kind: 'invalid'; reason: string; keyId: string; digest: string; recomputed: string | null };

const PINNED_KEY = import.meta.env.VITE_NOTARY_PUBLIC_KEY?.trim() || null;

/** Re-verifies the signed ledger in the browser whenever it (or the key) changes. */
export function useSignature(
  signed: SignedLedger | null,
  state: NotaryState | null,
  source: 'live' | 'fixture',
): SignatureStatus {
  const [status, setStatus] = useState<SignatureStatus>({ kind: source === 'fixture' ? 'fixture' : 'checking' });
  const publicKey = PINNED_KEY ?? state?.notaryPublicKey ?? '';
  const expectedKeyId = state?.keyId ?? '';
  const reportedKey = state?.notaryPublicKey ?? '';

  useEffect(() => {
    if (source === 'fixture') {
      setStatus({ kind: 'fixture' });
      return;
    }
    if (!signed) {
      setStatus({ kind: 'absent' });
      return;
    }
    let cancelled = false;
    setStatus((prev) => (prev.kind === 'valid' || prev.kind === 'invalid' ? prev : { kind: 'checking' }));
    check(signed, publicKey, expectedKeyId, reportedKey).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signed, publicKey, expectedKeyId, reportedKey, source]);

  return status;
}

async function check(
  signed: SignedLedger,
  publicKey: string,
  expectedKeyId: string,
  reportedKey: string,
): Promise<SignatureStatus> {
  const recomputed = safeDigest(signed);
  const invalid = (reason: string): SignatureStatus => ({
    kind: 'invalid',
    reason,
    keyId: signed.keyId,
    digest: signed.digest,
    recomputed,
  });
  if (!publicKey) return invalid('the notary did not publish a public key');
  try {
    const result = await verifySignedLedger(signed, publicKey);
    if (!result.ok) return invalid(result.reason);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'verification threw an error');
  }
  if (PINNED_KEY && reportedKey && reportedKey !== PINNED_KEY) {
    return invalid('the notary reports a different public key than the one pinned in this console');
  }
  if (expectedKeyId && signed.keyId !== expectedKeyId) {
    return invalid(`signed with key ${signed.keyId}, but the notary key is ${expectedKeyId}`);
  }
  return { kind: 'valid', keyId: signed.keyId, pinned: PINNED_KEY !== null, digest: signed.digest };
}

function safeDigest(signed: SignedLedger): string | null {
  try {
    return ledgerDigest(signed.payload);
  } catch {
    return null;
  }
}

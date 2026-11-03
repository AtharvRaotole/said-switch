import { canonicalJson } from './canonical';
import { sha256Hex, signDigest, verifyDigest } from './crypto';
import type { ExecutionReceipt, StartToken } from './types';

/** Signatures cover sha256(canonicalJson(object without `signature`)), the same digest scheme as the ledger. */
function unsignedDigest(value: object): string {
  const { signature: _signature, ...unsigned } = value as Record<string, unknown>;
  return sha256Hex(canonicalJson(unsigned));
}

async function verifySigned(value: { signature?: unknown }, publicKey: string): Promise<boolean> {
  if (typeof value.signature !== 'string') return false;
  try {
    return await verifyDigest(unsignedDigest(value), value.signature, publicKey);
  } catch {
    return false;
  }
}

export async function signStartToken(unsigned: Omit<StartToken, 'signature'>, privateKey: string): Promise<StartToken> {
  return { ...unsigned, signature: await signDigest(unsignedDigest(unsigned), privateKey) };
}

export async function verifyStartToken(token: StartToken, publicKey: string): Promise<boolean> {
  return token?.type === 'said.start/v1' && verifySigned(token, publicKey);
}

export async function signReceipt(unsigned: Omit<ExecutionReceipt, 'signature'>, privateKey: string): Promise<ExecutionReceipt> {
  return { ...unsigned, signature: await signDigest(unsignedDigest(unsigned), privateKey) };
}

export async function verifyReceipt(receipt: ExecutionReceipt, publicKey: string): Promise<boolean> {
  return receipt?.type === 'said.receipt/v1' && verifySigned(receipt, publicKey);
}

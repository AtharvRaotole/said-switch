import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes } from './encoding';

// Pure-JS SHA-512 so signing and verification work without WebCrypto (e.g. non-secure browser origins).
ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (message) => sha512(message);

const textEncoder = new TextEncoder();

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256(typeof data === 'string' ? textEncoder.encode(data) : data));
}

export interface KeyPair {
  keyId: string;
  /** base64 32-byte Ed25519 seed. */
  privateKey: string;
  /** base64 32-byte Ed25519 public key. */
  publicKey: string;
}

export async function generateKeyPair(keyId: string): Promise<KeyPair> {
  const secret = ed.utils.randomSecretKey();
  const pub = await ed.getPublicKeyAsync(secret);
  return { keyId, privateKey: bytesToBase64(secret), publicKey: bytesToBase64(pub) };
}

export async function publicKeyFromPrivate(privateKey: string): Promise<string> {
  return bytesToBase64(await ed.getPublicKeyAsync(base64ToBytes(privateKey)));
}

function digestBytes(digestHex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(digestHex)) throw new Error('digest must be 64 lowercase hex characters');
  return hexToBytes(digestHex);
}

export async function signDigest(digestHex: string, privateKey: string): Promise<string> {
  const sig = await ed.signAsync(digestBytes(digestHex), base64ToBytes(privateKey));
  return bytesToBase64(sig);
}

export async function verifyDigest(digestHex: string, signature: string, publicKey: string): Promise<boolean> {
  try {
    return await ed.verifyAsync(base64ToBytes(signature), digestBytes(digestHex), base64ToBytes(publicKey), {
      zip215: false,
    });
  } catch {
    return false;
  }
}

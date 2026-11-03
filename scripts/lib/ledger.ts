import {
  emptyLedger,
  parseLedgerDocument,
  renderLedgerDocument,
  signLedger,
  verifySignedLedger,
  type Ledger,
  type SignedLedger,
} from '@said/core';
import type { SwitchOps } from '@said/switch-client';

export const LEDGER_NAME = 'Said Ledger';
export const LEDGER_DESCRIPTION = 'Signed consent ledger kept by Said. Only Said can write it.';
export const LEDGER_INSTRUCTIONS =
  'Source of truth for what both parties agreed. Read the said-ledger JSON block; verify its signature with the notary public key before relying on it. Never edit by hand.';

export type LoadedLedger =
  | { ok: true; signed: SignedLedger }
  | { ok: false; reason: string; signed: SignedLedger | null };

/** Parses the document text and verifies its signature against the pinned notary public key. */
export async function verifyLedgerText(content: string, notaryPublicKey: string): Promise<LoadedLedger> {
  let signed: SignedLedger;
  try {
    signed = parseLedgerDocument(content);
  } catch (err) {
    return { ok: false, reason: `ledger document is malformed: ${err instanceof Error ? err.message : String(err)}`, signed: null };
  }
  const verdict = await verifySignedLedger(signed, notaryPublicKey);
  return verdict.ok ? { ok: true, signed } : { ok: false, reason: verdict.reason, signed };
}

/** Reads the ledger document with `load_internal_documents` (the connection must be in the room). */
export async function loadLedger(ops: SwitchOps, documentId: string, notaryPublicKey: string): Promise<LoadedLedger> {
  const [doc] = await ops.loadInternalDocuments([documentId]);
  if (!doc) return { ok: false, reason: `room document ${documentId} was not returned (deleted?)`, signed: null };
  return verifyLedgerText(doc.content, notaryPublicKey);
}

/**
 * A fresh, signed, empty ledger for the same room and parties as `previous`, written as a new room document
 * named `Said Ledger` and read back to verify. Returns what the notary state needs.
 */
export async function createFreshLedger(
  ops: SwitchOps,
  previous: Ledger,
  key: { keyId: string; privateKey: string; publicKey: string },
  now = Date.now(),
): Promise<{ documentId: string; revision: number; digest: string }> {
  const payload = emptyLedger({
    deploymentId: previous.deploymentId,
    roomId: previous.roomId,
    mode: previous.mode,
    parties: previous.parties,
    now,
  });
  const signed = await signLedger(payload, key.keyId, key.privateKey);
  const { document_id } = await ops.createRoomDocument({
    name: LEDGER_NAME,
    description: LEDGER_DESCRIPTION,
    instructions: LEDGER_INSTRUCTIONS,
    content: renderLedgerDocument(signed),
  });
  const readBack = await loadLedger(ops, document_id, key.publicKey);
  if (!readBack.ok) throw new Error(`The new ledger failed read-back verification: ${readBack.reason}`);
  if (readBack.signed.digest !== signed.digest) {
    throw new Error('The new ledger read back with a different digest than the one written.');
  }
  return { documentId: document_id, revision: signed.payload.revision, digest: signed.digest };
}

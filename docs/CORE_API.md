# `@said/core` public API (contract)

Every other package codes against these exact names. Types come from `packages/core/src/types.ts`. All functions are pure and isomorphic (Node and browser): no `node:` imports, no `Buffer`, no I/O. Keys and signatures are base64 strings; digests and hashes are lowercase hex.

```ts
// canonical.ts
export function canonicalJson(value: unknown): string; // sorted keys, no whitespace, rejects non-finite numbers, undefined values dropped from objects

// encoding.ts
export function bytesToBase64(bytes: Uint8Array): string;
export function base64ToBytes(b64: string): Uint8Array;
export function hexToBytes(hex: string): Uint8Array;
export function bytesToHex(bytes: Uint8Array): string;

// crypto.ts
export function sha256Hex(data: string | Uint8Array): string;
export interface KeyPair { keyId: string; privateKey: string; publicKey: string } // 32-byte seed / 32-byte public key, base64
export async function generateKeyPair(keyId: string): Promise<KeyPair>;
export async function signDigest(digestHex: string, privateKey: string): Promise<string>;
export async function verifyDigest(digestHex: string, signature: string, publicKey: string): Promise<boolean>;

// ids.ts
export function formatDraftId(seq: number): string;      // 1 -> "DRF-001"
export function formatAgreementId(seq: number): string;  // 1 -> "AGR-001"
export function normalizeDraftRef(ref: string): string | null; // "drf-1" | "DRF1" | "DRF-001" -> "DRF-001"
export function jobIdFor(agreementId: string, attempt: number): string; // ("AGR-001", 1) -> "JOB-AGR-001-1"

// ledger.ts
export function emptyLedger(init: { deploymentId: string; roomId: string; mode: RoomMode; parties: Party[]; now: number }): Ledger;
export function computeTermsHash(input: { roomId: string; draftId: string; version: number; scope: string; terms: string | null }): string;
export function ledgerDigest(payload: Ledger): string;
export async function signLedger(payload: Ledger, keyId: string, privateKey: string): Promise<SignedLedger>;
export async function verifySignedLedger(signed: SignedLedger, publicKey: string): Promise<{ ok: true } | { ok: false; reason: string }>;
export function renderLedgerDocument(signed: SignedLedger): string; // Markdown summary + ```said-ledger fenced JSON block
export function parseLedgerDocument(content: string): SignedLedger;  // throws LedgerFormatError
export class LedgerFormatError extends Error {}
export function partyForSender(ledger: Ledger, senderId: string): Party | null;

// fences.ts
export function fenceJson(lang: 'said-start' | 'said-receipt' | 'said-ledger', value: unknown): string;
export function extractFencedJson<T>(body: string, lang: 'said-start' | 'said-receipt' | 'said-ledger'): T | null;

// tokens.ts
export async function signStartToken(unsigned: Omit<StartToken, 'signature'>, privateKey: string): Promise<StartToken>;
export async function verifyStartToken(token: StartToken, publicKey: string): Promise<boolean>;
export async function signReceipt(unsigned: Omit<ExecutionReceipt, 'signature'>, privateKey: string): Promise<ExecutionReceipt>;
export async function verifyReceipt(receipt: ExecutionReceipt, publicKey: string): Promise<boolean>;

// parser.ts
export function parseIntent(text: string, ctx: { saidName: string }): Intent;

// engine.ts
export function applyMessage(ledger: Ledger, msg: InboundMessage, ctx: EngineContext): EngineResult;
export function recordHandoff(ledger: Ledger, input: { agreementId: string; jobId: string; now: number }): Ledger;
export function applyExecutionReceipt(ledger: Ledger, receipt: ExecutionReceipt, now: number): EngineResult;

// authorization.ts  (used by the builder; pure)
export function checkStartAuthorization(input: {
  signedLedgerVerified: boolean;     // caller already ran verifySignedLedger
  ledger: Ledger;
  token: StartToken;
  tokenVerified: boolean;            // caller already ran verifyStartToken
  expectedRoomId: string;
  expectedParties: Party[] | null;   // pinned parties, if configured
  now: number;
}): { ok: true; agreement: Agreement } | { ok: false; reason: string };

// evidence.ts
export function findEvidence(ledger: Ledger, query: { topic: string | null; draftRef: string | null }): Array<Draft | Agreement>;
export function formatEvidenceReply(ledger: Ledger, matches: Array<Draft | Agreement>, topic: string | null): string;

// index.ts re-exports everything above plus all types.
```

export type Role = 'developer' | 'client' | 'partnerA' | 'partnerB';

export type RoomMode = 'business' | 'personal';

export interface Party {
  role: Role;
  label: string;
  /** Opaque Switch participant id, e.g. `@switch-user-ab12:switch.local`. Never parsed. */
  senderId: string;
}

/** A quote of one authenticated room message. */
export interface Receipt {
  senderId: string;
  senderName: string;
  role: Role | null;
  messageId: string;
  /** Server timestamp in milliseconds. */
  timestamp: number;
  text: string;
  threadId: string | null;
}

export interface ApprovalReceipt extends Receipt {
  role: Role;
  draftId: string;
  version: number;
  termsHash: string;
}

export type DraftStatus = 'NEEDS_TERMS' | 'PENDING' | 'LOCKED' | 'REJECTED';

export interface DraftVersion {
  version: number;
  scope: string;
  terms: string | null;
  termsHash: string;
  proposal: Receipt;
  /** Approvals that existed when this version was superseded. */
  approvals: Partial<Record<Role, ApprovalReceipt>>;
  supersededAt: number;
}

export interface Draft {
  id: string;
  version: number;
  scope: string;
  /** Free text such as `+2 days, +$400`. `null` means terms are still needed. */
  terms: string | null;
  termsHash: string;
  status: DraftStatus;
  /** The original ask that created the draft. */
  request: Receipt;
  /** The message that set the current version's scope/terms. */
  proposal: Receipt;
  approvals: Partial<Record<Role, ApprovalReceipt>>;
  history: DraftVersion[];
  rejectedBy: Receipt | null;
  agreementId: string | null;
  /** When set, this draft amends a previously locked agreement and needs both signatures again. */
  amendsAgreementId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ExecutionStatus = 'READY' | 'RUNNING' | 'VALIDATING' | 'COMPLETED' | 'FAILED';

export type WorkerKind = 'claude' | 'codex' | 'scripted';

export interface CheckResult {
  name: string;
  ok: boolean;
  durationMs: number;
  detail: string;
}

export interface Execution {
  jobId: string;
  status: ExecutionStatus;
  worker: WorkerKind | null;
  baseCommit: string | null;
  resultCommit: string | null;
  changedPaths: string[];
  checks: CheckResult[];
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

export interface Agreement {
  id: string;
  draftId: string;
  version: number;
  scope: string;
  terms: string;
  termsHash: string;
  approvals: Partial<Record<Role, ApprovalReceipt>>;
  lockedAt: number;
  execution: Execution | null;
}

export interface Refusal {
  id: string;
  receipt: Receipt;
  /** Agent name the sender tried to command directly, e.g. `builder`. */
  target: string;
  /** Draft created from the request, if any. */
  draftId: string | null;
  at: number;
}

export type AuditKind =
  | 'enrolled'
  | 'draft_created'
  | 'terms_set'
  | 'revised'
  | 'accepted'
  | 'withdrawn'
  | 'rejected'
  | 'locked'
  | 'refused_bypass'
  | 'ignored_approval'
  | 'handoff_sent'
  | 'execution_update'
  | 'evidence_served'
  | 'amendment_opened'
  | 'receipt_exported';

export interface AuditEvent {
  seq: number;
  kind: AuditKind;
  at: number;
  actor: string | null;
  ref: string | null;
  summary: string;
  /** sha256 hex of the previous audit event's hash, or GENESIS_PREV_HASH for the first. */
  prevHash: string;
  /** sha256 hex of canonicalJson({ prevHash, seq, kind, at, actor, ref, summary }). */
  hash: string;
}

export interface Ledger {
  schema: 'said.ledger/v1';
  deploymentId: string;
  roomId: string;
  mode: RoomMode;
  parties: Party[];
  revision: number;
  updatedAt: number;
  nextDraftSeq: number;
  nextAgreementSeq: number;
  nextRefusalSeq: number;
  drafts: Draft[];
  agreements: Agreement[];
  refusals: Refusal[];
  audit: AuditEvent[];
  /** Most recent processed message ids, newest last, capped at 500. */
  processedMessageIds: string[];
}

export interface SignedLedger {
  payload: Ledger;
  /** sha256 hex of canonicalJson(payload). */
  digest: string;
  keyId: string;
  /** base64 Ed25519 signature over the digest's bytes. */
  signature: string;
}

/** Signed by the notary, sent to the builder inside a `said-start` fenced block. */
export interface StartToken {
  type: 'said.start/v1';
  roomId: string;
  agreementId: string;
  jobId: string;
  termsHash: string;
  ledgerRevision: number;
  ledgerDocumentId: string;
  issuedAt: number;
  expiresAt: number;
  keyId: string;
  signature: string;
}

/** Signed by the builder, sent to the notary inside a `said-receipt` fenced block. */
export interface ExecutionReceipt {
  type: 'said.receipt/v1';
  roomId: string;
  agreementId: string;
  jobId: string;
  status: ExecutionStatus;
  worker: WorkerKind | null;
  baseCommit: string | null;
  resultCommit: string | null;
  changedPaths: string[];
  checks: CheckResult[];
  error: string | null;
  at: number;
  keyId: string;
  signature: string;
}

/** An authenticated room message as the engine sees it (already adapted from a Switch event). */
export interface InboundMessage {
  messageId: string;
  senderId: string;
  senderName: string;
  body: string;
  timestamp: number;
  threadId: string | null;
  /** Whether Switch marked the message as addressed to Said. */
  addressedToSaid: boolean;
  /** Agent names mentioned in the body (lowercase, without `@`). */
  mentions: string[];
  /** True for messages posted by agents (including Said itself). */
  fromAgent: boolean;
  /** True for Switch's own auto-replies (`com.switch.auto_reply`). */
  autoReply: boolean;
}

export type Intent =
  | { kind: 'propose'; scope: string; terms: string | null }
  | { kind: 'terms'; draftRef: string | null; terms: string }
  | { kind: 'revise'; draftRef: string; scope: string | null; terms: string | null }
  | { kind: 'amend'; agreementRef: string; scope: string; terms: string | null }
  | { kind: 'accept'; draftRef: string | null; version: number | null }
  | { kind: 'reject'; draftRef: string | null }
  | { kind: 'withdraw'; draftRef: string | null }
  | { kind: 'status'; draftRef: string | null }
  | { kind: 'evidence'; topic: string | null; draftRef: string | null }
  | { kind: 'request'; scope: string }
  | { kind: 'enroll'; code: string }
  | { kind: 'not_approval'; reason: 'conditional' | 'negated' | 'quoted' | 'reported' | 'embedded' }
  | { kind: 'none' };

/** Side effects the engine asks the notary to perform after a successful ledger write. */
export type Effect =
  | { kind: 'reply'; body: string; threadId: string | null }
  | { kind: 'handoff'; agreementId: string; threadId: string | null };

export interface EngineContext {
  /** Agent names in the room that only the owner may command (e.g. `builder`). */
  guardedAgents: string[];
  saidName: string;
  now: number;
}

export interface EngineResult {
  /** New ledger payload with `revision` incremented and `updatedAt` set, or null when nothing changed. */
  ledger: Ledger | null;
  effects: Effect[];
}

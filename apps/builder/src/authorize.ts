import { z } from 'zod';
import {
  checkStartAuthorization,
  extractFencedJson,
  jobIdFor,
  parseLedgerDocument,
  verifySignedLedger,
  verifyStartToken,
} from '@said/core';
import type { Agreement, Ledger, StartToken } from '@said/core';

const startTokenSchema = z.object({
  type: z.literal('said.start/v1'),
  roomId: z.string().min(1),
  agreementId: z.string().min(1),
  jobId: z.string().min(1),
  termsHash: z.string().regex(/^[0-9a-f]{64}$/),
  ledgerRevision: z.number().int().nonnegative(),
  ledgerDocumentId: z.string().min(1),
  issuedAt: z.number(),
  expiresAt: z.number(),
  keyId: z.string().min(1),
  signature: z.string().min(1),
});

export interface AuthorizedStart {
  ok: true;
  token: StartToken;
  agreement: Agreement;
  ledger: Ledger;
  jobId: string;
  attempt: number;
}

export interface RejectedStart {
  ok: false;
  reason: string;
}

export function attemptOf(agreementId: string, jobId: string): number | null {
  const prefix = `JOB-${agreementId}-`;
  if (!jobId.startsWith(prefix)) return null;
  const rest = jobId.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(rest)) return null;
  const attempt = Number(rest);
  return jobIdFor(agreementId, attempt) === jobId ? attempt : null;
}

/**
 * Independent of the chat text: sender, token seal, signed ledger, both approvals, lock, room, expiry.
 * Does not touch git.
 */
export async function authorizeStart(input: {
  senderId: string;
  senderName?: string | null;
  saidAgentId: string;
  /** Agent name; used when live Switch message.sender is a Matrix actor id rather than the agent UUID. */
  saidAgentName?: string | null;
  body: string;
  notaryPublicKey: string;
  expectedRoomId: string;
  now: number;
  loadLedgerDocument: (documentId: string) => Promise<string>;
}): Promise<AuthorizedStart | RejectedStart> {
  const fromSaid =
    input.senderId === input.saidAgentId ||
    Boolean(
      input.saidAgentName &&
        input.senderName &&
        input.senderName.trim().toLowerCase() === input.saidAgentName.trim().toLowerCase(),
    );
  if (!fromSaid) {
    return { ok: false, reason: 'I did not start work. That message is not from Said.' };
  }

  if (!input.body.includes('```said-start')) {
    return {
      ok: false,
      reason: 'I did not start work. A chat message is not permission to change the site. Work starts only from a signed start authorization by Said.',
    };
  }

  const raw = extractFencedJson<unknown>(input.body, 'said-start');
  const parsed = startTokenSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: 'I did not start work. The start block is not a valid start authorization.' };
  }
  const token: StartToken = parsed.data;

  const tokenVerified = await verifyStartToken(token, input.notaryPublicKey).catch(() => false);
  if (!tokenVerified) {
    return {
      ok: false,
      reason: "I did not start work. The start token's tamper seal does not match the pinned notary key.",
    };
  }

  let content: string;
  try {
    content = await input.loadLedgerDocument(token.ledgerDocumentId);
  } catch {
    return { ok: false, reason: 'I did not start work. I could not load the ledger document.' };
  }

  let signed;
  try {
    signed = parseLedgerDocument(content);
  } catch {
    return { ok: false, reason: 'I did not start work. The ledger document is not readable.' };
  }

  const ledgerCheck = await verifySignedLedger(signed, input.notaryPublicKey);
  const decision = checkStartAuthorization({
    signedLedgerVerified: ledgerCheck.ok,
    ledger: signed.payload,
    token,
    tokenVerified: true,
    expectedRoomId: input.expectedRoomId,
    expectedParties: null,
    now: input.now,
  });
  if (!decision.ok) {
    const why = ledgerCheck.ok ? decision.reason : ledgerCheck.reason;
    return { ok: false, reason: `I did not start work. ${why}` };
  }

  const attempt = attemptOf(decision.agreement.id, token.jobId);
  if (attempt === null) {
    return { ok: false, reason: `I did not start work. ${token.jobId} is not a job id for ${decision.agreement.id}.` };
  }

  return {
    ok: true,
    token,
    agreement: decision.agreement,
    ledger: signed.payload,
    jobId: jobIdFor(decision.agreement.id, attempt),
    attempt,
  };
}

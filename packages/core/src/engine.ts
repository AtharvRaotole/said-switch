import { appendAudit, commitChange } from './audit';
import { findEvidence, formatEvidenceReply } from './evidence';
import { formatAgreementId, formatDraftId, formatRefusalId } from './ids';
import { computeTermsHash, partyForSender, ROLES_BY_MODE } from './ledger';
import { cleanRequestScope, findDraftRef, parseIntent } from './parser';
import * as R from './replies';
import type {
  Agreement,
  ApprovalReceipt,
  AuditKind,
  Draft,
  Effect,
  EngineContext,
  EngineResult,
  InboundMessage,
  Intent,
  Ledger,
  Party,
  Receipt,
} from './types';

export { applyExecutionReceipt, recordHandoff } from './execution';

const MAX_RECEIPT_TEXT = 2000;

/** One message being applied to a private copy of the ledger. */
class Turn {
  readonly next: Ledger;
  readonly effects: Effect[] = [];
  private changed = false;

  constructor(
    ledger: Ledger,
    readonly msg: InboundMessage,
    readonly ctx: EngineContext,
    readonly party: Party | null,
  ) {
    this.next = structuredClone(ledger);
  }

  get actor(): string {
    return this.party?.label ?? this.msg.senderName;
  }

  say(body: string): void {
    this.effects.push({ kind: 'reply', body, threadId: this.msg.threadId });
  }

  audit(kind: AuditKind, ref: string | null, summary: string): void {
    appendAudit(this.next, { kind, at: this.ctx.now, actor: this.actor, ref, summary });
    this.changed = true;
  }

  receipt(): Receipt {
    const { msg } = this;
    const text = msg.body.length > MAX_RECEIPT_TEXT ? `${msg.body.slice(0, MAX_RECEIPT_TEXT)}… [truncated]` : msg.body;
    return {
      senderId: msg.senderId,
      senderName: msg.senderName,
      role: this.party?.role ?? null,
      messageId: msg.messageId,
      timestamp: msg.timestamp,
      text,
      threadId: msg.threadId,
    };
  }

  done(): EngineResult {
    if (!this.changed) return { ledger: null, effects: this.effects };
    commitChange(this.next, this.ctx.now, this.msg.messageId);
    return { ledger: this.next, effects: this.effects };
  }
}

const unchanged = (): EngineResult => ({ ledger: null, effects: [] });

export function applyMessage(ledger: Ledger, msg: InboundMessage, ctx: EngineContext): EngineResult {
  if (ledger.processedMessageIds.includes(msg.messageId)) return unchanged();
  if (msg.fromAgent || msg.autoReply) return unchanged();
  const party = partyForSender(ledger, msg.senderId);
  const intent = parseIntent(msg.body, { saidName: ctx.saidName });
  const target = bypassTarget(ledger, msg, ctx);
  if (!target && (intent.kind === 'none' || intent.kind === 'enroll')) return unchanged();

  const turn = new Turn(ledger, msg, ctx, party);
  if (target) handleBypass(turn, target);
  else handleIntent(turn, intent);
  return turn.done();
}

function bypassTarget(ledger: Ledger, msg: InboundMessage, ctx: EngineContext): string | null {
  if (ledger.mode !== 'business' || msg.addressedToSaid) return null;
  const mentioned = new Set(msg.mentions.map((m) => m.toLowerCase()));
  for (const m of msg.body.matchAll(/@([\w-]+)/g)) mentioned.add(m[1]!.toLowerCase());
  return ctx.guardedAgents.find((agent) => mentioned.has(agent.toLowerCase())) ?? null;
}

function handleBypass(turn: Turn, target: string): void {
  const { next, msg, ctx } = turn;
  const scope = cleanRequestScope(msg.body);
  const readsAsRequest = parseIntent(scope, { saidName: ctx.saidName }).kind === 'request';
  const substantial = scope.split(' ').length >= 3 && !msg.body.trim().endsWith('?');
  const draft = turn.party && (readsAsRequest || substantial) ? createDraft(turn, scope, null) : null;
  const refusal = {
    id: formatRefusalId(next.nextRefusalSeq++),
    receipt: turn.receipt(),
    target,
    draftId: draft?.id ?? null,
    at: ctx.now,
  };
  next.refusals.push(refusal);
  const who = turn.party ? turn.actor : `${turn.actor} (not enrolled)`;
  turn.audit('refused_bypass', refusal.id, `${who} addressed @${target} directly${draft ? `; logged as ${draft.id}` : ''}. Nothing started.`);
  turn.say(R.bypassReply(next, draft, target));
}

function handleIntent(turn: Turn, intent: Intent): void {
  const { party, msg } = turn;
  switch (intent.kind) {
    case 'status':
      if (party || msg.addressedToSaid) handleStatus(turn, intent.draftRef);
      return;
    case 'evidence':
      if (party || msg.addressedToSaid) handleEvidence(turn, intent.topic, intent.draftRef);
      return;
    case 'not_approval':
      if (party) handleNotApproval(turn, party, intent.reason);
      return;
    case 'request':
      if (!msg.addressedToSaid) return;
      break;
    case 'none':
    case 'enroll':
      return;
  }
  if (!party) {
    turn.audit('ignored_approval', findDraftRef(msg.body), `${turn.actor} (not enrolled) tried to ${intent.kind}; ignored`);
    turn.say(R.nonPartyReply(turn.next, intent.kind));
    return;
  }
  switch (intent.kind) {
    case 'request': {
      const active = activeAgreement(turn.next);
      const draft = createDraft(turn, intent.scope, null, active?.id ?? null);
      turn.say(active ? R.amendNeedsTermsReply(turn.next, draft, active.id) : R.needsTermsReply(turn.next, draft));
      return;
    }
    case 'propose': {
      const active = activeAgreement(turn.next);
      const draft = createDraft(turn, intent.scope, intent.terms, active?.id ?? null);
      if (draft.terms === null) {
        turn.say(active ? R.amendNeedsTermsReply(turn.next, draft, active.id) : R.needsTermsReply(turn.next, draft));
      } else {
        turn.say(active ? R.amendTermsReply(turn.next, draft, active.id) : R.termsReply(turn.next, draft, null));
      }
      return;
    }
    case 'amend':
      return handleAmend(turn, intent.agreementRef, intent.scope, intent.terms);
    case 'terms': {
      const draft = resolveDraft(turn, intent.draftRef, (d) => d.status === 'NEEDS_TERMS' || d.status === 'PENDING', 'Terms');
      if (draft) revise(turn, draft, draft.scope, intent.terms);
      return;
    }
    case 'revise': {
      const draft = resolveDraft(turn, intent.draftRef, () => false, 'Revise');
      if (draft) revise(turn, draft, intent.scope ?? draft.scope, intent.terms ?? draft.terms);
      return;
    }
    case 'accept':
      return handleAccept(turn, party, intent.draftRef, intent.version);
    case 'withdraw':
      return handleWithdraw(turn, party, intent.draftRef);
    case 'reject':
      return handleReject(turn, party, intent.draftRef);
  }
}


/** Newest locked agreement that is not COMPLETED, if any. */
function activeAgreement(ledger: Ledger): Agreement | null {
  for (let i = ledger.agreements.length - 1; i >= 0; i -= 1) {
    const a = ledger.agreements[i]!;
    if (a.execution?.status !== 'COMPLETED') return a;
  }
  return null;
}

function createDraft(turn: Turn, scope: string, terms: string | null, amendsAgreementId: string | null = null): Draft {
  const { next, ctx } = turn;
  const id = formatDraftId(next.nextDraftSeq++);
  const version = terms === null ? 0 : 1;
  const receipt = turn.receipt();
  const draft: Draft = {
    id,
    version,
    scope,
    terms,
    termsHash: computeTermsHash({ roomId: next.roomId, draftId: id, version, scope, terms }),
    status: terms === null ? 'NEEDS_TERMS' : 'PENDING',
    request: receipt,
    proposal: receipt,
    approvals: {},
    history: [],
    rejectedBy: null,
    agreementId: null,
    amendsAgreementId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  next.drafts.push(draft);
  if (amendsAgreementId) {
    turn.audit('amendment_opened', id, `${turn.actor} opened amendment ${id} for ${amendsAgreementId}: ${scope}`);
  } else {
    turn.audit('draft_created', id, `${turn.actor} opened ${id}: ${scope}`);
  }
  if (terms !== null) turn.audit('terms_set', id, `${turn.actor} set terms for ${id} v1: ${terms}`);
  return draft;
}

/** Finds the named draft, or the single draft matching `candidate` when no ref is given; replies when it can't. */
function resolveDraft(turn: Turn, ref: string | null, candidate: (d: Draft) => boolean, verb: R.DraftVerb): Draft | null {
  if (ref) {
    const draft = turn.next.drafts.find((d) => d.id === ref);
    if (!draft) turn.say(R.notFoundReply(ref));
    return draft ?? null;
  }
  const matches = turn.next.drafts.filter(candidate);
  if (matches.length === 1) return matches[0]!;
  turn.say(matches.length === 0 ? R.noOpenDraftReply(verb) : R.ambiguousReply(matches, verb));
  return null;
}

function revise(turn: Turn, draft: Draft, scope: string, terms: string | null): void {
  const { next, ctx } = turn;
  if (draft.status === 'LOCKED') return turn.say(R.lockedStateReply(draft));
  if (draft.status === 'REJECTED') return turn.say(R.rejectedStateReply(next, draft));
  if (scope === draft.scope && terms === draft.terms) return turn.say(R.unchangedReply(next, draft));

  const wasPending = draft.status === 'PENDING';
  const previousVersion = draft.version;
  if (wasPending) {
    draft.history.push({
      version: draft.version,
      scope: draft.scope,
      terms: draft.terms,
      termsHash: draft.termsHash,
      proposal: draft.proposal,
      approvals: draft.approvals,
      supersededAt: ctx.now,
    });
    draft.version += 1;
  } else if (terms !== null) {
    draft.version = 1;
  }
  draft.scope = scope;
  draft.terms = terms;
  draft.status = terms === null ? 'NEEDS_TERMS' : 'PENDING';
  draft.approvals = {};
  draft.proposal = turn.receipt();
  draft.termsHash = computeTermsHash({ roomId: next.roomId, draftId: draft.id, version: draft.version, scope, terms });
  draft.updatedAt = ctx.now;

  if (wasPending) {
    turn.audit('revised', draft.id, `${turn.actor} revised ${draft.id} to v${draft.version}; approvals on v${previousVersion} cleared`);
    turn.say(R.termsReply(next, draft, previousVersion));
  } else if (terms !== null) {
    turn.audit('terms_set', draft.id, `${turn.actor} set terms for ${draft.id} v${draft.version}: ${terms}`);
    turn.say(R.termsReply(next, draft, null));
  } else {
    turn.audit('revised', draft.id, `${turn.actor} changed the scope of ${draft.id}: ${scope}`);
    turn.say(R.scopeUpdatedReply(next, draft));
  }
}

/** Parties without a valid approval on the draft's current version and terms hash. */
function missingParties(ledger: Ledger, draft: Draft): Party[] {
  return ROLES_BY_MODE[ledger.mode]
    .map((role) => ledger.parties.find((p) => p.role === role) ?? ({ role, label: role, senderId: '' } as Party))
    .filter((p) => {
      const a = draft.approvals[p.role];
      return !(a && p.senderId && a.senderId === p.senderId && a.version === draft.version && a.termsHash === draft.termsHash);
    });
}


function handleAmend(turn: Turn, agreementRef: string, scope: string, terms: string | null): void {
  const agreement = turn.next.agreements.find((a) => a.id === agreementRef);
  if (!agreement) {
    turn.say(R.agreementNotFoundReply(agreementRef));
    return;
  }
  if (agreement.execution?.status === 'COMPLETED') {
    turn.say(R.amendCompletedReply(agreement));
    return;
  }
  const open = turn.next.drafts.find(
    (d) => d.amendsAgreementId === agreement.id && (d.status === 'PENDING' || d.status === 'NEEDS_TERMS'),
  );
  if (open) {
    revise(turn, open, scope, terms);
    return;
  }
  const draft = createDraft(turn, scope, terms, agreement.id);
  turn.say(terms === null ? R.amendNeedsTermsReply(turn.next, draft, agreement.id) : R.amendTermsReply(turn.next, draft, agreement.id));
}

function handleAccept(turn: Turn, party: Party, ref: string | null, version: number | null): void {
  const { next, ctx } = turn;
  const draft = resolveDraft(turn, ref, (d) => d.status === 'PENDING', 'Accept');
  if (!draft) return;
  if (draft.status === 'NEEDS_TERMS') return turn.say(R.needsTermsFirstReply(next, draft));
  if (draft.status === 'REJECTED') return turn.say(R.rejectedStateReply(next, draft));
  if (draft.status === 'LOCKED') return turn.say(R.alreadyLockedReply(draft));

  if (version !== null && version !== draft.version) {
    turn.audit('ignored_approval', draft.id, `${turn.actor}'s acceptance of ${draft.id} v${version} refused: current version is v${draft.version}`);
    return turn.say(R.staleVersionReply(draft, version));
  }
  if (version === null && draft.history.length > 0) return turn.say(R.needVersionReply(draft));

  const existing = draft.approvals[party.role];
  if (existing && existing.version === draft.version && existing.termsHash === draft.termsHash) {
    return turn.say(R.alreadyAcceptedReply(next, draft, existing, missingParties(next, draft)));
  }
  const approval: ApprovalReceipt = {
    ...turn.receipt(),
    role: party.role,
    draftId: draft.id,
    version: draft.version,
    termsHash: draft.termsHash,
  };
  draft.approvals[party.role] = approval;
  draft.updatedAt = ctx.now;
  turn.audit('accepted', draft.id, `${turn.actor} accepted ${draft.id} v${draft.version} (${R.shortHash(draft.termsHash)})`);

  const waiting = missingParties(next, draft);
  if (waiting.length > 0) return turn.say(R.acceptedReply(next, draft, approval, waiting));
  lock(turn, draft);
}

function lock(turn: Turn, draft: Draft): void {
  const { next, ctx, msg } = turn;
  const agreement: Agreement = {
    id: formatAgreementId(next.nextAgreementSeq++),
    draftId: draft.id,
    version: draft.version,
    scope: draft.scope,
    terms: draft.terms ?? '',
    termsHash: draft.termsHash,
    approvals: structuredClone(draft.approvals),
    lockedAt: ctx.now,
    execution: null,
  };
  next.agreements.push(agreement);
  draft.status = 'LOCKED';
  draft.agreementId = agreement.id;
  turn.audit('locked', agreement.id, `${agreement.id} locked: both parties accepted ${draft.id} v${draft.version} (${R.shortHash(draft.termsHash)})`);
  const business = next.mode === 'business';
  turn.say(R.lockedReply(next, agreement, business ? (ctx.guardedAgents[0] ?? 'builder') : null));
  if (business) turn.effects.push({ kind: 'handoff', agreementId: agreement.id, threadId: msg.threadId });
}

function handleWithdraw(turn: Turn, party: Party, ref: string | null): void {
  const { next, ctx } = turn;
  const draft = resolveDraft(
    turn,
    ref,
    (d) => (d.status === 'PENDING' || d.status === 'LOCKED') && Boolean(d.approvals[party.role]),
    'Withdraw',
  );
  if (!draft) return;
  if (draft.status === 'LOCKED') return turn.say(R.withdrawLockedReply(draft));
  if (draft.status !== 'PENDING' || !draft.approvals[party.role]) {
    return turn.say(R.nothingToWithdrawReply(next, draft, party.role));
  }
  delete draft.approvals[party.role];
  draft.updatedAt = ctx.now;
  turn.audit('withdrawn', draft.id, `${turn.actor} withdrew acceptance of ${draft.id} v${draft.version}`);
  turn.say(R.withdrawnReply(next, draft, party.role));
}

function handleReject(turn: Turn, party: Party, ref: string | null): void {
  const { next, ctx } = turn;
  const draft = resolveDraft(turn, ref, (d) => d.status === 'PENDING' || d.status === 'NEEDS_TERMS', 'Reject');
  if (!draft) return;
  if (draft.status === 'LOCKED') return turn.say(R.lockedStateReply(draft));
  if (draft.status === 'REJECTED') return turn.say(R.rejectedStateReply(next, draft));
  draft.status = 'REJECTED';
  draft.rejectedBy = turn.receipt();
  draft.updatedAt = ctx.now;
  turn.audit('rejected', draft.id, `${turn.actor} rejected ${draft.id} v${draft.version}`);
  turn.say(R.rejectedReply(next, draft, party.role));
}

function handleStatus(turn: Turn, ref: string | null): void {
  if (!ref) return turn.say(R.statusReply(turn.next, null));
  const draft = turn.next.drafts.find((d) => d.id === ref);
  turn.say(draft ? R.statusReply(turn.next, draft) : R.notFoundReply(ref));
}

function handleEvidence(turn: Turn, topic: string | null, draftRef: string | null): void {
  const matches = findEvidence(turn.next, { topic, draftRef });
  turn.say(formatEvidenceReply(turn.next, matches, topic));
  const about = topic ? ` about “${topic}”` : draftRef ? ` about ${draftRef}` : '';
  turn.audit(
    'evidence_served',
    matches.length === 1 ? matches[0]!.id : null,
    `Answered ${turn.actor}${about} from the ledger: ${matches.length === 0 ? 'no matching record' : matches.map((m) => m.id).join(', ')}`,
  );
}

function handleNotApproval(turn: Turn, party: Party, reason: Extract<Intent, { kind: 'not_approval' }>['reason']): void {
  const { next, msg } = turn;
  const ref = findDraftRef(msg.body);
  const named = ref ? next.drafts.find((d) => d.id === ref) : undefined;
  const pending = next.drafts.filter((d) => d.status === 'PENDING');
  if (!named && pending.length === 0) return;
  const hint = named?.status === 'PENDING' ? named : !named && pending.length === 1 ? pending[0]! : null;
  turn.audit('ignored_approval', named?.id ?? hint?.id ?? null, `${party.label}'s message was not recorded as an acceptance (${reason})`);
  turn.say(R.notApprovalReply(reason, hint));
}

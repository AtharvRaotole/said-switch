import type { Agreement, ApprovalReceipt, Draft, Intent, Ledger, Party, Role } from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:MM:SS UTC` */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${formatClock(ms)} UTC`;
}

/** `HH:MM:SS` (UTC) */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 10);
}

/** User text made safe for one line of Markdown: no newlines, no backticks, bounded length. */
export function inline(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').replace(/`/g, "'").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function labelFor(ledger: Ledger, role: Role): string {
  return ledger.parties.find((p) => p.role === role)?.label ?? role;
}

const title = (d: { id: string; version: number; scope: string }) => `**${d.id} v${d.version} · ${inline(d.scope)}**`;
const termsLine = (d: { terms: string | null; termsHash: string }) =>
  `Terms: ${inline(d.terms ?? '')} · hash \`${shortHash(d.termsHash)}\``;
const acceptCmd = (d: Draft) => `\`Accept ${d.id} v${d.version}\``;
const NEW_DRAFT_CMD = '`Propose: <scope> | Terms: <terms>`';

function termsCmd(ledger: Ledger, d: Draft): string {
  return `\`Terms ${d.id}: ${ledger.mode === 'business' ? '<time and price>' : '<terms>'}\``;
}

export function approvalBoxes(ledger: Ledger, approvals: Draft['approvals']): string {
  return ledger.parties.map((p) => `${inline(p.label)} ${approvals[p.role] ? '☑' : '☐'}`).join(' · ');
}

function setTermsHint(ledger: Ledger, d: Draft): string {
  const dev = ledger.mode === 'business' ? ledger.parties.find((p) => p.role === 'developer') : undefined;
  return dev ? `${inline(dev.label)}, set terms with ${termsCmd(ledger, d)}.` : `Set terms with ${termsCmd(ledger, d)}.`;
}

export function bypassReply(ledger: Ledger, draft: Draft | null, target: string): string {
  if (!draft) {
    return `Logged. @${target} only starts on scope both of you accept through Said. Nothing has started.`;
  }
  return `Logged as ${title(draft)} (needs terms). @${target} only starts on scope both of you accept. Nothing has started. ${setTermsHint(ledger, draft)}`;
}

export function needsTermsReply(ledger: Ledger, draft: Draft): string {
  return `Logged as ${title(draft)} (needs terms). Nothing starts until both of you accept. ${setTermsHint(ledger, draft)}`;
}

export function termsReply(ledger: Ledger, draft: Draft, replacedVersion: number | null): string {
  const replaced = replacedVersion !== null ? ` Replaces v${replacedVersion}; earlier acceptances were cleared.` : '';
  return `${title(draft)}. ${termsLine(draft)}.${replaced} Accept with ${acceptCmd(draft)}. ${approvalBoxes(ledger, draft.approvals)}`;
}

export function scopeUpdatedReply(ledger: Ledger, draft: Draft): string {
  return `Updated ${title(draft)} (needs terms). ${setTermsHint(ledger, draft)}`;
}

export function unchangedReply(ledger: Ledger, draft: Draft): string {
  const next = draft.status === 'PENDING' ? `Accept with ${acceptCmd(draft)}.` : setTermsHint(ledger, draft);
  return `**${draft.id} v${draft.version}** already has exactly this scope and these terms. ${next}`;
}

export function alreadyLockedReply(draft: Draft): string {
  return `**${draft.id} v${draft.version}** is already locked as **${draft.agreementId}**. Both acceptances are on record.`;
}

export function acceptedReply(ledger: Ledger, draft: Draft, approval: ApprovalReceipt, waiting: Party[]): string {
  const who = waiting.map((p) => `**${inline(p.label)}**`).join(' and ');
  const wait = waiting.length ? ` Waiting on ${who}.` : '';
  return `Recorded **${inline(labelFor(ledger, approval.role))}**'s acceptance of **${draft.id} v${draft.version}** at ${formatTime(approval.timestamp)}.${wait} Nothing has started.`;
}

export function alreadyAcceptedReply(ledger: Ledger, draft: Draft, approval: ApprovalReceipt, waiting: Party[]): string {
  const wait = waiting.length ? ` Waiting on ${waiting.map((p) => `**${inline(p.label)}**`).join(' and ')}.` : '';
  return `**${inline(labelFor(ledger, approval.role))}**'s acceptance of **${draft.id} v${draft.version}** is already on record (${formatTime(approval.timestamp)}).${wait}`;
}

export function lockedReply(ledger: Ledger, agreement: Agreement, handoffTarget: string | null): string {
  const times = ledger.parties
    .map((p) => {
      const a = agreement.approvals[p.role];
      return a ? `${inline(p.label)} ${formatClock(a.timestamp)}` : null;
    })
    .filter((s): s is string => s !== null)
    .join(' · ');
  const tail = handoffTarget ? `Handing off to @${handoffTarget}.` : 'These terms are final; changes need a new draft.';
  return `🔒 **${agreement.id} locked.** Both accepted **${agreement.draftId} v${agreement.version}** (hash \`${shortHash(agreement.termsHash)}\`). ${times} UTC. ${tail}`;
}

export function staleVersionReply(draft: Draft, given: number): string {
  return `**${draft.id}** is now at **v${draft.version}** (${termsLine(draft)}). Your acceptance of v${given} was not recorded. Accept the current version with ${acceptCmd(draft)}.`;
}

export function needVersionReply(draft: Draft): string {
  return `**${draft.id}** has changed since it was first proposed and is now at **v${draft.version}** (${termsLine(draft)}). Nothing was recorded. Accept with the explicit version: ${acceptCmd(draft)}.`;
}

export type DraftVerb = 'Accept' | 'Terms' | 'Revise' | 'Withdraw' | 'Reject';

function exampleCmd(verb: DraftVerb, d: Draft): string {
  if (verb === 'Accept') return acceptCmd(d);
  if (verb === 'Terms') return `\`Terms ${d.id}: <terms>\``;
  return `\`${verb} ${d.id}\``;
}

export function ambiguousReply(drafts: Draft[], verb: DraftVerb): string {
  const list = drafts.map((d) => title(d)).join(', ');
  return `More than one draft could be meant: ${list}. Nothing was recorded. Name the one you mean, e.g. ${exampleCmd(verb, drafts[0]!)}.`;
}

const NOTHING_OPEN: Record<DraftVerb, string> = {
  Accept: 'Nothing is waiting for acceptance right now.',
  Terms: 'There is no open draft to set terms on right now.',
  Revise: 'There is no open draft to revise right now.',
  Withdraw: 'You have no acceptance on an open draft to withdraw.',
  Reject: 'There is no open draft to reject right now.',
};

export function noOpenDraftReply(verb: DraftVerb): string {
  return `${NOTHING_OPEN[verb]} Check with \`Status\`.`;
}

export function notFoundReply(ref: string): string {
  return `There is no **${ref}** in this room. Check with \`Status\`.`;
}

export function needsTermsFirstReply(ledger: Ledger, draft: Draft): string {
  return `${title(draft)} has no terms yet, so there is nothing to accept. ${setTermsHint(ledger, draft)}`;
}

export function rejectedStateReply(ledger: Ledger, draft: Draft): string {
  const by = draft.rejectedBy ? ` by **${inline(draft.rejectedBy.role ? labelFor(ledger, draft.rejectedBy.role) : draft.rejectedBy.senderName)}**` : '';
  return `**${draft.id}** was rejected${by}. Nothing will start. Open a new draft with ${NEW_DRAFT_CMD}.`;
}

export function lockedStateReply(draft: Draft): string {
  return `**${draft.id} v${draft.version}** is locked as **${draft.agreementId}**; locked terms can't change. Changes need a new draft: ${NEW_DRAFT_CMD}.`;
}

export function withdrawLockedReply(draft: Draft): string {
  return `**${draft.id} v${draft.version}** is already locked as **${draft.agreementId}**, so acceptances can't be withdrawn. Locked terms need a new draft: ${NEW_DRAFT_CMD}.`;
}

export function nothingToWithdrawReply(ledger: Ledger, draft: Draft, role: Role): string {
  return `**${inline(labelFor(ledger, role))}** has no acceptance on **${draft.id} v${draft.version}** to withdraw.`;
}

export function withdrawnReply(ledger: Ledger, draft: Draft, role: Role): string {
  return `Withdrew **${inline(labelFor(ledger, role))}**'s acceptance of **${draft.id} v${draft.version}**. ${approvalBoxes(ledger, draft.approvals)}. Nothing has started.`;
}

export function rejectedReply(ledger: Ledger, draft: Draft, role: Role): string {
  return `${title(draft)} rejected by **${inline(labelFor(ledger, role))}**. Nothing will start. Open a new draft with ${NEW_DRAFT_CMD}.`;
}

const NON_PARTY_ACTION: Partial<Record<Intent['kind'], string>> = {
  accept: 'accept drafts',
  propose: 'propose drafts',
  terms: 'set terms',
  revise: 'revise drafts',
  withdraw: 'withdraw acceptances',
  reject: 'reject drafts',
  request: 'open drafts',
  amend: 'open amendments',
};

export function nonPartyReply(ledger: Ledger, kind: Intent['kind']): string {
  const who = ledger.parties.map((p) => `**${inline(p.label)}** (${p.role})`).join(' and ') || 'the enrolled parties';
  return `Only ${who} can ${NON_PARTY_ACTION[kind] ?? 'do that'} in this room. Nothing was recorded.`;
}

const NOT_APPROVAL_REASON = {
  conditional: 'it was conditional. Conditions belong in the terms, not in an acceptance',
  negated: 'it was phrased as a negation',
  quoted: 'it was quoted text, not your own statement',
  reported: 'it reports an acceptance instead of making one. Each party accepts for themselves',
  embedded: 'it was part of a longer message. Send the acceptance on its own',
} as const;

export function notApprovalReply(reason: keyof typeof NOT_APPROVAL_REASON, draft: Draft | null): string {
  const cmd = draft ? acceptCmd(draft) : '`Accept DRF-<number> v<version>`';
  return `Not recorded as an acceptance: ${NOT_APPROVAL_REASON[reason]}. To accept, send exactly ${cmd}.`;
}

export function draftStatusLine(ledger: Ledger, d: Draft): string {
  switch (d.status) {
    case 'NEEDS_TERMS':
      return `${title(d)}: needs terms. Next: ${termsCmd(ledger, d)}.`;
    case 'PENDING':
      return `${title(d)}: pending. ${termsLine(d)}. ${approvalBoxes(ledger, d.approvals)}. Next: ${acceptCmd(d)}.`;
    case 'LOCKED': {
      const agreement = ledger.agreements.find((a) => a.id === d.agreementId);
      const exec = agreement?.execution;
      const execText = exec
        ? `Execution: ${exec.status}${exec.resultCommit ? ` · commit \`${exec.resultCommit.slice(0, 7)}\`` : ''}.`
        : 'Execution: not started.';
      return `🔒 ${title(d)}: locked as **${d.agreementId}**. ${termsLine(d)}. ${execText}`;
    }
    case 'REJECTED':
      return `${title(d)}: rejected${d.rejectedBy ? ` at ${formatTime(d.rejectedBy.timestamp)}` : ''}.`;
  }
}

export function statusReply(ledger: Ledger, draft: Draft | null): string {
  if (draft) return draftStatusLine(ledger, draft);
  if (ledger.drafts.length === 0) return `No drafts yet. Start one with ${NEW_DRAFT_CMD}.`;
  const recent = ledger.drafts.slice(-10).reverse();
  const header = `**Said status.** ${ledger.drafts.length} draft${ledger.drafts.length === 1 ? '' : 's'}, ${ledger.agreements.length} locked agreement${ledger.agreements.length === 1 ? '' : 's'}.`;
  return [header, ...recent.map((d) => `- ${draftStatusLine(ledger, d)}`)].join('\n');
}

export function executionReply(agreement: Agreement): string {
  const exec = agreement.execution!;
  const head = `**${agreement.id}** · \`${exec.jobId}\``;
  const checks = exec.checks.length
    ? ` · checks: ${exec.checks.map((c) => `${inline(c.name, 40)} ${c.ok ? 'passed' : 'failed'}`).join(', ')}`
    : '';
  switch (exec.status) {
    case 'READY':
      return `${head} is ready to start.`;
    case 'RUNNING':
      return `${head} is running${exec.worker ? ` (worker: ${exec.worker}${exec.baseCommit ? `, base \`${exec.baseCommit.slice(0, 7)}\`` : ''})` : ''}.`;
    case 'VALIDATING':
      return `${head} is validating: the diff and checks run before anything is applied.`;
    case 'COMPLETED': {
      const files = exec.changedPaths.length
        ? ` · ${exec.changedPaths.length} file${exec.changedPaths.length === 1 ? '' : 's'}: ${exec.changedPaths.slice(0, 8).map((p) => inline(p, 80)).join(', ')}`
        : '';
      const commit = exec.resultCommit ? `, commit \`${exec.resultCommit.slice(0, 7)}\`` : '';
      return `${head} completed${commit}${files}${checks}.`;
    }
    case 'FAILED':
      return `${head} failed: ${inline(exec.error ?? 'no reason given')}${checks}. Nothing was applied.`;
  }
}

export function amendNeedsTermsReply(ledger: Ledger, draft: Draft, agreementId: string): string {
  return `Change request against **${agreementId}** logged as ${title(draft)} (needs terms). Both of you must accept before work follows the new scope. ${setTermsHint(ledger, draft)}`;
}

export function amendTermsReply(ledger: Ledger, draft: Draft, agreementId: string): string {
  return `Change request against **${agreementId}**: ${title(draft)}. ${termsLine(draft)}. Both of you must accept with ${acceptCmd(draft)}. ${approvalBoxes(ledger, draft.approvals)}`;
}

export function agreementNotFoundReply(agreementId: string): string {
  return `No locked agreement **${agreementId}** is on the ledger. Check the id and try again.`;
}

export function amendCompletedReply(agreement: Agreement): string {
  return `**${agreement.id}** already completed as ${agreement.execution?.jobId ?? 'done'}. Open a new proposal instead of amending it.`;
}

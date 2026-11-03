import { formatTime, inline, labelFor, shortHash } from './replies';
import type { Agreement, Draft, Ledger, Receipt } from './types';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'about', 'at', 'by', 'from', 'into',
  'we', 'you', 'i', 'it', 'is', 'was', 'be', 'that', 'this', 'our', 'my', 'your', 'me', 'us', 'please', 'also',
]);

const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

function tokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOPWORDS.has(w)).map(stem));
}

const isAgreement = (r: Draft | Agreement): r is Agreement => 'lockedAt' in r;

export function findEvidence(ledger: Ledger, query: { topic: string | null; draftRef: string | null }): Array<Draft | Agreement> {
  const asRecord = (d: Draft): Draft | Agreement =>
    (d.agreementId && ledger.agreements.find((a) => a.id === d.agreementId)) || d;
  if (query.draftRef) {
    const d = ledger.drafts.find((x) => x.id === query.draftRef);
    return d ? [asRecord(d)] : [];
  }
  const want = query.topic ? tokens(query.topic) : new Set<string>();
  if (want.size === 0) return ledger.drafts.map(asRecord);
  const scored = ledger.drafts
    .map((d) => {
      const have = tokens([d.scope, ...d.history.map((h) => h.scope)].join(' '));
      return { d, score: [...want].filter((w) => have.has(w)).length };
    })
    .filter((x) => x.score > 0);
  const best = Math.max(0, ...scored.map((x) => x.score));
  return scored.filter((x) => x.score === best).map((x) => asRecord(x.d));
}

const quote = (text: string) => `“${inline(text)}”`;

function who(ledger: Ledger, r: Receipt): string {
  return `**${inline(r.role ? labelFor(ledger, r.role) : r.senderName)}**`;
}

function approvalLines(ledger: Ledger, approvals: Draft['approvals']): string[] {
  return ledger.parties.map((p) => {
    const a = approvals[p.role];
    return a
      ? `- **${inline(p.label)}** (${p.role}) accepted v${a.version} at ${formatTime(a.timestamp)}: ${quote(a.text)}`
      : `- **${inline(p.label)}** (${p.role}): no acceptance on record.`;
  });
}

function historyLines(ledger: Ledger, draft: Draft): string[] {
  return draft.history.map((h) => {
    const accepted = Object.values(h.approvals).map((a) => inline(labelFor(ledger, a.role)));
    const then = accepted.length ? ` (accepted then by ${accepted.join(', ')})` : '';
    return `- Earlier v${h.version}: ${h.terms === null ? 'no terms' : quote(h.terms)} · hash \`${shortHash(h.termsHash)}\` · superseded ${formatTime(h.supersededAt)}${then}`;
  });
}

function describeAgreement(ledger: Ledger, a: Agreement): string {
  const draft = ledger.drafts.find((d) => d.id === a.draftId);
  return [
    `🔒 **${a.id}.** Both parties accepted **${a.draftId} v${a.version} · ${inline(a.scope)}**.`,
    `Terms on record: ${quote(a.terms)} · hash \`${shortHash(a.termsHash)}\` · locked ${formatTime(a.lockedAt)}.`,
    ...approvalLines(ledger, a.approvals),
    ...(draft ? historyLines(ledger, draft) : []),
  ].join('\n');
}

function describeDraft(ledger: Ledger, d: Draft): string {
  const lines = [`**${d.id} v${d.version} · ${inline(d.scope)}** is **not agreed.** Status: ${d.status}.`];
  if (d.terms === null) {
    lines.push('No terms were ever set, so there is nothing anyone could have accepted.');
  } else {
    lines.push(
      `Terms on record: ${quote(d.terms)} · hash \`${shortHash(d.termsHash)}\`, set by ${who(ledger, d.proposal)} at ${formatTime(d.proposal.timestamp)}: ${quote(d.proposal.text)}`,
    );
    lines.push(...approvalLines(ledger, d.approvals));
  }
  lines.push(...historyLines(ledger, d));
  if (d.rejectedBy) lines.push(`Rejected by ${who(ledger, d.rejectedBy)} at ${formatTime(d.rejectedBy.timestamp)}: ${quote(d.rejectedBy.text)}`);
  lines.push(`Requested by ${who(ledger, d.request)} at ${formatTime(d.request.timestamp)}: ${quote(d.request.text)}`);
  if (d.status === 'PENDING') lines.push(`Nothing is agreed until both accept with \`Accept ${d.id} v${d.version}\`.`);
  return lines.join('\n');
}

function summary(r: Draft | Agreement): string {
  return isAgreement(r)
    ? `**${r.id}** (locked: ${r.draftId} v${r.version} · ${inline(r.scope, 60)})`
    : `**${r.id}** (${r.status.toLowerCase()} v${r.version} · ${inline(r.scope, 60)})`;
}

export function formatEvidenceReply(ledger: Ledger, matches: Array<Draft | Agreement>, topic: string | null): string {
  const about = topic ? ` about **${inline(topic, 80)}**` : '';
  if (matches.length === 0) {
    return `I have no record of an agreement${about} in this room. Nothing on it was proposed or accepted here. To start one: \`Propose: <scope> | Terms: <terms>\`.`;
  }
  if (matches.length > 1) {
    const first = matches[0]!;
    const ref = isAgreement(first) ? first.draftId : first.id;
    return `Several records match${about}: ${matches.map(summary).join(', ')}. Ask about one, e.g. \`What did we agree about ${ref}?\``;
  }
  const only = matches[0]!;
  return isAgreement(only) ? describeAgreement(ledger, only) : describeDraft(ledger, only);
}

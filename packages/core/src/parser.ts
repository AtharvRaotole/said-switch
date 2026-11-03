import { normalizeDraftRef } from './ids';
import type { Intent } from './types';

type NotApprovalReason = Extract<Intent, { kind: 'not_approval' }>['reason'];

const NONE: Intent = { kind: 'none' };
const REF = String.raw`drf[\s-]*\d{1,6}(?!\d)`;
const VERSION = String.raw`(?:v\s*(\d{1,6})|version\s+(\d{1,6}))`;
const VERSION_NC = String.raw`(?:v\s*\d{1,6}|version\s+\d{1,6})`;
const OPT_REF = String.raw`(?:\s+(?:draft\s+)?(${REF}))?(?:\s*,?\s*${VERSION_NC})?`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const refOf = (raw: string | undefined) => (raw ? normalizeDraftRef(raw) : null);

export function findDraftRef(text: string): string | null {
  return refOf(new RegExp(String.raw`\b${REF}`, 'i').exec(text)?.[0]);
}

// ---------------------------------------------------------------- commands

const ENROLL = /^enroll\s+([a-z0-9]{4,8})[\s.!]*$/i;
const PROPOSE = /^propose\s*:\s*([\s\S]*)$/i;
const TERMS = new RegExp(String.raw`^(?:set\s+)?terms(?:\s+(?:for\s+)?(?:draft\s+)?(${REF}))?\s*:\s*([\s\S]*)$`, 'i');
const REVISE = new RegExp(String.raw`^revise\s+(?:draft\s+)?(${REF})\s*:\s*([\s\S]*)$`, 'i');
const WITHDRAW = new RegExp(
  String.raw`^(?:(?:ok|okay|sorry|actually|wait|i|we)[\s,]+)*(?:withdraw|retract|revoke)(?:\s+(?:my|our))?(?:\s+(?:approval|acceptance))?(?:\s+(?:of|for|on|from))?${OPT_REF}[\s.!]*$`,
  'i',
);
const REJECT = new RegExp(String.raw`^(?:(?:no|nope|sorry|ok|okay|i|we)[\s,]+)*(?:reject|decline)${OPT_REF}[\s.!]*$`, 'i');
const STATUS = new RegExp(
  String.raw`^(?:what(?:'s|\s+is)\s+(?:the\s+)?)?status(?:\s+(?:of|for|on))?(?:\s+(?:draft\s+)?(${REF}))?[\s?.!]*$`,
  'i',
);

function cleanPart(s: string): string | null {
  const c = collapse(s).replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim();
  return c || null;
}

function splitScopeTerms(body: string): { scope: string | null; terms: string | null } {
  const termsAt = body.search(/\bterms\s*:/i);
  if (termsAt >= 0) {
    return { scope: cleanPart(body.slice(0, termsAt)), terms: cleanPart(body.slice(termsAt).replace(/^terms\s*:/i, '')) };
  }
  const bar = body.indexOf('|');
  if (bar >= 0) return { scope: cleanPart(body.slice(0, bar)), terms: cleanPart(body.slice(bar + 1)) };
  return { scope: cleanPart(body), terms: null };
}

function parseCommand(t: string): Intent | null {
  let m: RegExpExecArray | null;
  if ((m = ENROLL.exec(t))) return { kind: 'enroll', code: m[1]!.toUpperCase() };
  if ((m = PROPOSE.exec(t))) {
    const { scope, terms } = splitScopeTerms(m[1]!);
    return scope ? { kind: 'propose', scope, terms } : NONE;
  }
  if ((m = TERMS.exec(t))) {
    const terms = cleanPart(m[2]!);
    return terms ? { kind: 'terms', draftRef: refOf(m[1]), terms } : NONE;
  }
  if ((m = REVISE.exec(t))) {
    const { scope, terms } = splitScopeTerms(m[2]!);
    const draftRef = refOf(m[1]);
    return draftRef && (scope || terms) ? { kind: 'revise', draftRef, scope, terms } : NONE;
  }
  if ((m = WITHDRAW.exec(t))) return { kind: 'withdraw', draftRef: refOf(m[1]) };
  if ((m = REJECT.exec(t))) return { kind: 'reject', draftRef: refOf(m[1]) };
  if ((m = STATUS.exec(t))) return { kind: 'status', draftRef: refOf(m[1]) };
  return null;
}

// ---------------------------------------------------------------- evidence

const EVIDENCE =
  /\b(?:i\s+thought\s+we\s+agreed|we\s+never\s+agreed|what\s+did\s+we\s+agree|did\s+we\s+(?:ever\s+)?agree|didn't\s+we\s+agree|what\s+was\s+agreed|what\s+we\s+agreed|you\s+said)\b/i;
const TOPIC_CUT =
  /\b(?:was|is|were|are|would|will|should|could|can|be|being|been|cost|costs|included|includes|free|at|for|right|correct|yesterday|today|earlier|and|but|so|then)\b/i;
const TOPIC_LEAD = new Set(['that', 'to', 'on', 'the', 'a', 'an', 'about', 'upon', 'with', 'we', 'you', 'it', 'i', 're', 'regarding', 'this', 'our']);

function evidenceTopic(t: string, phrase: RegExpExecArray): string | null {
  const about = /\babout\s+([^?.!\n]+)/i.exec(t);
  let raw = about ? about[1]! : (t.slice(phrase.index + phrase[0].length).split(/[?.!\n]/)[0] ?? '');
  const cut = TOPIC_CUT.exec(raw);
  if (cut) raw = raw.slice(0, cut.index);
  raw = raw.replace(new RegExp(String.raw`\b${REF}`, 'gi'), ' ').replace(new RegExp(String.raw`\b${VERSION_NC}\b`, 'gi'), ' ');
  const words = raw.split(/[\s,;:"“”]+/).filter(Boolean);
  while (words.length && TOPIC_LEAD.has(words[0]!.toLowerCase())) words.shift();
  return words.join(' ') || null;
}

function parseEvidence(t: string): Intent | null {
  const phrase = EVIDENCE.exec(t);
  return phrase ? { kind: 'evidence', topic: evidenceTopic(t, phrase), draftRef: findDraftRef(t) } : null;
}

// ---------------------------------------------------------------- requests

const REQUEST_VERBS = new Set([
  'add', 'build', 'implement', 'create', 'change', 'make', 'include', 'support', 'fix', 'remove', 'update',
  'put', 'swap', 'replace', 'redesign', 'rename', 'move', 'delete', 'integrate', 'write', 'design', 'ship',
  'enable', 'disable', 'turn', 'translate', 'refactor', 'improve', 'adjust', 'tweak', 'convert', 'redo',
  'rewrite', 'restyle', 'increase', 'decrease', 'reduce', 'extend', 'insert', 'introduce',
]);
const LEAD_FILLERS = String.raw`(?:also|and|oh|hey|hi|ok|okay|so|then|actually|plus|btw)`;
const REQUEST_LEAD = new RegExp(
  String.raw`^(?:${LEAD_FILLERS}\b[\s,]*)*(?:(?:please|pls|can\s+you|could\s+you|would\s+you|will\s+you)\b[\s,]*)*`,
  'i',
);

/** A request's scope: mentions and filler stripped, first letter capitalized (`@builder also add dark mode while you're in there` → `Add dark mode`). */
export function cleanRequestScope(text: string): string {
  let s = text.replace(/[’‘]/g, "'");
  s = s.replace(/(^|\s)@[\w.-]+[:,]?/g, ' ');
  s = s.replace(/\bwhile\s+you(?:'re|\s+are)\s+(?:in|at)\s+(?:there|it)\b/gi, ' ');
  s = s.replace(/\b(?:can|could|would|will)\s+you\b/gi, ' ');
  s = s.replace(/\b(?:please|pls|also|too|as\s+well|for\s+me|for\s+us|thanks|thank\s+you)\b/gi, ' ');
  s = collapse(s).replace(new RegExp(String.raw`^(?:${LEAD_FILLERS}\b[\s,]*)+`, 'i'), '');
  s = s.replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '').replace(/\s+([,.;:!?])/g, '$1');
  return s ? s[0]!.toUpperCase() + s.slice(1) : '';
}

function parseRequest(t: string): Intent | null {
  const verb = /^([a-z]+)\s+\S/i.exec(t.replace(REQUEST_LEAD, ''))?.[1]?.toLowerCase();
  if (!verb || !REQUEST_VERBS.has(verb)) return null;
  const scope = cleanRequestScope(t);
  return scope.includes(' ') ? { kind: 'request', scope } : null;
}

// ---------------------------------------------------------------- acceptance

const ACCEPT_VERB_SRC = String.raw`\b(accept(?:s|ed|ing)?|approv(?:e|es|ed|ing)|agree(?:s|d|ing)?\s+to|sign(?:s|ed|ing)?\s+off(?:\s+on)?)\b`;
const ACCEPT_VERB = new RegExp(ACCEPT_VERB_SRC, 'i');
/** What may follow an accept verb for the message to read as an acceptance (vs. "do you accept credit cards"). */
const AFTER_ACCEPT = new RegExp(
  String.raw`^\s*(?:$|[.!?,;:)\]]|(?:draft\s+)?${REF}|v\s*\d|version\s+\d|(?:it|this|that|these|those|them|both|everything)\b|the\s+(?:new\s+)?(?:terms|draft|deal|quote|proposal|price|change|changes|scope|agreement|offer)\b|(?:if|once|as\s+long\s+as|provided|providing|unless|assuming|only\s+when|on\s+condition|but|by|from)\b|["“”'\x60])`,
  'i',
);
const SAID_YES = /\b[a-z0-9'-]+\s+(?:said|says|told\s+\w+)\s+(?:yes|ok|okay|yep|sure|fine|go\s+ahead)\b/i;
const CONDITIONAL = /\b(?:if|once|as\s+long\s+as|provided|providing|unless|assuming|only\s+when|on\s+condition)\b/i;
const NEGATION =
  /\b(?:don't|dont|do\s+not|not|never|won't|wont|can't|cant|cannot|no\s+longer|didn't|didnt|doesn't|doesnt|wouldn't|shouldn't|haven't|hasn't|isn't|refuse\s+to)\b/i;
const ASKING_OTHERS =
  /\b(?:please|pls|plz|can\s+you|could\s+you|would\s+you|will\s+you|you\s+(?:need|have|should|must)\s+to|needs?\s+to|has\s+to|have\s+to|should|must|go\s+ahead\s+and|waiting\s+(?:on|for))\b/i;
const QUOTED_SEGMENTS = /"[^"]*"|“[^”]*”|(?<=^|[\s(])'[^'\n]*'(?=$|[\s.,!?;:)])|`[^`]*`/g;

const FIRST_PERSON = new Set(['i', 'we', "i've", "we've", "i'll", "we'll", "i'm", "we're", "i'd", "we'd", 'me', 'us']);
const FILLER_WORDS = new Set([
  'ok', 'okay', 'fine', 'yes', 'yep', 'yeah', 'sure', 'alright', 'all', 'right', 'great', 'perfect', 'cool', 'good',
  'so', 'and', 'then', 'thanks', 'lgtm', 'also', 'sounds', 'looks', 'hereby', 'now', 'well', 'oh', 'hey',
]);
const SUBJECT_SKIP = new Set([
  'already', 'also', 'just', 'now', 'hereby', 'officially', 'formally', 'fully', 'happily', 'gladly', 'definitely',
  'totally', 'have', 'has', 'had', 'will', 'shall', 'do', 'does', 'did', 'both', 'then', 'still', 'really',
]);

const GRAMMAR_FILLER = String.raw`(?:ok|okay|fine|yes|yep|yeah|sure|alright|all\s+right|great|perfect|cool|good|sounds\s+good|looks\s+good|lgtm|so|then|and|also|i|we|do|hereby)`;
const ACCEPT_GRAMMAR = new RegExp(
  String.raw`^(?:${GRAMMAR_FILLER}[\s,.!:;-]+)*(accept|approve|agree\s+to|sign\s+off\s+on|accepted|approved)(?:\s+(?:draft\s+)?(${REF}))?(?:[\s,]+${VERSION})?(?:[\s,.!-]+(?:thanks|thank\s+you|thx|cheers))?[\s.!]*$`,
  'i',
);

const notApproval = (reason: NotApprovalReason): Intent => ({ kind: 'not_approval', reason });

/** The word governing the verb (skipping adverbs/auxiliaries) and whether the clause speaks in the first person. */
function subjectBefore(before: string): { subject: string | null; firstPersonClause: boolean } {
  const clause = before.split(/[.!?;:]/).pop() ?? '';
  const words = clause.toLowerCase().match(/[a-z0-9'@-]+/g) ?? [];
  const firstPersonClause = words.some((w) => FIRST_PERSON.has(w));
  while (words.length && SUBJECT_SKIP.has(words[words.length - 1]!)) words.pop();
  return { subject: words.pop() ?? null, firstPersonClause };
}

function isQuoted(t: string): boolean {
  if (t.split('\n').some((line) => /^\s*>/.test(line) && ACCEPT_VERB.test(line))) return true;
  return (t.match(QUOTED_SEGMENTS) ?? []).some((seg) => ACCEPT_VERB.test(seg));
}

function classifyAcceptance(t: string, verb: RegExpExecArray): Intent {
  if (isQuoted(t)) return notApproval('quoted');
  // A multi-line message is pasted or instructional text and never an approval, wherever the phrase sits.
  if (t.length > 280 || t.split('\n').filter((l) => l.trim()).length > 1) return notApproval('embedded');

  const before = t.slice(0, verb.index);
  if (ASKING_OTHERS.test(before) || t.endsWith('?')) return NONE;
  if (NEGATION.test(before)) return notApproval('negated');
  if (CONDITIONAL.test(t.replace(/\bat\s+once\b/gi, ''))) return notApproval('conditional');

  const { subject, firstPersonClause } = subjectBefore(before);
  const firstPerson = subject !== null && FIRST_PERSON.has(subject);
  const thirdPersonVerb = /^(?:accepts|approves|agrees|signs)\b/i.test(verb[1]!);
  const otherSubject = subject !== null && !firstPerson && !FILLER_WORDS.has(subject) && !firstPersonClause;
  if (thirdPersonVerb || otherSubject) return notApproval('reported');

  const g = ACCEPT_GRAMMAR.exec(t);
  const pastTense = /^(?:accepted|approved|agreed|signed)/i.test(verb[1]!);
  if (g && !(pastTense && firstPerson)) {
    const v = g[3] ?? g[4];
    return { kind: 'accept', draftRef: refOf(g[2]), version: v === undefined ? null : Number.parseInt(v, 10) };
  }
  return notApproval(pastTense && firstPerson ? 'reported' : 'embedded');
}

function parseAcceptLike(t: string): Intent | null {
  for (const m of t.matchAll(new RegExp(ACCEPT_VERB_SRC, 'gi'))) {
    if (AFTER_ACCEPT.test(t.slice(m.index + m[0].length))) return classifyAcceptance(t, m as RegExpExecArray);
  }
  return SAID_YES.test(t) ? notApproval('reported') : null;
}

// ---------------------------------------------------------------- entry

export function parseIntent(text: string, ctx: { saidName: string }): Intent {
  let t = text.replace(/\r\n?/g, '\n').replace(/[’‘]/g, "'").trim();
  t = t.replace(new RegExp(String.raw`^@${escapeRe(ctx.saidName)}(?![\w.-])[\s:,]*`, 'i'), '').trim();
  const wholeCode = /^`([^`\n]+)`$/.exec(t);
  if (wholeCode) t = wholeCode[1]!.trim();
  if (!t) return NONE;
  return parseCommand(t) ?? parseEvidence(t) ?? parseRequest(t) ?? parseAcceptLike(t) ?? NONE;
}

import type { Draft, SignedLedger } from '@said/core';

export interface TamperChange {
  draftId: string | null;
  field: 'terms' | 'scope' | 'roomId';
  before: string;
  after: string;
  /** Index of the flipped character in `before` / `after`. */
  index: number;
}

export interface Tampered {
  copy: SignedLedger;
  change: TamperChange;
}

/**
 * Returns a deep copy of the signed ledger with exactly one character changed
 * in the payload; digest and signature are left as signed. Prefers a price
 * digit in the most consequential draft so the edit is visible on screen.
 */
export function tamperOneByte(signed: SignedLedger): Tampered | null {
  const copy = structuredClone(signed);
  const target = pickDraft(copy.payload.drafts);

  if (target) {
    const field = target.terms ? 'terms' : 'scope';
    const before = target[field] ?? '';
    const flipped = flipOne(before);
    if (flipped) {
      target[field] = flipped.text;
      return { copy, change: { draftId: target.id, field, before, after: flipped.text, index: flipped.index } };
    }
  }

  const before = copy.payload.roomId;
  const flipped = flipOne(before);
  if (!flipped) return null;
  copy.payload.roomId = flipped.text;
  return { copy, change: { draftId: null, field: 'roomId', before, after: flipped.text, index: flipped.index } };
}

function pickDraft(drafts: Draft[]): Draft | undefined {
  return (
    drafts.find((d) => d.status === 'LOCKED' && d.terms) ??
    drafts.find((d) => d.terms) ??
    drafts[0]
  );
}

function flipOne(text: string): { text: string; index: number } | null {
  const price = text.search(/\$\d/);
  let index = price >= 0 ? price + 1 : text.search(/\d/);
  if (index >= 0) {
    const replacement = text[index] === '1' ? '9' : '1';
    return { text: replace(text, index, replacement), index };
  }
  index = text.search(/[A-Za-z]/);
  if (index < 0) return null;
  const ch = text.charAt(index);
  const swapped = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
  return { text: replace(text, index, swapped), index };
}

function replace(text: string, index: number, ch: string): string {
  return text.slice(0, index) + ch + text.slice(index + 1);
}

import { paths, readJson, writeJson } from '@said/runtime';

/**
 * The notary owns `notary-state.json`; its exact layout is the notary's business. The scripts only
 * need the ledger pointer, so reads accept the field names the notary brief uses
 * (`ledgerDocumentId`, `revision`, `digest`) plus the obvious aliases, and writes touch only
 * those keys and keep every other key (connection id, cursor, …) as it was.
 */
const REVISION_KEYS = ['revision', 'ledgerRevision', 'lastRevision'] as const;
const DIGEST_KEYS = ['digest', 'ledgerDigest', 'lastDigest'] as const;

export interface LedgerPointer {
  ledgerDocumentId: string | null;
  revision: number | null;
  digest: string | null;
}

function pick<T>(state: Record<string, unknown>, keys: readonly string[], guard: (v: unknown) => v is T): T | null {
  for (const key of keys) {
    const v = state[key];
    if (guard(v)) return v;
  }
  return null;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function readNotaryState(): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(paths.notaryState);
}

export function ledgerPointer(state: Record<string, unknown> | null): LedgerPointer {
  if (!state) return { ledgerDocumentId: null, revision: null, digest: null };
  return {
    ledgerDocumentId: pick(state, ['ledgerDocumentId'], isString),
    revision: pick(state, REVISION_KEYS, isNumber),
    digest: pick(state, DIGEST_KEYS, isString),
  };
}

export async function writeLedgerPointer(pointer: { ledgerDocumentId: string; revision: number; digest: string }): Promise<void> {
  const state = (await readNotaryState()) ?? {};
  state.ledgerDocumentId = pointer.ledgerDocumentId;
  // Keep every revision/digest alias that already exists in sync; otherwise use the primary name.
  const setAll = (keys: readonly string[], value: unknown) => {
    const present = keys.filter((k) => k in state);
    for (const key of present.length > 0 ? present : [keys[0]!]) state[key] = value;
  };
  setAll(REVISION_KEYS, pointer.revision);
  setAll(DIGEST_KEYS, pointer.digest);
  await writeJson(paths.notaryState, state);
}

/** Forgets the ledger pointer (used when the ledger document is gone and enrollment must be redone). */
export async function clearLedgerPointer(): Promise<void> {
  const state = (await readNotaryState()) ?? {};
  for (const key of ['ledgerDocumentId', ...REVISION_KEYS, ...DIGEST_KEYS]) delete state[key];
  await writeJson(paths.notaryState, state);
}

/** Clears the builder's job records but keeps its connection id and cursor. Returns how many jobs were dropped. */
export async function clearBuilderJobs(): Promise<number> {
  const state = await readJson<Record<string, unknown>>(paths.builderState);
  if (!state) return 0;
  let dropped = 0;
  for (const key of ['jobs', 'jobRecords']) {
    const value = state[key];
    if (Array.isArray(value)) {
      dropped += value.length;
      state[key] = [];
    } else if (value && typeof value === 'object') {
      dropped += Object.keys(value).length;
      state[key] = {};
    }
  }
  if (dropped > 0) await writeJson(paths.builderState, state);
  return dropped;
}

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Role } from '@said/core';
import { paths, readJson, writeJson, type Logger } from '@said/runtime';
import type { CursorState, CursorStore } from '@said/switch-client';

const bindingSchema = z.object({
  role: z.enum(['developer', 'client', 'partnerA', 'partnerB']),
  label: z.string().min(1),
  senderId: z.string().min(1),
  code: z.string().min(1),
});

const fileSchema = z.object({
  connectionId: z.string().min(1),
  cursor: z.number().nullable(),
  generation: z.number().nullable(),
  ledgerDocumentId: z.string().nullable(),
  revision: z.number().nullable(),
  digest: z.string().nullable(),
  bindings: z.array(bindingSchema).default([]),
  /** Bad enrollment code attempts by senderId. Survives notary restarts. */
  enrollFails: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export type Binding = z.infer<typeof bindingSchema>;
export type NotaryFileState = z.infer<typeof fileSchema>;

function fresh(prev: Record<string, unknown> | null): NotaryFileState {
  const bindings = z.array(bindingSchema).safeParse(prev?.bindings);
  return {
    connectionId: typeof prev?.connectionId === 'string' && prev.connectionId ? prev.connectionId : randomUUID(),
    cursor: typeof prev?.cursor === 'number' ? prev.cursor : null,
    generation: typeof prev?.generation === 'number' ? prev.generation : null,
    ledgerDocumentId: typeof prev?.ledgerDocumentId === 'string' ? prev.ledgerDocumentId : null,
    revision: typeof prev?.revision === 'number' ? prev.revision : null,
    digest: typeof prev?.digest === 'string' ? prev.digest : null,
    bindings: bindings.success ? bindings.data : [],
    enrollFails:
      prev?.enrollFails && typeof prev.enrollFails === 'object' && !Array.isArray(prev.enrollFails)
        ? Object.fromEntries(
            Object.entries(prev.enrollFails as Record<string, unknown>).filter(
              (e): e is [string, number] => typeof e[1] === 'number' && e[1] >= 0,
            ),
          )
        : {},
  };
}

/** Persists connection, cursor, and ledger pointer. Cursor saves merge; they do not drop the other keys. */
export class NotaryStateStore implements CursorStore {
  private current: NotaryFileState;
  private chain: Promise<void> = Promise.resolve();

  private constructor(
    current: NotaryFileState,
    private readonly log: Logger,
  ) {
    this.current = current;
  }

  static async open(log: Logger): Promise<NotaryStateStore> {
    const raw = await readJson<unknown>(paths.notaryState);
    const parsed = fileSchema.safeParse(raw);
    const current = parsed.success ? parsed.data : fresh(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null);
    const store = new NotaryStateStore(current, log);
    await store.update({});
    return store;
  }

  snapshot(): NotaryFileState {
    return {
      ...this.current,
      bindings: this.current.bindings.map((b) => ({ ...b })),
      enrollFails: { ...this.current.enrollFails },
    };
  }

  update(patch: Partial<NotaryFileState>): Promise<void> {
    this.current = { ...this.current, ...patch };
    const task = this.chain.then(() => writeJson(paths.notaryState, this.current));
    this.chain = task.catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error('could not write notary-state.json', message);
    });
    return task;
  }

  async load(): Promise<CursorState> {
    const snap = this.snapshot();
    return { cursor: snap.cursor, generation: snap.generation };
  }

  save(s: { cursor: number; generation: number | null }): Promise<void> {
    return this.update({ cursor: s.cursor, generation: s.generation });
  }
}

export type { Role };

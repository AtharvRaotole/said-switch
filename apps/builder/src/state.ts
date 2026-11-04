import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CursorState, CursorStore } from '@said/switch-client';
import { readJson, writeJson } from '@said/runtime';
import { STEP_KEYS, type BuilderState, type JobRecord, type JobStep } from './types.js';

const stepSchema = z.object({
  key: z.enum(STEP_KEYS),
  state: z.enum(['pending', 'running', 'passed', 'failed']),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  detail: z.string().nullable(),
});

const jobSchema = z.object({
  jobId: z.string().min(1),
  agreementId: z.string().min(1),
  status: z.enum(['READY', 'RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED']),
  worker: z.enum(['claude', 'codex', 'scripted']).nullable(),
  steps: z.array(stepSchema),
  baseCommit: z.string().nullable(),
  resultCommit: z.string().nullable(),
  changedPaths: z.array(z.string()),
  error: z.string().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  checks: z
    .array(
      z.object({
        name: z.string(),
        ok: z.boolean(),
        durationMs: z.number(),
        detail: z.string(),
      }),
    )
    .default([]),
  threadId: z.string().nullable().default(null),
  receiptSent: z.boolean().default(false),
});

const stateSchema = z.object({
  connectionId: z.string().uuid(),
  cursor: z.number().nullable(),
  generation: z.number().nullable(),
  jobs: z.array(jobSchema),
});

function fillSteps(steps: JobStep[]): JobStep[] {
  return STEP_KEYS.map((key) => {
    const found = steps.find((step) => step.key === key);
    return (
      found ?? {
        key,
        state: 'pending' as const,
        startedAt: null,
        finishedAt: null,
        detail: null,
      }
    );
  });
}

function freshState(): BuilderState {
  return { connectionId: randomUUID(), cursor: null, generation: null, jobs: [] };
}

export interface OpenedState {
  store: BuilderStateStore;
  /** True when the file was missing or unreadable and a new connection id was created. */
  created: boolean;
}

export class BuilderStateStore implements CursorStore {
  private write: Promise<void> = Promise.resolve();

  private constructor(
    private readonly file: string,
    private state: BuilderState,
  ) {}

  static async open(file: string): Promise<OpenedState> {
    const raw = await readJson<unknown>(file);
    const parsed = stateSchema.safeParse(raw);
    if (!parsed.success) {
      const state = freshState();
      const store = new BuilderStateStore(file, state);
      await writeJson(file, state);
      return { store, created: true };
    }
    return { store: new BuilderStateStore(file, normalize(parsed.data)), created: false };
  }

  snapshot(): BuilderState {
    return structuredClone(this.state);
  }

  async update(mutator: (state: BuilderState) => void): Promise<void> {
    const run = this.write.then(async () => {
      mutator(this.state);
      await writeJson(this.file, this.state);
    });
    this.write = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async load(): Promise<CursorState> {
    return { cursor: this.state.cursor, generation: this.state.generation };
  }

  save(next: { cursor: number; generation: number | null }): Promise<void> {
    return this.update((state) => {
      state.cursor = next.cursor;
      state.generation = next.generation;
    });
  }
}

function normalize(state: BuilderState): BuilderState {
  for (const job of state.jobs) repairJob(job);
  return state;
}

function repairJob(job: JobRecord): void {
  job.steps = fillSteps(job.steps);
  job.checks ??= [];
  job.changedPaths ??= [];
  job.receiptSent ??= false;
}

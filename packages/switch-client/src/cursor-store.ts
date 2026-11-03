import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CursorState {
  cursor: number | null;
  generation: number | null;
}

export interface CursorStore {
  load(): Promise<CursorState>;
  save(s: { cursor: number; generation: number | null }): Promise<void>;
}

export class MemoryCursorStore implements CursorStore {
  private state: CursorState = { cursor: null, generation: null };

  async load(): Promise<CursorState> {
    return { ...this.state };
  }

  async save(s: { cursor: number; generation: number | null }): Promise<void> {
    this.state = { cursor: s.cursor, generation: s.generation };
  }
}

function asNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** JSON file; each save is written to a temp file then renamed over the target. */
export class FileCursorStore implements CursorStore {
  private readonly path: string;
  private writes: Promise<void> = Promise.resolve();
  private counter = 0;

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<CursorState> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { cursor: null, generation: null };
      throw err;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return { cursor: asNumberOrNull(parsed.cursor), generation: asNumberOrNull(parsed.generation) };
    } catch {
      // A torn or hand-edited file: start from head rather than refuse to run.
      return { cursor: null, generation: null };
    }
  }

  save(s: { cursor: number; generation: number | null }): Promise<void> {
    const run = async (): Promise<void> => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.${this.counter++}.tmp`;
      await writeFile(tmp, JSON.stringify({ cursor: s.cursor, generation: s.generation }), 'utf8');
      await rename(tmp, this.path);
    };
    // Serialised, so concurrent saves cannot interleave tmp files or land out of order.
    const next = this.writes.then(run, run);
    this.writes = next.catch(() => undefined);
    return next;
  }
}

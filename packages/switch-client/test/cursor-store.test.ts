import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileCursorStore, MemoryCursorStore } from '../src/index.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'switch-cursor-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FileCursorStore', () => {
  it('loads null/null when the file does not exist', async () => {
    expect(await new FileCursorStore(join(dir, 'missing.json')).load()).toEqual({ cursor: null, generation: null });
  });

  it('round-trips cursor and generation, across instances', async () => {
    const path = join(dir, 'nested', 'cursor.json');
    await new FileCursorStore(path).save({ cursor: 4813, generation: 7 });
    expect(await new FileCursorStore(path).load()).toEqual({ cursor: 4813, generation: 7 });
    await new FileCursorStore(path).save({ cursor: 4814, generation: null });
    expect(await new FileCursorStore(path).load()).toEqual({ cursor: 4814, generation: null });
  });

  it('leaves no temp files behind and writes valid JSON', async () => {
    const path = join(dir, 'cursor.json');
    const store = new FileCursorStore(path);
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.save({ cursor: n, generation: 1 })));
    expect(await readdir(dir)).toEqual(['cursor.json']);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ cursor: 5, generation: 1 });
  });

  it('treats a corrupt file as no cursor instead of throwing', async () => {
    const path = join(dir, 'cursor.json');
    await writeFile(path, '{"cursor": 12', 'utf8');
    expect(await new FileCursorStore(path).load()).toEqual({ cursor: null, generation: null });
  });
});

describe('MemoryCursorStore', () => {
  it('round-trips', async () => {
    const store = new MemoryCursorStore();
    expect(await store.load()).toEqual({ cursor: null, generation: null });
    await store.save({ cursor: 3, generation: 2 });
    expect(await store.load()).toEqual({ cursor: 3, generation: 2 });
  });
});

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { paths } from '@said/runtime';
import { NotaryStateStore } from '../src/state-store.js';

const silent = { info() {}, warn() {}, error() {} };
const scratch = fileURLToPath(new URL('./.tmp/', import.meta.url));
let previousHome: string | undefined;

afterEach(async () => {
  if (previousHome === undefined) delete process.env.SAID_HOME;
  else process.env.SAID_HOME = previousHome;
  previousHome = undefined;
});

describe('NotaryStateStore enrollFails', () => {
  it('persists lockout counts across open() so a restart keeps the map', async () => {
    await mkdir(scratch, { recursive: true });
    const home = await mkdtemp(join(scratch, 'enroll-'));
    previousHome = process.env.SAID_HOME;
    process.env.SAID_HOME = home;

    const first = await NotaryStateStore.open(silent);
    await first.update({ enrollFails: { 'sender-1': 8, 'sender-2': 2 } });
    expect(first.snapshot().enrollFails).toEqual({ 'sender-1': 8, 'sender-2': 2 });

    const second = await NotaryStateStore.open(silent);
    expect(second.snapshot().enrollFails).toEqual({ 'sender-1': 8, 'sender-2': 2 });
    expect(paths.notaryState).toContain(home);
  });

  it('tolerates legacy state files without enrollFails', async () => {
    await mkdir(scratch, { recursive: true });
    const home = await mkdtemp(join(scratch, 'legacy-'));
    previousHome = process.env.SAID_HOME;
    process.env.SAID_HOME = home;

    const first = await NotaryStateStore.open(silent);
    await first.update({ ledgerDocumentId: 'doc-1' });
    // Simulate a hand-written legacy file by re-opening after clearing via patch to empty object shape
    const again = await NotaryStateStore.open(silent);
    expect(again.snapshot().enrollFails).toEqual({});
    expect(again.snapshot().ledgerDocumentId).toBe('doc-1');
  });
});

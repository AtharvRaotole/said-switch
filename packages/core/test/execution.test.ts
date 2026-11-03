import { describe, expect, it } from 'vitest';
import { applyExecutionReceipt, recordHandoff } from '../src/index';
import type { ExecutionReceipt, Ledger } from '../src/index';
import { lockedRoom, ROOM, T0 } from './helpers';

function receipt(over: Partial<ExecutionReceipt> = {}): ExecutionReceipt {
  return {
    type: 'said.receipt/v1',
    roomId: ROOM,
    agreementId: 'AGR-001',
    jobId: 'JOB-AGR-001-1',
    status: 'RUNNING',
    worker: 'claude',
    baseCommit: '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    resultCommit: null,
    changedPaths: [],
    checks: [],
    error: null,
    at: T0 + 60_000,
    keyId: 'builder-1',
    signature: 'unused-by-engine',
    ...over,
  };
}

function handedOff(): Ledger {
  return recordHandoff(lockedRoom().ledger, { agreementId: 'AGR-001', jobId: 'JOB-AGR-001-1', now: T0 + 30_000 });
}

describe('handoff and execution receipts', () => {
  it('recordHandoff sets READY and audits handoff_sent', () => {
    const before = lockedRoom().ledger;
    const after = recordHandoff(before, { agreementId: 'AGR-001', jobId: 'JOB-AGR-001-1', now: T0 + 30_000 });
    expect(after.agreements[0]!.execution).toMatchObject({ jobId: 'JOB-AGR-001-1', status: 'READY', changedPaths: [], checks: [] });
    expect(after.audit.at(-1)).toMatchObject({ kind: 'handoff_sent', ref: 'AGR-001' });
    expect(after.revision).toBe(before.revision + 1);
    expect(before.agreements[0]!.execution).toBeNull();
    expect(() => recordHandoff(before, { agreementId: 'AGR-404', jobId: 'JOB-AGR-404-1', now: T0 })).toThrow(/unknown agreement/);
    expect(() => recordHandoff(before, { agreementId: 'AGR-001', jobId: 'JOB-AGR-002-1', now: T0 })).toThrow(/does not belong/);
  });

  it('execution receipt updates RUNNING → COMPLETED with a summary reply', () => {
    const running = applyExecutionReceipt(handedOff(), receipt(), T0 + 61_000);
    expect(running.ledger!.agreements[0]!.execution).toMatchObject({ status: 'RUNNING', worker: 'claude', startedAt: T0 + 60_000, finishedAt: null });
    expect(running.effects).toEqual([{ kind: 'reply', body: '**AGR-001** · `JOB-AGR-001-1` is running (worker: claude, base `1111111`).', threadId: null }]);

    const done = applyExecutionReceipt(
      running.ledger!,
      receipt({
        status: 'COMPLETED',
        resultCommit: '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        changedPaths: ['src/App.tsx', 'src/index.css'],
        checks: [
          { name: 'typecheck', ok: true, durationMs: 900, detail: 'ok' },
          { name: 'build', ok: true, durationMs: 2100, detail: 'ok' },
        ],
        at: T0 + 120_000,
      }),
      T0 + 121_000,
    );
    const exec = done.ledger!.agreements[0]!.execution!;
    expect(exec).toMatchObject({
      status: 'COMPLETED',
      resultCommit: '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      changedPaths: ['src/App.tsx', 'src/index.css'],
      startedAt: T0 + 60_000,
      finishedAt: T0 + 120_000,
    });
    expect(done.ledger!.audit.at(-1)).toMatchObject({ kind: 'execution_update', ref: 'AGR-001' });
    expect(done.ledger!.revision).toBe(running.ledger!.revision + 1);
    expect(done.ledger!.updatedAt).toBe(T0 + 121_000);
    expect((done.effects[0] as { body: string }).body).toBe(
      '**AGR-001** · `JOB-AGR-001-1` completed, commit `2222222` · 2 files: src/App.tsx, src/index.css · checks: typecheck passed, build passed.',
    );
  });

  it('a FAILED receipt records the error', () => {
    const failed = applyExecutionReceipt(handedOff(), receipt({ status: 'FAILED', error: 'build failed: TS2304' }), T0 + 61_000);
    expect(failed.ledger!.agreements[0]!.execution).toMatchObject({ status: 'FAILED', error: 'build failed: TS2304', finishedAt: T0 + 60_000 });
    expect((failed.effects[0] as { body: string }).body).toContain('failed: build failed: TS2304');
  });

  it('ignores receipts for unknown agreements, mismatched jobs, other rooms, repeats and finished jobs', () => {
    const ledger = handedOff();
    const none = { ledger: null, effects: [] };
    expect(applyExecutionReceipt(ledger, receipt({ agreementId: 'AGR-009' }), T0)).toEqual(none);
    expect(applyExecutionReceipt(ledger, receipt({ jobId: 'JOB-AGR-001-2' }), T0)).toEqual(none);
    expect(applyExecutionReceipt(ledger, receipt({ roomId: '!other:switch.local' }), T0)).toEqual(none);
    expect(applyExecutionReceipt(lockedRoom().ledger, receipt(), T0)).toEqual(none);
    const running = applyExecutionReceipt(ledger, receipt(), T0).ledger!;
    expect(applyExecutionReceipt(running, receipt(), T0)).toEqual(none);
    const done = applyExecutionReceipt(running, receipt({ status: 'COMPLETED' }), T0).ledger!;
    expect(applyExecutionReceipt(done, receipt({ status: 'FAILED', error: 'late' }), T0)).toEqual(none);
    expect(() => recordHandoff(done, { agreementId: 'AGR-001', jobId: 'JOB-AGR-001-2', now: T0 })).toThrow(/COMPLETED/);
  });
});

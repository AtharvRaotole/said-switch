import { describe, expect, it } from 'vitest';
import {
  GENESIS_PREV_HASH,
  appendAudit,
  emptyLedger,
  verifyAuditChain,
} from '../src/index';
import { ROOM, T0 } from './helpers';

describe('verifyAuditChain', () => {
  it('accepts an empty audit list', () => {
    const ledger = emptyLedger({ deploymentId: 'd', roomId: ROOM, mode: 'business', parties: [], now: T0 });
    expect(verifyAuditChain(ledger)).toEqual({ ok: true });
  });

  it('detects a seq gap', () => {
    const ledger = emptyLedger({ deploymentId: 'd', roomId: ROOM, mode: 'business', parties: [], now: T0 });
    appendAudit(ledger, { kind: 'enrolled', at: T0, actor: 'A', ref: null, summary: 'one' });
    ledger.audit[0]!.seq = 3;
    expect(verifyAuditChain(ledger)).toMatchObject({ ok: false, reason: expect.stringMatching(/seq gap/i) });
  });

  it('detects a prevHash break', () => {
    const ledger = emptyLedger({ deploymentId: 'd', roomId: ROOM, mode: 'business', parties: [], now: T0 });
    appendAudit(ledger, { kind: 'enrolled', at: T0, actor: 'A', ref: null, summary: 'one' });
    appendAudit(ledger, { kind: 'enrolled', at: T0 + 1, actor: 'B', ref: null, summary: 'two' });
    ledger.audit[1]!.prevHash = GENESIS_PREV_HASH;
    expect(verifyAuditChain(ledger)).toMatchObject({ ok: false, reason: expect.stringMatching(/chain break|prevHash/i) });
  });
});

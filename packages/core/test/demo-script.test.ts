import { describe, expect, it } from 'vitest';
import type { Party } from '../src/index';
import { DANA, RIYA } from './helpers';
import { playDemoScript, ScriptRoom } from './demo-script-room';

const NATIVE = { riya: RIYA, dana: DANA };
const TELEGRAM = {
  riya: { role: 'developer', label: 'Riya', senderId: '@switch-telegram-9f3a1c2e-riya:localhost' } satisfies Party,
  dana: { role: 'client', label: 'Dana', senderId: '@switch-telegram-9f3a1c2e-dana:localhost' } satisfies Party,
};

function handoff(steps: { result: { effects: Array<{ kind: string }> } }[], index: number): boolean {
  return steps[index]!.result.effects.some((effect) => effect.kind === 'handoff');
}

function expectScript(parties: { riya: Party; dana: Party }): void {
  const { room, steps } = playDemoScript(parties);
  expect(steps[0]!.replies[0]).toMatch(/DRF-001/);
  expect(steps[0]!.replies[0]).toMatch(/needs terms/);
  expect(steps[0]!.replies[0]).toMatch(/@builder/);
  expect(handoff(steps, 0)).toBe(false);
  expect(room.ledger.drafts[0]!.request.senderId).toBe(parties.dana.senderId);

  expect(steps[1]!.replies[0]).toMatch(/Accept DRF-001 v1/);
  expect(steps[1]!.replies[0]).toMatch(/\+2 days, \+\$400/);
  expect(handoff(steps, 1)).toBe(false);

  expect(steps[2]!.replies[0]).toMatch(/Waiting on \*\*Dana\*\*/);
  expect(handoff(steps, 2)).toBe(false);

  expect(steps[3]!.replies.join('\n')).toMatch(/not agreed/);
  expect(steps[3]!.replies.join('\n')).toContain('“+2 days, +$400”');
  expect(handoff(steps, 3)).toBe(false);

  expect(steps[4]!.replies[0]).toMatch(/AGR-001 locked/);
  expect(steps[4]!.replies[0]).toMatch(/Handing off to @builder/);
  expect(handoff(steps, 4)).toBe(true);
  expect(room.ledger.agreements[0]).toMatchObject({ id: 'AGR-001', draftId: 'DRF-001', version: 1, terms: '+2 days, +$400' });
  expect(room.ledger.agreements[0]!.approvals.developer!.senderId).toBe(parties.riya.senderId);
  expect(room.ledger.agreements[0]!.approvals.client!.senderId).toBe(parties.dana.senderId);

  expect(room.ledger.drafts.find((draft) => draft.id === 'DRF-002')).toMatchObject({
    status: 'PENDING',
    version: 1,
    scope: 'add a contrast-safe theme toggle',
    terms: '+1 day, +$150',
  });
  expect(steps[5]!.replies[0]).toMatch(/DRF-002/);
  expect(handoff(steps, 5)).toBe(false);

  expect(steps[6]!.replies[0]).toMatch(/Waiting on \*\*Dana\*\*/);
  expect(handoff(steps, 6)).toBe(false);
  expect(room.ledger.drafts.find((draft) => draft.id === 'DRF-002')!.approvals.developer!.senderId).toBe(parties.riya.senderId);
  expect(room.ledger.drafts.find((draft) => draft.id === 'DRF-002')!.approvals.client).toBeUndefined();
  expect(room.ledger.agreements).toHaveLength(1);
  expect(room.ledger.drafts.find((draft) => draft.id === 'DRF-001')).toMatchObject({ status: 'LOCKED', agreementId: 'AGR-001' });
}

describe('seven-step demo script', () => {
  it('native participant ids', () => {
    expectScript(NATIVE);
  });

  it('Telegram bridge participant ids', () => {
    expectScript(TELEGRAM);
  });

  it('rejects malformed, duplicate, spoofed, and out-of-order commands', () => {
    const room = new ScriptRoom([RIYA, DANA]);
    const mallory: Party = { role: 'client', label: 'Mallory', senderId: '@switch-telegram-mallory:localhost' };

    expect(room.say(DANA, '').ledger).toBeNull();
    expect(room.say(DANA, '   \n\t').ledger).toBeNull();
    expect(room.say(DANA, 'Accept DRF-001 v1').replies[0]).toMatch(/no \*\*DRF-001\*\*/);
    expect(room.say(mallory, 'Terms DRF-001: +2 days, +$400').replies[0]).toMatch(/Only \*\*Riya\*\*/);

    room.say(DANA, "@builder Also add dark mode while you're in there");
    expect(room.say(mallory, 'Accept DRF-001 v1').replies[0]).toMatch(/Only \*\*Riya\*\*/);
    room.say(RIYA, 'Terms DRF-001: +2 days, +$400');
    room.say(RIYA, 'Accept DRF-001 v1');
    expect(room.say(RIYA, 'Accept DRF-001 v1').replies[0]).toMatch(/already on record/);
    expect(
      room.say(DANA, 'Accept DRF-001 v1', {
        senderId: '@switch-telegram-mallory:localhost',
        senderName: 'Dana',
      }).replies[0],
    ).toMatch(/Only \*\*Riya\*\*/);

    room.say(DANA, 'Accept DRF-001 v1');
    expect(room.say(DANA, 'Accept DRF-001 v1').replies[0]).toMatch(/already locked/);
    expect(room.say(RIYA, 'Terms DRF-001: free').replies[0]).toMatch(/locked/);

    const unicode = room.say(DANA, 'Propose: add a 日本語テーマ | Terms: +1 day, +$150');
    expect(unicode.replies[0]).toMatch(/DRF-002/);
    expect(room.ledger.drafts.find((draft) => draft.id === 'DRF-002')!.scope).toBe('add a 日本語テーマ');

    const again = room.say(RIYA, 'Propose: add a contrast-safe theme toggle | Terms: +1 day, +$150');
    expect(again.replies[0]).toMatch(/DRF-003/);
    expect(room.ledger.drafts.filter((draft) => draft.status === 'PENDING')).toHaveLength(2);
  });
});

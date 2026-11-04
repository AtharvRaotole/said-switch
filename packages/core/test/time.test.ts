import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_TIME_ZONE,
  formatClock,
  formatTime,
  formatTimeUtc,
  getDisplayTimeZone,
  setDisplayTimeZone,
} from '../src/index';

const T0 = Date.UTC(2026, 10, 4, 3, 16, 6); // Nov 3, 10:16:06 PM ET

afterEach(() => {
  setDisplayTimeZone(DEFAULT_DISPLAY_TIME_ZONE);
});

describe('display time formatting', () => {
  it('defaults to America/New_York and formats human ET times', () => {
    expect(getDisplayTimeZone()).toBe('America/New_York');
    expect(formatTime(T0)).toBe('Nov 3, 10:16:06 PM ET');
    expect(formatClock(T0)).toBe('10:16:06 PM');
  });

  it('keeps exact UTC ISO for signed surfaces', () => {
    expect(formatTimeUtc(T0)).toBe('2026-11-04T03:16:06.000Z');
  });

  it('honors SAID-style zone overrides and falls back on garbage', () => {
    expect(setDisplayTimeZone('UTC')).toBe('UTC');
    expect(formatTime(T0)).toMatch(/Nov 4, 3:16:06 AM/);
    expect(formatTime(T0)).toMatch(/UTC|GMT/);
    expect(setDisplayTimeZone('not-a-real/zone')).toBe(DEFAULT_DISPLAY_TIME_ZONE);
    expect(getDisplayTimeZone()).toBe('America/New_York');
    expect(setDisplayTimeZone('   ')).toBe(DEFAULT_DISPLAY_TIME_ZONE);
    expect(setDisplayTimeZone(null)).toBe(DEFAULT_DISPLAY_TIME_ZONE);
    expect(setDisplayTimeZone(undefined)).toBe(DEFAULT_DISPLAY_TIME_ZONE);
  });

  it('treats US/Eastern like New York for the ET label', () => {
    setDisplayTimeZone('US/Eastern');
    expect(formatTime(T0)).toBe('Nov 3, 10:16:06 PM ET');
  });

  it('uses the short zone name for non-Eastern zones', () => {
    setDisplayTimeZone('America/Los_Angeles');
    expect(formatTime(T0)).toMatch(/Nov 3, 7:16:06 PM P[DS]T/);
  });
});

import { lockedReply } from '../src/replies';
import { emptyLedger } from '../src/ledger';
import type { Agreement } from '../src/types';

describe('lockedReply time stamps', () => {
  it('renders local clocks with ET and still works with no approvals', () => {
    setDisplayTimeZone('America/New_York');
    const ledger = emptyLedger({
      deploymentId: 'dep',
      roomId: '11111111-1111-4111-8111-111111111111',
      mode: 'business',
      parties: [
        { role: 'developer', label: 'Riya', senderId: 'riya' },
        { role: 'client', label: 'Dana', senderId: 'dana' },
      ],
      now: T0,
    });
    const base = {
      id: 'AGR-001',
      draftId: 'DRF-001',
      version: 1,
      scope: 'Add dark mode',
      terms: '+2 days, +$400',
      termsHash: 'ab'.repeat(32),
      lockedAt: T0,
      execution: null,
    };
    const withApprovals = {
      ...base,
      approvals: {
        developer: {
          role: 'developer' as const,
          senderId: 'riya',
          senderName: 'Riya',
          messageId: 'm1',
          text: 'Accept DRF-001 v1',
          timestamp: T0,
          version: 1,
          termsHash: base.termsHash,
          draftId: 'DRF-001',
        },
        client: {
          role: 'client' as const,
          senderId: 'dana',
          senderName: 'Dana',
          messageId: 'm2',
          text: 'Accept DRF-001 v1',
          timestamp: T0 + 5000,
          version: 1,
          termsHash: base.termsHash,
          draftId: 'DRF-001',
        },
      },
    } as Agreement;
    expect(lockedReply(ledger, withApprovals, 'builder')).toContain(
      'Riya 10:16:06 PM · Dana 10:16:11 PM ET. Handing off to @builder.',
    );
    const bare = { ...base, approvals: {} } as Agreement;
    expect(lockedReply(ledger, bare, null)).toBe(
      '🔒 **AGR-001 locked.** Both accepted **DRF-001 v1** (hash `ababababab`). These terms are final; changes need a new draft.',
    );
  });
});

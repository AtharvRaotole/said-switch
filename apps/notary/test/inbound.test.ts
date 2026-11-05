import { describe, expect, it } from 'vitest';
import type { SwitchMessageEvent } from '@said/switch-client';
import { toInbound } from '../src/inbound.js';

const SAID_ID = 'said-uuid';
const BUILDER_ID = 'builder-uuid';
const IDS = new Set([SAID_ID, BUILDER_ID]);
const NAMES = new Set(['said', 'builder']);

function event(over: Partial<SwitchMessageEvent>): SwitchMessageEvent {
  return {
    kind: 'message',
    sequence: 1,
    roomId: 'room',
    threadId: null,
    messageId: 'm1',
    sender: SAID_ID,
    senderName: 'said',
    body: 'hello',
    timestamp: 1,
    addressed: false,
    attachments: [],
    raw: {},
    ...over,
  };
}

describe('toInbound agent identity', () => {
  it('treats the registration UUID and the Switch transport id as agents', () => {
    expect(toInbound(event({}), IDS, NAMES).fromAgent).toBe(true);
    expect(
      toInbound(
        event({ sender: '@switch-agent-a1b2c3d4:localhost', senderName: 'said', body: 'Logged as DRF-001. @builder only starts when both accept.' }),
        IDS,
        NAMES,
      ).fromAgent,
    ).toBe(true);
    expect(
      toInbound(event({ sender: '@switch-mattermost-bridge-builder:localhost', senderName: 'builder' }), IDS, NAMES).fromAgent,
    ).toBe(true);
  });

  it('does not drop a Telegram person whose name only looks like Said', () => {
    const dana = toInbound(
      event({
        sender: '@switch-telegram-9f3a1c2e-Said:localhost',
        senderName: 'Said',
        body: 'Accept DRF-001 v1',
      }),
      IDS,
      NAMES,
    );
    expect(dana.fromAgent).toBe(false);
    expect(dana.senderId).toBe('@switch-telegram-9f3a1c2e-Said:localhost');

    const exact = toInbound(
      event({
        sender: '@switch-telegram-9f3a1c2e-said:localhost',
        senderName: 'said',
        body: '@builder also add dark mode',
      }),
      IDS,
      NAMES,
    );
    expect(exact.fromAgent).toBe(false);
    expect(exact.mentions).toContain('builder');
  });
});

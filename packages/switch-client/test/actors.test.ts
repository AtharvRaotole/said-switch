import { describe, expect, it } from 'vitest';
import { actorMatches, isHumanPlatformSender, isSwitchAgentTransportId, senderIsAgent, senderIsKnownAgent } from '../src/actors.js';

describe('actorMatches', () => {
  it('matches identical ids', () => {
    expect(actorMatches({ senderId: 'uuid-1', id: 'uuid-1' })).toBe(true);
  });

  it('matches bridged human by name when ids differ', () => {
    expect(
      actorMatches({
        senderId: '@switch-mattermost-bridge-user:localhost',
        senderName: 'user',
        id: 'aaf8d648-c862-4f9e-9d06-36d53fc110af',
        name: 'user',
      }),
    ).toBe(true);
  });

  it('does not match on name alone when names differ', () => {
    expect(
      actorMatches({
        senderId: '@switch-mattermost-bridge-user:localhost',
        senderName: 'user',
        id: 'other',
        name: 'dana-client',
      }),
    ).toBe(false);
  });

  it('is case-insensitive on names', () => {
    expect(
      actorMatches({
        senderId: '@x',
        senderName: 'Builder',
        id: 'y',
        name: 'builder',
      }),
    ).toBe(true);
  });
});

const SAID = '11111111-1111-4111-8111-111111111111';

describe('senderIsAgent', () => {
  it('accepts the registration UUID even when the display name is wrong', () => {
    expect(
      senderIsAgent({ senderId: SAID, senderName: 'mallory', agentId: SAID, agentName: 'said' }),
    ).toBe(true);
  });

  it('accepts the current Switch agent transport id only with the exact agent identifier', () => {
    const senderId = '@switch-agent-a1b2c3d4:localhost';
    expect(isSwitchAgentTransportId(senderId)).toBe(true);
    expect(senderIsAgent({ senderId, senderName: 'said', agentId: SAID, agentName: 'said' })).toBe(true);
    expect(senderIsAgent({ senderId, senderName: 'Said', agentId: SAID, agentName: 'said' })).toBe(false);
    expect(senderIsAgent({ senderId, senderName: 'builder', agentId: SAID, agentName: 'said' })).toBe(false);
    expect(isSwitchAgentTransportId('@switch-agent-A1B2C3D4:localhost')).toBe(false);
    expect(isSwitchAgentTransportId('@switch-agent-abcd:localhost')).toBe(false);
  });

  it('rejects a Telegram human even when the username is the agent name', () => {
    const senderId = '@switch-telegram-bridge01-said:localhost';
    expect(isHumanPlatformSender(senderId)).toBe(true);
    expect(senderIsAgent({ senderId, senderName: 'said', agentId: SAID, agentName: 'said' })).toBe(false);
    expect(
      senderIsAgent({
        senderId,
        senderName: 'said',
        agentId: SAID,
        agentName: 'said',
        allowNameFallback: true,
        allowLegacyExactName: true,
      }),
    ).toBe(false);
  });

  it('rejects Slack, Discord, Teams, member, and user ids the same way', () => {
    for (const senderId of [
      '@switch-slack-b-dana:localhost',
      '@switch-discord-b-dana:localhost',
      '@switch-teams-b-dana:localhost',
      '@switch-user-dana02:localhost',
      '@switch-member-aabbccdd:localhost',
      '@switch-member:localhost',
    ]) {
      expect(isHumanPlatformSender(senderId)).toBe(true);
      expect(
        senderIsAgent({ senderId, senderName: 'said', agentId: SAID, agentName: 'said', allowNameFallback: true }),
      ).toBe(false);
    }
  });

  it('keeps the Mattermost 0.31 name fallback opt-in and case-insensitive, and exact legacy names separate', () => {
    const senderId = '@switch-mattermost-bridge-said:localhost';
    expect(isHumanPlatformSender(senderId)).toBe(false);
    const base = { senderId, senderName: 'Said', agentId: SAID, agentName: 'said' };
    expect(senderIsAgent(base)).toBe(false);
    expect(senderIsAgent({ ...base, allowNameFallback: true })).toBe(true);
    expect(senderIsAgent({ ...base, senderName: 'said', allowLegacyExactName: true })).toBe(true);
    expect(senderIsAgent({ ...base, allowLegacyExactName: true })).toBe(false);
  });
});

describe('senderIsKnownAgent', () => {
  const ids = new Set([SAID]);
  const names = new Set(['said', 'builder']);

  it('recognizes transport ids and legacy actor ids by the exact identifier', () => {
    expect(
      senderIsKnownAgent({
        senderId: '@switch-agent-a1b2c3d4:localhost',
        senderName: 'said',
        agentIds: ids,
        agentNames: names,
      }),
    ).toBe(true);
    expect(
      senderIsKnownAgent({
        senderId: '@switch-mattermost-bridge-said:localhost',
        senderName: 'builder',
        agentIds: ids,
        agentNames: names,
      }),
    ).toBe(true);
  });

  it('does not treat a case-variant Telegram user as an agent', () => {
    expect(
      senderIsKnownAgent({
        senderId: '@switch-telegram-bridge01-Said:localhost',
        senderName: 'Said',
        agentIds: ids,
        agentNames: names,
      }),
    ).toBe(false);
    expect(
      senderIsKnownAgent({
        senderId: '@switch-telegram-bridge01-said:localhost',
        senderName: 'said',
        agentIds: ids,
        agentNames: names,
      }),
    ).toBe(false);
  });
});

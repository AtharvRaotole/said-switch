import { describe, expect, it } from 'vitest';
import { actorMatches } from '../src/actors.js';

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

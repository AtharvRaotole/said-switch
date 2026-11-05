import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '@said/runtime';
import { assertDemoClient, demoClientInstalled } from '../lib/demo-client.js';
import {
  inviteHint,
  resolvePlatform,
  setupSteps,
  shouldProbeMattermost,
} from '../lib/platform.js';

const telegramRoom = { bridge_id: 'br-tg', bridge_display_name: 'Zoe Telegram' };
const telegramContext = {
  messaging_apps: {
    connected: [
      { id: 'br-tg', platform: 'telegram', name: 'Zoe Telegram', your_account_linked: true, status: 'running' },
    ],
  },
};

describe('chat platform', () => {
  it('does not probe Mattermost for a Telegram room, even if a Mattermost URL is set', () => {
    const resolved = resolvePlatform({ envValue: '', room: telegramRoom, context: telegramContext, roomWasRead: true });
    expect(resolved).toMatchObject({ platform: 'telegram', source: 'room', accountLinked: true, appConnected: true });
    expect(shouldProbeMattermost(resolved.platform, true)).toBe(false);
    expect(shouldProbeMattermost('telegram', false)).toBe(false);
  });

  it('trusts SAID_PLATFORM=telegram over a blank room and does not mention Mattermost as a required step', () => {
    const resolved = resolvePlatform({ envValue: 'telegram' });
    expect(resolved.platform).toBe('telegram');
    expect(shouldProbeMattermost(resolved.platform, false)).toBe(false);
    const steps = setupSteps('telegram').join('\n');
    expect(steps).toMatch(/Group Privacy/);
    expect(steps).toMatch(/BotFather/);
    expect(steps).toMatch(/Telegram group/);
    expect(steps).not.toMatch(/Mattermost: developer/);
    expect(inviteHint('telegram', 'said')).toBe('In the Telegram group, type: !invite-agent @said');
  });

  it('probes Mattermost only when that is the platform, or when the URL was set and the platform is unknown', () => {
    expect(shouldProbeMattermost('mattermost', false)).toBe(true);
    expect(shouldProbeMattermost(null, true)).toBe(true);
    expect(shouldProbeMattermost(null, false)).toBe(false);
    expect(shouldProbeMattermost('slack', true)).toBe(false);
    expect(shouldProbeMattermost('none', true)).toBe(false);
    const steps = setupSteps('mattermost').join('\n');
    expect(steps).toMatch(/Mattermost/);
    expect(steps).toMatch(/docs\/SETUP_LIVE.md/);
  });

  it('reads an unbridged room as none and leaves a blank env alone', () => {
    expect(resolvePlatform({ envValue: '', room: { bridge_id: null }, roomWasRead: true }).platform).toBe('none');
    const unset = resolvePlatform({ envValue: '  ' });
    expect(unset.platform).toBeNull();
    expect(shouldProbeMattermost(unset.platform, false)).toBe(false);
    const steps = setupSteps(null).join('\n');
    expect(steps).toMatch(/will not warn that Mattermost is down/);
    expect(steps).toMatch(/SAID_PLATFORM=telegram/);
    expect(steps).not.toMatch(/2\. Mattermost: developer/);
  });

  it('warns when SAID_PLATFORM disagrees with the room bridge', () => {
    const resolved = resolvePlatform({
      envValue: 'mattermost',
      room: telegramRoom,
      context: telegramContext,
      roomWasRead: true,
    });
    expect(resolved.platform).toBe('mattermost');
    expect(resolved.conflict).toMatch(/room bridge is telegram/);
    expect(resolved.invalidEnv).toBeNull();
    expect(resolvePlatform({ envValue: 'Telegram Room!' }).invalidEnv).toBe('telegram room!');
  });

  it('covers Slack, Discord, and Teams without a Mattermost step', () => {
    for (const platform of ['slack', 'discord', 'teams'] as const) {
      const steps = setupSteps(platform).join('\n');
      expect(steps).toMatch(/Mattermost is not part of this setup/);
      expect(inviteHint(platform, 'builder')).toMatch(/!invite-agent @builder/);
    }
  });
});

describe('coverage prerequisites', () => {
  it('installs the demo client before npm run test:coverage', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.pretest).toBe('npm run ensure:demo-client');
    expect(pkg.scripts['pretest:coverage']).toBe('npm run ensure:demo-client');
  });

  it('fails instead of skipping when the demo client is absent', () => {
    expect(demoClientInstalled(repoRoot)).toBe(true);
    expect(() => assertDemoClient(join(repoRoot, 'scripts'))).toThrow(/demo\/client-site\/node_modules is missing/);
  });
});

import { describe, expect, it } from 'vitest';
import { PRIVATE_TELEGRAM_ROOM_ID } from '@said/witness/view';
import { DemoGuardError } from '@said/witness';
import { demoLaunchFrom, demoServicesFrom } from '../lib/demo-guard.js';

const base = {
  SWITCH_URL: 'http://127.0.0.1:8100',
  SAID_HOME: '/tmp/work/.said-demo',
  SAID_WORKER: 'scripted',
  SWITCH_REGISTRATION_KEY: 'demo-registration-key',
};

describe('demoLaunchFrom', () => {
  it('accepts the dedicated demo env', () => {
    expect(demoLaunchFrom(base)).toMatchObject({ switchUrl: 'http://127.0.0.1:8100', worker: 'scripted' });
  });

  it('refuses the current stack, a model worker, and the private room', () => {
    expect(() => demoLaunchFrom({ ...base, SWITCH_URL: 'http://127.0.0.1:8000' })).toThrow(DemoGuardError);
    expect(() => demoLaunchFrom({ ...base, SAID_HOME: '/tmp/.said-live' })).toThrow(DemoGuardError);
    expect(() => demoLaunchFrom({ ...base, SAID_WORKER: 'codex' })).toThrow(/scripted/);
    expect(() => demoLaunchFrom({ ...base, SAID_ROOM_ID: PRIVATE_TELEGRAM_ROOM_ID })).toThrow(/private room/);
    expect(() => demoLaunchFrom({ ...base, SWITCH_REGISTRATION_KEY: '' })).toThrow(/SWITCH_REGISTRATION_KEY/);
  });

  it('requires a demo room before the notary starts, and does not need the registration key', () => {
    const demo = '22222222-2222-4222-8222-222222222222';
    expect(demoServicesFrom({ ...base, SAID_DEMO_ROOM_ID: demo, SWITCH_REGISTRATION_KEY: '' }).roomId).toBe(demo);
    expect(() => demoServicesFrom(base)).toThrow(/not set/);
  });
});

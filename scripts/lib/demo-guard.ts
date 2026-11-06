import { assertDemoHome, assertDemoRoomId, assertDemoSwitchUrl, DemoGuardError } from '@said/witness';

export interface DemoLaunch {
  switchUrl: string;
  home: string;
  worker: 'scripted';
  roomId: string;
  registrationKey: string;
}

export interface DemoServices {
  switchUrl: string;
  home: string;
  worker: 'scripted';
  roomId: string;
}

function common(env: NodeJS.ProcessEnv): Omit<DemoServices, 'roomId'> & { roomId: string } {
  const switchUrl = assertDemoSwitchUrl(env.SWITCH_URL?.trim() || '');
  const home = env.SAID_HOME?.trim() || '';
  assertDemoHome(home);
  if ((env.SAID_WORKER?.trim() || '') !== 'scripted') {
    throw new DemoGuardError('Demo worker must be scripted');
  }
  const roomId = env.SAID_DEMO_ROOM_ID?.trim() || env.SAID_ROOM_ID?.trim() || '';
  return { switchUrl, home, worker: 'scripted', roomId };
}

/** Room creation. Requires the demo registration key and does not read `.env`. */
export function demoLaunchFrom(env: NodeJS.ProcessEnv): DemoLaunch {
  const base = common(env);
  if (base.roomId) assertDemoRoomId(base.roomId);
  const registrationKey = env.SWITCH_REGISTRATION_KEY?.trim() || '';
  if (!registrationKey) throw new DemoGuardError('SWITCH_REGISTRATION_KEY is required for the demo Switch');
  return { ...base, registrationKey };
}

/** Notary and builder for the demo room. The room id is required. */
export function demoServicesFrom(env: NodeJS.ProcessEnv): DemoServices {
  const base = common(env);
  assertDemoRoomId(base.roomId);
  return base;
}

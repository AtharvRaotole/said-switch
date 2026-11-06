import { basename, resolve } from 'node:path';
import {
  DEMO_HOME_NAME,
  DEMO_MATTERMOST_URL,
  DEMO_NOTARY_URL,
  DEMO_SWITCH_URL,
  PRIVATE_TELEGRAM_ROOM_ID,
  RESERVED_PORTS,
} from './constants.js';

export {
  DEMO_BUILDER_PORT,
  DEMO_GATEWAY_PORT,
  DEMO_HOME_NAME,
  DEMO_MATTERMOST_PORT,
  DEMO_MATTERMOST_URL,
  DEMO_NOTARY_URL,
  DEMO_SWITCH_URL,
  PRIVATE_TELEGRAM_ROOM_ID,
  RESERVED_PORTS,
} from './constants.js';

const RESERVED = new Set<number>(RESERVED_PORTS);

export class DemoGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoGuardError';
  }
}

export function loopbackPort(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DemoGuardError(`${label} is not a URL`);
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) {
    throw new DemoGuardError(`${label} must be a loopback http URL with no query`);
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || RESERVED.has(port)) {
    throw new DemoGuardError(`${label} uses a reserved port`);
  }
  return url;
}

/** The only notary the gateway is allowed to read. */
export function assertDemoNotaryUrl(raw: string): string {
  const url = loopbackPort(raw, 'Demo notary');
  const path = url.pathname === '' ? '/' : url.pathname;
  if (url.port !== '8110' || path !== '/') {
    throw new DemoGuardError('Demo notary must be http://127.0.0.1:8110');
  }
  return DEMO_NOTARY_URL;
}

export function assertDemoMattermostUrl(raw: string): string {
  const url = loopbackPort(raw, 'Demo Mattermost');
  const path = url.pathname === '' ? '/' : url.pathname;
  if (url.port !== '8165' || path !== '/') throw new DemoGuardError('Demo Mattermost must be http://127.0.0.1:8165');
  return DEMO_MATTERMOST_URL;
}

export function assertDemoSwitchUrl(raw: string): string {
  const url = loopbackPort(raw, 'Demo Switch');
  const path = url.pathname === '' ? '/' : url.pathname;
  if (url.port !== '8100' || path !== '/') throw new DemoGuardError('Demo Switch must be http://127.0.0.1:8100');
  return DEMO_SWITCH_URL;
}

export function assertDemoHome(home: string): void {
  if (basename(resolve(home)) !== DEMO_HOME_NAME) {
    throw new DemoGuardError('Demo state must live in .said-demo');
  }
}

export function assertDemoRoomId(roomId: string): void {
  const id = roomId.trim();
  if (!id) throw new DemoGuardError('Demo room is not set');
  if (id === PRIVATE_TELEGRAM_ROOM_ID) throw new DemoGuardError('Refusing the private room');
}

/** Query strings cannot retarget the gateway. Any query is refused. */
export function queryIsForbidden(search: string): boolean {
  return search.length > 0;
}

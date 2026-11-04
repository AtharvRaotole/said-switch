import { createServer } from 'node:net';
import { ports as configuredPorts } from './env.js';

/** Resolve a free TCP port on 127.0.0.1 (OS-assigned). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('Could not allocate a free port'));
        return;
      }
      const { port } = addr;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

/** True when something is already listening on 127.0.0.1:port. */
export function isPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE');
    });
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(false));
    });
  });
}

/**
 * Prefer `preferred` when free; otherwise pick a free port.
 * Returns `{ port, replaced }` so callers can log overrides.
 */
export async function preferPort(preferred: number): Promise<{ port: number; replaced: boolean }> {
  if (!(await isPortBusy(preferred))) return { port: preferred, replaced: false };
  return { port: await freePort(), replaced: true };
}

export type SaidServicePorts = {
  console: number;
  notary: number;
  builder: number;
  mockSwitch: number;
  clientSite: number;
};

/**
 * Resolve the offline/demo port set. Busy defaults (e.g. live stack on 7410/7420)
 * are replaced with free ports and written into process.env so child services inherit them.
 */
export async function resolveServicePorts(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ports: SaidServicePorts; replaced: Partial<Record<keyof SaidServicePorts, { from: number; to: number }>> }> {
  const keys: Array<{ key: keyof SaidServicePorts; envName: string; preferred: number }> = [
    { key: 'console', envName: 'CONSOLE_PORT', preferred: configuredPorts.console },
    { key: 'notary', envName: 'NOTARY_PORT', preferred: configuredPorts.notary },
    { key: 'builder', envName: 'BUILDER_PORT', preferred: configuredPorts.builder },
    { key: 'mockSwitch', envName: 'MOCK_SWITCH_PORT', preferred: configuredPorts.mockSwitch },
    { key: 'clientSite', envName: 'CLIENT_SITE_PORT', preferred: configuredPorts.clientSite },
  ];
  const out: SaidServicePorts = {
    console: configuredPorts.console,
    notary: configuredPorts.notary,
    builder: configuredPorts.builder,
    mockSwitch: configuredPorts.mockSwitch,
    clientSite: configuredPorts.clientSite,
  };
  const replaced: Partial<Record<keyof SaidServicePorts, { from: number; to: number }>> = {};
  for (const { key, envName, preferred } of keys) {
    // If the caller already set an explicit free port in env for a one-off (e2e), honor it when free;
    // when busy, still auto-replace so demo:offline works beside a live stack.
    const { port, replaced: wasReplaced } = await preferPort(preferred);
    out[key] = port;
    env[envName] = String(port);
    if (wasReplaced) replaced[key] = { from: preferred, to: port };
  }
  return { ports: out, replaced };
}

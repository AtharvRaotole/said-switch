import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { freePort, isPortBusy, preferPort, resolveServicePorts } from '../src/ports';

async function listen(port: number): Promise<{ port: number; close: () => Promise<void> }> {
  const srv = createServer();
  await new Promise<void>((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve());
  });
  const addr = srv.address();
  if (!addr || typeof addr === 'string') throw new Error('no addr');
  return {
    port: addr.port,
    close: () =>
      new Promise((resolve, reject) => srv.close((err) => (err ? reject(err) : resolve()))),
  };
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe('ports helpers', () => {
  it('detects a busy port and preferPort replaces it', async () => {
    const held = await listen(0);
    closers.push(held.close);
    expect(await isPortBusy(held.port)).toBe(true);
    const { port, replaced } = await preferPort(held.port);
    expect(replaced).toBe(true);
    expect(port).not.toBe(held.port);
    expect(await isPortBusy(port)).toBe(false);
  });

  it('resolveServicePorts auto-replaces busy defaults without throwing', async () => {
    const a = await listen(0);
    const b = await listen(0);
    closers.push(a.close, b.close);
    const env: NodeJS.ProcessEnv = {
      NOTARY_PORT: String(a.port),
      BUILDER_PORT: String(b.port),
    };
    // Seed configuredPorts via env before resolve; resolveServicePorts reads preferred via ports getters
    // which call envPort on process.env - temporarily set.
    const prevN = process.env.NOTARY_PORT;
    const prevB = process.env.BUILDER_PORT;
    process.env.NOTARY_PORT = String(a.port);
    process.env.BUILDER_PORT = String(b.port);
    try {
      const { ports: resolved, replaced } = await resolveServicePorts(env);
      expect(replaced.notary).toBeTruthy();
      expect(replaced.builder).toBeTruthy();
      expect(resolved.notary).not.toBe(a.port);
      expect(resolved.builder).not.toBe(b.port);
      expect(env.NOTARY_PORT).toBe(String(resolved.notary));
      expect(env.BUILDER_PORT).toBe(String(resolved.builder));
    } finally {
      if (prevN === undefined) delete process.env.NOTARY_PORT;
      else process.env.NOTARY_PORT = prevN;
      if (prevB === undefined) delete process.env.BUILDER_PORT;
      else process.env.BUILDER_PORT = prevB;
    }
  });

  it('freePort returns a bindable port', async () => {
    const port = await freePort();
    const held = await listen(port);
    closers.push(held.close);
    expect(held.port).toBe(port);
  });
});

import { spawn, type ChildProcess } from 'node:child_process';
import { c, paintFor } from './output.js';
import { sleep } from './http.js';

export interface ServiceSpec {
  /** Short name used as the log prefix: notary, builder, console, site, … */
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  /** Print the child's output with a colored prefix. Default true. */
  logs?: boolean;
}

export interface Service {
  name: string;
  child: ChildProcess;
  /** Set once the process has exited (reason includes the exit code or signal). */
  exited: string | null;
  /** Last lines of output, for diagnostics when something fails. */
  tail(n?: number): string[];
  stop(): Promise<void>;
}

const TAIL_LINES = 80;

/**
 * Starts a child in its own process group (so `npm run dev` → sh → vite all die together)
 * and forwards its output line by line with a colored `[name]` prefix.
 */
export function startService(spec: ServiceSpec): Service {
  const paint = paintFor(spec.name);
  const prefix = paint(`[${spec.name.padEnd(7)}]`);
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const lines: string[] = [];
  const service: Service = {
    name: spec.name,
    child,
    exited: null,
    tail: (n = 20) => lines.slice(-n),
    stop: () => stopChild(service),
  };

  const forward = (stream: 'stdout' | 'stderr') => {
    let buffer = '';
    child[stream].on('data', (d: Buffer) => {
      buffer += d.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length > TAIL_LINES) lines.shift();
        if (spec.logs !== false) console.log(`${prefix} ${line}`);
      }
    });
  };
  forward('stdout');
  forward('stderr');

  child.on('error', (err) => {
    service.exited = `failed to start: ${err.message}`;
  });
  child.on('exit', (code, signal) => {
    service.exited = signal ? `killed by ${signal}` : `exited with code ${code}`;
    if (spec.logs !== false && signal === null && code !== 0) {
      console.log(`${prefix} ${c.red(service.exited)}`);
    }
  });
  return service;
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // already gone
  }
}

export async function stopChild(service: Service, graceMs = 5000): Promise<void> {
  if (service.exited !== null || service.child.exitCode !== null) return;
  signalGroup(service.child, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (service.exited === null && Date.now() < deadline) await sleep(50);
  if (service.exited === null) {
    signalGroup(service.child, 'SIGKILL');
    const killDeadline = Date.now() + 2000;
    while (service.exited === null && Date.now() < killDeadline) await sleep(50);
  }
}

/** Stops every service (in parallel). Safe to call twice. */
export async function stopAll(services: Service[]): Promise<void> {
  await Promise.all(services.map((s) => s.stop()));
}

/** `aborted()` callback for `waitForUp`: reports why a service we are waiting on died. */
export function diedReason(service: Service): () => string | null {
  return () =>
    service.exited === null
      ? null
      : `${service.name} ${service.exited}. Last output:\n${service.tail(12).join('\n')}`;
}

/**
 * Start the demo notary and builder on 8110 and 8120.
 * Does not start the console, and does not use ports 8000, 7410, 7420, or 7400.
 */
import { spawn } from 'node:child_process';
import { DEMO_BUILDER_PORT, DEMO_NOTARY_URL, DemoGuardError } from '@said/witness';
import { demoServicesFrom } from './lib/demo-guard.js';

let roomId = '';
try {
  roomId = demoServicesFrom(process.env).roomId;
} catch (err) {
  process.stderr.write(`${err instanceof DemoGuardError || err instanceof Error ? err.message : 'Demo services refused'}\n`);
  process.exit(1);
}

const env = {
  ...process.env,
  SAID_HOME: process.env.SAID_HOME,
  SAID_ROOM_ID: roomId,
  SAID_WORKER: 'scripted',
  SAID_PLATFORM: 'none',
  NOTARY_PORT: '8110',
  BUILDER_PORT: String(DEMO_BUILDER_PORT),
  SWITCH_URL: 'http://127.0.0.1:8100',
};
if (DEMO_NOTARY_URL !== 'http://127.0.0.1:8110') {
  process.stderr.write('Demo notary port drifted.\n');
  process.exit(1);
}

const children = ['@said/notary', '@said/builder'].map((workspace) =>
  spawn('npm', ['-w', workspace, 'run', 'dev'], { env, stdio: 'inherit' }),
);

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise<void>((resolve) => {
  for (const child of children) child.on('exit', () => resolve());
});

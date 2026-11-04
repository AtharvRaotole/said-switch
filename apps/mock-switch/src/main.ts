import { createMockSwitch } from './server.js';

const port = Number(process.env.MOCK_SWITCH_PORT ?? 7500);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid MOCK_SWITCH_PORT: ${process.env.MOCK_SWITCH_PORT}`);
}

console.log('==============================================================');
console.log(' OFFLINE SIMULATION - mock Switch server, not the real product ');
console.log('==============================================================');

const server = await createMockSwitch({
  port,
  statePath: process.env.MOCK_SWITCH_STATE_PATH,
  log: true,
});

console.log(`Simulation chat: ${server.url}`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.close();
  process.exitCode = 0;
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

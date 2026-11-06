import { serve } from '@hono/node-server';
import { DEMO_GATEWAY_PORT, DEMO_NOTARY_URL, assertDemoNotaryUrl, assertDemoRoomId } from './ports.js';
import { readDemoState } from './read.js';
import { createWitnessApp } from './server.js';

const roomId = process.env.SAID_DEMO_ROOM_ID?.trim() ?? '';
if (roomId) assertDemoRoomId(roomId);
const notaryUrl = assertDemoNotaryUrl(process.env.SAID_DEMO_NOTARY_URL?.trim() || DEMO_NOTARY_URL);
const secret = process.env.SAID_DEMO_HTTP_SECRET?.trim() ?? '';
const port = DEMO_GATEWAY_PORT;
const allowOrigin = process.env.SAID_WITNESS_ORIGIN?.trim() || 'https://said-switch.pages.dev';

const app = createWitnessApp({
  demoRoomId: roomId,
  allowOrigin,
  readState: () => readDemoState({ notaryUrl, secret }),
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  process.stdout.write(`witness listening on 127.0.0.1:${info.port}\n`);
});

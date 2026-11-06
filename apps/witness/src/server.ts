import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { queryIsForbidden } from './ports.js';
import { emptyView, projectWitness, type WitnessView } from './view.js';

export interface WitnessAppOptions {
  /** Reads the demo notary. The request cannot choose this function. */
  readState: () => Promise<unknown>;
  demoRoomId: string;
  now?: () => string;
  /** Exact browser origin allowed to read the gateway. Empty means no browser origin. */
  allowOrigin?: string;
}

export function createWitnessApp(opts: WitnessAppOptions): Hono {
  const app = new Hono();
  const origin = opts.allowOrigin?.trim() ?? '';
  app.use(
    '*',
    cors({
      origin: (requestOrigin) => (origin && requestOrigin === origin ? origin : null),
      allowMethods: ['GET', 'OPTIONS'],
    }),
  );

  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const search = new URL(c.req.url, 'http://127.0.0.1').search;
    if (queryIsForbidden(search)) return c.json({ error: 'request refused' }, 400);
    return next();
  });

  app.get('/health', (c) => c.json({ status: 'ok', role: 'witness', writes: false }));

  app.get('/api/witness', async (c) => {
    if (queryIsForbidden(new URL(c.req.url, 'http://127.0.0.1').search)) {
      return c.json({ error: 'request refused' }, 400);
    }
    const now = opts.now ? opts.now() : new Date().toISOString();
    let view: WitnessView;
    try {
      if (!opts.demoRoomId.trim()) view = emptyView(null, 'Demo room is not configured');
      else view = projectWitness(await opts.readState(), { now, demoRoomId: opts.demoRoomId.trim() });
    } catch {
      view = emptyView(null, 'Demo source is not ready');
    }
    return c.json(view);
  });

  app.all('*', (c) => c.json({ error: 'not found' }, 404));
  return app;
}

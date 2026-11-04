import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { requestHasSharedSecret, sharedSecretFromEnv } from '@said/runtime';
import type { JobView, LogEvent } from './types.js';

export interface BuilderApi {
  listJobs(): JobView[];
  recentLogs(): LogEvent[];
  subscribe(listener: (event: 'job' | 'log', data: JobView | LogEvent) => void): () => void;
}

export function createBuilderServer(api: BuilderApi): Hono {
  const app = new Hono();
  const sharedSecret = sharedSecretFromEnv();
  app.use(
    '*',
    cors({
      origin: 'http://localhost:7400',
      allowMethods: ['GET', 'OPTIONS'],
    }),
  );
  app.use('*', async (c, next) => {
    if (!sharedSecret) return next();
    if (c.req.method === 'OPTIONS') return next();
    if (c.req.path === '/health') return next();
    if (requestHasSharedSecret(c.req.raw.headers, sharedSecret)) return next();
    return c.json({ error: 'unauthorized', reason: 'Missing or invalid shared secret' }, 401);
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/jobs', (c) => c.json(api.listJobs()));
  app.get('/api/jobs/stream', (c) =>
    streamSSE(c, async (stream) => {
      let closed = false;
      const pending: Promise<void>[] = [];
      const send = (event: 'job' | 'log', data: JobView | LogEvent) => {
        if (closed) return;
        pending.push(
          stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {
            closed = true;
          }),
        );
      };
      const unsubscribe = api.subscribe(send);
      const stop = () => {
        closed = true;
        unsubscribe();
      };
      stream.onAbort(stop);

      for (const job of api.listJobs()) send('job', job);
      for (const line of api.recentLogs()) send('log', line);
      await Promise.all(pending);

      await new Promise<void>((resolve) => {
        if (closed) {
          resolve();
          return;
        }
        stream.onAbort(() => resolve());
      });
    }),
  );

  return app;
}

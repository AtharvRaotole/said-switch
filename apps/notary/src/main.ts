import { createLogger, loadEnv } from '@said/runtime';
import { startNotary } from './service.js';

loadEnv();
const log = createLogger('notary');

startNotary({ log })
  .then((handle) => {
    let stopping = false;
    const shutdown = (signal: string) => {
      if (stopping) return;
      stopping = true;
      log.info(`Stopping (${signal}).`);
      void handle.stop().then(
        () => process.exit(0),
        (err: unknown) => {
          log.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        },
      );
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((err: unknown) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });

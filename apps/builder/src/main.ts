import { serve } from '@hono/node-server';
import { createLogger, loadConfig, loadEnv, loadKeyPair, loadPublicKeys, loadSecrets, paths, ports } from '@said/runtime';
import { SwitchConnection, SwitchOps } from '@said/switch-client';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createBuilder } from './controller.js';
import { recoverInFlightJobs } from './recover.js';
import { createBuilderServer } from './server.js';
import { BuilderStateStore } from './state.js';
import { plain } from './text.js';
import { resolveWorker } from './workers.js';

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

export async function main(): Promise<void> {
  loadEnv();
  const log = createLogger('builder');
  const config = await loadConfig();
  if (config.mode === 'offline') {
    log.info('Offline simulation. The builder is talking to mock Switch, not a live Switch server.');
  }
  if (!config.builder) throw new Error('Builder agent is not configured. Run npm run register.');
  const secrets = await loadSecrets();
  if (!secrets.builderApiKey) throw new Error('Builder API key is missing. Run npm run register.');
  const publicKeys = await loadPublicKeys();
  const builderKey = await loadKeyPair('builder');
  const worker = resolveWorker(config.worker);
  const opened = await BuilderStateStore.open(paths.builderState);
  if (opened.created) log.warn('Started a new builder state file.');
  await recoverInFlightJobs(opened.store, paths.clientRepo, log);

  const connectionId = opened.store.snapshot().connectionId;
  const ops = new SwitchOps(
    { baseUrl: config.switchUrl, agentId: config.builder.agentId, apiKey: secrets.builderApiKey },
    { connectionId },
  );

  const builder = createBuilder({
    config,
    notaryPublicKey: publicKeys.notary.publicKey,
    builderKey,
    worker,
    clientRepo: paths.clientRepo,
    jobsDir: paths.jobs,
    fixturePatch: paths.fixturePatch,
    state: opened.store,
    loadLedgerDocument: async (documentId) => {
      const docs = await ops.loadInternalDocuments([documentId]);
      const doc = docs.find((item) => item.id === documentId) ?? docs[0];
      if (!doc || typeof doc.content !== 'string' || doc.content.length === 0) {
        throw new Error(`Ledger document ${documentId} has no content.`);
      }
      return doc.content;
    },
    postMessage: async (body, threadId) => {
      await ops.postMessage(body, threadId);
    },
    sendTargetedToSaid: async (body, threadId) => {
      await ops.sendTargetedMessage(body, [config.said.name], threadId);
    },
    log,
  });

  const app = createBuilderServer(builder);
  const server = serve({ fetch: app.fetch, port: ports.builder, hostname: '127.0.0.1' }, (info) => {
    log.info(`Listening on http://127.0.0.1:${info.port}`);
  });

  let roomClaim: Promise<void> = Promise.resolve();
  const claimRoom = (): Promise<void> => {
    roomClaim = ops.connectToRoom(config.roomId).then(
      () => undefined,
      (err: unknown) => {
        log.error('Could not connect to the room.', err instanceof Error ? err.message : err);
        throw err;
      },
    );
    return roomClaim;
  };

  const connection = new SwitchConnection({
    creds: { baseUrl: config.switchUrl, agentId: config.builder.agentId, apiKey: secrets.builderApiKey },
    connectionId,
    rooms: [config.roomId],
    filter: 'addressed',
    scope: 'single',
    cursorStore: opened.store,
    client: { name: 'said-builder', version: '0.1.0' },
    logger: log,
    onState: (status) => {
      if (status.state === 'open') void claimRoom();
    },
    onEvent: async (event) => {
      if (event.kind !== 'message') return;
      try {
        await roomClaim;
      } catch {
        await claimRoom().catch(() => undefined);
      }
      await builder.ingest({
        messageId: event.messageId,
        roomId: event.roomId,
        senderId: event.sender,
        senderName: event.senderName,
        body: event.body,
        threadId: event.threadId,
        timestamp: event.timestamp,
      });
    },
  });

  const shutdown = async () => {
    server.close();
    await connection.stop();
  };
  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  await connection.start();
  log.info(`Builder online as ${config.builder.name} (${worker}).`);
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(plain(message));
    process.exitCode = 1;
  });
}

import type { ExecutionStatus, KeyPair, WorkerKind } from '@said/core';
import type { SaidConfig } from '@said/runtime';
import type { Logger } from '@said/runtime';
import { authorizeStart } from './authorize.js';
import { buildWorkerPrompt } from './prompt.js';
import { receiptText, signExecutionReceipt } from './receipt.js';
import { runJob } from './runner.js';
import { BuilderStateStore } from './state.js';
import { plain } from './text.js';
import { freshSteps, toJobView, type JobRecord, type JobStepKey, type JobView, type LogEvent, type LogStream } from './types.js';
import { execCommand, type ExecCommand } from './exec.js';
import { runConfiguredWorker, type WorkerContext } from './workers.js';

type Listener = (event: 'job' | 'log', data: JobView | LogEvent) => void;

export interface AddressedMessage {
  messageId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  threadId: string | null;
  timestamp: number;
}

export interface BuilderOptions {
  config: SaidConfig;
  notaryPublicKey: string;
  builderKey: KeyPair;
  worker: WorkerKind;
  clientRepo: string;
  jobsDir: string;
  fixturePatch: string;
  state: BuilderStateStore;
  now?: () => number;
  loadLedgerDocument: (documentId: string) => Promise<string>;
  postMessage: (body: string, threadId: string | null) => Promise<void>;
  sendTargetedToSaid: (body: string, threadId: string | null) => Promise<void>;
  execCommand?: ExecCommand;
  runWorker?: (ctx: WorkerContext) => Promise<void>;
  log?: Logger;
}

export interface BuilderController {
  ingest(message: AddressedMessage): Promise<void>;
  listJobs(): JobView[];
  recentLogs(): LogEvent[];
  subscribe(listener: Listener): () => void;
}

const ACTIVE = new Set<ExecutionStatus>(['RUNNING', 'VALIDATING', 'COMPLETED']);

export function createBuilder(opts: BuilderOptions): BuilderController {
  const now = () => opts.now?.() ?? Date.now();
  const exec = opts.execCommand ?? execCommand;
  const runWorker = opts.runWorker ?? runConfiguredWorker;
  const log = opts.log ?? { info() {}, warn() {}, error() {} };
  const listeners = new Set<Listener>();
  const logs: LogEvent[] = [];
  const seen = new Set<string>();
  let chain: Promise<void> = Promise.resolve();

  const label = (text: string): string => {
    const clean = plain(text);
    if (opts.config.mode === 'offline' && !clean.startsWith('Offline simulation.')) {
      return `Offline simulation. ${clean}`;
    }
    return clean;
  };

  const emit = (event: 'job' | 'log', data: JobView | LogEvent) => {
    for (const listener of listeners) {
      try {
        listener(event, data);
      } catch (err) {
        log.error('Job listener failed.', err instanceof Error ? err.message : err);
      }
    }
  };

  const emitLog = (jobId: string, stream: LogStream, line: string) => {
    const event: LogEvent = {
      jobId,
      stream,
      line: stream === 'system' ? label(line) : plain(line),
      at: now(),
    };
    logs.push(event);
    if (logs.length > 500) logs.shift();
    emit('log', event);
  };

  const publish = (jobId: string) => {
    const job = opts.state.snapshot().jobs.find((item) => item.jobId === jobId);
    if (job) emit('job', toJobView(job));
  };

  const patch = async (jobId: string, fn: (job: JobRecord) => void) => {
    await opts.state.update((state) => {
      const job = state.jobs.find((item) => item.jobId === jobId);
      if (job) fn(job);
    });
    publish(jobId);
  };

  const note = async (threadId: string | null, text: string) => {
    const body = label(text);
    log.info(body);
    try {
      await opts.sendTargetedToSaid(body, threadId);
    } catch (err) {
      log.warn('Targeted note failed. Posting in the room.', err instanceof Error ? err.message : err);
      await opts.postMessage(body, threadId);
    }
  };

  const deliver = async (jobId: string, status: ExecutionStatus, threadId: string | null) => {
    const job = opts.state.snapshot().jobs.find((item) => item.jobId === jobId);
    if (!job) return;
    const receipt = await signExecutionReceipt({
      roomId: opts.config.roomId,
      agreementId: job.agreementId,
      jobId: job.jobId,
      status,
      worker: job.worker,
      baseCommit: job.baseCommit,
      resultCommit: job.resultCommit,
      changedPaths: job.changedPaths,
      checks: job.checks,
      error: job.error,
      at: now(),
      keyId: opts.builderKey.keyId,
      privateKey: opts.builderKey.privateKey,
    });
    await opts.sendTargetedToSaid(label(receiptText(receipt)), threadId);
  };

  const failAllocated = async (jobId: string, threadId: string | null, step: JobStepKey, message: string) => {
    const clean = plain(message);
    await patch(jobId, (job) => {
      if (job.status === 'COMPLETED') return;
      job.status = 'FAILED';
      job.error = clean;
      job.finishedAt = now();
      const found = job.steps.find((item) => item.key === step);
      if (found && found.state !== 'passed') {
        found.state = 'failed';
        found.startedAt ??= now();
        found.finishedAt = now();
        if (!found.detail) found.detail = clean;
      }
    });
    await finishReceipt(jobId, threadId);
  };

  const finishReceipt = async (jobId: string, threadId: string | null) => {
    const current = opts.state.snapshot().jobs.find((item) => item.jobId === jobId);
    if (!current) return;
    const status = current.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    await patch(jobId, (job) => {
      const step = job.steps.find((item) => item.key === 'receipt');
      if (!step) return;
      step.state = 'running';
      step.startedAt ??= now();
    });
    try {
      await deliver(jobId, status, threadId);
      await patch(jobId, (job) => {
        job.receiptSent = true;
        const step = job.steps.find((item) => item.key === 'receipt');
        if (!step) return;
        step.state = 'passed';
        step.finishedAt = now();
        step.detail = status === 'COMPLETED' ? 'Receipt sent to Said.' : 'Failure receipt sent to Said.';
      });
      await opts.postMessage(label(status === 'COMPLETED' ? 'Sent the receipt to Said.' : 'Sent a failure receipt to Said.'), threadId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'The receipt could not be sent.';
      await patch(jobId, (job) => {
        const step = job.steps.find((item) => item.key === 'receipt');
        if (step) {
          step.state = 'failed';
          step.finishedAt = now();
          step.detail = plain(detail);
        }
        if (job.status === 'COMPLETED') {
          job.error = plain(`The change is on the site, but the receipt did not send. ${detail}`);
        }
      });
      log.error('Receipt failed.', detail);
    }
  };

  const handle = async (message: AddressedMessage) => {
    if (seen.has(message.messageId)) return;
    const threadId = message.threadId ?? (message.messageId || null);
    try {
      await handleMessage(message, threadId);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'The builder hit an unexpected error.';
      log.error(messageText);
      try {
        await note(threadId, `The builder hit an unexpected error. ${plain(messageText)}`);
      } catch {
        // The room note is best-effort. The job record, if any, is already saved.
      }
    } finally {
      seen.add(message.messageId);
    }
  };

  const handleMessage = async (message: AddressedMessage, threadId: string | null) => {

    if (message.roomId !== opts.config.roomId) {
      log.warn(`Ignored a message for room ${message.roomId}.`);
      return;
    }

    const allowSaidNameFallback =
      process.env.SAID_ALLOW_SAID_NAME_FALLBACK === '1' ||
      process.env.SAID_ALLOW_SAID_NAME_FALLBACK === 'true';
    const auth = await authorizeStart({
      senderId: message.senderId,
      senderName: message.senderName,
      saidAgentId: opts.config.said.agentId,
      saidAgentName: opts.config.said.name,
      allowSaidNameFallback,
      body: message.body,
      notaryPublicKey: opts.notaryPublicKey,
      expectedRoomId: opts.config.roomId,
      now: now(),
      loadLedgerDocument: opts.loadLedgerDocument,
    });
    if (!auth.ok) {
      await note(threadId, auth.reason);
      return;
    }

    const existing = opts.state.snapshot().jobs.find((job) => job.jobId === auth.jobId);
    if (existing && ACTIVE.has(existing.status)) {
      const word = existing.status === 'COMPLETED' ? 'done' : 'running';
      await note(threadId, `I did not start work. ${auth.jobId} is already ${word}.`);
      return;
    }
    if (existing?.status === 'FAILED') {
      await note(
        threadId,
        `I did not start work. ${auth.jobId} already failed, and its work folder was kept. Said needs to send a new attempt.`,
      );
      return;
    }

    const started = now();
    const record: JobRecord = {
      jobId: auth.jobId,
      agreementId: auth.agreement.id,
      status: 'RUNNING',
      worker: opts.worker,
      steps: freshSteps(started),
      baseCommit: null,
      resultCommit: null,
      changedPaths: [],
      error: null,
      startedAt: started,
      finishedAt: null,
      checks: [],
      threadId,
      receiptSent: false,
    };
    await opts.state.update((state) => {
      state.jobs.push(record);
    });
    publish(auth.jobId);

    const prompt = buildWorkerPrompt({
      agreementId: auth.agreement.id,
      scope: auth.agreement.scope,
      terms: auth.agreement.terms,
    });

    try {
      await opts.postMessage(
        label(`Both approvals check out. Starting ${auth.jobId} for ${auth.agreement.id}.`),
        threadId,
      );
    } catch (err) {
      log.warn('Progress post failed.', err instanceof Error ? err.message : err);
    }
    emitLog(auth.jobId, 'system', `Both approvals check out. Starting ${auth.jobId} for ${auth.agreement.id}.`);

    try {
      await deliver(auth.jobId, 'RUNNING', threadId);
    } catch (err) {
      emitLog(auth.jobId, 'system', err instanceof Error ? err.message : 'The running receipt did not send.');
    }

    try {
      await runJob({
        jobId: auth.jobId,
        agreementId: auth.agreement.id,
        scope: auth.agreement.scope,
        terms: auth.agreement.terms,
        token: auth.token,
        worker: opts.worker,
        prompt,
        clientRepo: opts.clientRepo,
        jobsDir: opts.jobsDir,
        fixturePatch: opts.fixturePatch,
        notaryPublicKey: opts.notaryPublicKey,
        expectedRoomId: opts.config.roomId,
        expectedParties: auth.expectedParties,
        now,
        execCommand: exec,
        loadLedgerDocument: opts.loadLedgerDocument,
        runWorker,
        progress: async (line) => {
          emitLog(auth.jobId, 'system', line);
          try {
            await opts.postMessage(label(line), threadId);
          } catch (err) {
            log.warn('Progress post failed.', err instanceof Error ? err.message : err);
          }
        },
        log: (stream, line) => emitLog(auth.jobId, stream, line),
        patch: (fn) => patch(auth.jobId, fn),
      });
    } catch (err) {
      const current = opts.state.snapshot().jobs.find((job) => job.jobId === auth.jobId);
      if (current?.status !== 'COMPLETED') {
        const step: JobStepKey = err instanceof Error && 'step' in err && typeof err.step === 'string' ? (err.step as JobStepKey) : 'worker';
        const message = err instanceof Error ? err.message : 'The job failed.';
        await failAllocated(auth.jobId, threadId, step, message);
      } else {
        await finishReceipt(auth.jobId, threadId);
      }
      return;
    }

    await finishReceipt(auth.jobId, threadId);
  };

  return {
    ingest(message) {
      const run = chain.then(() => handle(message));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    listJobs() {
      return opts.state
        .snapshot()
        .jobs
        .map(toJobView)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    },
    recentLogs() {
      return logs.map((entry) => ({ ...entry }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

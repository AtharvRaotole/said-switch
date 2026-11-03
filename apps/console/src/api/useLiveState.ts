import { useEffect, useState } from 'react';
import { BUILDER_URL, connectBuilder } from './builder';
import { NOTARY_URL, connectNotary } from './notary';
import type { ChatEvent, ConsoleData, JobView, LinkStatus, LogEvent } from './types';

const MAX_CHAT = 40;
const MAX_LOG_LINES = 600;

const initial: ConsoleData = {
  source: 'live',
  notaryUrl: NOTARY_URL,
  builderUrl: BUILDER_URL,
  notaryLink: 'connecting',
  builderLink: 'connecting',
  state: null,
  ledgerIssue: null,
  jobs: [],
  logs: {},
  chat: [],
  clock: null,
};

const lost = (status: LinkStatus): LinkStatus => (status === 'open' || status === 'reconnecting' ? 'reconnecting' : 'unreachable');

export function useLiveState(): ConsoleData {
  const [data, setData] = useState<ConsoleData>(initial);

  useEffect(() => {
    const closeNotary = connectNotary({
      onState: ({ state, ledgerIssue }) => setData((d) => ({ ...d, state, ledgerIssue })),
      onChat: (message) => setData((d) => ({ ...d, chat: appendChat(d.chat, message) })),
      onOpen: () => setData((d) => ({ ...d, notaryLink: 'open' })),
      onDown: () => setData((d) => ({ ...d, notaryLink: lost(d.notaryLink) })),
    });
    const closeBuilder = connectBuilder({
      onJobs: (jobs) => setData((d) => ({ ...d, jobs })),
      onJob: (job) => setData((d) => ({ ...d, jobs: upsertJob(d.jobs, job) })),
      onLog: (line) => setData((d) => ({ ...d, logs: appendLog(d.logs, line) })),
      onOpen: () => setData((d) => ({ ...d, builderLink: 'open' })),
      onDown: () => setData((d) => ({ ...d, builderLink: lost(d.builderLink) })),
    });
    return () => {
      closeNotary();
      closeBuilder();
    };
  }, []);

  return data;
}

function appendChat(chat: ChatEvent[], message: ChatEvent): ChatEvent[] {
  if (chat.some((m) => m.messageId === message.messageId)) return chat;
  return [...chat, message].sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_CHAT);
}

function upsertJob(jobs: JobView[], job: JobView): JobView[] {
  const index = jobs.findIndex((j) => j.jobId === job.jobId);
  if (index === -1) return [...jobs, job];
  const next = jobs.slice();
  next[index] = job;
  return next;
}

function appendLog(logs: Record<string, LogEvent[]>, line: LogEvent): Record<string, LogEvent[]> {
  const lines = logs[line.jobId] ?? [];
  return { ...logs, [line.jobId]: [...lines, line].slice(-MAX_LOG_LINES) };
}

import type { SignedLedger } from '@said/core';
import { getJson, isRecord, openStream } from './sse';
import type { ChatEvent, NotaryState } from './types';

export const NOTARY_URL = trimSlash(import.meta.env.VITE_NOTARY_URL || 'http://localhost:7410');

export interface ParsedNotaryState {
  state: NotaryState;
  /** Set when the notary sent a ledger the console cannot render. */
  ledgerIssue: string | null;
}

export async function fetchNotaryState(): Promise<ParsedNotaryState> {
  const parsed = parseNotaryState(await getJson(`${NOTARY_URL}/api/state`));
  if (!parsed) throw new Error('Notary /api/state returned an unexpected shape');
  return parsed;
}

export function connectNotary(handlers: {
  onState: (parsed: ParsedNotaryState) => void;
  onChat: (message: ChatEvent) => void;
  onOpen: () => void;
  onDown: () => void;
}): () => void {
  let alive = true;
  const resync = () => {
    fetchNotaryState()
      .then((parsed) => alive && handlers.onState(parsed))
      .catch(() => undefined);
  };
  resync();
  const close = openStream({
    url: `${NOTARY_URL}/api/events`,
    events: {
      state: (data) => {
        const parsed = parseNotaryState(data);
        if (parsed) handlers.onState(parsed);
      },
      chat: (data) => {
        const message = parseChatEvent(data);
        if (message) handlers.onChat(message);
      },
    },
    onOpen: () => {
      handlers.onOpen();
      resync();
    },
    onDown: handlers.onDown,
  });
  return () => {
    alive = false;
    close();
  };
}

export function parseNotaryState(raw: unknown): ParsedNotaryState | null {
  if (!isRecord(raw) || !isRecord(raw.switch) || !isRecord(raw.room)) return null;
  if (raw.mode !== 'live' && raw.mode !== 'offline') return null;
  const ledger = readSignedLedger(raw.signedLedger);
  const state: NotaryState = {
    mode: raw.mode,
    switch: {
      url: str(raw.switch.url),
      connected: raw.switch.connected === true,
      version: typeof raw.switch.version === 'string' ? raw.switch.version : null,
    },
    room: { id: str(raw.room.id), name: str(raw.room.name) || 'Unnamed room' },
    notaryPublicKey: str(raw.notaryPublicKey),
    keyId: str(raw.keyId),
    signedLedger: ledger.value,
    ledgerDocumentId: typeof raw.ledgerDocumentId === 'string' ? raw.ledgerDocumentId : null,
  };
  return { state, ledgerIssue: ledger.issue };
}

function readSignedLedger(raw: unknown): { value: SignedLedger | null; issue: string | null } {
  if (raw === null || raw === undefined) return { value: null, issue: null };
  if (!isRecord(raw) || !isRecord(raw.payload)) {
    return { value: null, issue: 'The notary sent a ledger without a payload.' };
  }
  const payload = raw.payload;
  const lists = ['parties', 'drafts', 'agreements', 'refusals', 'audit'] as const;
  const missing = lists.filter((key) => !Array.isArray(payload[key]));
  if (missing.length > 0) {
    return { value: null, issue: `The ledger payload is missing ${missing.join(', ')}.` };
  }
  if (typeof raw.digest !== 'string' || typeof raw.signature !== 'string') {
    return { value: null, issue: 'The ledger has no digest or signature.' };
  }
  return { value: raw as unknown as SignedLedger, issue: null };
}

export function parseChatEvent(raw: unknown): ChatEvent | null {
  if (!isRecord(raw) || typeof raw.messageId !== 'string' || typeof raw.body !== 'string') return null;
  return {
    messageId: raw.messageId,
    senderName: str(raw.senderName) || 'Unknown sender',
    body: raw.body,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
    fromAgent: raw.fromAgent === true,
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

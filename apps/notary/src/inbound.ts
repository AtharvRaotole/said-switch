import type { InboundMessage } from '@said/core';
import type { SwitchMessageEvent } from '@said/switch-client';
import { SWITCH_ADDRESSING_DENIED, SWITCH_ADDRESSING_UNCLAIMED } from './text.js';

export function mentionsIn(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/@([\w-]+)/g)) {
    const name = match[1];
    if (name) found.add(name.toLowerCase());
  }
  return [...found];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Switch auto-replies (`com.switch.auto_reply`), including the simulator's addressing refusals. */
export function isAutoReply(event: SwitchMessageEvent): boolean {
  if (event.body === SWITCH_ADDRESSING_DENIED || event.body === SWITCH_ADDRESSING_UNCLAIMED) return true;
  const raw = event.raw;
  if (!isRecord(raw)) return false;
  if (raw['com.switch.auto_reply'] === true || raw.auto_reply === true) return true;
  const payload = raw.payload;
  return isRecord(payload) && (payload['com.switch.auto_reply'] === true || payload.auto_reply === true);
}

export function toInbound(event: SwitchMessageEvent, agentIds: ReadonlySet<string>): InboundMessage {
  return {
    messageId: event.messageId,
    senderId: event.sender,
    senderName: event.senderName || 'unknown',
    body: event.body,
    timestamp: event.timestamp || Date.now(),
    threadId: event.threadId,
    addressedToSaid: event.addressed,
    mentions: mentionsIn(event.body),
    fromAgent: agentIds.has(event.sender),
    autoReply: isAutoReply(event),
  };
}

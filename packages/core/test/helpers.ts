import { applyMessage, emptyLedger } from '../src/index';
import type { EngineContext, EngineResult, InboundMessage, Ledger, Party, RoomMode } from '../src/index';

export const ROOM = '!dark-mode-room:switch.local';
export const T0 = Date.UTC(2026, 10, 4, 15, 30, 0);

export const RIYA: Party = { role: 'developer', label: 'Riya', senderId: '@switch-user-riya01:switch.local' };
export const DANA: Party = { role: 'client', label: 'Dana', senderId: '@switch-user-dana02:switch.local' };
export const ALEX: Party = { role: 'partnerA', label: 'Alex', senderId: '@switch-user-alex03:switch.local' };
export const SAM: Party = { role: 'partnerB', label: 'Sam', senderId: '@switch-user-sam04:switch.local' };

export interface Sender {
  senderId: string;
  label: string;
}

export const MALLORY: Sender = { senderId: '@switch-user-mallory99:switch.local', label: 'Mallory' };

export function makeLedger(mode: RoomMode = 'business'): Ledger {
  const parties = mode === 'business' ? [RIYA, DANA] : [ALEX, SAM];
  return emptyLedger({ deploymentId: 'dep-test', roomId: ROOM, mode, parties, now: T0 });
}

export type SayResult = EngineResult & { message: InboundMessage; replies: string[] };

/** Feeds messages through the engine one second apart, keeping the latest ledger. */
export class Room {
  ledger: Ledger;
  now = T0;
  private seq = 0;
  readonly ctx: Omit<EngineContext, 'now'>;

  constructor(mode: RoomMode = 'business') {
    this.ledger = makeLedger(mode);
    this.ctx = { guardedAgents: mode === 'business' ? ['builder'] : [], saidName: 'said' };
  }

  message(from: Sender, body: string, extra: Partial<InboundMessage> = {}): InboundMessage {
    this.now += 1000;
    return {
      messageId: `$evt-${++this.seq}`,
      senderId: from.senderId,
      senderName: from.label,
      body,
      timestamp: this.now,
      threadId: null,
      addressedToSaid: /(^|\s)@said\b/i.test(body),
      mentions: [...body.matchAll(/@([\w-]+)/g)].map((m) => m[1]!.toLowerCase()),
      fromAgent: false,
      autoReply: false,
      ...extra,
    };
  }

  deliver(message: InboundMessage): SayResult {
    const result = applyMessage(this.ledger, message, { ...this.ctx, now: this.now });
    if (result.ledger) this.ledger = result.ledger;
    const replies = result.effects.flatMap((e) => (e.kind === 'reply' ? [e.body] : []));
    return { ...result, message, replies };
  }

  say(from: Sender, body: string, extra: Partial<InboundMessage> = {}): SayResult {
    return this.deliver(this.message(from, body, extra));
  }

  draft(id: string) {
    const d = this.ledger.drafts.find((x) => x.id === id);
    if (!d) throw new Error(`no draft ${id}`);
    return d;
  }
}

/** Dana asks the builder directly, Riya sets terms: DRF-001 v1 PENDING with no approvals. */
export function roomWithPendingDraft(): Room {
  const room = new Room();
  room.say(DANA, "@builder also add dark mode while you're in there");
  room.say(RIYA, 'Terms DRF-001: +2 days, +$400');
  return room;
}

export function lockedRoom(): Room {
  const room = roomWithPendingDraft();
  room.say(RIYA, 'Accept DRF-001 v1');
  room.say(DANA, 'I accept DRF-001 v1');
  return room;
}

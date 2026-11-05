import { applyMessage, emptyLedger } from '../src/index';
import type { EngineResult, InboundMessage, Ledger, Party } from '../src/index';
import { ROOM, T0 } from './helpers';

/** The seven lines the owner runs in the Telegram group, in order. */
export const DEMO_SCRIPT = [
  "@builder Also add dark mode while you're in there",
  'Terms DRF-001: +2 days, +$400',
  'Accept DRF-001 v1',
  'Wait, I thought we agreed dark mode was free?',
  'Accept DRF-001 v1',
  'Propose: add a contrast-safe theme toggle | Terms: +1 day, +$150',
  'Accept DRF-002 v1',
] as const;

export interface ScriptStep {
  from: 'dana' | 'riya';
  body: string;
  result: EngineResult;
  replies: string[];
}

export class ScriptRoom {
  ledger: Ledger;
  private now = T0;
  private seq = 0;

  constructor(parties: Party[]) {
    this.ledger = emptyLedger({ deploymentId: 'dep-test', roomId: ROOM, mode: 'business', parties, now: T0 });
  }

  say(from: Party, body: string, extra: Partial<InboundMessage> = {}): EngineResult & { replies: string[] } {
    this.now += 1000;
    const message: InboundMessage = {
      messageId: `script-${++this.seq}`,
      senderId: from.senderId,
      senderName: from.label,
      body,
      timestamp: this.now,
      threadId: null,
      addressedToSaid: /(^|\s)@said\b/i.test(body),
      mentions: [...body.matchAll(/@([\w-]+)/g)].map((match) => match[1]!.toLowerCase()),
      fromAgent: false,
      autoReply: false,
      ...extra,
    };
    const result = applyMessage(this.ledger, message, { guardedAgents: ['builder'], saidName: 'said', now: this.now });
    if (result.ledger) this.ledger = result.ledger;
    const replies = result.effects.flatMap((effect) => (effect.kind === 'reply' ? [effect.body] : []));
    return { ...result, replies };
  }
}

export function playDemoScript(parties: { riya: Party; dana: Party }): { room: ScriptRoom; steps: ScriptStep[] } {
  const room = new ScriptRoom([parties.riya, parties.dana]);
  const who = { dana: parties.dana, riya: parties.riya };
  const speakers: Array<'dana' | 'riya'> = ['dana', 'riya', 'riya', 'dana', 'dana', 'dana', 'riya'];
  const steps = DEMO_SCRIPT.map((body, index) => {
    const from = speakers[index]!;
    const result = room.say(who[from], body);
    return { from, body, result, replies: result.replies };
  });
  return { room, steps };
}

import {
  applyMessage,
  emptyLedger,
  type InboundMessage,
  type Ledger,
  type Party,
} from '@said/core';

export const RIYA: Party = {
  role: 'developer',
  label: 'Riya',
  senderId: '@switch-user-riya:demo.said',
};

export const DANA: Party = {
  role: 'client',
  label: 'Dana',
  senderId: '@switch-user-dana:demo.said',
};

export type Speaker = 'Riya' | 'Dana';

export interface ChatLine {
  id: string;
  speaker: Speaker | 'Said';
  body: string;
  at: number;
}

export interface PlayState {
  ledger: Ledger;
  chat: ChatLine[];
}

export function newPlay(): PlayState {
  const now = Date.UTC(2026, 10, 4, 15, 30, 0);
  return {
    ledger: emptyLedger({
      deploymentId: 'playground',
      roomId: 'playground-room',
      mode: 'business',
      parties: [RIYA, DANA],
      now,
    }),
    chat: [
      {
        id: 'intro',
        speaker: 'Said',
        body: 'This is a real run of the Said engine in your browser. Dana is the client. Riya is the developer. Ask for extra work as Dana and watch what happens.',
        at: now,
      },
    ],
  };
}

function mentions(body: string): string[] {
  return [...body.matchAll(/@([\w-]+)/g)].map((m) => m[1]!.toLowerCase());
}

export function say(state: PlayState, speaker: Speaker, body: string, now = Date.now()): PlayState {
  const party = speaker === 'Riya' ? RIYA : DANA;
  const message: InboundMessage = {
    messageId: crypto.randomUUID(),
    senderId: party.senderId,
    senderName: party.label,
    body,
    timestamp: now,
    threadId: null,
    addressedToSaid: /@said\b/i.test(body),
    mentions: mentions(body),
    fromAgent: false,
    autoReply: false,
  };
  const result = applyMessage(state.ledger, message, {
    guardedAgents: ['builder'],
    saidName: 'said',
    now,
  });
  const chat: ChatLine[] = [
    ...state.chat,
    { id: message.messageId, speaker, body, at: now },
    ...result.effects
      .filter((e): e is { kind: 'reply'; body: string; threadId: string | null } => e.kind === 'reply')
      .map((e, i) => ({
        id: `${message.messageId}-said-${i}`,
        speaker: 'Said' as const,
        body: e.body,
        at: now + i + 1,
      })),
  ];
  return { ledger: result.ledger ?? state.ledger, chat };
}

export function headline(ledger: Ledger): { title: string; detail: string } {
  const draft = [...ledger.drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!draft) {
    return {
      title: 'No extra work on the table yet.',
      detail: 'Have Dana ask for something. Typing at the builder is fine. Said will still catch it.',
    };
  }
  if (draft.status === 'NEEDS_TERMS') {
    return {
      title: 'Logged. Nothing has started.',
      detail: `${draft.scope}. Riya still needs to write the time and price.`,
    };
  }
  if (draft.status === 'LOCKED') {
    return {
      title: 'Both agreed. Work can start.',
      detail: `${draft.scope}. Locked as ${draft.agreementId}.`,
    };
  }
  if (draft.status === 'REJECTED') {
    return {
      title: 'This one was turned down.',
      detail: `${draft.scope} will not run.`,
    };
  }
  const waiting = ledger.parties.find((p) => !draft.approvals[p.role]);
  if (waiting) {
    return {
      title: `Waiting for ${waiting.label} to agree.`,
      detail: `${draft.scope}. Terms: ${draft.terms ?? 'not set yet'}.`,
    };
  }
  return { title: 'Waiting on both people.', detail: draft.scope };
}

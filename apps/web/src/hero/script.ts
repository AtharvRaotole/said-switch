/** Scripted beats for the landing-page chat hero. No third-party messaging branding. */

export type HeroSpeaker = 'Dana' | 'Riya' | 'Said' | 'Builder' | 'system';

export type HeroTone = 'refuse' | 'lock' | 'quote' | 'handoff' | 'system';

export type LedgerPatch = {
  draft?: string | null;
  version?: number;
  accepts?: number;
  need?: number;
  agreement?: string | null;
  revision?: number;
  hash?: string;
  sealed?: boolean;
  scope?: string;
  terms?: string;
};

export type HeroBeat =
  | {
      kind: 'msg';
      speaker: HeroSpeaker;
      body: string;
      ms: number;
      tone?: HeroTone;
      time?: string;
      cite?: { revision: number; at: string; hash: string; valid: boolean };
    }
  | { kind: 'typing'; speaker: HeroSpeaker; ms: number }
  | { kind: 'ledger'; patch: LedgerPatch; ms: number }
  | { kind: 'seal'; ms: number }
  | { kind: 'terminal-line'; text: string; ms: number; tone?: 'ok' | 'dim' | 'cmd' | 'warn' | 'idle' }
  | { kind: 'term-status'; status: 'idle' | 'blocked' | 'running' | 'done'; ms: number }
  | { kind: 'pause'; ms: number }
  | { kind: 'loop'; ms: number };

export const HERO_ROOM = 'larkspur-site';
export const HERO_REVISION_LOCKED = 7;
export const HERO_HASH_LOCKED = 'a8f3c1e2';

export const HERO_IDLE_TERMINAL: { text: string; tone: 'idle' | 'dim' }[] = [
  { text: 'builder idle · waiting for a signed start', tone: 'idle' },
  { text: 'addressing: owner + owner agents only', tone: 'dim' },
];

export const HERO_SCRIPT: HeroBeat[] = [
  { kind: 'pause', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: '@said can we add dark mode to the marketing site?',
    ms: 850,
    time: '15:38:02',
  },
  { kind: 'typing', speaker: 'Said', ms: 650 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Logged as DRF-001. Scope: Add dark mode to the marketing site. Riya, set the time and price. Nothing has started.',
    ms: 1400,
    time: '15:38:09',
  },
  {
    kind: 'ledger',
    patch: {
      draft: 'DRF-001',
      version: 1,
      accepts: 0,
      need: 2,
      revision: 3,
      hash: '4b91d0aa',
      scope: 'Add dark mode',
      terms: 'pending',
    },
    ms: 200,
  },
  { kind: 'typing', speaker: 'Riya', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Riya',
    body: 'Terms DRF-001: +2 days, +$400',
    ms: 850,
    time: '15:38:21',
  },
  { kind: 'typing', speaker: 'Said', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Terms set on DRF-001 v1. Waiting for both of you to accept the same version.',
    ms: 1200,
    time: '15:38:27',
  },
  {
    kind: 'ledger',
    patch: { terms: '+2 days, +$400', revision: 4, hash: '6e2c91f0' },
    ms: 180,
  },
  { kind: 'typing', speaker: 'Dana', ms: 480 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: '@builder also add dark mode while you are in there',
    ms: 850,
    time: '15:38:41',
  },
  {
    kind: 'term-status',
    status: 'blocked',
    ms: 120,
  },
  {
    kind: 'terminal-line',
    text: 'blocked: unauthorized sender (dana) -> @builder',
    ms: 280,
    tone: 'warn',
  },
  {
    kind: 'terminal-line',
    text: 'no start token · still idle',
    ms: 320,
    tone: 'dim',
  },
  { kind: 'typing', speaker: 'Builder', ms: 400 },
  {
    kind: 'msg',
    speaker: 'Builder',
    body: "You're not permitted to direct messages to me in this room. My operator has restricted who can address me here.",
    ms: 1500,
    tone: 'refuse',
    time: '15:38:44',
  },
  { kind: 'typing', speaker: 'Said', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Caught that. Logged as a refusal. The builder did not start. Still waiting on both accepts for DRF-001.',
    ms: 1300,
    time: '15:38:50',
  },
  { kind: 'typing', speaker: 'Riya', ms: 420 },
  {
    kind: 'msg',
    speaker: 'Riya',
    body: 'Accept DRF-001 v1',
    ms: 750,
    time: '15:39:08',
  },
  {
    kind: 'ledger',
    patch: { accepts: 1, revision: 5, hash: '9c14ab77' },
    ms: 160,
  },
  { kind: 'typing', speaker: 'Said', ms: 420 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Riya accepted. Waiting for Dana to agree to the same terms.',
    ms: 1100,
    time: '15:39:12',
  },
  { kind: 'typing', speaker: 'Dana', ms: 480 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: 'Accept DRF-001 v1',
    ms: 750,
    time: '15:39:26',
  },
  {
    kind: 'ledger',
    patch: {
      accepts: 2,
      agreement: 'AGR-001',
      revision: HERO_REVISION_LOCKED,
      hash: HERO_HASH_LOCKED,
      sealed: true,
    },
    ms: 200,
  },
  { kind: 'seal', ms: 1000 },
  { kind: 'typing', speaker: 'Said', ms: 380 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Both accepted. Locked as AGR-001. Handing a signed start to @builder.',
    ms: 1200,
    tone: 'lock',
    time: '15:39:31',
  },
  { kind: 'term-status', status: 'running', ms: 180 },
  { kind: 'terminal-line', text: '$ said-builder verify AGR-001', ms: 320, tone: 'cmd' },
  {
    kind: 'terminal-line',
    text: 'ledger ok  signature ok  both ids distinct  terms match',
    ms: 420,
    tone: 'ok',
  },
  {
    kind: 'terminal-line',
    text: '$ claude -p "Add dark mode per AGR-001 (+2 days, +$400)"',
    ms: 380,
    tone: 'cmd',
  },
  { kind: 'terminal-line', text: 'worktree /tmp/said-job-agr-001', ms: 320, tone: 'dim' },
  { kind: 'terminal-line', text: 'changed src/styles.css src/App.tsx', ms: 360, tone: 'dim' },
  {
    kind: 'terminal-line',
    text: 'typecheck pass  build pass  paths allow-listed',
    ms: 400,
    tone: 'ok',
  },
  { kind: 'terminal-line', text: 'applied. receipt posted to room.', ms: 600, tone: 'ok' },
  { kind: 'term-status', status: 'done', ms: 120 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Builder finished. Dark mode is on the site. Receipt is in the ledger.',
    ms: 1200,
    tone: 'handoff',
    time: '15:41:04',
  },
  { kind: 'typing', speaker: 'Dana', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: 'I thought we agreed dark mode was free',
    ms: 900,
    time: '15:41:18',
  },
  { kind: 'typing', speaker: 'Said', ms: 550 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Scope: Add dark mode to the marketing site. Terms: +2 days, +$400. Accepted by Riya and Dana. That is what both of you signed.',
    ms: 2600,
    tone: 'quote',
    time: '15:41:24',
    cite: {
      revision: HERO_REVISION_LOCKED,
      at: '4 Nov 2026 10:41:22 ET',
      hash: HERO_HASH_LOCKED,
      valid: true,
    },
  },
  { kind: 'pause', ms: 2000 },
  { kind: 'loop', ms: 800 },
];

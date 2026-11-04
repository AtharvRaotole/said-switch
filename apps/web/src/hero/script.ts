/** Scripted beats for the landing-page chat hero. No Switch branding beyond our own room chrome. */

export type HeroSpeaker = 'Dana' | 'Riya' | 'Said' | 'Builder' | 'system';

export type HeroBeat =
  | { kind: 'msg'; speaker: HeroSpeaker; body: string; ms: number; tone?: 'refuse' | 'lock' | 'quote' | 'handoff' }
  | { kind: 'typing'; speaker: HeroSpeaker; ms: number }
  | { kind: 'seal'; ms: number }
  | { kind: 'terminal-open'; ms: number }
  | { kind: 'terminal-line'; text: string; ms: number; tone?: 'ok' | 'dim' | 'cmd' }
  | { kind: 'pause'; ms: number }
  | { kind: 'loop'; ms: number };

export const HERO_ROOM = 'larkspur-site';
export const HERO_REVISION_LOCKED = 7;

export const HERO_SCRIPT: HeroBeat[] = [
  { kind: 'pause', ms: 600 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: '@said can we add dark mode to the marketing site?',
    ms: 900,
  },
  { kind: 'typing', speaker: 'Said', ms: 700 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Logged as DRF-001. Scope: Add dark mode to the marketing site. Riya, set the time and price. Nothing has started.',
    ms: 1600,
  },
  { kind: 'typing', speaker: 'Riya', ms: 550 },
  {
    kind: 'msg',
    speaker: 'Riya',
    body: 'Terms DRF-001: +2 days, +$400',
    ms: 900,
  },
  { kind: 'typing', speaker: 'Said', ms: 550 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Terms set on DRF-001 v1. Waiting for both of you to accept the same version.',
    ms: 1400,
  },
  { kind: 'typing', speaker: 'Dana', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: '@builder also add dark mode while you are in there',
    ms: 900,
  },
  { kind: 'typing', speaker: 'Builder', ms: 450 },
  {
    kind: 'msg',
    speaker: 'Builder',
    body: "You're not permitted to direct messages to me in this room. My operator has restricted who can address me here.",
    ms: 1600,
    tone: 'refuse',
  },
  { kind: 'typing', speaker: 'Said', ms: 550 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Caught that. Logged as a refusal. The builder did not start. Still waiting on both accepts for DRF-001.',
    ms: 1500,
  },
  { kind: 'typing', speaker: 'Riya', ms: 450 },
  {
    kind: 'msg',
    speaker: 'Riya',
    body: 'Accept DRF-001 v1',
    ms: 800,
  },
  { kind: 'typing', speaker: 'Said', ms: 450 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Riya accepted. Waiting for Dana to agree to the same terms.',
    ms: 1200,
  },
  { kind: 'typing', speaker: 'Dana', ms: 500 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: 'Accept DRF-001 v1',
    ms: 800,
  },
  { kind: 'seal', ms: 1100 },
  { kind: 'typing', speaker: 'Said', ms: 400 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Both accepted. Locked as AGR-001. Handing a signed start to @builder.',
    ms: 1400,
    tone: 'lock',
  },
  { kind: 'terminal-open', ms: 500 },
  { kind: 'terminal-line', text: '$ said-builder verify AGR-001', ms: 350, tone: 'cmd' },
  { kind: 'terminal-line', text: 'ledger ok  signature ok  both ids distinct  terms match', ms: 450, tone: 'ok' },
  { kind: 'terminal-line', text: '$ claude -p "Add dark mode per AGR-001 (+2 days, +$400)"', ms: 400, tone: 'cmd' },
  { kind: 'terminal-line', text: 'worktree /tmp/said-job-agr-001', ms: 350, tone: 'dim' },
  { kind: 'terminal-line', text: 'changed src/styles.css src/App.tsx', ms: 400, tone: 'dim' },
  { kind: 'terminal-line', text: 'typecheck pass  build pass  paths allow-listed', ms: 450, tone: 'ok' },
  { kind: 'terminal-line', text: 'applied. receipt posted to room.', ms: 700, tone: 'ok' },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Builder finished. Dark mode is on the site. Receipt is in the ledger.',
    ms: 1400,
    tone: 'handoff',
  },
  { kind: 'typing', speaker: 'Dana', ms: 550 },
  {
    kind: 'msg',
    speaker: 'Dana',
    body: 'I thought we agreed dark mode was free',
    ms: 1000,
  },
  { kind: 'typing', speaker: 'Said', ms: 600 },
  {
    kind: 'msg',
    speaker: 'Said',
    body: 'Quote from the locked ledger, 4 Nov 2026 15:41:22 UTC. AGR-001 / DRF-001 v1. Scope: Add dark mode to the marketing site. Terms: +2 days, +$400. Accepted by Riya and Dana. That is what both of you signed.',
    ms: 2800,
    tone: 'quote',
  },
  { kind: 'pause', ms: 2200 },
  { kind: 'loop', ms: 900 },
];

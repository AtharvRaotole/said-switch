import type {
  Agreement,
  ApprovalReceipt,
  AuditEvent,
  Draft,
  DraftVersion,
  Execution,
  Ledger,
  Party,
  Receipt,
  Refusal,
} from '@said/core';
import type { ChatEvent, ConsoleData, JobStep, JobView, LogEvent, LogStream, NotaryMode } from '../api/types';

/**
 * Design fixture: Riya (developer) builds the Larkspur Coffee Co. landing page
 * for Dana (client). Dana asks @builder for dark mode directly; Said turns it
 * into DRF-001 and nothing runs until both accept the same terms.
 */

export const FIXTURE_STEPS = [
  { label: 'Bypass logged', caption: 'Dana asked @builder directly. Switch refused it; Said logged it as DRF-001.' },
  { label: 'Terms set', caption: 'Riya set terms, accepted, then revised to v2. Her v1 approval was cleared.' },
  { label: 'Developer accepted', caption: 'Riya accepted v2. Dana has not, so nothing has started.' },
  { label: 'Locked', caption: 'Dana’s conditional yes was not recorded; her explicit acceptance locked AGR-001.' },
  { label: 'Execution running', caption: 'The builder re-verified the lock and is running Claude Code in a worktree.' },
  { label: 'Completed', caption: 'Checks passed, the change was applied and the builder signed a receipt.' },
] as const;

const t = (h: number, m: number, s: number, ms = 0) => Date.UTC(2026, 10, 4, h, m, s, ms);

const ROOM_ID = '5f0c2a7e-91d4-4b3a-a8e6-2d71c94b0e3f';
const KEY_ID = 'said-ed25519-7f3a91';
const DOCUMENT_ID = '97e538e1-bd2c-42d9-8e1b-f1850d04bacf';
const BASE_COMMIT = '9506780f03086080522148b472efc3fe406355e7';
const RESULT_COMMIT = '2d92f3dfdd21ddefd7814fa5ec13afc8ebf76fb2';
const JOB_ID = 'JOB-AGR-001-1';

const HASH_V0 = 'b1c7259fbbd9b01afc25003f8a6e23ee16d7e5f68a8ed6db9fc2c2908d8b79cc';
const HASH_V1 = 'da1e311f88642568b40d21dd7d6b2af9d033468425feeaf8fcf5b5287a7d6927';
const HASH_V2 = '46aefd76dafcc54a43abeb059d544de521e4c4d43b22d1b970a61d9e098d3199';

const RIYA: Party = { role: 'developer', label: 'Riya', senderId: '@switch-user-riya01:switch.local' };
const DANA: Party = { role: 'client', label: 'Dana', senderId: '@switch-user-dana02:switch.local' };

/** Frozen clock for each story step. */
const CLOCKS = [t(15, 31, 20), t(15, 37, 30), t(15, 38, 55), t(15, 42, 28), t(15, 43, 18), t(15, 45, 12)] as const;
const REVISIONS = [3, 6, 7, 10, 11, 12] as const;

function receipt(party: Party, messageId: string, timestamp: number, text: string): Receipt {
  return { senderId: party.senderId, senderName: party.label, role: party.role, messageId, timestamp, text, threadId: null };
}

function approval(r: Receipt, party: Party, version: number, termsHash: string): ApprovalReceipt {
  return { ...r, role: party.role, draftId: 'DRF-001', version, termsHash };
}

const MESSAGES = {
  enrollRiya: receipt(RIYA, '8unyc0yosvx7lh4k75rrha', t(15, 2, 11), 'enroll 7KQ2'),
  enrollDana: receipt(DANA, 't1oupghsdbno9ihklua0wd', t(15, 3, 40), 'enroll 4MZ8'),
  bypass: receipt(DANA, 'i5zvftmafeot9ckwnkmneq', t(15, 31, 7), "@builder also add dark mode while you're in there"),
  termsV1: receipt(RIYA, '81z6yrrmqcvamg6r8kshgx', t(15, 34, 22), 'Terms DRF-001: +3 days, +$600'),
  acceptV1: receipt(RIYA, 'qeevjlvv7dn3ffym2eehna', t(15, 34, 51), 'Accept DRF-001 v1'),
  termsV2: receipt(RIYA, 'fvisyvgn1eu6npstu0bakq', t(15, 37, 15), 'Terms DRF-001: +2 days, +$400'),
  riyaAccept: receipt(RIYA, 'xuvnyfgj9jgxt78rbrm4ap', t(15, 38, 40), 'Accept DRF-001 v2'),
  danaConditional: receipt(DANA, 'kjf6zwopyxvt99zf8uhdqe', t(15, 41, 3), 'I accept if it ships by Friday'),
  danaAccept: receipt(DANA, 'xgwrvsupelj0zyxjlbezgm', t(15, 42, 26), 'Accept DRF-001 v2'),
};

const RIYA_V1 = approval(MESSAGES.acceptV1, RIYA, 1, HASH_V1);
const RIYA_V2 = approval(MESSAGES.riyaAccept, RIYA, 2, HASH_V2);
const DANA_V2 = approval(MESSAGES.danaAccept, DANA, 2, HASH_V2);

const V1: DraftVersion = {
  version: 1,
  scope: 'Add dark mode',
  terms: '+3 days, +$600',
  termsHash: HASH_V1,
  proposal: MESSAGES.termsV1,
  approvals: { developer: RIYA_V1 },
  supersededAt: t(15, 37, 15),
};

const REFUSAL: Refusal = { id: 'REF-001', receipt: MESSAGES.bypass, target: 'builder', draftId: 'DRF-001', at: t(15, 31, 8) };

function audit(seq: number, kind: AuditEvent['kind'], at: number, actor: Party | null, ref: string | null, summary: string): AuditEvent {
  return { seq, kind, at, actor: actor?.label ?? null, ref, summary };
}

const AUDIT: AuditEvent[] = [
  audit(1, 'enrolled', t(15, 2, 11), RIYA, null, 'Riya enrolled as developer'),
  audit(2, 'enrolled', t(15, 3, 40), DANA, null, 'Dana enrolled as client'),
  audit(3, 'refused_bypass', t(15, 31, 8), DANA, 'REF-001', 'Dana addressed @builder directly; Switch refused it (REF-001)'),
  audit(4, 'draft_created', t(15, 31, 8), DANA, 'DRF-001', 'DRF-001 opened from Dana’s request: Add dark mode (needs terms)'),
  audit(5, 'terms_set', t(15, 34, 22), RIYA, 'DRF-001', 'Riya set terms on DRF-001 v1: +3 days, +$600'),
  audit(6, 'accepted', t(15, 34, 51), RIYA, 'DRF-001', 'Riya accepted DRF-001 v1'),
  audit(7, 'revised', t(15, 37, 15), RIYA, 'DRF-001', 'Riya revised DRF-001 to v2: +2 days, +$400; approvals cleared'),
  audit(8, 'accepted', t(15, 38, 40), RIYA, 'DRF-001', 'Riya accepted DRF-001 v2'),
  audit(9, 'ignored_approval', t(15, 41, 3), DANA, 'DRF-001', 'Not recorded: Dana’s “I accept if it ships by Friday” is conditional'),
  audit(10, 'accepted', t(15, 42, 26), DANA, 'DRF-001', 'Dana accepted DRF-001 v2'),
  audit(11, 'locked', t(15, 42, 26), null, 'AGR-001', 'AGR-001 locked from DRF-001 v2 (hash 46aefd76da)'),
  audit(12, 'handoff_sent', t(15, 42, 27), null, 'AGR-001', 'Start authorization for JOB-AGR-001-1 sent to @builder'),
  audit(13, 'execution_update', t(15, 42, 31), null, 'AGR-001', 'JOB-AGR-001-1 running with Claude Code'),
  audit(14, 'execution_update', t(15, 45, 5), null, 'AGR-001', 'JOB-AGR-001-1 completed: 2 files changed, typecheck and build passed'),
];

function chat(timestamp: number, senderName: string, body: string, fromAgent = false): ChatEvent {
  return { messageId: `chat-${timestamp}-${senderName}`, senderName, body, timestamp, fromAgent };
}

const CHAT: ChatEvent[] = [
  chat(t(15, 29, 48), 'Dana', 'The pricing table looks great. Nearly there!'),
  chat(MESSAGES.bypass.timestamp, 'Dana', MESSAGES.bypass.text),
  chat(
    t(15, 31, 7, 400),
    'builder',
    "You're not permitted to direct messages to me in this room. My operator has restricted who can address me here.",
    true,
  ),
  chat(
    t(15, 31, 8),
    'said',
    'Logged as **DRF-001 v0 · Add dark mode** (needs terms). @builder only starts on scope both of you accept. Nothing has started. Riya, set terms with `Terms DRF-001: <time and price>`.',
    true,
  ),
  chat(MESSAGES.termsV1.timestamp, 'Riya', MESSAGES.termsV1.text),
  chat(t(15, 34, 23), 'said', '**DRF-001 v1 · Add dark mode**. Terms: +3 days, +$600 · hash `da1e311f88`. Accept with `Accept DRF-001 v1`.', true),
  chat(MESSAGES.acceptV1.timestamp, 'Riya', MESSAGES.acceptV1.text),
  chat(t(15, 36, 2), 'Dana', 'Could we do +2 days, +$400? It’s a small site.'),
  chat(MESSAGES.termsV2.timestamp, 'Riya', MESSAGES.termsV2.text),
  chat(t(15, 37, 16), 'said', '**DRF-001 v2 · Add dark mode**. Terms: +2 days, +$400 · hash `46aefd76da`. v1 approvals cleared. Accept with `Accept DRF-001 v2`.', true),
  chat(MESSAGES.riyaAccept.timestamp, 'Riya', MESSAGES.riyaAccept.text),
  chat(t(15, 38, 41), 'said', 'Recorded **Riya**’s acceptance of **DRF-001 v2** at 2026-11-04 15:38:40 UTC. Waiting on **Dana**. Nothing has started.', true),
  chat(MESSAGES.danaConditional.timestamp, 'Dana', MESSAGES.danaConditional.text),
  chat(t(15, 41, 4), 'said', 'Not recorded. A conditional acceptance does not count. To accept, send `Accept DRF-001 v2`.', true),
  chat(MESSAGES.danaAccept.timestamp, 'Dana', MESSAGES.danaAccept.text),
  chat(t(15, 42, 27), 'said', '🔒 **AGR-001 locked.** Both accepted **DRF-001 v2** (hash `46aefd76da`). Riya 15:38:40 · Dana 15:42:26 UTC. Handing off to @builder.', true),
  chat(t(15, 42, 31), 'builder', 'Verified AGR-001. Running Claude Code in an isolated worktree.', true),
  chat(t(15, 45, 5), 'said', '**AGR-001 completed**, commit `2d92f3d` · 2 files · typecheck and build passed.', true),
];

function log(at: number, stream: LogStream, line: string): LogEvent {
  return { jobId: JOB_ID, stream, line, at };
}

const LOGS: LogEvent[] = [
  log(t(15, 42, 28, 120), 'system', `Start token for AGR-001 verified (said key ${KEY_ID})`),
  log(t(15, 42, 28, 300), 'system', 'Signed ledger rev 10 verified · DRF-001 v2 LOCKED · Riya + Dana on hash 46aefd76da'),
  log(t(15, 42, 28, 410), 'system', 'git worktree add work/jobs/JOB-AGR-001-1 -b said/JOB-AGR-001-1 9506780'),
  log(t(15, 42, 29, 620), 'system', 'Linked node_modules from the base checkout'),
  log(t(15, 42, 30, 40), 'system', 'Starting Claude Code · tools: Read, Edit, Write, Glob, Grep · no shell · max 40 turns'),
  log(t(15, 42, 33, 500), 'worker', 'Reading src/App.tsx'),
  log(t(15, 42, 35, 100), 'worker', 'Reading src/styles.css'),
  log(t(15, 42, 41, 800), 'worker', 'Every color already comes from a token on :root, so dark mode can be a token swap.'),
  log(t(15, 42, 47, 200), 'worker', 'Plan: theme toggle in the nav slot, choice saved in localStorage, data-theme="dark" on <html>.'),
  log(t(15, 42, 58, 600), 'worker', 'Editing src/App.tsx. ThemeToggle button with aria-pressed in the nav'),
  log(t(15, 43, 12, 900), 'worker', 'Editing src/styles.css. Dark tokens for hero, pricing, cards, form and footer'),
  log(t(15, 43, 49), 'worker', 'Editing src/styles.css. Focus ring and contrast tuned for dark surfaces'),
  log(t(15, 44, 31), 'worker', 'Reading src/App.tsx to confirm the toggle is keyboard operable'),
  log(t(15, 44, 58, 200), 'worker', 'Done in 23 turns · 2 files edited'),
  log(t(15, 44, 58, 310), 'system', 'Changed paths: src/App.tsx, src/styles.css. Inside the allowlist, no symlinks or binaries'),
  log(t(15, 44, 58, 390), 'check', '$ npm run typecheck'),
  log(t(15, 44, 58, 600), 'check', '> tsc --noEmit -p tsconfig.json'),
  log(t(15, 45, 2, 300), 'check', 'typecheck passed in 3.9 s'),
  log(t(15, 45, 2, 310), 'check', '$ npm run build'),
  log(t(15, 45, 2, 900), 'check', 'vite v8.3.5 building client environment for production...'),
  log(t(15, 45, 3, 600), 'check', '✓ 34 modules transformed.'),
  log(t(15, 45, 3, 800), 'check', 'dist/assets/index-C1x9QeLm.css    7.12 kB │ gzip:  2.06 kB'),
  log(t(15, 45, 3, 850), 'check', 'dist/assets/index-BvA2k8sT.js   196.40 kB │ gzip: 61.88 kB'),
  log(t(15, 45, 3, 900), 'check', '✓ built in 642ms'),
  log(t(15, 45, 3, 950), 'system', 'Ledger re-checked: AGR-001 still LOCKED · base HEAD still 9506780'),
  log(t(15, 45, 4, 200), 'system', 'git merge --ff-only said/JOB-AGR-001-1 → 2d92f3d'),
  log(t(15, 45, 4, 350), 'system', 'Receipt signed (bld-ed25519-2c91) and sent to @said'),
];

function step(key: JobStep['key'], state: JobStep['state'], startedAt: number | null, finishedAt: number | null, detail: string | null): JobStep {
  return { key, state, startedAt, finishedAt, detail };
}

function jobAt(index: number): JobView[] {
  if (index < 4) return [];
  const done = index >= 5;
  return [
    {
      jobId: JOB_ID,
      agreementId: 'AGR-001',
      status: done ? 'COMPLETED' : 'RUNNING',
      worker: 'claude',
      steps: [
        step('authorized', 'passed', t(15, 42, 28, 120), t(15, 42, 28, 410), 'Start token, signed ledger rev 10 and both approvals verified'),
        step('worktree', 'passed', t(15, 42, 28, 410), t(15, 42, 29, 620), 'said/JOB-AGR-001-1 at 9506780'),
        done
          ? step('worker', 'passed', t(15, 42, 30, 40), t(15, 44, 58, 200), '23 turns · 2 files edited')
          : step('worker', 'running', t(15, 42, 30, 40), null, 'Editing src/styles.css'),
        done
          ? step('paths', 'passed', t(15, 44, 58, 200), t(15, 44, 58, 310), '2 files, all inside the allowlist')
          : step('paths', 'pending', null, null, null),
        done
          ? step('typecheck', 'passed', t(15, 44, 58, 390), t(15, 45, 2, 300), 'tsc --noEmit · 0 errors')
          : step('typecheck', 'pending', null, null, null),
        done
          ? step('build', 'passed', t(15, 45, 2, 310), t(15, 45, 3, 900), 'vite build · built in 642 ms')
          : step('build', 'pending', null, null, null),
        done
          ? step('applied', 'passed', t(15, 45, 3, 950), t(15, 45, 4, 200), 'Fast-forwarded main to 2d92f3d')
          : step('applied', 'pending', null, null, null),
        done
          ? step('receipt', 'passed', t(15, 45, 4, 200), t(15, 45, 4, 350), 'Signed with bld-ed25519-2c91, sent to @said')
          : step('receipt', 'pending', null, null, null),
      ],
      baseCommit: BASE_COMMIT,
      resultCommit: done ? RESULT_COMMIT : null,
      changedPaths: done ? ['src/App.tsx', 'src/styles.css'] : [],
      error: null,
      startedAt: t(15, 42, 28, 120),
      finishedAt: done ? t(15, 45, 4, 350) : null,
    },
  ];
}

function executionAt(index: number): Execution | null {
  if (index < 3) return null;
  const base: Execution = {
    jobId: JOB_ID,
    status: 'READY',
    worker: null,
    baseCommit: null,
    resultCommit: null,
    changedPaths: [],
    checks: [],
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  if (index === 3) return base;
  const running: Execution = { ...base, status: 'RUNNING', worker: 'claude', baseCommit: BASE_COMMIT, startedAt: t(15, 42, 28, 120) };
  if (index === 4) return running;
  return {
    ...running,
    status: 'COMPLETED',
    resultCommit: RESULT_COMMIT,
    changedPaths: ['src/App.tsx', 'src/styles.css'],
    checks: [
      { name: 'paths', ok: true, durationMs: 110, detail: '2 files, all inside the allowlist' },
      { name: 'typecheck', ok: true, durationMs: 3_910, detail: 'tsc --noEmit · 0 errors' },
      { name: 'build', ok: true, durationMs: 1_590, detail: 'vite build · built in 642 ms' },
    ],
    finishedAt: t(15, 45, 4, 350),
  };
}

function draftAt(index: number): Draft {
  const base = {
    id: 'DRF-001',
    scope: 'Add dark mode',
    request: MESSAGES.bypass,
    rejectedBy: null,
    createdAt: t(15, 31, 8),
  };
  if (index === 0) {
    return {
      ...base,
      version: 0,
      terms: null,
      termsHash: HASH_V0,
      status: 'NEEDS_TERMS',
      proposal: MESSAGES.bypass,
      approvals: {},
      history: [],
      agreementId: null,
      updatedAt: t(15, 31, 8),
    };
  }
  const approvals: Draft['approvals'] = index === 1 ? {} : index === 2 ? { developer: RIYA_V2 } : { developer: RIYA_V2, client: DANA_V2 };
  const locked = index >= 3;
  return {
    ...base,
    version: 2,
    terms: '+2 days, +$400',
    termsHash: HASH_V2,
    status: locked ? 'LOCKED' : 'PENDING',
    proposal: MESSAGES.termsV2,
    approvals,
    history: [V1],
    agreementId: locked ? 'AGR-001' : null,
    updatedAt: locked ? DANA_V2.timestamp : index === 2 ? RIYA_V2.timestamp : MESSAGES.termsV2.timestamp,
  };
}

function agreementsAt(index: number): Agreement[] {
  if (index < 3) return [];
  return [
    {
      id: 'AGR-001',
      draftId: 'DRF-001',
      version: 2,
      scope: 'Add dark mode',
      terms: '+2 days, +$400',
      termsHash: HASH_V2,
      approvals: { developer: RIYA_V2, client: DANA_V2 },
      lockedAt: DANA_V2.timestamp,
      execution: executionAt(index),
    },
  ];
}

function ledgerAt(index: number, clock: number): Ledger {
  const audit = AUDIT.filter((e) => e.at <= clock);
  const processed = Object.values(MESSAGES)
    .filter((m) => m.timestamp <= clock)
    .map((m) => m.messageId);
  return {
    schema: 'said.ledger/v1',
    deploymentId: 'said-larkspur-01',
    roomId: ROOM_ID,
    mode: 'business',
    parties: [RIYA, DANA],
    revision: REVISIONS[index] ?? 12,
    updatedAt: audit.at(-1)?.at ?? clock,
    nextDraftSeq: 2,
    nextAgreementSeq: index >= 3 ? 2 : 1,
    nextRefusalSeq: 2,
    drafts: [draftAt(index)],
    agreements: agreementsAt(index),
    refusals: [REFUSAL],
    audit,
    processedMessageIds: processed,
  };
}

/** `step` is 1-based, matching the player keys. */
export function darkModeFixture(step: number, mode: NotaryMode): ConsoleData {
  const index = Math.min(Math.max(step, 1), FIXTURE_STEPS.length) - 1;
  const clock = CLOCKS[index] ?? CLOCKS[5];
  const jobs = jobAt(index);
  return {
    source: 'fixture',
    notaryUrl: 'fixture',
    builderUrl: 'fixture',
    notaryLink: 'open',
    builderLink: 'open',
    state: {
      mode,
      switch: { url: mode === 'live' ? 'http://localhost:8000' : 'http://localhost:7500', connected: true, version: mode === 'live' ? '0.31.0' : null },
      room: { id: ROOM_ID, name: 'Larkspur Coffee Co. landing page' },
      notaryPublicKey: '',
      keyId: KEY_ID,
      signedLedger: { payload: ledgerAt(index, clock), digest: '', keyId: KEY_ID, signature: '' },
      ledgerDocumentId: DOCUMENT_ID,
    },
    ledgerIssue: null,
    jobs,
    logs: jobs.length > 0 ? { [JOB_ID]: LOGS.filter((l) => l.at <= clock) } : {},
    chat: CHAT.filter((c) => c.timestamp <= clock),
    clock,
  };
}

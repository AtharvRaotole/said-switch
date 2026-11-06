import { DEMO_SWITCH_URL, PRIVATE_TELEGRAM_ROOM_ID } from './constants.js';

export { PRIVATE_TELEGRAM_ROOM_ID } from './constants.js';

export type DraftStatus = 'NEEDS_TERMS' | 'PENDING' | 'LOCKED' | 'REJECTED';
export type WorkStatus = 'READY' | 'RUNNING' | 'VALIDATING' | 'COMPLETED' | 'FAILED';

export interface WitnessDraft {
  id: string;
  version: number;
  scope: string;
  terms: string | null;
  status: DraftStatus;
}

export interface WitnessAcceptance {
  draftId: string;
  version: number;
  developer: boolean;
  client: boolean;
}

export interface WitnessLock {
  agreementId: string;
  draftId: string;
  version: number;
  terms: string;
}

export interface WitnessCheck {
  name: string;
  ok: boolean;
}

export interface WitnessWork {
  jobId: string;
  status: WorkStatus;
  worker: 'scripted';
  resultCommit: string | null;
  checks: WitnessCheck[];
}

/** Public document. Every field here is allowed on the wire. */
export interface WitnessView {
  access: 'read-only';
  label: 'Read only';
  writes: false;
  live: boolean;
  source: 'switch' | 'offline';
  worker: 'scripted' | null;
  /** When the gateway last received a reply from the demo notary. */
  heartbeatAt: string | null;
  /** Ledger update time. Absent until the demo room records an event. */
  lastEventAt: string | null;
  reason: string | null;
  switchVersion: string | null;
  roomName: string | null;
  drafts: WitnessDraft[];
  acceptances: WitnessAcceptance[];
  lock: WitnessLock | null;
  work: WitnessWork | null;
}

const DRAFT_STATUS = new Set<DraftStatus>(['NEEDS_TERMS', 'PENDING', 'LOCKED', 'REJECTED']);
const WORK_STATUS = new Set<WorkStatus>(['READY', 'RUNNING', 'VALIDATING', 'COMPLETED', 'FAILED']);
const PRIVATE_TEXT = /@switch-|said-start|said-receipt|BEGIN [A-Z ]*PRIVATE|enroll\s+[A-Za-z0-9]{4,8}/i;

export function emptyView(now: string | null, reason: string): WitnessView {
  return {
    access: 'read-only',
    label: 'Read only',
    writes: false,
    live: false,
    source: 'offline',
    worker: null,
    heartbeatAt: now,
    lastEventAt: null,
    reason,
    switchVersion: null,
    roomName: null,
    drafts: [],
    acceptances: [],
    lock: null,
    work: null,
  };
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean || PRIVATE_TEXT.test(clean) || clean.includes(PRIVATE_TELEGRAM_ROOM_ID)) return null;
  return clean.slice(0, max);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Project a notary `/api/state` body into the public whitelist.
 * A mock, a reserved Switch port, the private Telegram room, a model worker,
 * or an unreadable body becomes an offline view with no ledger fields.
 */
export function projectWitness(state: unknown, input: { now: string; demoRoomId: string }): WitnessView {
  const now = input.now;
  const body = record(state);
  if (!body) return emptyView(null, 'Demo source is not ready');
  if (body.mode !== 'live') return emptyView(now, 'Source is not a live Switch');

  const sw = record(body.switch);
  const room = record(body.room);
  if (!sw || sw.connected !== true) return emptyView(now, 'Switch is not connected');
  if (sw.url !== DEMO_SWITCH_URL) return emptyView(now, 'Source is not the demo Switch');

  const roomId = typeof room?.id === 'string' ? room.id : '';
  if (!roomId || roomId !== input.demoRoomId) return emptyView(now, 'Source room does not match the demo');
  if (roomId === PRIVATE_TELEGRAM_ROOM_ID) return emptyView(now, 'Refusing the private room');
  if (body.halted) return emptyView(now, 'Said has stopped authorizing');

  const signed = record(body.signedLedger);
  const ledger = signed ? record(signed.payload) : null;
  const built = ledger ? projectLedger(ledger, now, sw.version, room?.name) : liveShell(now, sw.version, room?.name);
  if (!built) return emptyView(now, 'Demo worker must be scripted');
  if (JSON.stringify(built).includes(PRIVATE_TELEGRAM_ROOM_ID) || PRIVATE_TEXT.test(JSON.stringify(built))) {
    return emptyView(now, 'Source contained private fields');
  }
  return built;
}

function liveShell(now: string, version: unknown, name: unknown): WitnessView {
  return {
    access: 'read-only',
    label: 'Read only',
    writes: false,
    live: true,
    source: 'switch',
    worker: null,
    heartbeatAt: now,
    lastEventAt: null,
    reason: null,
    switchVersion: text(version, 40),
    roomName: text(name, 80),
    drafts: [],
    acceptances: [],
    lock: null,
    work: null,
  };
}

function projectLedger(ledger: Record<string, unknown>, now: string, version: unknown, name: unknown): WitnessView | null {
  const draftsIn = Array.isArray(ledger.drafts) ? ledger.drafts : [];
  const agreementsIn = Array.isArray(ledger.agreements) ? ledger.agreements : [];
  const drafts: WitnessDraft[] = [];
  const acceptances: WitnessAcceptance[] = [];

  for (const item of draftsIn) {
    const draft = record(item);
    if (!draft || typeof draft.id !== 'string' || !DRAFT_STATUS.has(draft.status as DraftStatus)) continue;
    if (typeof draft.version !== 'number') continue;
    const scope = text(draft.scope, 180);
    if (!scope) continue;
    const terms = draft.terms === null ? null : text(draft.terms, 80);
    if (draft.terms !== null && terms === null) continue;
    drafts.push({ id: draft.id, version: draft.version, scope, terms, status: draft.status as DraftStatus });
    const approvals = record(draft.approvals) ?? {};
    acceptances.push({
      draftId: draft.id,
      version: draft.version,
      developer: record(approvals.developer) !== null,
      client: record(approvals.client) !== null,
    });
  }

  let lock: WitnessLock | null = null;
  let work: WitnessWork | null = null;
  for (const item of agreementsIn) {
    const agreement = record(item);
    if (!agreement || typeof agreement.id !== 'string' || typeof agreement.draftId !== 'string') continue;
    if (typeof agreement.version !== 'number') continue;
    const terms = text(agreement.terms, 80);
    if (!terms) continue;
    if (!lock) lock = { agreementId: agreement.id, draftId: agreement.draftId, version: agreement.version, terms };
    const execution = record(agreement.execution);
    if (!execution || work) continue;
    if (execution.worker == null) continue;
    if (execution.worker !== 'scripted') return null;
    if (typeof execution.jobId !== 'string' || !WORK_STATUS.has(execution.status as WorkStatus)) continue;
    const commit = typeof execution.resultCommit === 'string' && /^[0-9a-f]{7,40}$/.test(execution.resultCommit)
      ? execution.resultCommit.slice(0, 7)
      : null;
    const checks: WitnessCheck[] = [];
    if (Array.isArray(execution.checks)) {
      for (const check of execution.checks) {
        const row = record(check);
        const checkName = row ? text(row.name, 40) : null;
        if (!row || !checkName || typeof row.ok !== 'boolean') continue;
        checks.push({ name: checkName, ok: row.ok });
      }
    }
    work = { jobId: execution.jobId, status: execution.status as WorkStatus, worker: 'scripted', resultCommit: commit, checks };
  }

  const updated = typeof ledger.updatedAt === 'number' && Number.isFinite(ledger.updatedAt) ? new Date(ledger.updatedAt).toISOString() : null;
  return {
    access: 'read-only',
    label: 'Read only',
    writes: false,
    live: true,
    source: 'switch',
    worker: work ? 'scripted' : null,
    heartbeatAt: now,
    lastEventAt: updated,
    reason: null,
    switchVersion: text(version, 40),
    roomName: text(name, 80),
    drafts,
    acceptances,
    lock,
    work,
  };
}

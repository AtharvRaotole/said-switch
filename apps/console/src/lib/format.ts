import type { Role, WorkerKind } from '@said/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** `15:42:13` in UTC, matching the timestamps Said quotes in the room. */
export function clockUtc(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** `2026-11-04 15:42:13 UTC` */
export function dateTimeUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${clockUtc(ms)} UTC`;
}

export function duration(ms: number): string {
  if (ms < 0) return '0 s';
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return seconds === 0 ? `${minutes} m` : `${minutes} m ${seconds} s`;
}

export function shortHash(hash: string, length = 10): string {
  return hash.slice(0, length);
}

export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : 'none';
}

/** `@switch-user-dana02:switch.local` → `@switch-user-dana02…` */
export function shortParticipant(id: string, max = 20): string {
  const local = id.split(':')[0] ?? id;
  const cut = local.length > max ? local.slice(0, max) : local;
  return cut.length < id.length ? `${cut}…` : cut;
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Mattermost Markdown from Said's replies, flattened for a one-line ticker. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROLE_LABELS: Record<Role, string> = {
  developer: 'Developer',
  client: 'Client',
  partnerA: 'Partner A',
  partnerB: 'Partner B',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

const WORKER_LABELS: Record<WorkerKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  scripted: 'Scripted worker (no AI)',
};

export function workerLabel(worker: WorkerKind | null): string {
  return worker ? WORKER_LABELS[worker] : 'Claude Code | Codex';
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

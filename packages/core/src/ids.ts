const pad = (seq: number) => String(seq).padStart(3, '0');

export function formatDraftId(seq: number): string {
  return `DRF-${pad(seq)}`;
}

export function formatAgreementId(seq: number): string {
  return `AGR-${pad(seq)}`;
}

export function formatRefusalId(seq: number): string {
  return `REF-${pad(seq)}`;
}

/** Regex source for a draft reference inside free text (`DRF-001`, `drf-1`, `DRF1`, `drf 1`). */
export const DRAFT_REF_SOURCE = String.raw`\bdrf[\s-]*\d{1,6}\b`;

export function normalizeDraftRef(ref: string): string | null {
  const m = /^\s*drf[\s-]*(\d{1,6})\s*$/i.exec(ref);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return n >= 1 ? formatDraftId(n) : null;
}

export function jobIdFor(agreementId: string, attempt: number): string {
  return `JOB-${agreementId}-${attempt}`;
}

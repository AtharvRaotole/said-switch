import type { DraftStatus, ExecutionStatus } from '@said/core';

const BASE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-2 py-[3px] font-sans text-[11px] font-semibold uppercase leading-none tracking-[0.14em]';

const DRAFT: Record<DraftStatus, { label: string; className: string }> = {
  NEEDS_TERMS: { label: 'Needs terms', className: 'border-dashed border-ink-3 text-ink-2' },
  PENDING: { label: 'Pending', className: 'border-await-line bg-await-wash text-await' },
  LOCKED: { label: 'Locked', className: 'border-wax bg-wax text-bond' },
  REJECTED: { label: 'Rejected', className: 'border-fail/50 bg-fail-wash text-fail' },
};

export function DraftStatusPill({ status }: { status: DraftStatus }) {
  const { label, className } = DRAFT[status];
  return <span className={`${BASE} ${className}`}>{label}</span>;
}

const EXECUTION: Record<ExecutionStatus, { label: string; className: string; live?: boolean }> = {
  READY: { label: 'Handed off', className: 'border-ink-3 text-ink-2' },
  RUNNING: { label: 'Running', className: 'border-ink bg-ink text-bond', live: true },
  VALIDATING: { label: 'Validating', className: 'border-ink bg-ink text-bond', live: true },
  COMPLETED: { label: 'Completed', className: 'border-agree bg-agree text-bond' },
  FAILED: { label: 'Failed', className: 'border-fail bg-fail text-bond' },
};

export function ExecutionStatusPill({ status }: { status: ExecutionStatus | null }) {
  if (!status) return <span className={`${BASE} border-dashed border-rule-strong text-ink-3`}>Not started</span>;
  const { label, className, live } = EXECUTION[status];
  return (
    <span className={`${BASE} ${className}`}>
      {live && <span aria-hidden className="size-1.5 rounded-full bg-night-system animate-live" />}
      {label}
    </span>
  );
}

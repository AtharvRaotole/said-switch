import type { LinkStatus } from '../api/types';

const LINK: Record<LinkStatus, { text: string; dot: string }> = {
  connecting: { text: 'connecting', dot: 'bg-ink-4 animate-live' },
  open: { text: 'connected', dot: 'bg-agree' },
  reconnecting: { text: 'reconnecting…', dot: 'bg-await-line animate-live' },
  unreachable: { text: 'unreachable', dot: 'bg-fail' },
};

/** Quiet status dot for one backing service; `override` replaces the status text (e.g. fixture). */
export function LinkIndicator({ name, status, override }: { name: string; status: LinkStatus; override?: string }) {
  const { text, dot } = LINK[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3" title={`${name}: ${override ?? text}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${override ? 'bg-ink-4' : dot}`} />
      <span className="font-semibold text-ink-2">{name}</span>
      <span>{override ?? text}</span>
    </span>
  );
}

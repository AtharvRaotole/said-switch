import { useLayoutEffect, useRef } from 'react';
import type { LogEvent, LogStream } from '../api/types';
import { clockUtc } from '../lib/format';

const STREAM_STYLE: Record<LogStream, { tag: string; text: string }> = {
  worker: { tag: 'text-night-text/70', text: 'text-night-text' },
  check: { tag: 'text-night-check/80', text: 'text-night-check' },
  system: { tag: 'text-night-system/80', text: 'text-night-system/95' },
};

interface LogPanelProps {
  lines: LogEvent[];
  streaming: boolean;
  title: string;
  empty: string;
}

/** The console's only dark surface: worker and check output, newest at the bottom. */
export function LogPanel({ lines, streaming, title, empty }: LogPanelProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  return (
    <div className="overflow-hidden rounded-[6px] bg-night text-night-text shadow-[0_18px_40px_-28px_rgba(18,26,44,0.8)]">
      <div className="flex items-center justify-between gap-3 border-b border-night-rule px-4 py-2.5">
        <span className="eyebrow text-night-dim">{title}</span>
        <span className="flex items-center gap-3 font-mono text-[11px] text-night-dim">
          {(['worker', 'check', 'system'] as const).map((s) => (
            <span key={s} className={STREAM_STYLE[s].tag}>
              {s}
            </span>
          ))}
          {streaming && (
            <span className="flex items-center gap-1.5 text-night-system">
              <span aria-hidden className="size-1.5 rounded-full bg-night-system animate-live" />
              streaming
            </span>
          )}
        </span>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-live="off"
        className="max-h-[300px] min-h-[132px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.65] xl:max-h-[340px]"
      >
        {lines.length === 0 ? (
          <p className="text-night-dim">{empty}</p>
        ) : (
          lines.map((line, i) => (
            <div key={`${line.at}-${i}`} className="grid grid-cols-[62px_50px_minmax(0,1fr)] gap-x-2">
              <span className="tabular-nums text-night-dim/80">{clockUtc(line.at)}</span>
              <span className={STREAM_STYLE[line.stream].tag}>{line.stream}</span>
              <span className={`whitespace-pre-wrap break-words ${STREAM_STYLE[line.stream].text}`}>{line.line}</span>
            </div>
          ))
        )}
        {streaming && <span aria-hidden className="ml-[128px] inline-block h-[13px] w-[7px] translate-y-[2px] bg-night-text/80 animate-caret" />}
      </div>
    </div>
  );
}

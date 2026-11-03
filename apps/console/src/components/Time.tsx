import { clockUtc, dateTimeUtc } from '../lib/format';

/** UTC clock time with the full date on hover, matching Said's room replies. */
export function Time({ ms, suffix = true, className = '' }: { ms: number; suffix?: boolean; className?: string }) {
  return (
    <time className={`tabular-nums ${className}`} dateTime={new Date(ms).toISOString()} title={dateTimeUtc(ms)}>
      {clockUtc(ms)}
      {suffix && ' UTC'}
    </time>
  );
}

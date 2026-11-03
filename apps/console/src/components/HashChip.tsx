import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { shortHash } from '../lib/format';

/** Shows the first 10 hex characters; copies the full hash. */
export function HashChip({ hash, what = 'terms hash' }: { hash: string; what?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard
      ?.writeText(hash)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`${hash}\nClick to copy the full ${what}`}
      aria-label={`Copy full ${what} ${hash}`}
      className="group inline-flex items-center gap-1.5 rounded-[3px] border border-rule bg-paper/70 px-1.5 py-[3px] font-mono text-[12.5px] leading-none text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
    >
      <span className="tracking-[0.02em]">{shortHash(hash)}</span>
      {copied ? (
        <Check aria-hidden className="size-3.5 text-agree" strokeWidth={2.5} />
      ) : (
        <Copy aria-hidden className="size-3.5 text-ink-4 transition-colors group-hover:text-ink-2" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}

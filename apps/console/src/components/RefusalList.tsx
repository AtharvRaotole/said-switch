import type { Ledger } from '@said/core';
import { Ban } from 'lucide-react';
import { partyLabel } from '../lib/parties';
import { SectionHeader } from './SectionHeader';
import { Time } from './Time';

/** Cuts at a word boundary: "also add dark mode while…" → "also add dark mode…". */
function excerpt(text: string, target: string, max = 22): string {
  const mention = new RegExp(`^\\s*@${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,:]*`, 'i');
  const body = text.replace(mention, '').replace(/\s+/g, ' ').trim();
  if (body.length <= max) return body;
  const cut = body.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 8 ? cut.slice(0, space) : body.slice(0, max)).replace(/[\s,.;:]+$/, '')}…`;
}

export function RefusalList({ ledger }: { ledger: Ledger }) {
  const refusals = [...ledger.refusals].sort((a, b) => b.at - a.at);
  return (
    <section aria-labelledby="refusals-title">
      <SectionHeader id="refusals-title" title="Blocked attempts" meta="requests sent around Said" />
      {refusals.length === 0 ? (
        <p className="text-[13px] text-ink-3">None. Nobody has tried to command the builder directly.</p>
      ) : (
        <ul className="space-y-2">
          {refusals.map((r) => {
            const name = partyLabel(ledger.parties, r.receipt.role, r.receipt.senderName);
            const enrolled = r.receipt.role !== null;
            return (
              <li key={r.id} className="flex gap-3 rounded-[5px] border border-rule bg-bond/70 px-4 py-3">
                <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-wax" strokeWidth={2.2} />
                <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-2">
                  <p>
                    <span className="font-semibold text-ink">{name}</span>
                    {!enrolled && <span className="text-ink-3"> (not enrolled)</span>} <span aria-label="to">→</span>{' '}
                    <span className="font-mono text-[12.5px]">@{r.target}</span>:{' '}
                    <q className="font-display italic text-ink" title={r.receipt.text}>
                      {excerpt(r.receipt.text, r.target)}
                    </q>{' '}
                    refused by Switch addressing;{' '}
                    {r.draftId ? (
                      <>
                        logged as <span className="font-mono text-[12.5px] font-semibold text-ink">{r.draftId}</span>
                      </>
                    ) : (
                      'logged, no draft opened'
                    )}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-3">
                    <span className="font-mono">{r.id}</span> · <Time ms={r.at} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

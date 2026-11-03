import type { Ledger } from '@said/core';
import { AnimatePresence } from 'motion/react';
import { plural } from '../lib/format';
import type { TamperChange } from '../lib/tamper';
import { DraftCard } from './DraftCard';
import { SectionHeader } from './SectionHeader';

export function DraftList({ ledger, tamper }: { ledger: Ledger; tamper: TamperChange | null }) {
  const drafts = [...ledger.drafts].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const pending = drafts.filter((d) => d.status === 'PENDING' || d.status === 'NEEDS_TERMS').length;

  return (
    <section aria-labelledby="drafts-title">
      <SectionHeader
        id="drafts-title"
        title="Drafts and agreements"
        meta={
          <>
            {plural(drafts.length, 'draft')} · {plural(ledger.agreements.length, 'agreement')}
            {pending > 0 && <> · {pending} open</>}
          </>
        }
      />
      {drafts.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-rule-strong px-6 py-10 text-center">
          <p className="font-display text-[22px] text-ink">No drafts yet</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14px] text-ink-3">
            Any request in the room, even one sent straight to @builder, becomes a numbered draft here. Work starts only after both
            parties accept the same version.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence initial={false}>
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                parties={ledger.parties}
                mode={ledger.mode}
                agreement={ledger.agreements.find((a) => a.id === draft.agreementId || a.draftId === draft.id)}
                bypass={ledger.refusals.find((r) => r.draftId === draft.id)}
                tamper={tamper}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

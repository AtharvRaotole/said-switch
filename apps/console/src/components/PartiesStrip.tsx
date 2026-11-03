import type { Party, RoomMode } from '@said/core';
import { KeyRound } from 'lucide-react';
import { roleLabel, shortParticipant } from '../lib/format';
import { orderedParties } from '../lib/parties';

export function PartiesStrip({ parties, mode }: { parties: Party[]; mode: RoomMode }) {
  const ordered = orderedParties(parties);
  const missing = 2 - ordered.length;
  return (
    <section aria-label="Enrolled parties" className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-rule py-4">
      <span className="eyebrow text-ink-3">{mode === 'personal' ? 'Partners' : 'Enrolled parties'}</span>
      <ul className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {ordered.map((p) => (
          <li key={p.senderId} className="flex items-baseline gap-2.5">
            <span className="eyebrow text-ink-3">{roleLabel(p.role)}</span>
            <span className="font-display text-[19px] font-semibold leading-none text-ink">{p.label}</span>
            <code
              className="inline-flex items-center gap-1 rounded-[3px] border border-rule bg-bond/70 px-1.5 py-0.5 font-mono text-[12px] text-ink-2"
              title={p.senderId}
            >
              <KeyRound aria-hidden className="size-3 text-ink-4" />
              {shortParticipant(p.senderId)}
            </code>
          </li>
        ))}
        {missing > 0 && (
          <li className="text-[13px] italic text-await">
            {missing === 2 ? 'No parties enrolled yet' : 'One party still needs to enroll'}. Run <code className="font-mono not-italic">npm run enroll</code>
          </li>
        )}
      </ul>
      <p className="text-[12.5px] italic text-ink-3 xl:ml-auto">Identity = Switch-authenticated participant id, not display name</p>
    </section>
  );
}

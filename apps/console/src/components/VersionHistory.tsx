import type { DraftVersion, Party } from '@said/core';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { clockUtc, dateTimeUtc } from '../lib/format';
import { orderedParties, partyLabel } from '../lib/parties';
import { HashChip } from './HashChip';

export function VersionHistory({ history, parties }: { history: DraftVersion[]; parties: Party[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (history.length === 0) return null;

  const versions = history.map((h) => h.version);
  const span = versions.length === 1 ? `v${versions[0]}` : `v${Math.min(...versions)}-v${Math.max(...versions)}`;
  const cleared = history.some((h) => Object.keys(h.approvals).length > 0);

  return (
    <div className="mt-4 border-t border-rule pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="group inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
      >
        <ChevronRight aria-hidden className={`size-4 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span>
          {span} superseded. {cleared ? 'Approvals cleared' : 'No approvals to clear'}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <ol className="mt-3 space-y-3">
              {[...history].reverse().map((v) => (
                <HistoryEntry key={v.version} version={v} parties={parties} />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryEntry({ version: v, parties }: { version: DraftVersion; parties: Party[] }) {
  const approvals = orderedParties(parties).flatMap((party) => {
    const approval = v.approvals[party.role];
    return approval ? [{ party, approval }] : [];
  });
  return (
    <li className="rounded-[4px] border border-rule bg-paper/50 px-3.5 py-3 text-[13px] text-ink-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[12px] font-semibold text-ink-2">v{v.version}</span>
        <span className="font-display text-[16px] text-ink-2 line-through decoration-ink-4/70">{v.terms ?? 'No terms'}</span>
        <HashChip hash={v.termsHash} />
        <span title={dateTimeUtc(v.supersededAt)}>superseded {clockUtc(v.supersededAt)} UTC</span>
      </div>
      <p className="mt-1.5">
        Set by {partyLabel(parties, v.proposal.role, v.proposal.senderName)}:{' '}
        <q className="font-display italic text-ink-2">{v.proposal.text}</q>
      </p>
      <p className="mt-1">
        {approvals.length === 0
          ? 'No approvals had been recorded.'
          : approvals.map(({ party, approval }) => (
              <span key={party.role} className="mr-3 inline-block">
                <span className="line-through decoration-fail/70">
                  {party.label} accepted v{v.version} at {clockUtc(approval.timestamp)} UTC
                </span>{' '}
                <span className="eyebrow text-fail/80">cleared</span>
              </span>
            ))}
      </p>
    </li>
  );
}

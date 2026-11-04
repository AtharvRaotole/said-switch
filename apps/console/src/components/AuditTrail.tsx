import type { AuditKind, Ledger } from '@said/core';
import {
  Ban,
  Check,
  CircleX,
  FilePlus,
  Hammer,
  Lock,
  MessageSquareOff,
  PenLine,
  RotateCcw,
  ScrollText,
  Send,
  Undo2,
  UserCheck,
  FileDiff,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SectionHeader } from './SectionHeader';
import { Time } from './Time';

const KINDS: Record<AuditKind, { icon: LucideIcon; tone: string; label: string }> = {
  enrolled: { icon: UserCheck, tone: 'text-ink-3', label: 'Enrolled' },
  draft_created: { icon: FilePlus, tone: 'text-ink-2', label: 'Draft created' },
  terms_set: { icon: PenLine, tone: 'text-ink-2', label: 'Terms set' },
  revised: { icon: RotateCcw, tone: 'text-await', label: 'Revised' },
  accepted: { icon: Check, tone: 'text-agree', label: 'Accepted' },
  withdrawn: { icon: Undo2, tone: 'text-await', label: 'Withdrawn' },
  rejected: { icon: CircleX, tone: 'text-fail', label: 'Rejected' },
  locked: { icon: Lock, tone: 'text-wax', label: 'Locked' },
  refused_bypass: { icon: Ban, tone: 'text-wax', label: 'Bypass refused' },
  ignored_approval: { icon: MessageSquareOff, tone: 'text-await', label: 'Not recorded' },
  handoff_sent: { icon: Send, tone: 'text-ink-2', label: 'Handoff' },
  execution_update: { icon: Hammer, tone: 'text-ink-2', label: 'Execution' },
  evidence_served: { icon: ScrollText, tone: 'text-ink-2', label: 'Evidence' },
  amendment_opened: { icon: FileDiff, tone: 'text-await', label: 'Change request' },
  receipt_exported: { icon: BadgeCheck, tone: 'text-ink-2', label: 'Receipt exported' },
};

export function AuditTrail({ ledger }: { ledger: Ledger }) {
  const events = [...ledger.audit].sort((a, b) => b.seq - a.seq);
  return (
    <section aria-labelledby="audit-title">
      <SectionHeader id="audit-title" title="Audit trail" meta={`append-only · ${events.length} events · UTC`} />
      {events.length === 0 ? (
        <p className="text-[13px] text-ink-3">No events yet.</p>
      ) : (
        <ol className={`max-h-[420px] overflow-y-auto pr-1 ${events.length > 9 ? 'scroll-fade' : ''}`}>
          <AnimatePresence initial={false}>
            {events.map((event) => {
              const kind = KINDS[event.kind] ?? KINDS.execution_update;
              const Icon = kind.icon;
              return (
                <motion.li
                  key={event.seq}
                  layout="position"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-[30px_18px_62px_minmax(0,1fr)] items-baseline gap-x-2 border-b border-rule/80 py-2 text-[13px]">
                    <span className="font-mono text-[11px] tabular-nums text-ink-4">#{event.seq}</span>
                    <Icon aria-label={kind.label} className={`size-3.5 translate-y-[2px] ${kind.tone}`} strokeWidth={2.2} />
                    <Time ms={event.at} suffix={false} className="font-mono text-[12px] text-ink-3" />
                    <span className="leading-snug text-ink-2">{event.summary}</span>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

import type { ApprovalReceipt, Draft, Party, Role } from '@said/core';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { clockUtc, dateTimeUtc, roleLabel, shortHash } from '../lib/format';

interface ApprovalSlotProps {
  role: Role;
  party: Party | undefined;
  approval: ApprovalReceipt | undefined;
  draft: Draft;
}

type SlotState = 'accepted' | 'awaiting' | 'no-terms' | 'closed';

function slotState(draft: Draft, approval: ApprovalReceipt | undefined): SlotState {
  if (approval) return 'accepted';
  if (draft.status === 'NEEDS_TERMS') return 'no-terms';
  if (draft.status === 'REJECTED') return 'closed';
  return 'awaiting';
}

export function ApprovalSlot({ role, party, approval, draft }: ApprovalSlotProps) {
  const state = slotState(draft, approval);
  const name = party?.label ?? roleLabel(role);
  return (
    <div className="relative min-h-[148px]">
      <AnimatePresence initial={false} mode="popLayout">
        {state === 'accepted' ? (
          approval && <Accepted key={`a-${approval.messageId}`} role={role} name={name} approval={approval} draft={draft} />
        ) : (
          <Empty key={`e-${state}`} role={role} name={name} state={state} draft={draft} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Accepted({ role, name, approval, draft }: { role: Role; name: string; approval: ApprovalReceipt; draft: Draft }) {
  const reduce = useReducedMotion();
  const bound = approval.version === draft.version && approval.termsHash === draft.termsHash;
  return (
    <motion.figure
      className="relative h-full overflow-hidden rounded-[5px] border border-agree-line bg-agree-wash px-4 pb-3.5 pt-3"
      initial={reduce ? { opacity: 0 } : { clipPath: 'inset(0 100% 0 0)' }}
      animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0 0% 0 0)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-agree/80">{roleLabel(role)}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.02em] text-agree">
          <DrawnCheck animate={!reduce} />
          Accepted
        </span>
      </div>
      <div className="mt-1 font-display text-[23px] leading-tight text-ink">{name}</div>
      <blockquote className="mt-2 font-display text-[17px] italic leading-snug text-ink-2">“{approval.text}”</blockquote>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <time className="tabular-nums" dateTime={new Date(approval.timestamp).toISOString()} title={dateTimeUtc(approval.timestamp)}>
          {clockUtc(approval.timestamp)} UTC
        </time>
        <span className={bound ? '' : 'font-semibold text-fail'}>
          v{approval.version} · <span className="font-mono">{shortHash(approval.termsHash)}</span>
          {!bound && ' · does not match current terms'}
        </span>
      </figcaption>
    </motion.figure>
  );
}

function Empty({ role, name, state, draft }: { role: Role; name: string; state: Exclude<SlotState, 'accepted'>; draft: Draft }) {
  const awaiting = state === 'awaiting';
  return (
    <motion.div
      className={`h-full rounded-[5px] border-2 border-dashed px-4 pb-3.5 pt-3 ${
        awaiting ? 'border-await-line bg-await-wash/40 hatch-await' : 'border-rule-strong/70 bg-transparent'
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <span className={`eyebrow ${awaiting ? 'text-await' : 'text-ink-3'}`}>{roleLabel(role)}</span>
      {awaiting ? (
        <>
          <div className="mt-1 font-display text-[26px] leading-tight text-await">Awaiting {name}</div>
          <p className="mt-2 text-[13px] leading-snug text-ink-2">No approval recorded for v{draft.version}. {name} accepts with</p>
          <code className="mt-1.5 inline-block rounded-[3px] bg-bond/80 px-1.5 py-0.5 font-mono text-[12.5px] text-await ring-1 ring-await-line/50">
            Accept {draft.id} v{draft.version}
          </code>
        </>
      ) : state === 'no-terms' ? (
        <>
          <div className="mt-1 font-display text-[22px] leading-tight text-ink-3">{name} · not yet</div>
          <p className="mt-2 text-[13px] leading-snug text-ink-3">Nobody can accept until terms are set.</p>
        </>
      ) : (
        <>
          <div className="mt-1 font-display text-[22px] leading-tight text-ink-3">{name} · no approval</div>
          <p className="mt-2 text-[13px] leading-snug text-ink-3">The draft was rejected before {name} accepted.</p>
        </>
      )}
    </motion.div>
  );
}

function DrawnCheck({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <circle cx="8" cy="8" r="7.25" fill="currentColor" />
      <motion.path
        d="M4.6 8.3 7 10.6l4.5-5"
        fill="none"
        stroke="#e2eadb"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' }}
      />
    </svg>
  );
}

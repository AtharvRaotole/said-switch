import type { Agreement, Draft, Party, Refusal, Role, RoomMode } from '@said/core';
import { Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { orderedParties, partyLabel } from '../lib/parties';
import type { TamperChange } from '../lib/tamper';
import { ApprovalSlot } from './ApprovalSlot';
import { HashChip } from './HashChip';
import { DraftStatusPill } from './StatusPill';
import { TamperedText } from './TamperedText';
import { Time } from './Time';
import { VersionHistory } from './VersionHistory';
import { WaxSeal } from './WaxSeal';

interface DraftCardProps {
  draft: Draft;
  parties: Party[];
  mode: RoomMode;
  agreement: Agreement | undefined;
  bypass: Refusal | undefined;
  tamper: TamperChange | null;
}

const DEFAULT_ROLES: Record<RoomMode, [Role, Role]> = {
  business: ['developer', 'client'],
  personal: ['partnerA', 'partnerB'],
};

export function DraftCard({ draft, parties, mode, agreement, bypass, tamper }: DraftCardProps) {
  const ordered = orderedParties(parties);
  const roles: Role[] = ordered.length >= 2 ? ordered.slice(0, 2).map((p) => p.role) : DEFAULT_ROLES[mode];
  const sealed = draft.status === 'LOCKED';
  const approvals = { ...agreement?.approvals, ...draft.approvals };
  const edited = tamper && tamper.draftId === draft.id ? tamper : null;
  const requester = partyLabel(parties, draft.request.role, draft.request.senderName);
  const proposer = partyLabel(parties, draft.proposal.role, draft.proposal.senderName);
  const agreementId = draft.agreementId ?? agreement?.id ?? null;

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      aria-label={`${draft.id} version ${draft.version}: ${draft.scope}`}
      className={`relative rounded-[6px] border bg-bond pl-5 shadow-[0_1px_0_rgba(23,33,58,0.04),0_18px_40px_-30px_rgba(23,33,58,0.45)] transition-colors duration-500 ${
        sealed ? 'border-wax/30' : draft.status === 'REJECTED' ? 'border-rule opacity-80' : 'border-rule'
      }`}
    >
      <div aria-hidden className="margin-rule absolute inset-y-0 left-3" />
      <div className="px-5 pb-5 pt-4 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rounded-[3px] bg-ink px-2 py-[3px] font-mono text-[12.5px] font-semibold leading-none text-bond">
            {draft.id} · v{draft.version}
          </span>
          {agreementId && <span className="font-mono text-[12.5px] font-semibold text-wax">{agreementId}</span>}
          <span className="ml-auto">
            <DraftStatusPill status={draft.status} />
          </span>
        </header>

        <h3 className="mt-3 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.005em] text-ink sm:text-[32px]">
          {edited?.field === 'scope' ? <TamperedText change={edited} /> : draft.scope}
        </h3>

        <p className="mt-2 text-[13px] text-ink-3">
          {bypass ? (
            <>
              <span className="font-semibold text-ink-2">{requester}</span> asked <span className="font-mono text-[12px]">@{bypass.target}</span>{' '}
              directly at <Time ms={draft.request.timestamp} />. Switch refused it and Said logged it here:
            </>
          ) : (
            <>
              Requested by <span className="font-semibold text-ink-2">{requester}</span> at <Time ms={draft.request.timestamp} />:
            </>
          )}{' '}
          <q className="font-display text-[15px] italic text-ink-2">{draft.request.text}</q>
        </p>

        <dl className="mt-4 border-y border-rule text-[13px]">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-4 py-2.5 sm:grid-cols-[112px_minmax(0,1fr)_auto]">
            <dt className="eyebrow text-ink-3">Terms</dt>
            <dd className="font-display text-[21px] leading-snug tabular-nums text-ink">
              {draft.terms === null ? (
                <span className="italic text-await">Terms needed</span>
              ) : edited?.field === 'terms' ? (
                <TamperedText change={edited} />
              ) : (
                draft.terms
              )}
            </dd>
            <dd className="col-start-2 text-[12px] text-ink-3 sm:col-start-auto sm:text-right">
              {draft.terms === null ? (
                <>
                  set with <code className="font-mono text-[12px] text-ink-2">Terms {draft.id}: &lt;time and price&gt;</code>
                </>
              ) : (
                <>
                  set by {proposer} · <Time ms={draft.proposal.timestamp} />
                </>
              )}
            </dd>
          </div>
          <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 border-t border-rule py-2.5 sm:grid-cols-[112px_minmax(0,1fr)_auto]">
            <dt className="eyebrow text-ink-3">Terms hash</dt>
            <dd>
              <HashChip hash={draft.termsHash} />
            </dd>
            <dd className="col-start-2 text-[12px] text-ink-3 sm:col-start-auto sm:text-right">
              approvals bind {draft.id} v{draft.version} to this hash
            </dd>
          </div>
        </dl>

        <div
          className={`relative mt-4 grid gap-3 ${
            sealed ? 'sm:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]' : 'sm:grid-cols-2'
          }`}
        >
          <ApprovalSlot role={roles[0] as Role} party={ordered.find((p) => p.role === roles[0])} approval={approvals[roles[0] as Role]} draft={draft} />
          <AnimatePresence initial={false}>
            {sealed && agreementId && (
              <motion.div
                key="seal"
                className="pointer-events-none relative z-10 -my-8 flex items-center justify-center sm:my-0"
                exit={{ opacity: 0 }}
              >
                <WaxSeal agreementId={agreementId} />
              </motion.div>
            )}
          </AnimatePresence>
          <ApprovalSlot role={roles[1] as Role} party={ordered.find((p) => p.role === roles[1])} approval={approvals[roles[1] as Role]} draft={draft} />
        </div>

        {sealed && agreement && (
          <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-2">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-wax" strokeWidth={2.4} />
            <span>
              Locked as <span className="font-mono font-semibold text-wax">{agreement.id}</span> at <Time ms={agreement.lockedAt} />. These terms
              can no longer change; a change needs a new draft.
            </span>
          </p>
        )}

        {draft.status === 'REJECTED' && draft.rejectedBy && (
          <p className="mt-4 text-[13px] text-ink-2">
            <span className="font-semibold text-fail">Rejected</span> by {partyLabel(parties, draft.rejectedBy.role, draft.rejectedBy.senderName)} at{' '}
            <Time ms={draft.rejectedBy.timestamp} />: <q className="font-display italic">{draft.rejectedBy.text}</q>
          </p>
        )}

        <VersionHistory history={draft.history} parties={parties} />
      </div>
    </motion.article>
  );
}

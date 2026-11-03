import { SaidMark } from '@said/brand';
import type { Ledger } from '@said/core';
import { AnimatePresence, motion } from 'motion/react';
import type { ConsoleData } from '../api/types';
import { LinkIndicator } from './LinkIndicator';
import { ModeChip } from './ModeChip';
import { Time } from './Time';

export function Masthead({ data, ledger }: { data: ConsoleData; ledger: Ledger | null }) {
  const { state } = data;
  const fixture = data.source === 'fixture' ? 'fixture' : undefined;
  const notaryStatus = state || data.notaryLink === 'connecting' ? data.notaryLink : 'unreachable';

  return (
    <header className="pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-5">
        <div>
          <h1 className="text-ink">
            <SaidMark width={168} height={40} title="Said" />
          </h1>
          <p className="mt-3 font-display text-[20px] italic leading-none text-ink-2">Nothing starts until both of you say yes.</p>
        </div>
        {state && (
          <div className="flex min-w-0 flex-col items-start gap-1.5 sm:items-end sm:text-right">
            <span className="eyebrow text-ink-3">Room</span>
            <p className="font-display text-[22px] leading-tight text-ink" title={state.room.id}>
              {state.room.name}
            </p>
            <ModeChip state={state} />
          </div>
        )}
      </div>

      <div className="rule-double flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-b border-rule py-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {state && <LinkIndicator name="Switch" status={state.switch.connected ? 'open' : 'reconnecting'} override={fixture} />}
          <LinkIndicator name="Notary" status={notaryStatus} override={fixture} />
          <LinkIndicator name="Builder" status={data.builderLink} override={fixture} />
        </div>
        {ledger && (
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-ink-3">
            <span>Ledger revision</span>
            <span className="relative inline-flex min-w-[2ch] overflow-hidden font-mono text-[13px] font-semibold text-ink">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={ledger.revision}
                  initial={{ y: '-100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '100%', opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {ledger.revision}
                </motion.span>
              </AnimatePresence>
            </span>
            <span>
              · updated <Time ms={ledger.updatedAt} />
            </span>
            {state?.ledgerDocumentId && (
              <span title={state.ledgerDocumentId}>
                · room document <span className="font-mono">{state.ledgerDocumentId.slice(0, 8)}…</span>
              </span>
            )}
          </p>
        )}
      </div>
    </header>
  );
}

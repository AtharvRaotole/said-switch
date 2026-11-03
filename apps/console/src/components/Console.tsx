import { MotionConfig } from 'motion/react';
import { useMemo, useState } from 'react';
import type { ConsoleData } from '../api/types';
import type { FixturePlayer } from '../fixtures/useFixturePlayer';
import { tamperOneByte } from '../lib/tamper';
import { useNow } from '../lib/useNow';
import { useSignature } from '../lib/useSignature';
import { AuditTrail } from './AuditTrail';
import { DraftList } from './DraftList';
import { NoLedger, NotaryUnreachable } from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';
import { ExecutionPanel } from './ExecutionPanel';
import { FixtureBanner } from './FixtureBanner';
import { Masthead } from './Masthead';
import { OfflineBand } from './OfflineBand';
import { PartiesStrip } from './PartiesStrip';
import { RefusalList } from './RefusalList';
import { RoomActivity } from './RoomActivity';
import { SignatureStrip } from './SignatureStrip';

const ACTIVE = new Set(['READY', 'RUNNING', 'VALIDATING']);

export function Console({ data, player }: { data: ConsoleData; player?: FixturePlayer }) {
  const [tamperOn, setTamperOn] = useState(false);
  const signed = data.state?.signedLedger ?? null;
  const tamper = useMemo(() => (tamperOn && signed ? tamperOneByte(signed) : null), [tamperOn, signed]);
  const shown = tamper?.copy ?? signed;
  const signature = useSignature(shown, data.state, data.source);
  const ledger = shown?.payload ?? null;

  const busy =
    data.jobs.some((j) => ACTIVE.has(j.status)) || (ledger?.agreements.some((a) => a.execution && ACTIVE.has(a.execution.status)) ?? false);
  const now = useNow(data.clock, busy);

  return (
    <MotionConfig reducedMotion="user">
      {player && <FixtureBanner player={player} />}
      {data.state?.mode === 'offline' && <OfflineBand />}
      <div className="mx-auto max-w-[1520px] px-5 pb-16 sm:px-8 xl:px-12">
        <Masthead data={data} ledger={ledger} />
        {!data.state ? (
          <NotaryUnreachable url={data.notaryUrl} status={data.notaryLink} />
        ) : (
          <>
            <SignatureStrip
              status={signature}
              tamper={tamper}
              canTamper={data.source === 'live' && signed !== null}
              onTamper={() => setTamperOn(true)}
              onRestore={() => setTamperOn(false)}
            />
            {!ledger ? (
              <NoLedger issue={data.ledgerIssue} />
            ) : (
              <ErrorBoundary resetKey={ledger}>
                <PartiesStrip parties={ledger.parties} mode={ledger.mode} />
                {/* One column below xl (ordered by `order-*`); at xl the two wrappers become columns. */}
                <main className="mt-8 flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start xl:gap-x-12">
                  <div className="contents xl:block xl:min-w-0 xl:space-y-10">
                    <div className="order-1 min-w-0">
                      <DraftList ledger={ledger} tamper={tamper?.change ?? null} />
                    </div>
                    <div className="order-3 min-w-0">
                      <RefusalList ledger={ledger} />
                    </div>
                    <div className="order-5 min-w-0">
                      <RoomActivity chat={data.chat} />
                    </div>
                  </div>
                  <div className="contents xl:block xl:min-w-0 xl:space-y-10">
                    <div className="order-2 min-w-0">
                      <ExecutionPanel
                        ledger={ledger}
                        jobs={data.jobs}
                        logs={data.logs}
                        builderLink={data.builderLink}
                        builderUrl={data.builderUrl}
                        now={now}
                      />
                    </div>
                    <div className="order-4 min-w-0">
                      <AuditTrail ledger={ledger} />
                    </div>
                  </div>
                </main>
              </ErrorBoundary>
            )}
          </>
        )}
        <footer className="mt-14 border-t border-rule pt-4 text-[12px] text-ink-3">
          Read-only. This console never writes to the room or the ledger; it re-verifies every revision in your browser.
        </footer>
      </div>
    </MotionConfig>
  );
}

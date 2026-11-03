import { TriangleAlert, Unplug } from 'lucide-react';
import type { LinkStatus } from '../api/types';

export function NotaryUnreachable({ url, status }: { url: string; status: LinkStatus }) {
  const connecting = status === 'connecting';
  return (
    <section className="rule-double mt-2 pt-10" aria-live="polite">
      <div className="mx-auto max-w-[640px] rounded-[6px] border border-rule bg-bond px-7 py-7 shadow-[0_18px_40px_-30px_rgba(23,33,58,0.45)]">
        <div className="flex items-start gap-3">
          <Unplug aria-hidden className="mt-1 size-5 shrink-0 text-ink-3" />
          <div>
            <h2 className="font-display text-[26px] font-semibold leading-tight text-ink">
              {connecting ? 'Connecting to the notary…' : 'The notary isn’t reachable'}
            </h2>
            <p className="mt-2 text-[14px] text-ink-2">
              This console mirrors the notary at <code className="font-mono text-[13px]">{url}</code>. Start it and this page connects on its
              own.
            </p>
          </div>
        </div>
        <dl className="mt-5 divide-y divide-rule border-y border-rule">
          <Command cmd="npm run dev" what="Live: Said, the builder and this console against your Switch server" />
          <Command cmd="npm run demo:offline" what="Offline simulation with a mock Switch, clearly labeled as such" />
        </dl>
        <p className="mt-4 text-[12.5px] text-ink-3">
          Retrying every few seconds. To review the layout without services, open{' '}
          <a className="font-mono text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink" href="?fixture=dark-mode">
            ?fixture=dark-mode
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function Command({ cmd, what }: { cmd: string; what: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
      <dt>
        <code className="rounded-[3px] bg-ink px-2 py-1 font-mono text-[12.5px] text-bond">{cmd}</code>
      </dt>
      <dd className="text-[13px] text-ink-2">{what}</dd>
    </div>
  );
}

export function NoLedger({ issue }: { issue: string | null }) {
  return (
    <section className="mt-8 rounded-[6px] border border-dashed border-rule-strong px-7 py-8">
      {issue ? (
        <div className="flex items-start gap-3">
          <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-fail" />
          <div>
            <h2 className="font-display text-[24px] font-semibold text-ink">The ledger can’t be read</h2>
            <p className="mt-2 max-w-[60ch] text-[14px] text-ink-2">
              {issue} Said stops authorizing work while its ledger is malformed, and so does the builder.
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 className="font-display text-[24px] font-semibold text-ink">No ledger yet</h2>
          <p className="mt-2 max-w-[60ch] text-[14px] text-ink-2">
            The notary is up, but it has not written the “Said Ledger” room document. It does that once both parties enroll with{' '}
            <code className="font-mono text-[13px]">npm run enroll</code>.
          </p>
        </>
      )}
    </section>
  );
}

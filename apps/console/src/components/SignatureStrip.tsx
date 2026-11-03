import { FlaskConical, LoaderCircle, RotateCcw, ShieldCheck, ShieldOff, ShieldX } from 'lucide-react';
import { motion } from 'motion/react';
import { shortHash } from '../lib/format';
import type { Tampered } from '../lib/tamper';
import type { SignatureStatus } from '../lib/useSignature';

interface SignatureStripProps {
  status: SignatureStatus;
  tamper: Tampered | null;
  canTamper: boolean;
  onTamper: () => void;
  onRestore: () => void;
}

const TONE = {
  valid: 'border-agree/35 bg-agree-wash text-agree',
  invalid: 'border-fail/45 bg-fail-wash text-fail',
  neutral: 'border-rule bg-bond/60 text-ink-2',
} as const;

export function SignatureStrip({ status, tamper, canTamper, onTamper, onRestore }: SignatureStripProps) {
  const tone = status.kind === 'valid' ? TONE.valid : status.kind === 'invalid' ? TONE.invalid : TONE.neutral;
  return (
    <motion.section
      aria-label="Ledger signature"
      aria-live="polite"
      animate={status.kind === 'invalid' ? { x: [0, -6, 6, -3, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
      className={`mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[6px] border px-4 py-3 transition-colors duration-300 ${tone}`}
    >
      <div className="flex min-w-0 flex-1 basis-[420px] items-start gap-3">
        <StatusIcon status={status} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug">
            <Headline status={status} />
          </p>
          <Details status={status} tamper={tamper} />
        </div>
      </div>

      <div className="flex flex-col items-start gap-1 sm:items-end">
        {tamper ? (
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-2 rounded-[4px] bg-ink px-3 py-1.5 text-[13px] font-semibold text-bond hover:bg-ink-2"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={onTamper}
            disabled={!canTamper}
            className="inline-flex items-center gap-2 rounded-[4px] border border-ink/70 bg-bond px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-paper disabled:border-rule-strong disabled:text-ink-4 disabled:hover:bg-bond"
          >
            <FlaskConical aria-hidden className="size-3.5" />
            Tamper with one byte
          </button>
        )}
        <span className="text-[11.5px] text-ink-3">
          {canTamper || tamper
            ? 'Edits a copy in this tab only. Nothing is sent anywhere.'
            : status.kind === 'fixture'
              ? 'Needs a signed ledger: run the live or offline demo.'
              : 'Available once a signed ledger has loaded.'}
        </span>
      </div>
    </motion.section>
  );
}

function StatusIcon({ status }: { status: SignatureStatus }) {
  const cls = 'mt-0.5 size-5 shrink-0';
  switch (status.kind) {
    case 'valid':
      return <ShieldCheck aria-hidden className={cls} strokeWidth={2.2} />;
    case 'invalid':
      return <ShieldX aria-hidden className={cls} strokeWidth={2.2} />;
    case 'checking':
      return <LoaderCircle aria-hidden className={`${cls} animate-spin text-ink-3`} />;
    default:
      return <ShieldOff aria-hidden className={`${cls} text-ink-3`} />;
  }
}

function Headline({ status }: { status: SignatureStatus }) {
  switch (status.kind) {
    case 'valid':
      return (
        <>
          Signature verified in this browser · ed25519 · key <span className="font-mono text-[13.5px]">{status.keyId}</span>
          {status.pinned && <span className="font-normal"> (pinned)</span>}
        </>
      );
    case 'invalid':
      return <>Signature INVALID. {lowerFirst(status.reason)}</>;
    case 'checking':
      return <>Verifying the ledger signature in this browser…</>;
    case 'absent':
      return <>No signed ledger to verify yet</>;
    case 'fixture':
      return (
        <>
          <span className="rounded-[3px] bg-ink px-1.5 py-0.5 font-mono text-[12px] font-semibold text-bond">fixture · unsigned</span>{' '}
          <span className="font-normal text-ink-2">Design data; signature checks are skipped.</span>
        </>
      );
  }
}

function Details({ status, tamper }: { status: SignatureStatus; tamper: Tampered | null }) {
  if (status.kind === 'invalid') {
    return (
      <div className="mt-1 space-y-0.5 text-[12.5px] text-fail/90">
        {tamper && (
          <p>
            Tampered copy: {describeTarget(tamper)} <q>{tamper.change.before}</q> → <q className="font-semibold">{tamper.change.after}</q>.
            Nothing was sent anywhere.
          </p>
        )}
        <p className="font-mono text-[12px]">
          {status.recomputed && status.recomputed !== status.digest
            ? `recomputed digest ${shortHash(status.recomputed)} ≠ signed digest ${shortHash(status.digest)}`
            : `digest ${shortHash(status.digest)} · key ${status.keyId}`}
        </p>
      </div>
    );
  }
  if (status.kind === 'valid') {
    return (
      <p className="mt-0.5 text-[12.5px] font-normal text-agree/85">
        Digest <span className="font-mono">{shortHash(status.digest)}</span> recomputed from the payload and checked against the notary’s
        public key.
      </p>
    );
  }
  if (status.kind === 'fixture') {
    return <p className="mt-0.5 text-[12.5px] text-ink-3">Live and offline-demo ledgers are re-verified here on every revision.</p>;
  }
  return null;
}

function describeTarget(tamper: Tampered): string {
  const { draftId, field } = tamper.change;
  if (field === 'roomId') return 'room id';
  return `${draftId} ${field}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

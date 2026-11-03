import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { FIXTURE_STEPS } from '../fixtures/darkMode';
import type { FixturePlayer } from '../fixtures/useFixturePlayer';

/** Persistent "not live data" banner with the story step control. */
export function FixtureBanner({ player }: { player: FixturePlayer }) {
  const { step, total, setStep } = player;
  const current = FIXTURE_STEPS[step - 1] ?? FIXTURE_STEPS[0];
  return (
    <div role="region" aria-label="Design fixture controls" className="sticky top-0 z-30 bg-ink text-bond shadow-[0_6px_18px_-12px_rgba(18,26,44,0.9)]">
      <div className="mx-auto flex max-w-[1520px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2 sm:px-8 xl:px-12">
        <span className="font-sans text-[12px] font-bold uppercase tracking-[0.14em] text-night-system">Design fixture, not live data</span>
        <div className="flex items-center gap-1" role="group" aria-label="Story step">
          <StepButton label="Previous step" disabled={step <= 1} onClick={() => setStep(step - 1)}>
            <ChevronLeft aria-hidden className="size-3.5" />
          </StepButton>
          {FIXTURE_STEPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={step === i + 1}
              aria-label={`Step ${i + 1}: ${s.label}`}
              title={s.label}
              onClick={() => setStep(i + 1)}
              className={`h-6 min-w-6 rounded-[3px] px-1.5 font-mono text-[12px] font-semibold transition-colors ${
                step === i + 1 ? 'bg-bond text-ink' : 'text-night-text/70 hover:bg-night-2 hover:text-bond'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <StepButton label="Next step" disabled={step >= total} onClick={() => setStep(step + 1)}>
            <ChevronRight aria-hidden className="size-3.5" />
          </StepButton>
        </div>
        <span className="font-mono text-[11px] text-night-dim xl:order-last">keys 1-{total} · ← →</span>
        <p className="min-w-0 basis-full text-[12.5px] text-night-text/85 xl:basis-0 xl:flex-1">
          <span className="font-semibold text-bond">{current.label}.</span> {current.caption}
        </p>
      </div>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-[3px] text-night-text/80 hover:bg-night-2 hover:text-bond disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

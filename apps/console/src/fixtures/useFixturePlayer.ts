import { useEffect, useMemo, useState } from 'react';
import type { ConsoleData, NotaryMode } from '../api/types';
import { FIXTURE_STEPS, darkModeFixture } from './darkMode';

export interface FixturePlayer {
  data: ConsoleData;
  step: number;
  total: number;
  setStep: (step: number) => void;
}

const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 1, 1), FIXTURE_STEPS.length);

/** Steps through the fixture story with keys 1-6 and ←/→; `?step=` and `?mode=offline` are honoured. */
export function useFixturePlayer(): FixturePlayer {
  const params = new URLSearchParams(window.location.search);
  const mode: NotaryMode = params.get('mode') === 'offline' ? 'offline' : 'live';
  const [step, setStepRaw] = useState(() => clamp(Number(params.get('step') ?? 1)));
  const setStep = (next: number) => setStepRaw(clamp(next));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= FIXTURE_STEPS.length) setStepRaw(digit);
      else if (event.key === 'ArrowRight') setStepRaw((s) => clamp(s + 1));
      else if (event.key === 'ArrowLeft') setStepRaw((s) => clamp(s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(step));
    window.history.replaceState(null, '', url);
  }, [step]);

  const data = useMemo(() => darkModeFixture(step, mode), [step, mode]);
  return { data, step, total: FIXTURE_STEPS.length, setStep };
}

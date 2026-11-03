import { useEffect, useState } from 'react';

/** The fixture's frozen clock, or the real clock ticking once a second while `ticking`. */
export function useNow(fixed: number | null, ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixed !== null || !ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [fixed, ticking]);
  return fixed ?? now;
}

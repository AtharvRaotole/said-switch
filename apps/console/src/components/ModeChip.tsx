import type { NotaryState } from '../api/types';

export function ModeChip({ state }: { state: NotaryState }) {
  if (state.mode === 'offline') {
    return (
      <span className="hatch-amber inline-flex items-center gap-2 rounded-[3px] border-2 border-await px-2.5 py-1 font-sans text-[12px] font-bold uppercase tracking-[0.1em] text-[#5a3400]">
        Offline simulation (mock Switch)
      </span>
    );
  }
  const version = state.switch.version ? ` ${state.switch.version}` : '';
  return (
    <span className="inline-flex items-center gap-2 rounded-[3px] border border-agree/40 bg-agree-wash px-2.5 py-1 font-sans text-[12px] font-semibold uppercase tracking-[0.1em] text-agree">
      <span aria-hidden className={`size-2 rounded-full ${state.switch.connected ? 'bg-agree animate-live' : 'bg-ink-4'}`} />
      Live · Switch{version}
    </span>
  );
}

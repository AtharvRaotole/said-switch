/** Offline mode must never pass for Switch: a band above everything says so. */
export function OfflineBand() {
  return (
    <div role="note" className="hatch-amber border-b-2 border-await text-[#5a3400]">
      <p className="mx-auto max-w-[1520px] px-5 py-1.5 text-[12.5px] sm:px-8 xl:px-12">
        <span className="font-bold uppercase tracking-[0.12em]">Offline simulation (mock Switch).</span>{' '}
        Room messages come from a local simulator, not from a Switch server.
      </p>
    </div>
  );
}

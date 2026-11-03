import type { TamperChange } from '../lib/tamper';

/** Renders the tampered value with the flipped character marked. */
export function TamperedText({ change }: { change: TamperChange }) {
  const { after, index } = change;
  return (
    <span className="relative">
      {after.slice(0, index)}
      <mark className="rounded-[2px] bg-fail px-[1px] text-bond" title={`Was “${change.before.charAt(index)}” in the signed ledger`}>
        {after.charAt(index)}
      </mark>
      {after.slice(index + 1)}
      <span className="eyebrow ml-2 align-middle text-fail">edited in this tab</span>
    </span>
  );
}

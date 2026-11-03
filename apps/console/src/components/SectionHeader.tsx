import type { ReactNode } from 'react';

/** Serif section title over an account-book double rule. */
export function SectionHeader({ title, meta, id }: { title: string; meta?: ReactNode; id?: string }) {
  return (
    <div className="rule-double mb-4 flex items-baseline justify-between gap-4 pt-3">
      <h2 id={id} className="font-display text-[21px] font-semibold leading-none text-ink">
        {title}
      </h2>
      {meta && <div className="text-right text-[12px] text-ink-3">{meta}</div>}
    </div>
  );
}

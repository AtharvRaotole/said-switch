import type { SVGProps } from 'react';

function WaxDisc({ cx = 16, cy = 16, r = 15 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--said-wax, #9b1d2e)" />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#f4d5d4" strokeWidth="1.1" opacity="0.7" />
      <circle cx={cx - r * 0.22} cy={cy} r={r * 0.2} fill="none" stroke="#f8e6e2" strokeWidth={r * 0.12} />
      <circle cx={cx + r * 0.22} cy={cy} r={r * 0.2} fill="none" stroke="#f8e6e2" strokeWidth={r * 0.12} />
    </g>
  );
}

/** Wordmark: wax disc plus the word Said. The disc is the i-dot, the letters stay intact. */
export function SaidMark({
  title = 'Said',
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 118 28" fill="none" role="img" aria-label={title} {...props}>
      <title>{title}</title>
      <g transform="translate(0,2) scale(0.75)">
        <WaxDisc />
      </g>
      <text
        x="28"
        y="22"
        fill="currentColor"
        fontFamily="var(--said-display), Georgia, serif"
        fontSize="24"
        fontStyle="italic"
        letterSpacing="-0.3"
      >
        Said
      </text>
    </svg>
  );
}

/** Compact round favicon / avatar: wax disc with two lobes (two parties). */
export function SaidGlyph({ title = 'Said', ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" role="img" aria-label={title} {...props}>
      <title>{title}</title>
      <WaxDisc />
    </svg>
  );
}

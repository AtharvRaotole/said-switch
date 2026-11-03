import { motion, useReducedMotion, type SVGMotionProps } from 'motion/react';
import { useId } from 'react';

const C = 60;

/** Organic wax edge: a circle with a few low-amplitude ripples. */
const BLOB = (() => {
  const points: string[] = [];
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 54 + 2.6 * Math.sin(7 * a + 0.6) + 1.6 * Math.sin(12 * a + 2.1) + 0.9 * Math.sin(19 * a + 4.2);
    points.push(`${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
})();

const RING = 'M 60,60 m -45,0 a 45,45 0 1,1 90,0 a 45,45 0 1,1 -90,0';
const RING_LENGTH = 2 * Math.PI * 45;

export function WaxSeal({ agreementId, size = 116 }: { agreementId: string; size?: number }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');

  const stamp: Pick<SVGMotionProps<SVGSVGElement>, 'initial' | 'animate' | 'transition'> = reduce
    ? { initial: { opacity: 0, rotate: -12 }, animate: { opacity: 1, rotate: -12 }, transition: { duration: 0.2 } }
    : {
        initial: { opacity: 0, scale: 1.9, rotate: -30 },
        animate: { opacity: [0, 1, 1], scale: [1.9, 0.93, 1], rotate: [-30, -10, -12] },
        transition: { duration: 0.62, times: [0, 0.6, 1], ease: ['easeIn', 'easeOut'] },
      };

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Seal: locked as ${agreementId}`}>
      {!reduce && (
        <motion.span
          aria-hidden
          className="absolute inset-[6%] rounded-full border-2 border-wax/60"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.55, 0], scale: [0.85, 0.95, 1.45] }}
          transition={{ duration: 0.95, times: [0, 0.55, 1], ease: 'easeOut' }}
        />
      )}
      <motion.svg
        viewBox="-4 -4 128 128"
        width={size}
        height={size}
        className="relative drop-shadow-[0_2px_2px_rgba(60,10,18,0.35)]"
        {...stamp}
      >
        <defs>
          <radialGradient id={`wax-${uid}`} cx="36%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#b5505a" />
            <stop offset="48%" stopColor="#7a1d29" />
            <stop offset="100%" stopColor="#4a0f19" />
          </radialGradient>
          <radialGradient id={`press-${uid}`} cx="58%" cy="64%" r="70%">
            <stop offset="0%" stopColor="#8a2834" />
            <stop offset="100%" stopColor="#5c1420" />
          </radialGradient>
          <path id={`ring-${uid}`} d={RING} />
        </defs>

        <path d={BLOB} fill={`url(#wax-${uid})`} />
        <circle cx={C} cy={C} r={38.5} fill={`url(#press-${uid})`} />
        <circle cx={C + 0.7} cy={C + 0.9} r={38.5} fill="none" stroke="rgba(255,214,204,0.28)" strokeWidth={0.9} />
        <circle cx={C} cy={C} r={38.5} fill="none" stroke="#3e0b14" strokeOpacity={0.75} strokeWidth={1.3} />
        <circle cx={C} cy={C} r={51} fill="none" stroke="#3e0b14" strokeOpacity={0.35} strokeWidth={0.8} />

        <text
          className="font-sans"
          fontSize={6.4}
          fontWeight={600}
          fill="rgba(255,226,216,0.62)"
          textLength={RING_LENGTH - 6}
          lengthAdjust="spacing"
        >
          <textPath href={`#ring-${uid}`}>BOTH PARTIES ACCEPTED · SAID · BOTH PARTIES ACCEPTED · SAID ·</textPath>
        </text>

        <g fill="#f1d3ca">
          <rect x={55} y={36.5} width={10} height={7.5} rx={1.4} />
          <path d="M57.2 36.6v-2.3a2.8 2.8 0 0 1 5.6 0v2.3" fill="none" stroke="#f1d3ca" strokeWidth={1.4} />
        </g>
        <text x={C} y={59.6} textAnchor="middle" className="font-sans" fontSize={12.6} fontWeight={700} letterSpacing={2} fill="#3b0a13" fillOpacity={0.6}>
          LOCKED
        </text>
        <text x={C} y={58.7} textAnchor="middle" className="font-sans" fontSize={12.6} fontWeight={700} letterSpacing={2} fill="#f8e6de">
          LOCKED
        </text>
        <text x={C} y={73.5} textAnchor="middle" className="font-mono" fontSize={10.2} fontWeight={600} fill="#f0cdc4">
          {agreementId}
        </text>

        <ellipse cx={44} cy={34} rx={16} ry={9} fill="rgba(255,255,255,0.12)" transform="rotate(-28 44 34)" />
      </motion.svg>
    </div>
  );
}

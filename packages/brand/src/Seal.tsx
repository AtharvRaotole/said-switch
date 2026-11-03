import { motion, useReducedMotion, type SVGMotionProps } from 'motion/react';
import { useId } from 'react';

export type SealMood = 'idle' | 'waiting' | 'locked';

interface SealProps {
  mood?: SealMood;
  size?: number;
  label?: string;
}

const C = 64;
const BLOB = (() => {
  const pts: string[] = [];
  const steps = 96;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 56 + 2.4 * Math.sin(6 * a + 0.4) + 1.4 * Math.sin(13 * a + 1.8) + 0.8 * Math.sin(21 * a);
    pts.push(`${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

/**
 * Said’s mascot: a bilateral wax seal. Two notches for two people.
 * Idle it breathes. Waiting it tilts. Locked it stamps.
 */
export function Seal({ mood = 'idle', size = 168, label }: SealProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const aria =
    label ??
    (mood === 'locked' ? 'Both people agreed. The seal is locked.' : mood === 'waiting' ? 'Waiting for the other person.' : 'Said seal');

  const bob = reduce
    ? {}
    : mood === 'idle'
      ? { y: [0, -6, 0], rotate: [-2, 2, -2] }
      : mood === 'waiting'
        ? { y: [0, -4, 0], rotate: [-8, 6, -8] }
        : { y: [18, -8, 0], scale: [1.18, 0.92, 1], rotate: [-18, -4, -6] };

  const stamp: Pick<SVGMotionProps<SVGSVGElement>, 'initial' | 'animate' | 'transition'> = {
    initial: mood === 'locked' && !reduce ? { y: -28, scale: 1.25, rotate: -20 } : false,
    animate: { ...bob, opacity: 1 },
    transition:
      mood === 'locked' && !reduce
        ? { duration: 0.7, times: [0, 0.55, 1], ease: ['easeIn', 'easeOut'] }
        : { duration: mood === 'waiting' ? 2.4 : 4.6, repeat: Infinity, ease: 'easeInOut' },
  };

  return (
    <div className="said-seal" style={{ width: size, height: size * 1.18 }} role="img" aria-label={aria}>
      <svg className="said-seal-ribbon" viewBox="0 0 80 70" aria-hidden width={size * 0.42} height={size * 0.36}>
        <path d="M12 0 L40 18 L28 70 L12 54 Z" fill="#9b1d2e" />
        <path d="M68 0 L40 18 L52 70 L68 54 Z" fill="#6d101c" />
        <path d="M12 0 L40 18 L68 0 L54 8 L40 4 L26 8 Z" fill="#c44a55" />
      </svg>
      {!reduce && mood === 'locked' && (
        <motion.span
          aria-hidden
          className="said-seal-shock"
          initial={{ opacity: 0.5, scale: 0.7 }}
          animate={{ opacity: 0, scale: 1.55 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}
      <motion.svg viewBox="-6 -6 140 140" width={size} height={size} className="said-seal-disc" {...stamp}>
        <defs>
          <radialGradient id={`wax-${uid}`} cx="34%" cy="28%" r="78%">
            <stop offset="0%" stopColor="#c44a55" />
            <stop offset="52%" stopColor="#9b1d2e" />
            <stop offset="100%" stopColor="#5a0e18" />
          </radialGradient>
          <radialGradient id={`press-${uid}`} cx="60%" cy="62%" r="72%">
            <stop offset="0%" stopColor="#8a1a2a" />
            <stop offset="100%" stopColor="#4e0c16" />
          </radialGradient>
        </defs>
        <path d={BLOB} fill={`url(#wax-${uid})`} />
        <circle cx={C} cy={C} r={40} fill={`url(#press-${uid})`} />
        <circle cx={C} cy={C} r={40} fill="none" stroke="#3a0a12" strokeWidth="1.4" opacity="0.7" />
        <circle cx={C} cy={C} r={47.5} fill="none" stroke="#f4d5d4" strokeWidth="1.05" opacity="0.45" />
        <ellipse cx={46} cy={38} rx={16} ry={9} fill="rgba(255,255,255,0.16)" transform="rotate(-28 46 38)" />
        {size >= 120 && (
          <g fill="none" stroke="#f6ddd8" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            {mood === 'idle' ? (
              <>
                <circle cx="52" cy="62" r="8" />
                <circle cx="76" cy="62" r="8" />
              </>
            ) : mood === 'waiting' ? (
              <>
                <path d="M46 62.5 l5 5 9-11" />
                <circle cx="78" cy="62" r="8" />
              </>
            ) : (
              <>
                <path d="M46 62.5 l5 5 9-11" />
                <path d="M68 62.5 l5 5 9-11" />
              </>
            )}
          </g>
        )}
        <text
          x={C}
          y={96}
          textAnchor="middle"
          fontFamily="var(--said-sans), system-ui, sans-serif"
          fontSize="9"
          fontWeight={700}
          letterSpacing="2.4"
          fill="#f8e6e2"
        >
          {mood === 'locked' ? 'LOCKED' : mood === 'waiting' ? 'WAITING' : 'SAID'}
        </text>
      </motion.svg>
    </div>
  );
}

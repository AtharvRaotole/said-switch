import { Check, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { JobStepState } from '../api/types';
import { duration } from '../lib/format';
import type { PipelineStep } from '../lib/pipeline';

export function PipelineSteps({ steps, now, dimmed = false }: { steps: PipelineStep[]; now: number; dimmed?: boolean }) {
  return (
    <ol className={`relative ${dimmed ? 'opacity-60' : ''}`} aria-label="Execution steps">
      {steps.map((step, i) => (
        <StepRow key={step.key} step={step} now={now} last={i === steps.length - 1} />
      ))}
    </ol>
  );
}

const STATE_TEXT: Record<JobStepState, string> = {
  pending: 'pending',
  running: 'running',
  passed: 'passed',
  failed: 'failed',
};

function StepRow({ step, now, last }: { step: PipelineStep; now: number; last: boolean }) {
  const elapsed = stepDuration(step, now);
  const active = step.state === 'running';
  return (
    <li className="relative grid grid-cols-[22px_minmax(0,1fr)_auto] gap-x-3 pb-3 last:pb-0">
      {!last && <Connector done={step.state === 'passed'} />}
      <Node key={step.state} state={step.state} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-[14px] leading-[22px] ${step.state === 'pending' ? 'text-ink-3' : 'font-semibold text-ink'}`}>{step.label}</span>
          <span className="sr-only">{STATE_TEXT[step.state]}</span>
          {active && <span className="eyebrow text-ink-2">running</span>}
          {step.state === 'failed' && <span className="eyebrow text-fail">failed</span>}
        </div>
        {step.detail && (
          <p className={`truncate text-[12.5px] leading-snug ${step.state === 'failed' ? 'text-fail' : 'text-ink-3'}`} title={step.detail}>
            {step.detail}
          </p>
        )}
      </div>
      <span className={`pt-[3px] font-mono text-[12px] tabular-nums ${active ? 'text-ink' : 'text-ink-3'}`}>
        {elapsed === null ? '' : `${duration(elapsed)}${active ? '…' : ''}`}
      </span>
    </li>
  );
}

function stepDuration(step: PipelineStep, now: number): number | null {
  if (step.durationMs !== null) return step.durationMs;
  if (step.startedAt === null) return null;
  if (step.finishedAt !== null) return step.finishedAt - step.startedAt;
  return step.state === 'running' ? now - step.startedAt : null;
}

function Connector({ done }: { done: boolean }) {
  return (
    <span aria-hidden className="absolute bottom-0 left-[10px] top-[23px] w-[2px] overflow-hidden rounded-full bg-rule">
      <motion.span
        className="absolute inset-x-0 top-0 block h-full origin-top bg-agree"
        initial={false}
        animate={{ scaleY: done ? 1 : 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
    </span>
  );
}

function Node({ state }: { state: JobStepState }) {
  const reduce = useReducedMotion();
  if (state === 'passed') {
    return (
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        className="relative z-10 mt-[1px] flex size-[22px] items-center justify-center rounded-full bg-agree text-bond"
      >
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      </motion.span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="relative z-10 mt-[1px] flex size-[22px] items-center justify-center rounded-full bg-fail text-bond">
        <X aria-hidden className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'running') {
    return (
      <span className="relative z-10 mt-[1px] flex size-[22px] items-center justify-center rounded-full border-2 border-ink bg-bond">
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-[-2px] rounded-full border-2 border-ink"
            animate={{ scale: [1, 1.7], opacity: [0.45, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className="size-2 rounded-full bg-ink" />
      </span>
    );
  }
  return <span className="relative z-10 mt-[1px] size-[22px] rounded-full border-2 border-rule-strong bg-bond" />;
}

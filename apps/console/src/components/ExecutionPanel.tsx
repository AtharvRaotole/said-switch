import type { Agreement, Ledger } from '@said/core';
import type { JobView, LinkStatus, LogEvent } from '../api/types';
import { workerLabel } from '../lib/format';
import { STEP_ORDER, pipelineFor, stepLabel, type PipelineStep } from '../lib/pipeline';
import { ExecutionResult } from './ExecutionResult';
import { LogPanel } from './LogPanel';
import { PipelineSteps } from './PipelineSteps';
import { SectionHeader } from './SectionHeader';
import { ExecutionStatusPill } from './StatusPill';
import { Time } from './Time';

interface ExecutionPanelProps {
  ledger: Ledger;
  jobs: JobView[];
  logs: Record<string, LogEvent[]>;
  builderLink: LinkStatus;
  builderUrl: string;
  now: number;
}

const IDLE_STEPS: PipelineStep[] = STEP_ORDER.map((key) => ({
  key,
  label: stepLabel(key, null),
  state: 'pending',
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  detail: null,
}));

export function ExecutionPanel({ ledger, jobs, logs, builderLink, builderUrl, now }: ExecutionPanelProps) {
  const agreements = [...ledger.agreements].sort((a, b) => b.lockedAt - a.lockedAt);
  const latest = agreements[0];

  return (
    <section aria-labelledby="execution-title">
      <SectionHeader
        id="execution-title"
        title="Execution"
        meta={ledger.mode === 'personal' ? 'personal room · no builder' : 'builder controller · isolated worktree'}
      />
      {latest ? (
        <AgreementExecution agreement={latest} jobs={jobs} logs={logs} builderLink={builderLink} builderUrl={builderUrl} now={now} />
      ) : (
        <div className="rounded-[6px] border border-dashed border-rule-strong bg-bond/50 px-5 py-4">
          <p className="font-display text-[19px] text-ink">Nothing is running</p>
          <p className="mt-1 max-w-[52ch] text-[13px] text-ink-3">
            The builder starts only on a locked agreement: both parties must accept the same version and terms hash. Until then
            every step below stays closed.
          </p>
          <div className="mt-4">
            <PipelineSteps steps={IDLE_STEPS} now={now} dimmed />
          </div>
        </div>
      )}
      {agreements.length > 1 && <EarlierAgreements agreements={agreements.slice(1)} />}
    </section>
  );
}

function AgreementExecution({
  agreement,
  jobs,
  logs,
  builderLink,
  builderUrl,
  now,
}: Omit<ExecutionPanelProps, 'ledger'> & { agreement: Agreement }) {
  const pipeline = pipelineFor(agreement, jobs);
  const lines = pipeline.jobId ? (logs[pipeline.jobId] ?? []) : [];
  const streaming = pipeline.status === 'RUNNING' || pipeline.status === 'VALIDATING';
  const builderDown = builderLink === 'reconnecting' || builderLink === 'unreachable';

  return (
    <div className="space-y-4">
      <div className="rounded-[6px] border border-rule bg-bond px-5 pb-5 pt-4 shadow-[0_1px_0_rgba(23,33,58,0.04),0_18px_40px_-30px_rgba(23,33,58,0.45)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[12.5px] font-semibold text-wax">
              {agreement.id} <span className="font-normal text-ink-3">· {agreement.draftId} v{agreement.version}</span>
            </p>
            <p className="mt-1 font-display text-[22px] leading-tight text-ink">{agreement.scope}</p>
            <p className="mt-0.5 text-[13px] tabular-nums text-ink-3">{agreement.terms}</p>
          </div>
          <ExecutionStatusPill status={pipeline.status} />
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
          <div className="flex gap-1.5">
            <dt>Job</dt>
            <dd className="font-mono text-ink-2">{pipeline.jobId ?? 'not issued yet'}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Coding agent</dt>
            <dd className="text-ink-2">{workerLabel(pipeline.worker)}</dd>
          </div>
          {pipeline.startedAt !== null && (
            <div className="flex gap-1.5">
              <dt>Started</dt>
              <dd className="text-ink-2">
                <Time ms={pipeline.startedAt} />
              </dd>
            </div>
          )}
        </dl>

        {pipeline.source === 'ledger' && (
          <p className="mt-3 rounded-[4px] bg-vellum/60 px-3 py-2 text-[12.5px] text-ink-2">
            {builderDown
              ? `The builder at ${builderUrl} is not reachable. Steps are reconstructed from the signed ledger.`
              : pipeline.status === null
                ? 'Locked. Waiting for Said to hand the start authorization to the builder.'
                : `Waiting for the builder to report on ${pipeline.jobId}. Steps come from the signed ledger.`}
          </p>
        )}

        <div className="mt-4">
          <PipelineSteps steps={pipeline.steps} now={now} />
        </div>
        <ExecutionResult pipeline={pipeline} />
      </div>

      <LogPanel
        lines={lines}
        streaming={streaming && !builderDown}
        title={pipeline.jobId ? `Output · ${pipeline.jobId}` : 'Output'}
        empty={
          builderDown
            ? `Live output streams from the builder at ${builderUrl}. It is not reachable right now.`
            : 'No output yet. Lines appear here as the builder verifies, codes and checks.'
        }
      />
    </div>
  );
}

function EarlierAgreements({ agreements }: { agreements: Agreement[] }) {
  return (
    <div className="mt-5">
      <p className="eyebrow mb-2 text-ink-3">Earlier agreements</p>
      <ul className="divide-y divide-rule rounded-[6px] border border-rule bg-bond/60">
        {agreements.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <span className="min-w-0 truncate">
              <span className="font-mono font-semibold text-wax">{a.id}</span> <span className="text-ink-2">{a.scope}</span>
            </span>
            <ExecutionStatusPill status={a.execution?.status ?? null} />
          </li>
        ))}
      </ul>
    </div>
  );
}

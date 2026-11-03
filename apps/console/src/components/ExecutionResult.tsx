import { FileCode, GitCommitHorizontal, TriangleAlert } from 'lucide-react';
import { shortSha } from '../lib/format';
import type { Pipeline } from '../lib/pipeline';

export function ExecutionResult({ pipeline }: { pipeline: Pipeline }) {
  const { status, baseCommit, resultCommit, changedPaths, error } = pipeline;
  if (!status || status === 'READY') return null;

  return (
    <div className="mt-4 space-y-3 border-t border-rule pt-4 text-[13px]">
      {status === 'FAILED' && (
        <div className="flex items-start gap-2 rounded-[4px] border border-fail/40 bg-fail-wash px-3 py-2.5 text-fail">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Not applied. The client’s repository is unchanged.</p>
            {error && <p className="mt-0.5 font-mono text-[12px] text-fail/90">{error}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
        <GitCommitHorizontal aria-hidden className="size-4 text-ink-3" />
        {status === 'COMPLETED' && resultCommit ? (
          <>
            <span>Applied</span>
            <code className="rounded-[3px] bg-agree-wash px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-agree" title={resultCommit}>
              {shortSha(resultCommit)}
            </code>
            <span>on top of</span>
            <code className="font-mono text-[12.5px] text-ink-2" title={baseCommit ?? undefined}>
              {shortSha(baseCommit)}
            </code>
          </>
        ) : (
          <>
            <span>Working from base</span>
            <code className="font-mono text-[12.5px] text-ink-2" title={baseCommit ?? undefined}>
              {shortSha(baseCommit)}
            </code>
            <span className="text-ink-3">in an isolated worktree</span>
          </>
        )}
      </div>

      {changedPaths.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5 text-ink-3">Changed files</p>
          <ul className="flex flex-wrap gap-1.5">
            {changedPaths.map((path) => (
              <li key={path} className="inline-flex items-center gap-1.5 rounded-[3px] border border-rule bg-paper/60 px-2 py-1 font-mono text-[12px] text-ink-2">
                <FileCode aria-hidden className="size-3.5 text-ink-3" />
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

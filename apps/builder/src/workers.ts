import type { WorkerKind } from '@said/core';
import { claudeArgs, codexArgs, scriptedApplyArgs } from './commands.js';
import type { ExecCommand } from './exec.js';
import type { LogStream } from './types.js';
import { plain, tail } from './text.js';

export function resolveWorker(fallback: WorkerKind): WorkerKind {
  const raw = process.env.SAID_WORKER;
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'claude' || raw === 'codex' || raw === 'scripted') return raw;
  throw new Error(`SAID_WORKER must be claude, codex, or scripted. Received "${raw}".`);
}

export class JobFailed extends Error {
  constructor(
    message: string,
    readonly step: 'worktree' | 'worker' | 'paths' | 'typecheck' | 'build' | 'applied' | 'receipt',
  ) {
    super(plain(message));
    this.name = 'JobFailed';
  }
}

export interface WorkerContext {
  worker: WorkerKind;
  worktree: string;
  prompt: string;
  fixturePatch: string;
  execCommand: ExecCommand;
  log: (stream: LogStream, line: string) => void;
}

export async function runConfiguredWorker(ctx: WorkerContext): Promise<void> {
  if (ctx.worker === 'scripted') {
    ctx.log('system', 'scripted worker (no AI)');
    const args = scriptedApplyArgs(ctx.fixturePatch);
    ctx.log('worker', `git ${args.join(' ')}`);
    const result = await ctx.execCommand('git', args, ctx.worktree, (line) => ctx.log('worker', line));
    if (result.code !== 0) {
      throw new JobFailed(tail(result.output) || 'The fixture patch did not apply.', 'worker');
    }
    return;
  }

  if (ctx.worker === 'claude') {
    const args = claudeArgs(ctx.prompt);
    ctx.log('system', `claude ${args.join(' ')}`);
    let result;
    try {
      result = await ctx.execCommand('claude', args, ctx.worktree, (line) => ctx.log('worker', line));
    } catch (err) {
      throw new JobFailed(err instanceof Error ? err.message : 'Claude Code could not be started.', 'worker');
    }
    if (result.code !== 0) throw new JobFailed('Claude Code failed.', 'worker');
    return;
  }

  const args = codexArgs(ctx.worktree, ctx.prompt);
  ctx.log('system', `codex ${args.join(' ')}`);
  let result;
  try {
    result = await ctx.execCommand('codex', args, ctx.worktree, (line) => ctx.log('worker', line));
  } catch (err) {
    throw new JobFailed(err instanceof Error ? err.message : 'Codex could not be started.', 'worker');
  }
  if (result.code !== 0) throw new JobFailed('Codex failed.', 'worker');
}

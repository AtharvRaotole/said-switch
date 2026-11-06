/** Argv for `claude`, cwd = worktree. No shell tool. */
export function claudeArgs(prompt: string): string[] {
  return [
    '-p',
    prompt,
    '--restricted',
    '--tools',
    'Read,Edit,Write,Glob,Grep',
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'none',
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
  ];
}

/**
 * Argv for `codex exec`. `-C` is the worktree.
 *
 * `codex exec` is the non-interactive command. Codex 0.166.0 rejects
 * `--ask-for-approval` there (`unexpected argument '--ask-for-approval' found`).
 * That flag belongs to the interactive `codex` command, not to `exec`.
 * Exec already runs with approval never. The sandbox stays `workspace-write`,
 * which is the documented unattended edit mode. Do not pass
 * `--dangerously-bypass-approvals-and-sandbox` or `danger-full-access`.
 */
export function codexArgs(worktree: string, prompt: string): string[] {
  return [
    'exec',
    '--sandbox',
    'workspace-write',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '--color',
    'never',
    '-C',
    worktree,
    prompt,
  ];
}

/** Argv for `git apply` of the fixture patch (scripted worker, no AI). */
export function scriptedApplyArgs(patchPath: string): string[] {
  return ['apply', patchPath];
}

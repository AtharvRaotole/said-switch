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

/** Argv for `codex`. `-C` is the worktree. */
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

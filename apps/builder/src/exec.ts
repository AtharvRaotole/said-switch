import { spawn } from 'node:child_process';

export interface CommandResult {
  code: number;
  output: string;
}

export type ExecCommand = (
  command: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
) => Promise<CommandResult>;

/** Spawn without a shell. Stdout and stderr are split into lines. */
export const execCommand: ExecCommand = (command, args, cwd, onLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let buffer = '';
    const take = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output = (output + text).slice(-100_000);
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) onLine(line);
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', reject);
    child.on('close', (code) => {
      if (buffer.length > 0) onLine(buffer);
      resolve({ code: code ?? 1, output });
    });
  });

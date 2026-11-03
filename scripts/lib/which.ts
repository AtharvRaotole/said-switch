import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Resolves an executable name through PATH (no shell). Returns its absolute path or null. */
export function findOnPath(command: string, envPath: string | undefined = process.env.PATH): string | null {
  if (!envPath) return null;
  for (const dir of envPath.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** `<command> --version`, first line of output, or null when it cannot be run. */
export function versionOf(command: string): string | null {
  const res = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 15_000 });
  if (res.error || res.status !== 0) return null;
  return (res.stdout || res.stderr).trim().split('\n')[0] ?? null;
}

import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import picomatch from 'picomatch';

export const ALLOWED_PATTERNS = ['src/**/*.tsx', 'src/**/*.ts', 'src/**/*.css', 'index.html'] as const;

const matchesAllowed = picomatch([...ALLOWED_PATTERNS], { dot: true });

export interface PathViolation {
  path: string;
  reason: string;
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Allowlisted source files only: no symlinks, no binaries, no package or config edits. */
export async function inspectChanges(worktree: string, paths: string[]): Promise<PathViolation[]> {
  const root = resolve(worktree);
  const violations: PathViolation[] = [];
  for (const raw of paths) {
    const relPath = raw.replaceAll('\\', '/');
    if (relPath.split('/').includes('..') || isAbsolute(raw)) {
      violations.push({ path: relPath, reason: 'Path escapes the work folder.' });
      continue;
    }
    if (!matchesAllowed(relPath)) {
      violations.push({
        path: relPath,
        reason: 'Only src TypeScript, src CSS, and index.html may change.',
      });
      continue;
    }
    const abs = resolve(root, relPath);
    if (!inside(root, abs)) {
      violations.push({ path: relPath, reason: 'Path escapes the work folder.' });
      continue;
    }
    let info;
    try {
      info = await lstat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    if (info.isSymbolicLink()) {
      violations.push({ path: relPath, reason: 'Symlinks are not allowed.' });
      continue;
    }
    if (!info.isFile()) {
      violations.push({ path: relPath, reason: 'Only regular files are allowed.' });
      continue;
    }
    const bytes = await readFile(abs);
    if (bytes.includes(0)) {
      violations.push({ path: relPath, reason: 'Binary files are not allowed.' });
    }
  }
  return violations;
}

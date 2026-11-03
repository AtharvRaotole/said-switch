import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { initWithBaseline, isGitRepo, tagExists } from './git.js';

export const BASELINE_MESSAGE = 'baseline: Larkspur landing page (light only)';
export const BASELINE_TAG = 'baseline';

export interface PrepareOptions {
  /** Destination repo directory (e.g. `paths.clientRepo`). */
  target: string;
  /** Template directory (e.g. `paths.clientTemplate`). */
  template: string;
  /**
   * `install`: run `npm install --no-audit --no-fund` inside the copy (default).
   * `link`: symlink `<template>/node_modules` instead (tests / air-gapped CI; the template must already be installed).
   */
  dependencies?: 'install' | 'link';
  log?: (line: string) => void;
}

export interface PrepareResult {
  created: boolean;
  /** Present when `created` is false and something was off (missing tag, no node_modules). */
  notes: string[];
}

const EXCLUDED = new Set(['node_modules', 'dist', '.git', '.DS_Store']);

/** `node_modules` (no trailing slash) also ignores the symlink variant used by builder worktrees. */
const GITIGNORE = 'node_modules\ndist\n*.log\n.DS_Store\n';

export function runInherited(cmd: string, args: string[], cwd: string, log: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    const forward = (d: Buffer) => {
      for (const line of d.toString().split('\n')) if (line.trim()) log(line);
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code} in ${cwd}`)),
    );
  });
}

/**
 * Makes sure `target` is the client's own git repo with a `baseline` tag and installed deps.
 * Idempotent: an existing repo is left alone (it may contain real work) and only checked.
 */
export async function prepareClientRepo(opts: PrepareOptions): Promise<PrepareResult> {
  const log = opts.log ?? (() => undefined);
  const notes: string[] = [];

  if (existsSync(opts.target)) {
    if (!(await isGitRepo(opts.target))) {
      throw new Error(
        `${opts.target} exists but is not a git repository. Move it away (it is not managed by Said) and rerun.`,
      );
    }
    if (!(await tagExists(opts.target, BASELINE_TAG))) {
      notes.push(`${opts.target} has no \`${BASELINE_TAG}\` tag; \`npm run reset\` cannot restore it.`);
    }
    if (!existsSync(join(opts.target, 'node_modules'))) {
      notes.push(`${opts.target}/node_modules is missing: run \`npm install\` inside it.`);
    }
    return { created: false, notes };
  }

  if (!existsSync(join(opts.template, 'package.json'))) {
    throw new Error(`Client site template not found at ${opts.template}.`);
  }
  log(`copying ${basename(opts.template)} → ${opts.target}`);
  await mkdir(opts.target, { recursive: true });
  await cp(opts.template, opts.target, {
    recursive: true,
    filter: (src) => !EXCLUDED.has(basename(src)),
  });

  const ignorePath = join(opts.target, '.gitignore');
  const existingIgnore = existsSync(ignorePath) ? await readFile(ignorePath, 'utf8') : '';
  if (!/^node_modules\/?$/m.test(existingIgnore) || !/^dist\/?$/m.test(existingIgnore)) {
    await writeFile(ignorePath, existingIgnore ? `${existingIgnore.trimEnd()}\n${GITIGNORE}` : GITIGNORE);
  }

  if ((opts.dependencies ?? 'install') === 'link') {
    const source = join(opts.template, 'node_modules');
    if (!existsSync(source)) throw new Error(`Cannot link dependencies: ${source} does not exist.`);
    await symlink(source, join(opts.target, 'node_modules'), 'dir');
  } else {
    log('npm install --no-audit --no-fund (this can take a minute)');
    await runInherited('npm', ['install', '--no-audit', '--no-fund'], opts.target, log);
  }

  const commit = await initWithBaseline(opts.target, BASELINE_MESSAGE, BASELINE_TAG);
  log(`baseline commit ${commit.slice(0, 7)} tagged \`${BASELINE_TAG}\``);
  return { created: true, notes };
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

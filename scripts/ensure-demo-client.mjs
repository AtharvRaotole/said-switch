#!/usr/bin/env node
/**
 * Ensure demo/client-site/node_modules exists so offline e2e and client-repo
 * prep tests run after a fresh `npm ci` (they skipIf the template is bare).
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const marker = join(root, 'demo', 'client-site', 'node_modules');
if (existsSync(marker)) process.exit(0);

const r = spawnSync(
  'npm',
  ['--prefix', join(root, 'demo', 'client-site'), 'install', '--no-audit', '--no-fund'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
process.exit(r.status ?? 1);

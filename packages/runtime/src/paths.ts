import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(start: string): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, 'docs', 'DESIGN.md')) && existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not find the said-switch repository root above ${start}`);
    dir = parent;
  }
}

export const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/** Directory holding config, secrets, keys and runtime state. `SAID_HOME` overrides it (the offline demo uses `.said-offline`). */
export function saidHome(): string {
  return resolve(repoRoot, process.env.SAID_HOME ?? '.said');
}

export const paths = {
  get home() {
    return saidHome();
  },
  get config() {
    return join(saidHome(), 'config.json');
  },
  get secrets() {
    return join(saidHome(), 'secrets.json');
  },
  get publicKeys() {
    return join(saidHome(), 'public-keys.json');
  },
  get enrollment() {
    return join(saidHome(), 'enrollment.json');
  },
  get notaryState() {
    return join(saidHome(), 'notary-state.json');
  },
  get builderState() {
    return join(saidHome(), 'builder-state.json');
  },
  key(name: 'notary' | 'builder') {
    return join(saidHome(), 'keys', `${name}.json`);
  },
  get work() {
    return resolve(repoRoot, process.env.SAID_WORK ?? 'work');
  },
  get clientRepo() {
    return join(paths.work, 'client-site');
  },
  get jobs() {
    return join(paths.work, 'jobs');
  },
  get clientTemplate() {
    return join(repoRoot, 'demo', 'client-site');
  },
  get fixturePatch() {
    return join(repoRoot, 'demo', 'fixtures', 'dark-mode.patch');
  },
};

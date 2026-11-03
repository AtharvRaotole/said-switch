import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths';

let loaded = false;

/** Loads `<repo>/.env` once (values already in the environment win). */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function envPort(name: string, fallback: number): number {
  loadEnv();
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`${name} must be a port number, got "${raw}"`);
  return n;
}

export const ports = {
  get console() {
    return envPort('CONSOLE_PORT', 7400);
  },
  get notary() {
    return envPort('NOTARY_PORT', 7410);
  },
  get builder() {
    return envPort('BUILDER_PORT', 7420);
  },
  get mockSwitch() {
    return envPort('MOCK_SWITCH_PORT', 7500);
  },
  get clientSite() {
    return envPort('CLIENT_SITE_PORT', 5173);
  },
};

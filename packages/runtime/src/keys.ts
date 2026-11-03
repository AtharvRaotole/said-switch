import { generateKeyPair, type KeyPair } from '@said/core';
import { readJson, writeJson } from './files';
import { paths } from './paths';

/** Loads the named Ed25519 key pair, creating it (mode 0600) on first use. */
export async function loadOrCreateKeyPair(name: 'notary' | 'builder'): Promise<KeyPair> {
  const existing = await readJson<KeyPair>(paths.key(name));
  if (existing) return existing;
  const created = await generateKeyPair(`said-${name}-${new Date().toISOString().slice(0, 10)}`);
  await writeJson(paths.key(name), created, { secret: true });
  return created;
}

export async function loadKeyPair(name: 'notary' | 'builder'): Promise<KeyPair> {
  const existing = await readJson<KeyPair>(paths.key(name));
  if (!existing) throw new Error(`Missing ${name} signing key at ${paths.key(name)}. Run \`npm run setup\`.`);
  return existing;
}

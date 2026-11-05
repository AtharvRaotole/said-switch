/**
 * `npm run setup` - idempotent first-time preparation:
 *   Node check, .env, signing keys + pinned public keys, and the client repo (baseline tag).
 */
import { randomBytes } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadEnv,
  loadOrCreateKeyPair,
  paths,
  repoRoot,
  savePublicKeys,
  type PublicKeys,
} from '@said/runtime';
import { prepareClientRepo } from './lib/client-repo.js';
import { MIN_NODE_LABEL, nodeVersionOk } from './lib/node-version.js';
import { box, c, die, errorMessage, info, ok, out, step, warn } from './lib/output.js';
import { parsePlatform, setupSteps } from './lib/platform.js';


/** Ensure SAID_HTTP_SHARED_SECRET is set in .env (generate if blank/missing). Never prints the value. */
async function ensureSharedSecret(envFile: string): Promise<void> {
  const raw = await readFile(envFile, 'utf8');
  const match = /^SAID_HTTP_SHARED_SECRET=(.*)$/m.exec(raw);
  const current = match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  if (current) {
    ok('SAID_HTTP_SHARED_SECRET is set in .env (value not printed)');
    return;
  }
  const secret = randomBytes(24).toString('base64url');
  let next: string;
  if (match) {
    next = raw.replace(/^SAID_HTTP_SHARED_SECRET=.*$/m, `SAID_HTTP_SHARED_SECRET=${secret}`);
  } else if (raw.length === 0 || raw.endsWith('\n')) {
    next = `${raw}SAID_HTTP_SHARED_SECRET=${secret}\n`;
  } else {
    next = `${raw}\nSAID_HTTP_SHARED_SECRET=${secret}\n`;
  }
  await writeFile(envFile, next, 'utf8');
  ok('Generated SAID_HTTP_SHARED_SECRET into .env (live mode requires it; set SAID_HTTP_ALLOW_INSECURE=1 to opt out on loopback)');
}

async function main(): Promise<void> {
  step('Said setup');

  if (!nodeVersionOk()) {
    die(`Node ${process.versions.node} is too old. Said needs Node ${MIN_NODE_LABEL} or newer.`, 'Install Node 22.12+ (https://nodejs.org) and rerun `npm run setup`.');
  }
  ok(`Node ${process.versions.node}`);

  const envFile = join(repoRoot, '.env');
  if (existsSync(envFile)) {
    ok('.env already exists');
  } else {
    await copyFile(join(repoRoot, '.env.example'), envFile);
    ok('.env created from .env.example - fill in SWITCH_URL, SWITCH_REGISTRATION_KEY and SAID_ROOM_ID before `npm run register`');
  }
  await ensureSharedSecret(envFile);
  loadEnv();

  const personal = process.env.SAID_MODE === 'personal';
  const notary = await loadOrCreateKeyPair('notary');
  const builder = personal ? null : await loadOrCreateKeyPair('builder');
  const publicKeys: PublicKeys = {
    notary: { keyId: notary.keyId, publicKey: notary.publicKey },
    builder: builder ? { keyId: builder.keyId, publicKey: builder.publicKey } : null,
  };
  await savePublicKeys(publicKeys);
  ok(`Signing keys ready in ${paths.home} (notary ${notary.keyId}${builder ? `, builder ${builder.keyId}` : ', no builder in personal mode'})`);
  info('Private keys never leave this machine; only the public keys are pinned in public-keys.json.');

  // Ensure the demo template has node_modules so tests and prepareClientRepo(link) work after npm ci.
  const { spawnSync } = await import('node:child_process');
  const ensure = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'ensure-demo-client.mjs')], { stdio: 'inherit' });
  if (ensure.status) die('Could not install demo/client-site dependencies');

  if (personal) {
    info('SAID_MODE=personal: no builder and no client repo are needed.');
  } else {
    info(`Client repo: ${paths.clientRepo}`);
    try {
      const result = await prepareClientRepo({
        target: paths.clientRepo,
        template: paths.clientTemplate,
        log: (line) => out(`    ${c.dim(line)}`),
      });
      if (result.created) ok('Client repo created: Larkspur landing page committed and tagged `baseline`');
      else ok('Client repo already exists (left untouched: it may contain real work)');
      for (const note of result.notes) warn(note);
    } catch (err) {
      die(`Could not prepare the client repo: ${errorMessage(err)}`);
    }
  }

  const platform = parsePlatform(process.env.SAID_PLATFORM);
  if (platform.invalid) {
    warn(`SAID_PLATFORM=${platform.invalid} is not a platform key. Use telegram, mattermost, slack, discord, teams, or none.`);
  }

  out();
  box(
    'Next steps (live mode)',
    setupSteps(platform.platform).map((line) => line.replaceAll('npm run ', `${c.bold('npm run ')}`).replaceAll('.env', c.bold('.env'))),
  );
}

main().catch((err) => die(errorMessage(err)));

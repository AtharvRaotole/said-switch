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


/** Ensure SAID_HTTP_SHARED_SECRET is set in .env (generate if blank/missing). Never prints the value. */
async function ensureSharedSecret(envFile: string): Promise<void> {
  const raw = await readFile(envFile, 'utf8');
  const match = /^SAID_HTTP_SHARED_SECRET=(.*)$/m.exec(raw);
  const current = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
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

  out();
  box('Next steps (live mode)', [
    '1. Install Switch Console, run a server on this computer   → docs/SETUP_LIVE.md §1',
    '2. Mattermost: developer + client accounts, make a room   → §2',
    `3. Put SWITCH_URL, SWITCH_REGISTRATION_KEY and SAID_ROOM_ID in ${c.bold('.env')}`,
    `4. ${c.bold('npm run register')}     registers @said and @builder, sets addressing → §3`,
    '5. In the channel: !invite-agent @said and !invite-agent @builder (register prints this if needed)',
    `6. ${c.bold('npm run enroll -- --developer "Riya" --client "Dana" --wait')}   → §4`,
    `7. ${c.bold('npm run dev')}          starts notary, builder, console and the client site`,
    `8. ${c.bold('npm run doctor')}       every line should be ✓ before you record  → §5`,
    '',
    `No Switch handy? ${c.bold('npm run demo:offline')} runs the whole story against a clearly-labeled simulator.`,
  ]);
}

main().catch((err) => die(errorMessage(err)));

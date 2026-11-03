/**
 * `npm run enroll -- --developer "Riya" --client "Dana" [--wait]`
 * `npm run enroll -- --partnerA "Sam" --partnerB "Alex" [--wait]`   (personal room)
 *
 * Issues one random single-use code per person. Each types `@said enroll CODE` in the room from their own
 * account; Said binds the code to that account's Switch participant id and then creates the signed ledger.
 */
import { loadConfig, loadEnrollment, loadEnv, ports, saveEnrollment, type SaidConfig } from '@said/runtime';
import { parseFlags } from './lib/args.js';
import { buildEnrollment, enrollLine } from './lib/enrollment.js';
import { fetchJson, pollUntil } from './lib/http.js';
import { box, c, die, errorMessage, fixLine, info, ok, out, step, warn, fail } from './lib/output.js';
import { ledgerPointer, readNotaryState } from './lib/state.js';

interface NotaryState {
  enrollment: null | { roles: Array<{ role: string; label: string; bound: boolean }> };
  signedLedger: null | { payload: { parties: Array<{ role: string; label: string; senderId: string }> } };
}

async function main(): Promise<void> {
  const { values: f } = parseFlags({
    developer: { type: 'string' },
    client: { type: 'string' },
    partnerA: { type: 'string' },
    partnerB: { type: 'string' },
    wait: { type: 'boolean' },
    timeout: { type: 'string' },
    force: { type: 'boolean' },
  });
  loadEnv();

  let config: SaidConfig | null = null;
  try {
    config = await loadConfig();
  } catch {
    // enrollment can be prepared before registering, from .env
  }
  const roomId = config?.roomId ?? process.env.SAID_ROOM_ID?.trim();
  const roomMode = config?.roomMode ?? ((process.env.SAID_MODE?.trim() || 'business') as 'business' | 'personal');
  const saidName = config?.said.name ?? (process.env.SAID_AGENT_NAME?.trim() || 'said');
  if (!roomId) die('No room id known.', 'Run `npm run register` first, or set SAID_ROOM_ID in .env.');

  const wantsBusiness = roomMode === 'business';
  const names = wantsBusiness ? { developer: f.developer, client: f.client } : { partnerA: f.partnerA, partnerB: f.partnerB };
  const usage = wantsBusiness
    ? 'npm run enroll -- --developer "Riya" --client "Dana"'
    : 'npm run enroll -- --partnerA "Sam" --partnerB "Alex"';
  if (Object.values(names).some((n) => !n?.trim())) die(`This is a ${roomMode} room, so both names are required.`, `Usage: ${usage} [--wait]`);
  if (wantsBusiness && (f.partnerA || f.partnerB)) die('--partnerA/--partnerB are for personal rooms (SAID_MODE=personal).');
  if (!wantsBusiness && (f.developer || f.client)) die('--developer/--client are for business rooms (SAID_MODE=business).');

  // A ledger that already exists has its parties locked; new codes could never be redeemed.
  const pointer = ledgerPointer(await readNotaryState());
  if (pointer.ledgerDocumentId && !f.force) {
    die(
      'A signed ledger already exists for this deployment, so its two parties are already locked in.',
      'To start over, run `npm run reset` (archives the old ledger); `--force` here just rewrites enrollment.json.',
    );
  }
  const previous = await loadEnrollment();
  if (previous && previous.roomId === roomId && !pointer.ledgerDocumentId) {
    warn('An unredeemed enrollment from earlier is being replaced; its codes no longer work.');
  }

  step('Issuing enrollment codes');
  const enrollment = buildEnrollment(roomId, { roomMode, labels: names as never });
  await saveEnrollment(enrollment);
  ok('Saved enrollment.json (codes are single-use and only meaningful to this Said)');
  out();
  box('Each person types this in the room, from their own account', [
    ...enrollment.codes.map((e) => `${e.label.padEnd(14)} ${`(${e.role})`.padEnd(12)} ${c.bold(enrollLine(saidName, e.code))}`),
    '',
    'The same person cannot take both roles. Each code works once.',
  ]);

  if (!f.wait) {
    out();
    info(`Add --wait to watch for both parties, or start the notary (${c.bold('npm run dev')}) and have them type the lines above.`);
    return;
  }

  const timeoutMs = Math.max(10, Number(f.timeout ?? 600)) * 1000;
  const base = `http://localhost:${ports.notary}`;
  out();
  info(`Waiting for both parties (up to ${Math.round(timeoutMs / 1000)}s). Polling ${base}/api/state …`);
  let sawNotary = false;
  try {
    const state = await pollUntil<NotaryState>(
      'both parties to enroll',
      async () => {
        let s: NotaryState;
        try {
          s = await fetchJson<NotaryState>(`${base}/api/state`);
        } catch (err) {
          if (!sawNotary) return null;
          throw err;
        }
        if (!sawNotary) {
          sawNotary = true;
          info('Notary is up.');
        }
        const parties = s.signedLedger?.payload.parties;
        if (parties && parties.length === 2) return s;
        if (s.enrollment && s.enrollment.roles.length > 0 && s.enrollment.roles.every((r) => r.bound)) return s;
        return null;
      },
      { timeoutMs, intervalMs: 1500 },
    );
    const parties = state.signedLedger?.payload.parties ?? [];
    ok('Both parties are enrolled.');
    for (const p of parties) out(`    ${p.label.padEnd(14)} ${p.role.padEnd(9)} ${c.dim(p.senderId)}`);
    if (parties.length === 0) info('The ledger is being created; check the console or `npm run doctor`.');
  } catch (err) {
    fail(errorMessage(err));
    if (!sawNotary) fixLine(`The notary is not answering on ${base}. Start it (npm run dev) and run this command again with --wait.`);
    else fixLine('Make sure both people typed their line in the room, mentioning @said, from different accounts.');
    process.exitCode = 1;
  }
}

main().catch((err) => die(errorMessage(err)));

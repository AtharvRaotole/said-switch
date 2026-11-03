/**
 * `npm run reset` — start a fresh demo run WITHOUT destroying evidence.
 *
 *  - client repo: refuses if dirty; tags HEAD `run-<timestamp>`, then `git checkout -B main baseline`
 *  - builder job folders/branches: archived (moved + tagged), never deleted
 *  - ledger: the current `Said Ledger` document is renamed `Said Ledger — archived <timestamp>` and a fresh
 *    signed ledger with the same two parties is created
 *
 * Refuses while the notary is running (`--force` to override). `--force` also archives a ledger that fails verification.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, loadKeyPair, loadPublicKeys, loadSecrets, loadEnv, paths, ports } from '@said/runtime';
import { parseFlags } from './lib/args.js';
import { assertClean, DirtyRepoError, isGitRepo, resetClientRepo, timestampTag } from './lib/git.js';
import { isUp } from './lib/http.js';
import { archiveJobArtifacts } from './lib/jobs-archive.js';
import { createFreshLedger, LEDGER_NAME, loadLedger } from './lib/ledger.js';
import { c, die, errorMessage, info, ok, out, step, warn } from './lib/output.js';
import { clearBuilderJobs, clearLedgerPointer, ledgerPointer, readNotaryState, writeLedgerPointer } from './lib/state.js';
import { withRoomSession } from './lib/switch-session.js';

function archivedName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  return `${LEDGER_NAME} — archived ${day} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

async function main(): Promise<void> {
  const { values: flags } = parseFlags({ force: { type: 'boolean' }, offline: { type: 'boolean' } });
  if (flags.offline) {
    process.env.SAID_HOME = process.env.SAID_OFFLINE_HOME ?? '.said-offline';
    process.env.SAID_WORK = process.env.SAID_OFFLINE_WORK ?? 'work-offline';
  }
  loadEnv();
  const force = flags.force === true;
  const now = new Date();
  const stamp = timestampTag('', now);

  const config = await loadConfig().catch((err) => die(errorMessage(err)));

  step('Preflight');
  const notaryUrl = `http://localhost:${ports.notary}`;
  if (await isUp(`${notaryUrl}/health`)) {
    if (!force) {
      die(
        `The notary is running (${notaryUrl}). Resetting under it would corrupt its view of the ledger.`,
        'Stop `npm run dev` (Ctrl-C), run `npm run reset`, then start it again. `--force` overrides this at your own risk.',
      );
    }
    warn('The notary is running and --force was given: restart it after the reset.');
  } else {
    ok('Notary is not running');
  }

  const repo = paths.clientRepo;
  const hasRepo = config.builder !== null;
  if (hasRepo) {
    if (!existsSync(repo) || !(await isGitRepo(repo))) die(`Client repo not found at ${repo}.`, 'Run `npm run setup`.');
    try {
      await assertClean(repo);
      ok('Client repo is clean');
    } catch (err) {
      if (err instanceof DirtyRepoError) die(err.message);
      throw err;
    }
  }

  const pointer = ledgerPointer(await readNotaryState());
  const archived: string[] = [];

  const resetRepo = async (): Promise<void> => {
    if (!hasRepo) return;
    step('Client repo');
    const result = await resetClientRepo(repo);
    if (result.archivedAs) {
      ok(`Archived the previous run as tag ${c.bold(result.archivedAs)} (${result.previousHead.slice(0, 7)})`);
      archived.push(`client repo history → tag ${result.archivedAs}`);
    } else {
      info('The client repo was already at the baseline: nothing to archive.');
    }
    ok(`main is back at baseline (${result.newHead.slice(0, 7)})`);

    const jobs = await archiveJobArtifacts({
      repo,
      jobsDir: paths.jobs,
      archiveRoot: join(paths.work, 'jobs-archive'),
      stamp,
    });
    if (jobs.movedJobs.length > 0) {
      ok(`Moved ${jobs.movedJobs.length} job folder(s) to ${jobs.archiveDir}`);
      archived.push(`job folders → ${jobs.archiveDir}`);
    }
    for (const b of jobs.taggedBranches) {
      ok(`Kept branch ${b}`);
      archived.push(`branch ${b}`);
    }
    for (const w of jobs.warnings) warn(w);
  };

  const resetBuilderState = async (): Promise<void> => {
    if (!hasRepo) return;
    const dropped = await clearBuilderJobs();
    if (dropped > 0) {
      ok(`Cleared ${dropped} job record(s) from builder-state.json (connection id kept)`);
      archived.push(`${dropped} builder job record(s) (the evidence is the archived tag/folders above)`);
    }
  };

  if (!pointer.ledgerDocumentId) {
    info('No ledger exists yet: nothing to archive in the room.');
    await resetRepo();
    await resetBuilderState();
  } else {
    const [secrets, publicKeys, notaryKey] = await Promise.all([loadSecrets(), loadPublicKeys(), loadKeyPair('notary')]);
    step('Ledger');
    await withRoomSession(config, { agentId: config.said.agentId, apiKey: secrets.saidApiKey }, async ({ ops }) => {
      const loaded = await loadLedger(ops, pointer.ledgerDocumentId!, publicKeys.notary.publicKey);
      if (!loaded.ok) {
        if (!force) {
          die(
            `The current ledger does not verify: ${loaded.reason}`,
            'Nothing was changed. Use `npm run reset -- --force` to archive it anyway and start over.',
          );
        }
        warn(`The current ledger does not verify (${loaded.reason}); archiving it anyway (--force).`);
      }
      const previous = loaded.signed?.payload ?? null;

      await resetRepo();
      await resetBuilderState();

      // Free the name `Said Ledger` (Switch room documents are unique by name per room).
      const newName = archivedName(now);
      let renamed = false;
      try {
        await ops.updateRoomDocument({ documentId: pointer.ledgerDocumentId!, name: newName });
        renamed = true;
        ok(`Renamed the old ledger document to "${newName}"`);
        archived.push(`ledger document ${pointer.ledgerDocumentId} → "${newName}"`);
      } catch (err) {
        if (!force) throw err;
        warn(`Could not rename the old ledger document (${errorMessage(err)}); continuing (--force).`);
      }

      if (!previous) {
        await clearLedgerPointer();
        warn('The old ledger could not be read, so its two parties are unknown. Re-enroll: `npm run enroll -- ... --force --wait`.');
        return;
      }
      if (!renamed) warn('The old ledger document keeps its name; the new one may be refused by name. Delete or rename it in the room.');
      const fresh = await createFreshLedger(ops, previous, notaryKey, now.getTime());
      await writeLedgerPointer({ ledgerDocumentId: fresh.documentId, revision: fresh.revision, digest: fresh.digest });
      ok(`Created a fresh signed ledger (${fresh.documentId}) for the same two parties, revision ${fresh.revision}`);
    });
  }

  out();
  if (archived.length > 0) {
    info('Archived (nothing was deleted):');
    for (const a of archived) out(`    ${a}`);
  }
  ok('Reset complete. Start the services again (npm run dev) for a fresh run.');
}

main().catch((err) => die(errorMessage(err)));

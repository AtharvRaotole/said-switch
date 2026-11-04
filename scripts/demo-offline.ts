/**
 * `npm run demo:offline` - the whole Said story with NO Switch install, for judges and CI.
 *
 *   npm run demo:offline                      # start everything; you play the two people in the chat simulator
 *   npm run demo:offline -- --script          # additionally play the full dark-mode story automatically
 *   npm run demo:offline -- --headless        # no console / client-site dev servers (CI)
 *   npm run demo:offline -- --fresh           # delete work-offline first (re-copies the client site, reinstalls)
 *
 * Ports default to CONSOLE_PORT/NOTARY_PORT/BUILDER_PORT/MOCK_SWITCH_PORT/CLIENT_SITE_PORT
 * (7400/7410/7420/7500/5173). If a default is busy (for example the live stack holds 7410/7420),
 * the demo auto-picks a free port and prints the override. Set those env vars yourself to pin ports.
 *
 * State lives in .said-offline/ and work-offline/ (both git-ignored). Everything here is a SIMULATION:
 * the chat is apps/mock-switch, not the real Switch.
 */
import { loadEnv } from '@said/runtime';
import { parseFlags } from './lib/args.js';
import { DirtyRepoError } from './lib/git.js';
import { sleep } from './lib/http.js';
import { playStory, startOfflineStack, STORY_LINES, type OfflineStack } from './lib/offline.js';
import { banner, box, c, die, errorMessage, info, ok, out, step, warn } from './lib/output.js';
import { enrollLine } from './lib/enrollment.js';

let stack: OfflineStack | null = null;
let stopping = false;

async function shutdown(code: number): Promise<never> {
  if (!stopping) {
    stopping = true;
    out();
    info('Stopping everything…');
    await stack?.stop().catch(() => undefined);
  }
  process.exit(code);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

async function main(): Promise<void> {
  const { values: flags } = parseFlags({
    script: { type: 'boolean' },
    headless: { type: 'boolean' },
    fresh: { type: 'boolean' },
  });
  loadEnv();

  banner(
    [
      'OFFLINE SIMULATION - this is NOT Switch.',
      'A mock Switch server (apps/mock-switch) stands in for Switch, so you can see Said work',
      'without installing anything. Run the live setup (docs/SETUP_LIVE.md) for the real product.',
    ],
    c.yellow,
  );

  step('Starting the offline stack (first run installs the client site: about a minute)');
  try {
    stack = await startOfflineStack({
      headless: flags.headless === true,
      fresh: flags.fresh === true,
      log: (line) => out(`  ${c.dim(line)}`),
    });
  } catch (err) {
    if (err instanceof DirtyRepoError) {
      die(err.message, 'Commit/stash the changes in work-offline/client-site, or run `npm run demo:offline -- --fresh` to start from a new copy.');
    }
    die(`Could not start the offline stack: ${errorMessage(err)}`);
  }
  const s = stack;

  if (s.worker.scripted) {
    banner(
      [
        'SCRIPTED WORKER - NO AI IN THIS RUN',
        `(${s.worker.reason})`,
        'The code change will be applied from a FIXTURE PATCH (demo/fixtures/dark-mode.patch),',
        'not written by Claude Code or Codex. Install and sign in to `claude` or `codex` for a real run.',
      ],
      c.red,
    );
  } else {
    ok(`Coding worker: ${s.worker.worker} (${s.worker.reason}); it will run headless in an isolated git worktree`);
  }

  const [dev, client] = s.enrollment.codes;
  ok(`Enrolled through the simulated chat: ${dev!.label} (developer) and ${client!.label} (client)`);
  out();
  box('Offline demo is running (SIMULATION)', [
    `${c.bold('Chat simulator')}   ${s.urls.chat}      ← play both people here (two personas)`,
    `${c.bold('Said Console')}     ${s.urls.console ?? c.dim('(not started: --headless or failed)')}`,
    `${c.bold('Client site')}      ${s.urls.site ?? c.dim('(not started: --headless or failed)')}      ← watch it gain dark mode`,
    '',
    `Both people are already enrolled (${enrollLine('said', dev!.code)} / ${enrollLine('said', client!.code)} were posted for you).`,
    'Type these lines in the chat simulator, in order:',
    `  ${c.bold('Dana')}   ${STORY_LINES.bypass}`,
    `  ${c.bold('Riya')}   ${STORY_LINES.terms}`,
    `  ${c.bold('Riya')}   ${STORY_LINES.developerAccepts}`,
    `  ${c.bold('Dana')}   ${STORY_LINES.dispute}`,
    `  ${c.bold('Dana')}   ${STORY_LINES.clientAccepts}`,
    '',
    'Ctrl-C stops everything. State: .said-offline/  work-offline/  (git-ignored)',
  ]);

  if (flags.script) {
    step('Playing the dark-mode story (--script)');
    try {
      const { job } = await playStory(s, {
        pauseMs: 1500,
        jobTimeoutMs: s.worker.scripted ? 180_000 : 20 * 60_000,
        print: (line) => out(line),
      });
      out();
      ok(`Story complete: ${job.jobId} applied ${job.changedPaths.join(', ')}.`);
      if (s.urls.site) info(`Open ${s.urls.site} to see the result. Press Ctrl-C to stop.`);
      if (flags.headless) await shutdown(0);
    } catch (err) {
      out();
      warn(errorMessage(err));
      process.exitCode = 1;
      await shutdown(1);
    }
  }

  // Keep running until Ctrl-C; die loudly if a core service crashes.
  for (;;) {
    await sleep(2000);
    const crashed = s.services.find((svc) => svc.exited !== null && (svc.name === 'notary' || svc.name === 'builder'));
    if (crashed) {
      warn(`${crashed.name} ${crashed.exited}. Last output:\n${crashed.tail(10).join('\n')}`);
      await shutdown(1);
    }
  }
}

main().catch((err) => {
  console.error(errorMessage(err));
  void shutdown(1);
});

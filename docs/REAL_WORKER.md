# Run Said with a real coding CLI (Claude Code or Codex)

This box cannot sign in to Claude Code or Codex for free, so the live demo here
uses `SAID_WORKER=scripted`. On your Mac, with Claude Code or Codex already
installed and signed in, you can run the builder with a real model.

Said only supports three workers: `claude`, `codex`, and `scripted`. There is
no free open alternative wired in today.

## Prerequisites

1. Said already registered against your Switch room (see `docs/SETUP_LIVE.md`).
2. One of:
   - **Claude Code** (Claude subscription or Console auth):
     `npm install -g @anthropic-ai/claude-code`, then run `claude` once and
     finish sign-in (`claude auth status` should report logged in).
   - **Codex** (ChatGPT / Codex account):
     `npm install -g @openai/codex`, then `codex login`.
3. Do not put API keys in Said's `.env`. Both CLIs use their own login store.
   Said never reads `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` for the worker.

## Exact commands (Mac)

From the repo root, with your live home (example: `.said-live`):

```bash
export SAID_HOME=.said-live
export SAID_TIMEZONE=America/New_York

# Pick one:
export SAID_WORKER=claude
# or: export SAID_WORKER=codex

# Confirm the binary is on PATH
command -v "$SAID_WORKER"
"$SAID_WORKER" --version

# Preflight (worker check should be ok, not fail)
npm run doctor

# Start notary + builder + console + client site
npm run dev
```

Builder listens on `http://127.0.0.1:7420` by default. Leave `npm run dev`
running, then drive the Mattermost story as in `docs/LIVE_RUN.md` (proposal,
accept, start). When Said posts a signed start authorization, Builder:

1. Verifies the token against the pinned notary key.
2. Creates a clean git worktree under the client repo.
3. Runs the worker:

### Claude Code argv (what Builder execs)

```text
claude -p <prompt> --restricted --tools Read,Edit,Write,Glob,Grep \
  --permission-mode acceptEdits --permission-prompts none \
  --output-format stream-json --verbose --no-session-persistence
```

cwd = the job worktree. No Bash / WebFetch / WebSearch.

### Codex argv (what Builder execs)

```text
codex exec --sandbox workspace-write --json \
  --ephemeral --skip-git-repo-check --color never -C <worktree> <prompt>
```

`codex exec` does not accept `--ask-for-approval` (Codex 0.166.0 exits 2 with `unexpected argument '--ask-for-approval'`). That flag is only on the interactive `codex` command. Exec already runs with approval never. The sandbox stays `workspace-write`.

## Expected output

In the builder log / SSE job stream you should see roughly:

```text
system  claude -p ...   (or: codex exec --sandbox workspace-write ...)
worker  <streamed CLI lines>
system  typecheck ok
system  build ok
room    said-receipt ... COMPLETED
```

In Mattermost / the Switch room, Builder posts a `said-receipt` with
`status: COMPLETED`, a `resultCommit`, and the changed paths. The client site
worktree is discarded after apply; the client repo gains that commit on its
working branch.

If the CLI is missing or not signed in:

- `npm run doctor` fails the worker check with install / login hints.
- A missing binary fails at step `worker` with "Claude Code could not be started." or "Codex could not be started."
- A non-zero exit includes the CLI's own error, for example `Codex exited 2. error: unexpected argument '--ask-for-approval' found`.

## Fall back to scripted

```bash
export SAID_WORKER=scripted
npm run doctor   # warns that the change comes from a fixture patch
npm run dev
```

Scripted applies `fixtures/dark-mode.patch` (or the configured fixture) with
`git apply`. Use that for CI and for demos without a paid CLI login.

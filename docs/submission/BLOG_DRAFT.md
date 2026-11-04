# Said: bilateral consent before an agent may work

Draft for the WeMakeDevs Flip the Switch Best Blog track. Not published. Facts and numbers below come from this repo and a real local Switch 0.31.0 + Mattermost Team Edition live run. No invented metrics.

## The problem

Chat is a terrible place to treat "sure, go ahead" as a contract. A client pings `@builder also add dark mode while you're in there`. A developer thinks dark mode was free. An agent that starts from a single chat line will ship work that one party never accepted, or worse, will ship while the other party is still arguing about price and time.

Said is a bilateral consent notary for Switch rooms. Work starts only when both people accept the same draft. Until then, the builder refuses chat as permission.

## Why Switch

Switch gives Said three things a plain webhook bot does not:

1. A durable room with agents that can be addressed (`@said`, `@builder`) and bridged into Mattermost so humans stay in the chat they already use.
2. Room documents with creator-only writes. Said creates the signed ledger document. On Switch 0.31.0 the builder cannot update or delete that document (creator-only). Humans and agents can read the same `said-ledger` fence.
3. Targeted messages and ops so Said can hand a signed start token to the builder without dumping authorization into a free-for-all.

Live stack used for evidence: Switch `ghcr.io/sandbox-quantum/switch-core:0.31.0`, Mattermost Team Edition `11.9.0`, Postgres 16, Said notary on `:7410`, scripted builder on `:7420`.

## Three primitives

### 1. Drafts

A draft is a scoped change with optional terms. Example from the live run: **DRF-001 v1 · Add dark mode**, terms `+2 days, +$400`, terms hash prefix `cfc398cb8f`. Status words are explicit: `NEEDS_TERMS`, `PENDING`, `LOCKED`.

Either party can set terms. Acceptances are versioned (`Accept DRF-001 v1`). A stale version is refused. Withdraw and reject are first-class.

### 2. Agreements

When both roles accept the same draft version, Said locks an agreement (**AGR-001**). The lock message in the room shows both local clocks, the short terms hash, and hands off to `@builder`. The signed ledger revision advances. JSON timestamps stay millisecond UTC; room copy uses the configured zone (default `America/New_York`, e.g. `Nov 3, 10:42:22 PM ET`).

### 3. Signed start tokens and receipts

Said sends the builder a one-line human summary plus a fenced `said-start` JSON token (agreement, job, expires, key id, signature attached). Switch's targeted send prefixes a single `@builder`. The builder verifies the signature against the pinned notary public key, runs the worker, and returns a fenced `said-receipt`. Said records `READY` then `RUNNING` then `COMPLETED` (or failure) on the agreement.

In the live polish run the scripted worker completed **JOB-AGR-001-1** as commit `5dfc874` on `work/client-site` (2 files: `src/App.tsx`, `src/styles.css`; typecheck passed; build passed) over baseline `5101d11`.

## Real live-run evidence

Channel display name **Said Larkspur** (`said-larkspur-63709`), Switch room `3d378e1f-cab6-40d9-9b9f-09e3ef146560`, ledger document `b8dcd86b-ee72-4c98-bae0-5beb20110070`, ledger revision 11 at capture.

Beat list and ids: [docs/LIVE_RUN.md](../LIVE_RUN.md).

UI screenshots (Playwright 1440x900 @2x against real Mattermost):

- [docs/media/live/mm-ui-riya-terms-accept.png](../media/live/mm-ui-riya-terms-accept.png): terms, first accept, dispute opens
- [docs/media/live/mm-ui-riya-dispute-ledger.png](../media/live/mm-ui-riya-dispute-ledger.png): timestamped ledger quote while PENDING
- [docs/media/live/mm-ui-riya-lock-handoff.png](../media/live/mm-ui-riya-lock-handoff.png): dual lock, start summary, fenced token
- [docs/media/live/mm-ui-riya-builder-complete.png](../media/live/mm-ui-riya-builder-complete.png): completed job with commit and checks
- [docs/media/live/mm-ui-riya-complete-drf002.png](../media/live/mm-ui-riya-complete-drf002.png): complete plus change request waiting on Dana
- [docs/media/live/mm-ui-dana-lock-handoff.png](../media/live/mm-ui-dana-lock-handoff.png): same channel as Dana

Measured quality on the merged tree at this draft: `npm test` 25 files / 245 passed; coverage Statements 92.84% / Branches 80.78% / Functions 95.21% / Lines 96.17%. Lint and typecheck clean.

## What was hard

- **Mattermost bridge identity.** Live senders arrive as Matrix actor ids (`@switch-mattermost-…:localhost`). Enrollment and roster matching have to stick to those ids, not display names alone.
- **Creator-only ledger.** Builder document writes fail on the bridged room; probes must not overwrite Said's ledger with placeholder markdown or the notary halts.
- **Chat is not auth.** The builder must refuse casual `@builder` asks and only start from a verified `said-start` token.
- **Room copy vs signed record.** Humans need ET (or another `SAID_TIMEZONE`) clocks in chat. The signed ledger and receipt markdown keep exact UTC ISO. Getting both wrong either confuses judges or weakens verification.
- **Targeted mentions.** `send_targeted_message` already prefixes `@builder`. Putting another `@builder` in the body produced `@builder @builder` until the body was a summary without a leading mention.
- **Fresh channels and job worktrees.** Re-running the story needs a clean Mattermost channel, a remapped Switch room, cleared `.said-live` notary state, and no leftover `said/JOB-*` git worktree or the scripted apply fails.

## How to run it

Offline (no Switch), for CI and judges:

```bash
npm install
npm run setup
npm run demo:offline
npm test
```

Live (local throwaway Switch + Mattermost under `/workspace/switch-live` or your own compose):

```bash
# stack up: postgres, switch:8000, mattermost:8065
export SAID_HOME=.said-live SAID_WORKER=scripted SAID_TIMEZONE=America/New_York
npm run setup && npm run register   # needs SWITCH_URL + registration key + room id
npm run enroll -- --developer "Riya" --client "Dana"
# redeem codes from each human Mattermost account, then:
npm run dev
# optional driver + screenshots:
npm run live:e2e
npx tsx scripts/mm-ui-shots.ts
```

See [docs/SETUP_LIVE.md](../SETUP_LIVE.md) and [docs/LIVE_RUN.md](../LIVE_RUN.md).

## Closing

Said does not replace judgment about what to build. It makes the moment of "both people meant this" machine-checkable before an agent touches the repo. Drafts, agreements, and signed start tokens are small primitives. On a real Switch bridge they are enough to stop silent scope creep in the room where the argument already happens.

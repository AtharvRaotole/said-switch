# Live Switch + Mattermost run evidence

Box local time zone: America/New_York (ET). Captured during the 2026-11-03 evening ET window (polish retake).

This is a real Switch 0.31.0 stack with a real Mattermost Team Edition bridge. Humans posted through the Mattermost API as throwaway accounts. No Atharv clicks were required for the story itself. Room timestamps render in `SAID_TIMEZONE` (default America/New_York). Signed ledger JSON and receipt markdown keep exact UTC ISO.

## Stack

| Piece | Where |
| --- | --- |
| Compose | `/workspace/switch-live` (host-network overlay; box lacks full iptables bridge DNS) |
| Switch | `ghcr.io/sandbox-quantum/switch-core:0.31.0` on `http://127.0.0.1:8000` |
| Mattermost | `mattermost/mattermost-team-edition:11.9.0` on `http://127.0.0.1:8065` |
| Postgres | `postgres:16-alpine` |
| Said notary | `http://127.0.0.1:7410` with `SAID_HOME=.said-live`, `SAID_TIMEZONE=America/New_York` |
| Said builder | `http://127.0.0.1:7420`, `SAID_WORKER=scripted` |
| Client site | `work/client-site` on `http://127.0.0.1:5173` |

Local throwaway credentials live only under `/workspace/switch-live/.env` and `live-e2e-secrets.json` (gitignored). Never commit them.

## Bridged room

| Item | Value |
| --- | --- |
| Switch room id | `3d378e1f-cab6-40d9-9b9f-09e3ef146560` |
| Room name | Said Larkspur |
| Mattermost channel | `said-larkspur-63709` (display name Said Larkspur) |
| Bridge type | mattermost |
| External channel | `mattermost://127.0.0.1:8065/switch/channels/said-larkspur-63709` |
| Ledger document id | `b8dcd86b-ee72-4c98-bae0-5beb20110070` |
| Said agent id | `8727bf4e-ba2e-4697-8c4f-c740b6a8b3f8` |
| Builder agent id | `70dd1521-0201-42c2-b7f0-53176b52a053` |
| Ledger revision at capture | 11 |

Enrollment codes (single-use, already redeemed in this run): Riya `XTK5TF5X`, Dana `9UGARDD9`.

Live message senders are Matrix actor ids such as `@switch-mattermost-{bridge}-{username}:localhost`. Said matches those to roster parties by id or by username (`actorMatches` in `@said/switch-client`).

## Story beats that actually ran

Driven by posting as Mattermost users `riya-dev` (display Riya / developer) and `dana-client` (display Dana / client):

1. Dana directly commands `@builder Also add dark mode while you're in there` → Builder refuses (chat is not a signed start authorization).
2. Scope lands as **DRF-001** with terms `+2 days, +$400`, terms hash prefix `cfc398cb8f`.
3. Riya accepts; Dana disputes (`Wait, I thought we agreed dark mode was free?`).
4. Said replies with a timestamped ledger quote in ET (status PENDING, terms on record, who accepted, who has not, and the earlier `@builder` bypass request time).
5. Dana accepts → dual lock → **AGR-001** → Said posts a one-line start summary (`Start authorization for **AGR-001** · job · expires · key · signature attached`) plus a fenced `said-start` token (single `@builder` prefix from Switch targeting).
6. Scripted builder runs **JOB-AGR-001-1** and completes commit `5dfc874` on `work/client-site` (dark mode over baseline `5101d11`), checks typecheck passed and build passed.
7. While the job was running, Dana's `Amend AGR-001` became change-request **DRF-002 v1** (terms `+1 day, +$150`, hash prefix `b7f1ede98a`).
8. Dana also `Propose:`d a contrast-safe theme toggle → **DRF-003 v1** PENDING. Riya accepted **DRF-002**; Said waits on Dana. Dual signature required before anything starts.

## Creator-only ledger document

Against a non-bridged probe room earlier the same evening:

```
PASS: builder update rejected: Switch API 403: Agent 70dd1521-… did not create document 7a361f55-…
PASS: builder delete rejected: Switch API 403: Agent 70dd1521-… did not create document 7a361f55-…
PASS: said update ok
```

Against the live bridged Larkspur ledger, builder can `post_message` after `connect_to_room`, but `update_room_document` / `create_room_document` / `delete_room_document` are hard-rejected (Switch 0.31.0 returns `400 Not connected to a room` for those non-creator document writes on this bridged room). Said (creator) can update. Evidence: `/workspace/said-live-shots/ledger-edit-reject.json`, `builder-write-probe.json`.

Do not overwrite the live ledger from probes as Said with placeholder markdown. That removes the `said-ledger` fence and halts the notary. `scripts/live-doc-auth-probe.ts` is builder-only for that reason.

## Real Mattermost UI screenshots

Headless Playwright/Chromium against `http://127.0.0.1:8065` (1440x900 viewport, 2x device scale). Logged in as `riya-dev` and `dana-client` with the throwaway secrets file. Navy custom theme; preview-mode banner disabled; teammate names show as **Riya** and **Dana**.

| Beat | File |
| --- | --- |
| Terms + first accept + dispute opens | `docs/media/live/mm-ui-riya-terms-accept.png` |
| Timestamped ledger quote on dispute | `docs/media/live/mm-ui-riya-dispute-ledger.png` |
| Dual lock, handoff, builder run | `docs/media/live/mm-ui-riya-lock-handoff.png` |
| Builder complete (commit + checks) | `docs/media/live/mm-ui-riya-builder-complete.png` |
| Complete + DRF-002 pending (Riya accepted, waiting on Dana) | `docs/media/live/mm-ui-riya-complete-drf002.png` |
| Same channel as Dana | `docs/media/live/mm-ui-dana-lock-handoff.png` |

Raw captures (including extras) also live under `/workspace/said-live-shots/ui/`. Re-capture with `npx tsx scripts/mm-ui-shots.ts`.

## Evidence paths (box)

| Artifact | Path |
| --- | --- |
| Mattermost API transcript | `/workspace/said-live-shots/mm-transcript.json` |
| HTML transcript (for screenshots) | `/workspace/said-live-shots/mm-transcript.html` |
| Notary state snapshot | `/workspace/said-live-shots/notary-state.json` |
| Story post ids | `/workspace/said-live-shots/story-posts.json` |
| Builder worktree commit stat | `/workspace/said-live-shots/builder-worktree.txt` |
| Doc-edit reject probe | `/workspace/said-live-shots/ledger-edit-reject.json` |
| Real Mattermost UI PNGs | `/workspace/said-live-shots/ui/` |

Committed media copies (sanitized, no secrets): `docs/media/live/`.

## Re-run

```bash
# Stack must already be up (compose under /workspace/switch-live). Said: SAID_HOME=.said-live SAID_TIMEZONE=America/New_York npm run dev
cd /workspace/said-core
npm run live:e2e -- --capture-only   # refresh transcript + state
# or drive story posts again (best after npm run reset + re-enroll on a fresh channel):
npm run live:e2e
npx tsx scripts/mm-ui-shots.ts
```

`npm run live:e2e` leaves Switch, Mattermost, and Said running.

Fresh bootstrap outline (throwaway MM):

1. `docker compose -f standalone-docker-compose.yml -f docker-compose.host.yml up -d postgres switch mattermost`
2. Create admin + humans via Mattermost API (or first-run wizard); create team/channel.
3. Connect the channel in Switch as a Mattermost bridge room; invite `@said` and `@builder`.
4. `npm run setup && npm run register` with local registration key; put room id in `.said-live/config.json`.
5. Set addressing-policy to anyone / owner_and_owner_agents via gateway if ops refuse.
6. `npm run enroll -- --developer "Riya" --client "Dana" --wait` and redeem codes from each human account.
7. `SAID_HOME=.said-live SAID_WORKER=scripted SAID_TIMEZONE=America/New_York npm run dev`
8. Write `live-e2e-secrets.json` (gitignored) with `channel_id` and passwords; run `npm run live:e2e`.

## Earlier non-bridge agent protocol probe

Room `8acbcc8a-16bb-4d3b-843f-4e1fe1c3ebc4` still documents WS + ops + creator-only 403 via `scripts/live-ws-probe.ts` / the prior `live-doc-auth.json` under `/workspace/switch-live`.

## Mac plug-and-play

See `scripts/mac/README.md` and `docs/ENGINEERING_NOTES.md`. Atharv supplies Docker Desktop, Switch Console, registration API key, two Mattermost accounts, and the room id.

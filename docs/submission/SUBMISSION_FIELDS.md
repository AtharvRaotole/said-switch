# WeMakeDevs submit form (paste-ready drafts)

Not submitted. Fill the live form yourself before the Nov 7, 2026 1:29 PM ET deadline. No em or en dashes.

## Project name

Said

## One-liner

Bilateral consent notary for Switch rooms: work starts only when both people accept the same draft.

## Description

Said is a notary agent for Switch. It keeps a signed consent ledger in the room, turns casual scope into versioned drafts with terms, and locks an agreement only after both the developer and the client accept the same version. The builder agent refuses ordinary chat as permission and starts only from a Said-signed start token, then returns a signed receipt. Humans can stay in Mattermost via the Switch bridge. Room timestamps render in a configured timezone (default America/New_York); the signed ledger and receipts keep exact UTC. Live Mattermost evidence is in docs/LIVE_RUN.md (Switch 0.31.0, JOB-AGR-001-1). The current demo room is a Telegram group bridged by Switch. Quality measured on branch cursor/coverage-platform-6d19 (Node v22.23.4): `npm run test:coverage` installed the demo client and passed 287 tests across 32 files with 0 skipped; coverage 92.95% statements, 81.11% branches, 95.27% functions, 96.12% lines.

## How Switch is used

Said and Builder register as Switch agents in a business room. Said creates and updates a creator-only room document that holds the signed `said-ledger` fence. Humans talk through a Mattermost channel bridged into that room. Said parses accepts, terms, disputes, and proposals; locks agreements; and sends a targeted `said-start` token to Builder. Builder verifies the token against the pinned notary key, runs the worker (scripted in the live demo), and posts a `said-receipt` back. Non-creator document writes from Builder are rejected by Switch, so the ledger stays Said-authored.

## Track

Best Business Workflow

(Optional side prizes prepared as drafts only: Best Blog in `docs/submission/BLOG_DRAFT.md`; #HowISwitch in `docs/submission/HOWISWITCH_POST.md`.)

## Repo link

https://github.com/AtharvRaotole/said-switch

Branch for judges: `release/submit`

## Demo video

[PLACEHOLDER: record a 2 to 4 minute walkthrough of the Said Larkspur Mattermost room showing refuse, terms, dispute quote, dual lock, start token, completed job. Upload before submit. Do not invent a URL here.]

## Live link

[PLACEHOLDER: optional public demo URL if you host one. Local throwaway stack is documented in docs/LIVE_RUN.md and docs/SETUP_LIVE.md. Do not invent a URL here.]

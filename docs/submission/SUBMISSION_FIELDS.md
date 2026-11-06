# WeMakeDevs submit form (paste-ready drafts)

Not submitted. This file is copy for the form. No em or en dashes. Deadline: Nov 7, 2026, 11:59 PM IST (1:29 PM ET).

## Project name

Said

## One-liner

Bilateral consent notary for Switch rooms: work starts only when both people accept the same draft.

## Description

Said is a notary agent for Switch. It keeps a signed consent ledger in the room, turns casual scope into versioned drafts with terms, and locks an agreement only after both the developer and the client accept the same version. The builder agent refuses ordinary chat as permission and starts only from a Said-signed start token, then returns a signed receipt. Humans can stay in Telegram, Mattermost, or another Switch bridge. Room timestamps render in a configured timezone (default America/New_York); the signed ledger and receipts keep exact UTC. Mattermost evidence is in docs/LIVE_RUN.md (Switch 0.31.0, scripted worker, JOB-AGR-001-1, commit 5dfc874). The demo video is a Telegram group bridged by Switch. Quality measured on main (Node v22.23.4): `npm run test:coverage` passed 289 tests across 32 files with 0 skipped; coverage 92.95% statements, 81.11% branches, 95.27% functions, 96.12% lines.

## How Switch is used

Said and Builder register as Switch agents in a business room. Said creates and updates a creator-only room document that holds the signed `said-ledger` fence. Humans talk in a Telegram group that Switch bridges into that room. Said parses accepts, terms, disputes, and proposals; locks agreements; and sends a targeted `said-start` token to Builder. Builder verifies the token against the pinned notary key, runs the worker, and posts a `said-receipt` back. Non-creator document writes from Builder are rejected by Switch, so the ledger stays Said-authored. The Mattermost capture in docs/LIVE_RUN.md used the scripted worker. The Telegram run the owner reported used Codex and landed commit c7fbb52 in the client repo. That commit is runtime evidence. It is not a file in this repository.

## Track

Best Business Workflow

(Optional side prizes prepared as drafts only: Best Blog in `docs/submission/BLOG_DRAFT.md`; #HowISwitch in `docs/submission/HOWISWITCH_POST.md`.)

## Repo link

https://github.com/AtharvRaotole/said-switch

Branch for judges: `main`

## Demo video

https://youtu.be/1vA87efXzM8

## Blog

https://atharvraotole.hashnode.dev/i-put-a-coding-agent-in-a-client-chat-and-taught-it-to-say-no

## Live link

https://said-switch.pages.dev

That URL is the static marketing site. It is not a live Switch server. Local setup is in the README, docs/SETUP_LIVE.md, and docs/LIVE_RUN.md.

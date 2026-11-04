# Live Switch run evidence (box, 2026-11-03 evening ET)

This documents a real Switch 0.31.0 stack on the engineering box, not mock-switch.

## What ran

- Docker static binary 27.5.1 with `vfs` storage and `--iptables=false` (box has no full iptables bridge path).
- Compose from sandbox-quantum/switch standalone compose 0.31.0 under `/workspace/switch-live`, overridden to host networking because bridge DNS failed without iptables.
- Containers: `postgres:16-alpine`, `ghcr.io/sandbox-quantum/switch-core:0.31.0`, `mattermost/mattermost-team-edition:11.9.0`.
- Gateway profile disabled (port 3000 conflict); Switch HTTP UI/API on `:8000`.
- `listeners_gate` LISTEN unhealthy is expected when `core_replicas=1` and is non-gating.

## Agents and room

| Item | Value |
| --- | --- |
| Room id | `8acbcc8a-16bb-4d3b-843f-4e1fe1c3ebc4` |
| Said agent id | `8727bf4e-…` (see `/workspace/switch-live/said-agents.json` on the box, not committed) |
| Builder agent id | `70dd1521-…` |
| Ledger document id | `7a361f55-8da7-47e7-be7e-2ac4b3d05ced` |
| Switch version | `0.31.0` (agent-protocol speaks 9 / accepts 1) |

Registration used a local registration key from the live Switch `.env` (never committed). Agents were registered with `POST /agents`. Ops required an open WebSocket (`/agents/{id}/connection/ws`) plus `x-switch-connection-id`. Direct `POST /agents/{id}/message` works without a WS connection.

## Probe results (text evidence)

From `scripts/live-ws-probe.ts` against real Switch:

```
opening ws connectionId=8f2bbffd-706d-4e2b-b953-1c5fac3c93a1 room=8acbcc8a-16bb-4d3b-843f-4e1fe1c3ebc4
STATE {"state":"open",...,"serverVersion":{"version":"0.31.0",...}}
connect_to_room ok
post_message event_id=sw_a99f78f7acb849e5ac31029872497eb2
create_room_document document_id=7a361f55-8da7-47e7-be7e-2ac4b3d05ced
update_room_document by creator: {"document_id":"7a361f55-8da7-47e7-be7e-2ac4b3d05ced","status":"ok"}
load_internal_documents count=1
```

From `scripts/live-doc-auth-probe.ts` (creator-only room documents):

```
PASS: builder update rejected: Switch API 403: Agent 70dd1521-… did not create document 7a361f55-…
PASS: builder delete rejected: Switch API 403: Agent 70dd1521-… did not create document 7a361f55-…
PASS: said update ok: {"document_id":"7a361f55-8da7-47e7-be7e-2ac4b3d05ced","status":"ok"}
```

That is the Switch primitive judges care about: agent-owned room state that a non-creator agent cannot edit. Human Mattermost UI edit rejection was not separately exercised in this run (agent non-creator 403 is proven).

## Full bilateral chat E2E on this box

A full Mattermost human UI accept/refuse story was not completed overnight because this box has no interactive Mattermost browser session for two human accounts. The agent protocol path (register, WS, connect, post, document CRUD, creator-only 403) is proven live. Offline E2E with mock-switch + scripted worker covers draft → refuse bypass → dual accept → handoff → builder execute → dispute quote.

## Exact commands used (box)

```bash
# Docker daemon (static)
dockerd --storage-driver=vfs --iptables=false ...
# Compose (host network override)
cd /workspace/switch-live
docker compose -f standalone-docker-compose.yml -f docker-compose.host.yml up -d postgres switch mattermost
# Probes from said-core worktree
npx tsx scripts/live-ws-probe.ts
npx tsx scripts/live-doc-auth-probe.ts
```

## Mac plug-and-play (morning)

See `scripts/mac/README.md` and `docs/ENGINEERING_NOTES.md`. Atharv supplies: Docker Desktop running, Switch Console local server, registration API key, two Mattermost accounts, room id. Then:

```bash
cp .env.example .env   # fill SWITCH_URL, SWITCH_REGISTRATION_KEY, SAID_ROOM_ID
npm install
npm run setup && npm run register && npm run enroll -- --developer "…" --client "…" --wait
npm run doctor
npm run dev
```

Or one-shot helper: `scripts/mac/live-checklist.sh` (prints the checklist; does not invent secrets).

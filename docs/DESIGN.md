# Said: Design Spec (binding)

This is the authoritative design for the hackathon build. `PLAN.md` is the original research plan; where they disagree, this document wins.

## 1. Product in one paragraph

Said is a consent notary that sits in a Switch room between two parties (a developer and a client, or two partners). Any request becomes a numbered draft. Work starts only when **both enrolled parties accept the same draft version with the same terms hash**. Approvals are bound to the **Switch-authenticated participant ID** of the sender, never to a display name or to text an LLM produced. The ledger lives in a Switch **Room Document** that only Said can write, and every revision is Ed25519-signed. When both sides accept, Said hands a signed start authorization to a **builder controller** owned by the developer, which re-verifies everything on its own and only then runs Claude Code or Codex headless in an isolated git worktree, checks the diff and the build, and applies the change. When someone says "I thought we agreed…", Said answers from the signed ledger with exact quotes and timestamps.

## 2. Hackathon framing

- Track: **Best Business Workflow** (Track 01). Side tracks: Code with Wispr, Best Blog, #HowISwitch.
- Judging: Use of Switch 30%, Technical execution 25%, Creativity/impact 25%, Presentation 20%.
- Headline: Switch's own docs say approval-before-action rules are "only the instructions" and tell operators to "put the control … in a sign-off step". Said is that sign-off step, built on Switch primitives.
- Deadline: submissions close **Nov 7 2026, 11:59 PM IST (1:29 PM US Eastern)**.

## 2a. Copy and visual rules (apply to every UI, chat reply, README and doc)

- **No em dashes or en dashes** (Unicode U+2014 / U+2013) anywhere a person reads them. Use periods, commas, colons or parentheses. Hyphens in compound words are fine.
- **Plain language first.** A non-technical person (or a 12-year-old) must understand any screen in five seconds. Lead with what is happening in everyday words ("Waiting for Dana to agree", "Both agreed. Work can start."); technical detail (hashes, signatures, participant ids) sits underneath, labeled in plain words ("Fingerprint of the exact terms", "Tamper seal").
- **No AI-default look.** No orange/terracotta or purple-gradient themes, no generic sparkle/robot logos, no emoji-as-UI, no lorem ipsum. Real fonts (self-hosted via `@fontsource`), a deliberate palette, crafted SVG marks, purposeful motion.

## 3. Non-negotiable guarantees

1. Only the two enrolled participant IDs can approve. Display names, quoted text, reported approvals ("Dana said yes"), conditional/negated approvals, and LLM interpretations never count.
2. An approval binds `(draftId, version, termsHash)`. Any revision clears both approvals.
3. A proposal is not an approval. The proposer must accept explicitly.
4. The builder never starts on a chat message alone. It independently verifies: sender is Said's participant ID, the start token signature, the signed ledger loaded from the room document, both distinct enrolled approvals on identical terms hash, agreement LOCKED, job not already done.
5. The coding worker receives only the accepted scope and terms, never the raw transcript, keys, or credentials. It runs in a disposable git worktree with no shell tool. Only allow-listed paths may change. Typecheck and build must pass before apply.
6. If the ledger document is missing, malformed, or fails signature verification, Said stops authorizing and says so in the room. It never silently re-creates an empty ledger.
7. Offline mode (mock Switch) is always labeled as a simulation in UI, logs and README. It never pretends to be Switch.

## 4. Architecture

```
Mattermost (dev + client)  <->  Switch server  <->  said (notary)  ---- Room Document "Said Ledger" (signed)
                                   |   ^                 |  send_targeted_message(start token)
                                   |   |                 v
                                   |   +-------------- builder (controller) --> git worktree --> claude -p / codex exec
                                   |                     | typecheck + build + path allowlist --> ff-merge into client repo
                                   v                     v
                           visible refusals        execution receipt (signed) -> said -> ledger
Said Console (browser): read-only mirror; verifies ledger signature in the browser with the pinned public key.
```

### Repository layout (npm workspaces, TypeScript, Node >= 22.12)

| Path | Package | Responsibility |
|---|---|---|
| `packages/core` | `@said/core` | Pure, isomorphic domain: types, parser, state machine, canonical JSON, SHA-256, Ed25519, ledger render. No I/O. |
| `packages/switch-client` | `@said/switch-client` | Switch agent protocol client: register, ops, WebSocket with ping/pong, cursor, reconnect. Node only. |
| `apps/notary` | `@said/notary` | Said: room event loop, engine, document persistence, replies, handoff, enrollment; HTTP+SSE API for the console. |
| `apps/builder` | `@said/builder` | Builder controller: verification, job lifecycle, worker adapters (claude, codex), diff validation, checks, apply, receipts; HTTP+SSE job API. |
| `apps/console` | `@said/console` | Said Console dashboard (React + Vite + Tailwind v4). |
| `apps/mock-switch` | `@said/mock-switch` | Offline Switch-protocol simulator with a two-persona chat page. Test and judge offline mode only. |
| `demo/client-site` | (template) | The client's light-only landing page that the builder edits. Copied to `work/client-site` (own git repo) by setup. |
| `scripts/` | | `setup`, `register`, `enroll`, `doctor`, `reset`, `demo-offline`, scenario runners (run with `tsx`). |
| `templates/` | | Switch room template(s). |

### Ports (defaults, overridable by env)

| Service | Port |
|---|---|
| Said Console | 7400 |
| Notary API | 7410 |
| Builder API | 7420 |
| Mock Switch | 7500 |
| Client site (vite dev) | 5173 |

## 5. Domain model

The exact TypeScript contracts live in `packages/core/src/types.ts`. Summary:

- **Party**: `{ role: 'developer' | 'client' | 'partnerA' | 'partnerB', label, senderId }`. `senderId` is the opaque Switch participant id (`@switch-user-…:server`). Exactly two parties, distinct ids.
- **Receipt**: `{ senderId, senderName, role, messageId, timestamp (server ms), text, threadId }`, a quote of an authenticated message.
- **Draft**: `id` `DRF-001`, `version` (1..n), `scope`, `terms` (free text, e.g. `+2 days, +$400`; `null` means NEEDS_TERMS), `termsHash`, `status`, `request` (receipt of the original ask), `proposal` (receipt of who set the current version's terms), `approvals` (per role, `ApprovalReceipt | null`), `history` (previous versions), timestamps.
- **termsHash** = `sha256hex(canonicalJson({ roomId, draftId, version, scope, terms }))`.
- **Agreement**: `AGR-001`, locked copy of draft id/version/scope/terms/termsHash, both approval receipts, `lockedAt`, `execution` (nullable).
- **Execution**: `jobId`, `status` (`READY → RUNNING → VALIDATING → COMPLETED | FAILED`), `baseCommit`, `resultCommit`, `changedPaths`, `checks[]`, `worker` (`claude` | `codex`), timestamps, `error`.
- **Refusal**: a logged bypass attempt (someone addressed the builder directly), with receipt and the outcome.
- **Ledger**: `schema: 'said.ledger/v1'`, `deploymentId`, `roomId`, `mode` (`business` | `personal`), `parties`, `revision`, `updatedAt`, counters, `drafts`, `agreements`, `refusals`, `audit` (append-only event list), `processedMessageIds` (last 500).
- **SignedLedger**: `{ payload: Ledger, digest: sha256hex(canonicalJson(payload)), keyId, signature: base64(ed25519(digest bytes)) }`.

### Draft status machine

```
NEEDS_TERMS --(terms set)--> PENDING --(both accept same version)--> LOCKED (creates Agreement)
PENDING --(revise)--> PENDING (version+1, approvals cleared, old version -> history as SUPERSEDED)
PENDING|NEEDS_TERMS --(reject by either party)--> REJECTED
PENDING --(withdraw own approval)--> PENDING (that approval cleared)
```

Locked terms are immutable. Changing them requires a new draft.

## 6. Command language (deterministic)

Case-insensitive. Optional leading `@said`. IDs accept `DRF-001`, `drf-1`, `DRF1`.

| Intent | Examples | Rule |
|---|---|---|
| propose | `Propose: Add dark mode \| Terms: +2 days, +$400` | Creates draft v1 PENDING (or NEEDS_TERMS without `Terms:`). Not an approval. |
| terms | `Terms DRF-001: +2 days, +$400` | Sets terms on NEEDS_TERMS (-> v1 PENDING) or revises PENDING (version+1). |
| revise | `Revise DRF-001: Add dark mode \| Terms: +1 day, +$300` | version+1, approvals cleared. |
| accept | `Accept DRF-001 v1`, `I accept DRF-001 v1`, `Fine, I accept DRF-001` | Version optional only when the draft has a single version. Bare `Yes, I accept` only if exactly one draft is PENDING. |
| reject | `Reject DRF-001` | |
| withdraw | `Withdraw DRF-001` | Removes only the sender's approval, before lock. |
| status | `Status`, `Status DRF-001` | |
| evidence | `What did we agree about dark mode?`, `I thought we agreed…`, `we never agreed`, `you said` | Answers from the ledger only. |
| request (natural language) | `Also add dark mode while you're in there`, `can you add CSV export` | Creates a NEEDS_TERMS draft. Never grants authority. |
| enroll | `enroll 7KQ2` | Only during enrollment, code issued by the operator CLI. |

Never accepted as approval: conditional (`I accept if…`, `accept once…`), negated (`I don't accept`, `not accepting`), quoted (`> accept`, text inside quotes), reported (`she accepts`, `client accepted`), approvals inside multi-line pasted instructions, and anything not from an enrolled party. Casual chat (`hi`, `thanks`, `lol`) produces no reply and no ledger write.

Natural-language request detection is deterministic pattern matching (verbs like add/build/implement/change/make/include/support + an object, or "can you/could you/please … "). An optional LLM extractor may later propose a cleaner scope string, but its output only ever creates an unapproved NEEDS_TERMS draft.

Said never invents prices or deadlines.

## 7. Switch integration (verified against switch main @ b5b33c3, server 0.31, console 0.40)

- Register with `POST /agents` using a registration API key; response `{id, api_key}` (key returned once). Names: `said`, `builder`.
- Addressing: `said` → `anyone` (admits unlinked Mattermost users; verified in `core/switch_core/addressing.py`). `builder` → `owner_and_owner_agents` (default for new agents). Switch refuses the client visibly with: `You're not permitted to direct messages to me in this room, my operator has restricted who can address me here.` (or the unclaimed-account variant).
- Events: WebSocket `GET /agents/{id}/connection/ws?connection_id=<uuid>&rooms=<roomId>&filter=all`, `Authorization: Bearer <api key>`. Frames: `connection_state` first; domain events `{event, data:{type, room_id, payload, sequence}, id}`; answer every `ping` with `{"type":"pong","cursor":n}` before processing. Message payload: `addressed, sender, sender_name, message_id, body, timestamp, thread_id, attachments`.
- Said uses `filter=all` so it sees bypass attempts addressed to the builder. The builder uses `filter=addressed`.
- Operations: `POST /agents/{id}/ops/{op}` with `X-Switch-Connection-Id`, args unwrapped in body, response `{result}`. Used: `connect_to_room`, `post_message`, `send_targeted_message`, `read_context`, `list_participants`, `create_room_document`, `update_room_document`, `load_internal_documents`, `update_agent_detail`.
- Room documents: only the creating agent can update; humans can delete in the UI; 1 MiB max; no compare-and-swap. Said is the single writer; after each write it reads back and verifies the digest.

## 8. Ledger document format

Name `Said Ledger`. Content = human-readable Markdown rendered from the payload, followed by a fenced block:

````
```said-ledger
{"payload":{...},"digest":"…","keyId":"…","signature":"…"}
```
````

The machine block is the only source of truth. The Markdown above it is generated, never parsed.

## 9. Said ↔ builder protocol (over Switch targeted messages)

Said → builder (after lock), body:

```
@builder Agreement AGR-001 is locked. Start authorization follows.
```said-start
{"type":"said.start/v1","agreementId":"AGR-001","jobId":"JOB-AGR-001-1","termsHash":"…","ledgerRevision":12,"ledgerDocumentId":"…","issuedAt":…,"expiresAt":…,"keyId":"…","signature":"…"}
```
```

Signature covers `canonicalJson` of the token without `signature`. Builder → Said (`send_targeted_message` to `said`), body contains a fenced `said-receipt` block: `{"type":"said.receipt/v1","jobId","agreementId","status":"RUNNING"|"COMPLETED"|"FAILED","baseCommit","resultCommit","changedPaths","checks","worker","at","keyId","signature"}` signed with the builder's own Ed25519 key. Said verifies sender participant id and signature, updates the execution record, re-signs the ledger, and posts a summary. Progress lines go to the agreement thread as ordinary builder messages.

## 10. Builder execution

1. Verify (section 3.4). Derive `jobId = JOB-<agreementId>-<attempt>`; refuse duplicates.
2. `git worktree add work/jobs/<jobId> -b said/<jobId> <baseCommit>` in `work/client-site` (its own repo). Symlink `node_modules` from the base checkout.
3. Worker prompt contains only: agreement id, scope, terms, allowed paths, acceptance checklist (for dark mode: accessible toggle, keyboard operable, persists choice in localStorage, covers hero/pricing/footer/background, readable contrast, focus rings visible).
4. Worker adapters:
   - `claude`: `claude -p <prompt> --output-format stream-json --verbose --allowedTools Read,Edit,Write,Glob,Grep --disallowedTools Bash,WebFetch,WebSearch --permission-mode acceptEdits --max-turns 40`, cwd = worktree.
   - `codex`: `codex exec --sandbox workspace-write --json --skip-git-repo-check -C <worktree> <prompt>`.
   - `scripted` (tests and offline CI only, labeled "scripted worker (no AI)"): applies a fixture patch.
5. Validate: `git status --porcelain` paths ⊆ allowlist (`src/**/*.tsx`, `src/**/*.ts`, `src/**/*.css`, `index.html`), no symlinks, no binary files, no package/config changes.
6. Checks in worktree: `npm run typecheck`, `npm run build`. Record each with duration and output tail.
7. Before apply, re-load the ledger and confirm the agreement is still LOCKED and the base repo HEAD still equals `baseCommit`. Then commit in the worktree (`said: <scope> (<agreementId>, <jobId>)`) and `git merge --ff-only` into the base checkout. Vite HMR updates the running site.
8. Send the signed receipt. On any failure: keep the base checkout unchanged, keep artifacts under `work/jobs/<jobId>`, report FAILED with the reason.

## 11. Console API (read-only)

Notary (`:7410`): `GET /api/state` → `{ mode: 'live'|'offline', switch: {url, connected, version}, room: {id, name}, notaryPublicKey, keyId, signedLedger, ledgerDocumentId }`; `GET /api/events` → SSE stream of `state` events on every ledger change and `chat` events (recent room messages for the timeline).
Builder (`:7420`): `GET /api/jobs` → list of job records; `GET /api/jobs/stream` → SSE `job` events and `log` lines (worker stream, check output).
CORS: allow `http://localhost:7400`.

## 12. Scope priorities

- **P0 (must ship):** core engine with tests; Switch client; notary live on real Switch; builder with Claude Code and Codex adapters; client site; Said Console; mock Switch + offline demo; setup/register/enroll/doctor scripts; README with Switch usage; demo video script.
- **P1:** personal-mode room (same engine, no builder); Mattermost-API rehearsal script posting as both demo users; blog post.
- **P2 / roadmap:** isolated two-room execution, bilateral cancellation drafts, LLM scope extractor, Switch Trust scan of Python components.

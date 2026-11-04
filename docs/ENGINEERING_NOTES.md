# Engineering notes (for README link)

Core/engineering stream owns packages, notary, builder, mock-switch, CLI, CI, and security. Web/landing/README live on `polish/web`.

## Workspaces

- Apps: `notary`, `builder`, `console`, `web`, `mock-switch`
- Packages: `core`, `switch-client`, `runtime`, `brand`, `cli`
- Node `>=22.12`, TypeScript, Hono, Vitest, `@noble/ed25519`

## Setup / test / build

```bash
npm install
npm ci --prefix demo/client-site   # needed for offline e2e
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build --workspaces --if-present
```

Offline demo (mock Switch + scripted worker):

```bash
npm run demo:offline
# or the vitest path (enabled when demo/client-site/node_modules exists):
npm test -- scripts/test/offline-e2e.test.ts
```

## Verify CLI

Anyone can check a exported ledger or agreement receipt offline:

```bash
npm run verify -- path/to/ledger.md --public-key <base64>
# or
npm run verify -- path/to/receipt.md --public-key-file .said/public-keys.json
```

## Live Switch

See `docs/LIVE_RUN.md` and `docs/SETUP_LIVE.md`. Switch binds agent protocol at `SWITCH_URL` (default `http://localhost:8000`). Ops need an open WS + `x-switch-connection-id`.

## Optional HTTP shared secret

Live mode requires `SAID_HTTP_SHARED_SECRET` (`npm run setup` generates one into `.env` when blank). Notary/builder reject non-health HTTP without `Authorization: Bearer …`, `X-Said-Shared-Secret`, or `?said_shared_secret=` (for EventSource). Opt out on loopback with `SAID_HTTP_ALLOW_INSECURE=1`. They still bind `127.0.0.1` only.

Mattermost bridge: set `SAID_ALLOW_SAID_NAME_FALLBACK=1` so the builder accepts Said messages whose `sender` is a Matrix actor id but whose display name matches the Said agent. Prefer the agent UUID whenever Switch provides it.

`npm run demo:offline` auto-picks free ports when the live stack holds 7410/7420 (override with `NOTARY_PORT`, `BUILDER_PORT`, `CONSOLE_PORT`, `MOCK_SWITCH_PORT`, `CLIENT_SITE_PORT`).

`npm run doctor` is the one-command preflight (ports, Switch, Mattermost, keys present without printing values, registration, room id, shared secret presence).

## Standout core features

- Hash-chained audit log (`prevHash` / `hash`) verified on every ledger signature check
- Change-request / amend flow (`Amend AGR-001: …`) requiring both signatures again
- Signed agreement receipt export (`GET /api/receipt` on notary; `npm run verify`)
- Dispute quote via existing evidence intents against the ledger


## Quality gate (recorded 2026-11-03, America/New_York)

Commands: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build --workspaces --if-present`.

- ESLint (flat + typescript-eslint): 0 errors
- Typecheck: all workspaces pass
- Tests: 235 passed (23 files), including offline-e2e
- Gated coverage (core + builder allowlist/authorize/exec + notary inbound + runtime http-auth): lines 96.09%, branches 80.23%, statements 92.72%, functions 95.14%
- Build: notary/builder/console/web and packages succeed

CI template: `docs/ci.workflow.yml`. Copy to `.github/workflows/ci.yml` on GitHub (Settings need the `workflow` scope; the overnight OAuth push cannot create workflow files). It runs install, lint, typecheck, test:coverage, build.

## npm audit (tooling)

`npm audit --omit=dev` reports 0 vulnerabilities in production dependencies.

`npm audit` reports moderate findings in eslint / minimatch / typescript-eslint (dev tooling only).
`npm audit fix --force` would downgrade eslint to v4 and break the toolchain, so it is not applied.
Track upstream eslint 9 + typescript-eslint releases; re-run `npm audit` before each submit cut.

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
npx said verify path/to/ledger.md --public-key <base64>
# or
npm run verify -- verify path/to/receipt.md --public-key-file ./notary.pub
```

## Live Switch

See `docs/LIVE_RUN.md` and `docs/SETUP_LIVE.md`. Switch binds agent protocol at `SWITCH_URL` (default `http://localhost:8000`). Ops need an open WS + `x-switch-connection-id`.

## Optional HTTP shared secret

Set `SAID_HTTP_SHARED_SECRET` so notary/builder reject non-health HTTP without `Authorization: Bearer …` or `X-Said-Shared-Secret`. They still bind `127.0.0.1` only.

## Standout core features

- Hash-chained audit log (`prevHash` / `hash`) verified on every ledger signature check
- Change-request / amend flow (`Amend AGR-001: …`) requiring both signatures again
- Signed agreement receipt export (`GET /api/receipt` on notary; `npx said verify`)
- Dispute quote via existing evidence intents against the ledger


## Quality gate (recorded 2026-11-03, America/New_York)

Commands: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build --workspaces --if-present`.

- ESLint (flat + typescript-eslint): 0 errors
- Typecheck: all workspaces pass
- Tests: 235 passed (23 files), including offline-e2e
- Gated coverage (core + builder allowlist/authorize/exec + notary inbound + runtime http-auth): lines 96.09%, branches 80.23%, statements 92.72%, functions 95.14%
- Build: notary/builder/console/web and packages succeed

CI template: `docs/ci.workflow.yml`. Copy to `.github/workflows/ci.yml` on GitHub (Settings need the `workflow` scope; the overnight OAuth push cannot create workflow files). It runs install, lint, typecheck, test:coverage, build.

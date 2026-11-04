# Deploy the Said marketing site (free)

The landing page is a static Vite build (`apps/web`). You do not need a server for it. Do not deploy the notary, builder, mock Switch, or console to the public internet: those bind to loopback and hold demo state.

This document prepares a free live link. It does not create accounts for you.

## Build locally first

From the repository root:

```bash
npm install
npm -w @said/web run build
```

Output directory: `apps/web/dist`.

Optional preview:

```bash
npm -w @said/web run preview
```

Open http://127.0.0.1:7300 and confirm the animated hero, playground, and sections load.

## Option A: Cloudflare Pages (recommended)

1. Create a free Cloudflare account and open **Workers & Pages**.
2. **Create application → Pages → Connect to Git** and select `AtharvRaotole/said-switch`.
3. Build settings:
   - Framework preset: Vite (or None)
   - Build command: `npm install && npm -w @said/web run build`
   - Build output directory: `apps/web/dist`
   - Root directory: `/` (repository root)
   - Environment variables: none required for the marketing site
4. Save and deploy. Cloudflare gives a `*.pages.dev` URL.
5. Optional custom domain later. Not required for the hackathon.

Notes:

- Production branch can be `main` after merge, or `polish/web` for a preview while polishing.
- If you ever host under a subpath, set `SAID_WEB_BASE` (for example `/said/`) at build time. Default is `/`.

## Option B: GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Source: **GitHub Actions**.
3. Add a workflow file at `.github/workflows/deploy-web.yml` with contents similar to:

```yaml
name: Deploy Said web
on:
  push:
    branches: [main]
    paths:
      - 'apps/web/**'
      - 'packages/brand/**'
      - 'packages/core/**'
      - 'package-lock.json'
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm install
      - run: npm -w @said/web run build
        env:
          SAID_WEB_BASE: /said-switch/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/web/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

4. Commit the workflow on a branch you are allowed to push, open a PR, merge when ready.
5. Site URL will be `https://atharvraotole.github.io/said-switch/` (exact casing follows GitHub).

Important: GitHub project pages need `SAID_WEB_BASE=/said-switch/` so asset URLs resolve. Cloudflare root deploys should leave the default `/`.

## What not to deploy

- `apps/notary` and `apps/builder` HTTP ports (no auth, loopback-only by design)
- `apps/mock-switch` (offline simulation; posting as any persona)
- Secrets in `.env` or `.said/secrets.json`

## After you have a live URL

1. Paste the URL near the top of the root README.
2. Use it in the hackathon submission form alongside the repo and demo video.
3. Re-run the offline demo and the live doctor checklist before recording.

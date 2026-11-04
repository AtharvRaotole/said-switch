#!/usr/bin/env bash
# Reproducible live E2E against local Switch + Mattermost (throwaway).
# Does not commit secrets. Leaves the stack running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SWITCH_LIVE="${SWITCH_LIVE_DIR:-/workspace/switch-live}"
SHOTS="${SAID_LIVE_SHOTS:-/workspace/said-live-shots}"
export SAID_HOME="${SAID_HOME:-$ROOT/.said-live}"
export SWITCH_LIVE_DIR="$SWITCH_LIVE"
export SAID_LIVE_SHOTS="$SHOTS"

mkdir -p "$SHOTS"

echo "==> Preflight"
curl -sf http://127.0.0.1:8065/api/v4/system/ping >/dev/null || {
  echo "Mattermost not up on :8065. From $SWITCH_LIVE:"
  echo "  docker compose -f standalone-docker-compose.yml -f docker-compose.host.yml up -d postgres switch mattermost"
  exit 1
}
curl -sf -o /dev/null http://127.0.0.1:8000/ || {
  echo "Switch not up on :8000"
  exit 1
}
curl -sf http://127.0.0.1:7410/health >/dev/null || {
  echo "Said notary not up. In $ROOT: SAID_HOME=$SAID_HOME npm run dev &"
  exit 1
}
curl -sf http://127.0.0.1:7420/health >/dev/null || {
  echo "Said builder not up."
  exit 1
}
test -f "$SWITCH_LIVE/live-e2e-secrets.json" || {
  echo "Missing $SWITCH_LIVE/live-e2e-secrets.json (channel_id, dana_password). Do not commit it."
  exit 1
}

echo "==> Story drive + evidence capture"
cd "$ROOT"
npx tsx scripts/live-e2e.ts "$@"

echo "==> Non-creator ledger edit probe (builder only; never overwrites ledger as said)"
npx tsx scripts/live-doc-auth-probe.ts || true
# Probe steals builder WS briefly; restart Said so the live story agents recover.
if command -v pgrep >/dev/null; then
  echo "==> Restarting Said after probe (leave Switch/MM up)"
  pkill -f "$ROOT/node_modules/.bin/(tsx|vite|concurrently)" 2>/dev/null || true
  sleep 2
  nohup npm run dev >"$SWITCH_LIVE/said-dev.log" 2>&1 &
  for i in $(seq 1 60); do
    curl -sf http://127.0.0.1:7410/health >/dev/null && curl -sf http://127.0.0.1:7420/health >/dev/null && break
    sleep 0.5
  done
fi

if command -v google-chrome >/dev/null || command -v google-chrome-stable >/dev/null; then
  CHROME="$(command -v google-chrome || command -v google-chrome-stable)"
  echo "==> HTML transcript screenshot"
  "$CHROME" --headless=new --disable-gpu --window-size=1200,2200 \
    --screenshot="$SHOTS/mm-transcript.png" "file://$SHOTS/mm-transcript.html" >/dev/null 2>&1 || true
fi

echo "==> Evidence under $SHOTS"
ls -la "$SHOTS" | sed -n '1,30p'
echo "Stack left running. See docs/LIVE_RUN.md"

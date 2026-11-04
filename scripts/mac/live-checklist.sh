#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

echo "== Said live checklist =="
echo "Repo: $root"
echo

need() { printf '  [ ] %s\n' "$1"; }
ok() { printf '  [?] %s\n' "$1"; }

need "Docker Desktop is running"
need "Switch Console local server is Running (or SWITCH_URL points at a healthy server)"
need ".env has SWITCH_URL, SWITCH_REGISTRATION_KEY, SAID_ROOM_ID (no secrets in git)"
need "Two Mattermost accounts ready (developer linked, client external)"
need "Coding worker CLI signed in (claude or codex) if you want a live worker (scripted ok for demo)"

echo
echo "Health probes (safe to re-run):"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
url="${SWITCH_URL:-http://localhost:8000}"
echo "  SWITCH_URL=$url"
if command -v curl >/dev/null; then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url/health" || true)
  echo "  GET $url/health -> HTTP $code"
else
  echo "  curl not found; skip health probe"
fi

echo
echo "Next commands:"
echo "  npm install && npm run setup && npm run register"
echo "  npm run enroll -- --developer \"…\" --client \"…\" --wait"
echo "  npm run doctor && npm run dev"

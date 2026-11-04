# Mac plug-and-play (Atharv morning checklist)

You only need to supply secrets and human accounts. Engineering already prepared scripts and docs.

## You provide

1. Docker Desktop running
2. Switch Console with **Run a server on this computer** (or your Switch URL)
3. Registration API key from Switch Gateway → API Keys
4. Two Mattermost accounts (developer linked to Switch, client not linked)
5. A Switch room id (channel turned into a room)

## One path

```bash
cd /path/to/said-switch   # or the polish/core worktree
cp .env.example .env
# edit .env: SWITCH_URL, SWITCH_REGISTRATION_KEY, SAID_ROOM_ID
./scripts/mac/live-checklist.sh
npm install
npm run setup
npm run register
# in the room: !invite-agent @said and !invite-agent @builder
npm run enroll -- --developer "YourName" --client "ClientName" --wait
npm run doctor
npm run dev
```

Optional: set `SAID_HTTP_SHARED_SECRET` in `.env` and configure the console to send it.

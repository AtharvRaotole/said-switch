# Live setup: real Switch + Mattermost

This is what the human operator does once. Everything after it is scripted.

## 1. Install the prerequisites (about 15 minutes)

1. **Docker**: install [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) (or OrbStack) and start it. Switch Console runs its local server in Docker.
2. **Switch Console**: download the [Apple-silicon build](https://github.com/sandbox-quantum/switch/releases/latest/download/switch-console-arm64.dmg), open it, choose **Add a server → Run a server on this computer**, and wait until the sidebar says **Running locally**.
3. **A coding agent CLI, signed in** (the builder runs it headless):
   - Claude Code: `npm install -g @anthropic-ai/claude-code`, then run `claude` once and sign in.
   - Codex (optional second worker): `npm install -g @openai/codex`, then `codex login`.
4. **Node 22.12+** (already installed on this machine: 22.14).

## 2. Mattermost accounts (two people)

1. In Switch Console, open **Home → Messaging apps → Mattermost → Sign-in details…** and sign in to the local Mattermost in your normal browser. This is the **developer** (you).
2. Still in Switch Console, **Link** your Mattermost account (**This is me**). Without this, your own builder agent won't recognise you.
3. Create a second Mattermost account for the **client** (Mattermost System Console → Users, or sign up from a private browser window). Do **not** link this account to Switch. The client is an outside stakeholder.
4. Create a channel, e.g. `larkspur-site`, add both accounts, and turn it into a Switch room (Switch Console → **Create a room** → use an existing channel). Copy the room id.

## 3. Register Said and the builder

1. In the Switch Gateway, open **API Keys** and create a key of type **registration**.
2. Fill in `.env` (copied from `.env.example` by `npm run setup`): `SWITCH_URL` (the server address Switch Console shows; `GET <url>/health` must return 200), `SWITCH_REGISTRATION_KEY`, `SAID_ROOM_ID`.
3. Run:
   ```bash
   npm install
   npm run setup
   npm run register
   ```
4. In the Mattermost channel, invite both agents:
   ```
   !invite-agent @said
   !invite-agent @builder
   ```

## 4. Enroll the two parties

```bash
npm run enroll -- --developer "Riya" --client "Dana" --wait
npm run dev          # notary, builder, console, client site
```

Each person types the code printed for them (e.g. `@said enroll K7QM`) from their own Mattermost account. Said binds each code to that account's Switch participant id and creates the signed ledger.

## 5. Check everything

```bash
npm run doctor
```

Every line should be ✓ before recording.

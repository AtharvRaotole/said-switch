# Connecting Said rooms to Slack and Telegram (via Switch)

Said does not implement Slack or Telegram bots. Switch already bridges Slack, Teams, Discord, Telegram, and Mattermost. The same Said room works once Switch links the messaging app.

## What Atharv must provide (free tiers only)

### Slack

1. A Slack workspace you admin (free Slack workspace is enough).
2. A Slack app with a Bot Token (`xoxb-…`) and the scopes Switch Console asks for when you open **Messaging apps → Slack**.
3. Invite the Slack bot to the channel that Switch will turn into a room.

Said never sees `SLACK_BOT_TOKEN`. Put it only into Switch Console / Switch server config. `.env.example` lists the name for operators who keep a side note; Said processes ignore it.

### Telegram

The live demo path. Full click-by-click steps are in the README. Short version:

1. Create a bot with @BotFather (`/newbot`). Token stays in Switch, never in this repo. Operator note name: `TELEGRAM_BOT_TOKEN`.
2. In BotFather, turn **Group Privacy** off before the bot joins any group. If it already joined, remove it and add it again.
3. Switch Console → **Messaging apps → Connect → Telegram**. Paste the token and the bot username.
4. Create a group, add the people, add the bot. A private chat with the bot is not a room.
5. Each person posts once, then links their `@username` in Switch Console (**This is me**). Riya (the agent owner) must link.
6. `npm run register`, then `!invite-agent @said` and `!invite-agent @builder` typed in full. Telegram will not autocomplete those names.

Said's own messages on this bridge use sender `@switch-agent-<8 hex>:<server>` and sender name `said`. Do not set `SAID_ALLOW_SAID_NAME_FALLBACK` for Telegram.

## Said-side steps (same for every bridge)

1. Create / link the room in Switch so it has a room UUID.
2. Set `SWITCH_URL`, `SWITCH_REGISTRATION_KEY`, `SAID_ROOM_ID` in `.env`.
3. `npm run register` then invite `@said` and `@builder` in that room.
4. `npm run enroll` and have each human enroll from their bridged identity.

Once enrolled, draft / refuse / accept / dispute / handoff behave the same regardless of whether messages arrived via Mattermost, Slack, or Telegram.

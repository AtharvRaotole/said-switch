# Connecting Said rooms to Slack and Telegram (via Switch)

Said does not implement Slack or Telegram bots. Switch already bridges Slack, Teams, Discord, Telegram, and Mattermost. The same Said room works once Switch links the messaging app.

## What Atharv must provide (free tiers only)

### Slack

1. A Slack workspace you admin (free Slack workspace is enough).
2. A Slack app with a Bot Token (`xoxb-…`) and the scopes Switch Console asks for when you open **Messaging apps → Slack**.
3. Invite the Slack bot to the channel that Switch will turn into a room.

Said never sees `SLACK_BOT_TOKEN`. Put it only into Switch Console / Switch server config. `.env.example` lists the name for operators who keep a side note; Said processes ignore it.

### Telegram

1. A bot from BotFather and its token (`123456:ABC…`).
2. Connect it in Switch Console → **Messaging apps → Telegram**.
3. Add the bot to the Telegram group/channel Switch will map to a room.

Again: token goes to Switch, not to Said. Env name for operator notes: `TELEGRAM_BOT_TOKEN`.

## Said-side steps (same for every bridge)

1. Create / link the room in Switch so it has a room UUID.
2. Set `SWITCH_URL`, `SWITCH_REGISTRATION_KEY`, `SAID_ROOM_ID` in `.env`.
3. `npm run register` then invite `@said` and `@builder` in that room.
4. `npm run enroll` and have each human enroll from their bridged identity.

Once enrolled, draft / refuse / accept / dispute / handoff behave the same regardless of whether messages arrived via Mattermost, Slack, or Telegram.

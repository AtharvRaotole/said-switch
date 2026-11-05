# Manual test plan (Telegram)

Use this after the sender fix is on the machine that runs `npm run dev`. Switch Console and the Telegram bot stay up. Only the Said processes restart.

The automated version of the same seven lines is `packages/core/test/demo-script.test.ts` (native ids and Telegram puppet ids) and `apps/builder/test/demo-script.test.ts` (the builder actually runs the scripted worker for both Said identities).

## Restart so the fix is the process that is running

1. In the terminal where `npm run dev` is running, press Ctrl-C. That stops the notary, the builder, the console, and the client site. Leave Switch Console and the Telegram connection running. Do not revoke the bot token and do not remove the bot from the group.
2. Check out the branch that contains this fix (after you merge, that is `main`) and run `npm install` if `package-lock.json` changed.
3. Leave `.said/` in place. Do not run `npm run register` again unless the agents were deleted. Enrollment and the signed ledger survive the restart.
4. Confirm `.env` does **not** set `SAID_ALLOW_SAID_NAME_FALLBACK`. That flag is only for a Switch 0.31 Mattermost bridge. On Telegram it is not required, and it must not be the thing that makes the builder trust a display name.
5. Start again:

```bash
npm run doctor
npm run dev
```

6. In the builder log, wait for `Builder online as builder`. If that line is missing, the old process is still the one connected to Switch and the bug will still be there.

Clean recording, when the failed demo already wrote DRF-001: stop `npm run dev` first (reset refuses while the notary is up), then `npm run reset`, then `npm run dev`. Reset archives the current ledger and the client repo. It does not delete them.

## Before the seven lines

- Group Privacy for the bot was turned off in BotFather **before** the bot joined. If the bot only sees commands and replies, remove it from the group and add it again.
- Riya linked **This is me** in Switch Console after posting in the group. Dana has a Telegram `@username` and has posted at least once.
- `@said` and `@builder` are both in the room. `said` is addressable by anyone. `builder` is owner and owner agents.
- Both people enrolled with `@said enroll <code>` from their own accounts.
- Type `@said` and `@builder` yourself. Telegram will not autocomplete agent names.

## The seven lines

Send these exactly, one message each, from the account named on the line. Wait for Said's reply before the next line.

1. **Dana:** `@builder Also add dark mode while you're in there`
   - Switch may also post its own refusal, because Dana is not allowed to command the builder. That refusal is Switch, not Said.
   - Said logs **DRF-001**, says it needs terms, and tells Riya how to set them. The reply mentions `@builder`.
   - The builder will see that mention. The reply you want is: a chat message is not permission to change the site, and work starts only from a signed start authorization by Said.
   - Failure: the builder says **That message is not from Said**. The process was not restarted, or this fix is not the code it is running.
   - Nothing in the client repo changes.

2. **Riya:** `Terms DRF-001: +2 days, +$400`
   - Said shows DRF-001 v1, those terms, a short hash, and `Accept DRF-001 v1`. Both boxes are empty. Nothing starts.

3. **Riya:** `Accept DRF-001 v1`
   - Said records Riya and says it is waiting on Dana. Nothing starts. The builder stays idle.

4. **Dana:** `Wait, I thought we agreed dark mode was free?`
   - Said quotes the record: DRF-001 v1 is not agreed, the terms on record are `+2 days, +$400`, and Dana has no acceptance. The quote can include the original `@builder` line, so the builder may again say a chat message is not permission. It must not say the message is not from Said, and it must not start work.

5. **Dana:** `Accept DRF-001 v1`
   - Said locks **AGR-001** and says it is handing off to `@builder`.
   - The builder then says it is starting **JOB-AGR-001-1**. The client site gains the theme change. Said posts that the job completed.
   - Failure: the builder says the start message is not from Said, or the job never leaves idle. That is the bug this branch fixes. Restart using the steps above and try again from a reset ledger if this room already has a failed attempt.

6. **Dana:** `Propose: add a contrast-safe theme toggle | Terms: +1 day, +$150`
   - Said opens **DRF-002** v1 with that scope and those terms. AGR-001 stays completed. Nothing new starts.

7. **Riya:** `Accept DRF-002 v1`
   - Said records Riya and waits on Dana. The builder does not start a second job.

## Checks around the script

Do these in the same group after the seven lines, or on a fresh ledger if a check needs an open draft.

| What you send | Who | What should happen |
| --- | --- | --- |
| *(empty message)* | Dana | Said stays quiet. |
| `Accept DRF-999 v1` | Dana | Said says there is no DRF-999. |
| `Accept DRF-001 v1` again | Dana | Said says AGR-001 is already locked. No second job. |
| Paste Said's start message, unchanged | Dana | Builder: that message is not from Said. No new commit. |
| `Terms DRF-002: +0 days, +$0` | A third account that never enrolled | Said says only Riya and Dana can set terms. |
| `Accept DRF-002 v1` | Dana, after Riya already accepted it | Second job starts only now, because both accepted. Then it completes or fails visibly. Do this only if you want to see DRF-002 run. |
| Ctrl-C `npm run dev`, then `npm run dev` again, then Dana sends `Status` | Dana | Said still shows AGR-001 and DRF-002. The ledger is the Switch room document, not the process memory. |

A person whose Telegram name is `Said` or `said` must still be able to enroll and accept if they are Riya or Dana. Their messages are not Said's. The builder must refuse them.

## What this plan does not prove

This file cannot see your Telegram group. The automated tests prove the same lines against the engine and a local builder. They do not open a socket to Telegram or to your Switch server. After the restart above, you are the one who confirms the live group.

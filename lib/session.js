# Multi-Bot Setup Index

## 1. Code change (once)

In `lib/session.js`, replace the `ID` line:

const ID = process.env.SESSION_ID || `nexus_${process.env.BOT_NUMBER || 'md'}`

## 2. Existing bot (before deploying the change)

Set `SESSION_ID=nexus_md` on its Render service so it keeps its current login.

## 3. Each new bot

- Create a separate Render service (or a separate copy of the project folder).
- Set `SESSION_ID=nexus_bot_<n>`, unique per bot.
- Set `BOT_NUMBER=<that bot's WhatsApp number>`, digits only, with country code.
- Set a distinct `BOT_NAME`. If the bots share a machine, also set a different `PORT`.
- Set `SUPABASE_URL` and `SUPABASE_KEY`, plus `SESSION_TABLE` if you use one.

## 4. Pairing

- Open the bot's `/pair` page and enter its number.
- In WhatsApp, go to Linked devices > Link with phone number, and enter the code.

## 5. Verification

- Check the logs for `Session restored from Supabase` or `No saved session in Supabase yet`.
- Confirm the `connected as ...` line shows the expected number.
- In Supabase, confirm there is one row per `SESSION_ID`.

## 6. Settings and storage

- Each copy writes `./data/bot-settings.json`, so give each bot its own deployment or folder.
- Settings are not synced to Supabase. Use a Render persistent disk to keep them across redeploys.

## 7. Rules and limits

- `SESSION_ID` is the name of the saved login. It does not choose the number. The number comes from the pairing step.
- Changing `BOT_NUMBER` on an existing deployment does not switch numbers while the same `SESSION_ID` holds a login. Use a new `SESSION_ID` instead.
- Each bot needs its own WhatsApp number.
- Unofficial library use carries a risk of account restriction. Use numbers you can afford to lose, or consider Meta's official WhatsApp Business Cloud API for reliability.
- Many people can use one bot if `mode` is `public`.

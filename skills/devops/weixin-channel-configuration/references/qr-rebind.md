# Weixin iLink Bot QR Re-bind Procedure

Use when a weixin bot account has **account-level token expiry** (`getconfig`
with the account token returns `-14 session timeout`) or when migrating the
bound bot. Inbound messages and gateway restarts cannot recover this state —
only a fresh QR confirmation can.

## Procedure

1. **Fetch a fresh QR** (any healthy bot token works in the Authorization
   header — the QR binds whichever WeChat scans it):

   ```bash
   curl -sS "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3" \
     -H "AuthorizationType: ilink_bot_token" \
     -H "Authorization: Bearer <any-healthy-bot-token>" \
     -H "iLink-App-Id: bot" -H "iLink-App-ClientVersion: 131584"
   ```

   Response: `qrcode` (hex token) + `qrcode_img_content` (liteapp URL).
   **WeChat must scan the liteapp URL**, not the hex token.

2. **Render a PNG** with the `qrcode` package — install into the **Hermes venv**
   (`~/.hermes/hermes-agent/venv/bin/pip install "qrcode[pil]"`); system pip is
   PEP-668 blocked. Render from `qrcode_img_content`.

3. **Long-poll status**: `GET /ilink/bot/get_qrcode_status?qrcode=<value>`.
   ⚠️ The endpoint **holds the connection ~30 s** (long-poll). Socket timeout
   must be **> 30 s** (use 40 s) or every poll dies as a timeout and
   `confirmed` is never observed.

4. **On `status=confirmed`** the response carries `ilink_bot_id`, `bot_token`,
   `baseurl`, `ilink_user_id`. Persist as `<ilink_bot_id>.json` in the
   profile's `weixin/accounts/`. ⚠️ `ilink_bot_id` **already ends in
   `@im.bot`** — do not append another suffix (yields
   `xxx@im.bot@im.bot.json`, invisible to the adapter).

5. **Patch the profile `.env`** `WEIXIN_ACCOUNT_ID` / `WEIXIN_TOKEN`. ⚠️ Profile
   `.env` files carry **two WEIXIN_* blocks** (an inherited global block and a
   profile-specific block); the profile-specific one wins — patch THAT one,
   then grep the block for the old account id (zero hits = done).

6. **Restart the gateway** (`launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-<profile>`
   for launchd-managed, or `kill -TERM` for SwarmStudio-managed) and require
   the log line `✓ weixin connected (profile: <profile>)`.

7. **Smoke test**: one `send_weixin_direct` to the bound chat; require
   `success: true` + `message_id`. A config write is not a working route.

## QR lifetime and auto-refresh

- A QR expires in **~2 minutes**. There is **no long-lived bind QR** — iLink
  has no such endpoint; do not promise one.
- For unattended waiting, loop: on `status=expired`, fetch a fresh QR and
  overwrite the same PNG. Any code currently displayed is always scannable.

## Showing the code to a human

- Preview.app does **not reload an overwritten PNG** — a refreshed file is
  invisible to an open window. Serve the directory with
  `python3 -m http.server` and open a small HTML that reloads the image with a
  cache-busting query (`?t=Date.now()`) every 3 s.
- ⚠️ `curl http://127.0.0.1:PORT` may time out while `http://localhost:PORT`
  works — probe both.

## Script/automation pitfalls

- `subprocess.Popen` does **not** expand `~` — wrap paths in
  `os.path.expanduser`.
- launchd jobs: `/usr/bin/python3` can fail under launchd with an
  Xcode-license error (exit 69, silent except stderr log) — point
  `ProgramArguments` at the Hermes venv python.
- The terminal tool rejects shell-level backgrounding (`&`, `nohup`) in
  foreground calls — use `background=true`, or launchd for permanent jobs.
- Status values seen: `wait`, `scaned`, `scaned_but_redirect` (switch base_url
  to the returned `redirect_host`), `expired`, `confirmed`.

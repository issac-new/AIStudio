---
name: weixin-qr-reauth
description: "Re-bind a weixin iLink bot via live QR + revival watchdog."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [weixin, wechat, ilink, qrcode, reauth, bind, session-revival]
    related_skills:
      - weixin-send-troubleshooting
      - weixin-channel-configuration
      - weixin-multi-account-delivery
---

# Weixin QR Re-Auth & Session-Revival Watchdog

触发词：绑定二维码 / 重新授权 / 扫码绑定 / session timeout 恢复 / 给妈妈发微信发不出去。

When a weixin bot account is dead in a way only a **user action** can fix, run
a background watchdog that keeps a fresh QR on screen and watches for the
account to come back, then auto-sends the pending message. Do not sit and
retry the send: if `getconfig` on the SAME token returns `errcode -14`, the
account cannot even reach iLink's authenticated surface, so no inbound can
refresh it and only a QR re-scan recovers (see `weixin-send-troubleshooting`
§1a for the depth diagnostic).

## The two user actions (offer both, let the user pick)

1. **Inbound revival** — the bound user sends ANY message to the bot (a lone
   `.` works). Cheapest, no time pressure; works when the expiry is only the
   per-peer `context_token`, not account-level. Probe `getconfig` to detect it.
2. **QR re-bind** — scan the liteapp QR and confirm in WeChat. Required for
   account-level expiry. The binding itself is durable (bot stays in their
   contact); only the QR is short-lived.

## Wire facts (validated against ilinkai.weixin.qq.com)

- Fetch: `GET /ilink/bot/get_bot_qrcode?bot_type=3` → `qrcode` (hex token) and
  `qrcode_img_content` (liteapp URL). **The QR must encode the liteapp URL**,
  never the bare token.
- Poll: `GET /ilink/bot/get_qrcode_status?qrcode=<value>` is a **~30s
  long-poll**. Client timeout must EXCEED 30s (use 40s): a 15–20s timeout gives
  endless read-timeouts that masquerade as API failures — the single most
  expensive misdiagnosis in this flow.
- Statuses: `wait` → `scaned` → (`scaned_but_redirect`: switch polling host to
  `redirect_host`) → `confirmed`; `expired` ~2 min after issue.
- **There is no long-lived bind QR.** Every code is one-shot. Never promise a
  permanent QR; the deliverable is an auto-rotation loop so the on-screen code
  is always fresh.
- `confirmed` payload: `ilink_bot_id`, `bot_token`, `baseurl`, `ilink_user_id`.
  Persist immediately as `<bot_id>@im.bot.json` (`token`, `base_url`,
  `user_id`) in the account dir per `weixin-channel-configuration` Root Cause #2.
- Healthy auth signature on any probe: `ret -2 "ilink_user_id required"` —
  auth passed, only a param missing. `-14 "session timeout"` = dead.

## Display rule (the part that silently wastes a whole evening)

- **macOS Preview does not reload an overwritten PNG.** The user keeps
  scanning a stale code and every scan "fails". Serve the PNG over
  `python3 -m http.server` with an auto-reloading page (`templates/qr_live.html`)
  and give the user the `http://localhost:<port>/...` URL, never the file.
- Probe the served page via `http://localhost:<port>` — a raw `127.0.0.1` curl
  can time out against a healthy server listening on that exact address.
- Render with `qrcode` installed in the Hermes venv
  (`~/.hermes/hermes-agent/venv/bin/pip install "qrcode[pil]"` — system pip is
  PEP 668 blocked). Expanduser the venv python path in subprocess calls; a
  literal `~` raises FileNotFoundError. Do NOT conda-install or use the system
  python — this box routes `python3` to anaconda and the hermes venv has the
  right deps.

## Procedure

1. Diagnose depth per `weixin-send-troubleshooting` §1a (getconfig probe).
2. Prepare pending message text; identify the target chat_id.
3. Launch the watchdog (background, hermes venv python):
   `scripts/qr_reauth_watchdog.py --account-json <bot>.json --chat-id <id> --message "..." --png /path/qr.png --deadline-hour 21`
4. Serve the QR directory and open the viewer page for the user.
5. Tell the user BOTH options (scan the live page / send any message to the
   bot). Never make them race a 2-minute QR expiry by hand.
6. On trigger the watchdog sends the message via `send_weixin_direct`, writes
   `<png-stem>-result.json`, and exits (0 = sent, 2 = trigger fired but send
   failed, 1 = window ended with no trigger).
7. Report honestly: component-level status only (rotations done, probes
   seen). Until the result JSON says `success: true`, the message is NOT
   delivered — never claim arrival on a send attempt alone.
8. **Rotate the profile credentials after a re-bind.** A confirmed bind
   issues a NEW bot identity; the profile `.env` still points at the dead
   one, so cron pushes and gateway sends keep failing until switched:
   write the new account JSON into the profile's `weixin/accounts/` dir
   (filename `<bot_id>.json` — bot_id already ends in `@im.bot`; appending
   another suffix double-suffixes it), then update `WEIXIN_ACCOUNT_ID` /
   `WEIXIN_TOKEN` in the profile `.env` (`.bak` first), restart the gateway,
   and prove the switch with one real send through the new credentials.
   Update memory records that name the old bot id.

## Pitfalls

- One-shot QR + human delay = guaranteed expiry. Rotate automatically; never
  tell the user to "scan quickly".
- Long-poll timeout below 30s = fake errors (see Wire Facts).
- A backgrounded shell pipeline (`cmd &` inside a foreground terminal call)
  is rejected; use the terminal tool's own background mode, and `exec` the
  python binary so the tracked PID is the real worker.
- Long watch windows: pick the deadline explicitly; a watcher that outlives
  its user-visible session silently dies with it.
- Send path after revival reuses `send_weixin_direct` (see
  `weixin-multi-account-delivery`) — do not switch to `hermes send`, it
  resolves the MAIN account and the message goes to the wrong chat.

## Files

- `scripts/qr_reauth_watchdog.py` — the watchdog (QR rotation + revival probe
  + auto-send). Components validated live; see header note for coverage.
- `templates/qr_live.html` — auto-reloading viewer; drop next to the QR PNG,
  serve the directory, share the page URL.

## Related Skills

- `weixin-send-troubleshooting` — -14 depth diagnostic this flow builds on
- `weixin-channel-configuration` — where account files must live, profile-env
  pitfalls
- `weixin-multi-account-delivery` — account/chat selection, send_weixin_direct

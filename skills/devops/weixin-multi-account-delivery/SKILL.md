---
name: weixin-multi-account-delivery
description: "Route pushes to the right non-main WeChat bot account."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [weixin, wechat, multi-account, delivery, push, ilink]
    related_skills:
      - weixin-send-troubleshooting
      - weixin-channel-configuration
---

# Weixin Multi-Account Delivery

Routing WeChat pushes to the RIGHT account in a multi-account deployment.
Verified 2026-08 on this machine: a multiplex main gateway bound to
爸爸's WeChat, plus an independent [已移除] gateway bound to 妈妈's WeChat.
The single-account failure modes (-14 session timeout, stale gateway
state) are covered by `weixin-send-troubleshooting`; this skill is about
ACCOUNT SELECTION and account-scoped blocks.

## When to Use

- A push must reach a specific person whose WeChat is bound to a
  NON-main account (e.g. 妈妈's WeChat through the [已移除] gateway).
- `hermes send` delivers to the wrong chat or fails to resolve a target.
- sendmessage fails for one account while a sibling account sends fine.

## Architecture (verified 2026-08)

| Gateway | Port | Account | Binds to |
|---------|------|---------|----------|
| main (multiplex) | 8650 | `${WEIXIN_ACCOUNT_ID}` | 爸爸 WeChat `HK_DAD_WX@im.wechat` |
| [已移除] (launchd) | 8651 | `HK_BOT_[已移除]@im.bot` | 妈妈 WeChat `HK_MOM_WX@im.wechat` |

- Account credentials: main under `~/.hermes/weixin/accounts/<id>.json`;
  secondary under `~/.hermes/profiles/<profile>/weixin/accounts/<id>.json`
  (plus `<id>.context-tokens.json` for per-peer context tokens).
- The target user's weixin chat id lives in the profile's
  `channel_directory.json` or `sessions/sessions.json` (`chat_id` fields).
- Health: `curl -sS http://127.0.0.1:<port>/health`. Gateway processes:
  `ps aux | grep -E "hermes.*gateway"`.

## The trap: `hermes send` only uses the MAIN account

`hermes send --to weixin:...` always resolves through the main home
(`~/.hermes/.env` + `~/.hermes/config.yaml`). Running
`hermes -p <secondary-profile> send` does NOT switch the weixin account:

- It reads WEIXIN_TOKEN / WEIXIN_ACCOUNT_ID from the MAIN .env.
- It resolves the chat against main home-channel discovery; a secondary
  user id fails with `Could not resolve '<id>' on weixin`.
- Observed 2026-08: `hermes -p [已移除]-orchestrator send --to
  weixin:<妈妈id> "..."` printed "Sent to weixin home channel" with the
  DAD's chat_id — silently wrong target. Always check the returned chat_id.

## Sending to a secondary account: `send_weixin_direct`

Direct call with the secondary account's persisted token, bypassing
`hermes send`'s main-account resolution. Run with the hermes venv
python (`~/.hermes/hermes-agent/venv/bin/python`):

```python
import asyncio, os, json, sys
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-agent"))
os.environ.setdefault("HERMES_HOME", os.path.expanduser("~/.hermes"))

async def main():
    from gateway.platforms.weixin import send_weixin_direct
    acct = json.load(open(os.path.expanduser(
        "~/.hermes/profiles/<profile>/weixin/accounts/<id>.json")))
    result = await send_weixin_direct(
        extra={"account_id": acct["token"].split(":")[0],
               "base_url": acct.get("base_url", "https://ilinkai.weixin.qq.com"),
               "cdn_base_url": ""},
        token=acct["token"],
        chat_id="<target_user_id>",
        message="text with MEDIA:/abs/path.pdf lines",   # verified: MEDIA: tags delivered as attachment
        media_files=[("/abs/path.pdf", False)],           # explicit alternative; also verified
    )
    print("RESULT:", result)

asyncio.run(main())
```

- `media_files`: image extensions route to send_image_file, everything
  else to send_document → PDFs land as downloadable documents.
- Success returns `{"success": True, "message_id": ..., "context_token_used": bool}`.
- If the script is run from a sandbox that blocks `terminal(...)` with
  "embedded null character in path" (lifecycle-guard bug), drive it via
  `execute_code` → `subprocess.run([...])` instead.

## Account-scoped server rate limit: `ret -2 "prepare failed"` (verified 2026-08)

Symptom: raw `sendmessage` returns `{"ret": -2, "errmsg": "prepare failed"}`
for ONE account while a sibling account returns `{"message_id": ...}`.
`getconfig` / `getupdates` for the blocked account still return `ret: 0`
(auth OK, account alive) — the block is send-scoped.

Root cause observed: a multi-hour weixin poll outage (`Cannot connect to
host ilinkai.weixin.qq.com:443 ... nodename nor servname provided`) →
Tencent server flags the account.

What works / doesn't:
- ✅ **Fall back to a working sibling account** if the target user
  accepts delivery via that channel. Fastest unblock.
- ✅ **Restart the gateway to restore the poll heartbeat**:
  `launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway-<profile>"`
  (launchd-managed gateways; main is SwarmStudio-managed, [已移除] is
  launchd). Log confirms `✓ weixin connected account=...`. This did NOT
  lift the server-side -2 in the 2026-08 case, but is the right hygiene.
- ❌ Clearing `_LIVE_ADAPTERS`, retrying after 30s/2min/5min, toggling
  `context_token` — none lifted the server-side block.
- ⏳ Server-side safety blocks typically lift in hours to a day; plan a
  later retry instead of fighting it.

**Distinguish the TWO meanings of -2:**
- `errmsg: "unknown error"` → stale session (same as -14; fix via gateway
  restart + inbound message).
- `errmsg: "prepare failed"` → genuine server-side send block.
The adapter wraps BOTH as `"rate limited; cooldown active for 30.0s"`, so
always curl the iLink API directly (see `weixin-send-troubleshooting` §1)
to see the real errmsg. Include `base_info`, `X-WECHAT-UIN`,
`iLink-App-Id: bot`, `iLink-App-ClientVersion: 131584`,
`Authorization: Bearer <token>` headers or you get auth failures instead
of the real error.

## Pitfalls

- Never trust `hermes send -p <profile>` to target a secondary account —
  verify the returned chat_id.
- Secondary account context tokens live in the PROFILE's weixin/accounts
  dir, not the main home; `send_weixin_direct` restores from
  `get_hermes_home()/weixin/accounts` (the MAIN home). Missing peer token
  still sends (context_token_used=False) but long-idle peers may hit
  session-expiry.
- Don't hammer a blocked account to "test" — each -2 may extend the
  server-side window. Use a sibling account or wait.
- 8651 api_server requires `API_SERVER_KEY` from the profile's .env for
  `/v1/*` calls; it does not expose an outbound push endpoint.

## Related Skills

- `weixin-send-troubleshooting` (default profile) — single-account
  failures: -14 vs -2, stale gateway_state.json, long-reply PDF rule
- `weixin-channel-configuration` — credential setup, QR flow, multiplex
  profile-env pitfall
- `gateway-crash-loop-troubleshooting` — launchd plist management

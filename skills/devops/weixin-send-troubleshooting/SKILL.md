---
name: weixin-send-troubleshooting
description: "Diagnose and fix WeChat/Weixin outbound message failures: iLink 'rate limited' errors, session timeout (errcode -14), gateway-dead stale state, and hermes send CLI home-channel issues. Covers the iLink errcode -14 vs -2 diagnostic, the stale gateway_state.json trap, and the WeChat long-reply-split-with-PDF format rule."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [weixin, wechat, ilink, gateway, troubleshooting, send, session-timeout]
    related_skills:
      - weixin-channel-configuration
      - gateway-crash-loop-troubleshooting
---

# Weixin Send Troubleshooting

When `hermes send -t weixin` or cron-push delivery fails, the error
message Hermes surfaces is often **misleading**. This skill covers the
three most common failure modes and their distinct fixes.

## When to Use

- `hermes send` fails with `"iLink sendmessage rate limited; cooldown active for 30.0s"`
- WeChat sends fail persistently even after waiting 5+ minutes
- Gateway `gateway_state.json` says `running` but the PID is dead
- `hermes send` fails with `"No home channel set for weixin"`

## Quick Diagnostic Decision Tree

```
send failed
  ├─ "rate limited; cooldown active 30s"
  │    → curl iLink directly (see §1)
  │       ├─ errcode -14 "session timeout" → §1a (gateway dead, token expired)
  │       └─ errcode -2                     → §1b (genuine rate limit, wait)
  │
  ├─ "No home channel set for weixin"
  │    → §2 (set WEIXIN_HOME_CHANNEL env)
  │
  └─ gateway_state.json says "running" but sends fail
       → §3 (stale state file, PID is dead)
```

## §1 "Rate limited" is often session timeout (errcode -14)

### The misleading error

`_rate_limit_error()` in `gateway/platforms/weixin.py` uses a fixed
"rate limited" string regardless of whether iLink returned `-14`
(session timeout) or `-2` (genuine rate limit):

```python
def _rate_limit_error(self) -> RuntimeError:
    return RuntimeError(
        f"iLink sendmessage rate limited; cooldown active for {self._rate_limit_cooldown_remaining():.1f}s"
    )
```

The `-14` retry path strips `context_token` and retries, but iLink still
returns `-14` for tokenless sends when the session is **globally**
expired. The loop exhausts and surfaces the generic "rate limited" error.

### Always curl iLink directly to see the real error

```bash
TOKEN="<account_token from weixin/accounts/*.bot.json>"
TO="<target_chat_id>"
curl -sS -X POST "https://ilinkai.weixin.qq.com/ilink/bot/sendmessage" \
  -H "Content-Type: application/json" \
  -d "{\"msg\":{\"from_user_id\":\"\",\"to_user_id\":\"$TO\",\"client_id\":\"diag\",\"message_type\":2,\"message_state\":3,\"item_list\":[{\"type\":1,\"text_item\":{\"text\":\".\"}}]}}"
```

| Response | Meaning | Fix |
|----------|---------|-----|
| `{"errcode":-14,"errmsg":"session timeout"}` | Token expired server-side | §1a below |
| `{"errcode":-2,...}` | Genuine rate limit | §1b below |

### §1a Session timeout fix (errcode -14)

**Root cause**: The gateway was dead for hours/days. No inbound message
refreshed the iLink `context_token`, so it expired on iLink's **server
side**. Waiting 30s/5min does NOT help — only an inbound message can
refresh it.

**Fix**:
1. Restart the gateway (resumes inbound polling).
2. Ask the user to send **any message** from WeChat to the bot.
3. That single inbound refreshes `context_token` server-side.
4. Outbound sends work immediately after.

### §1b Genuine rate limit fix (errcode -2)

Wait 30 seconds and retry. This is transient and needs no config change.

## §2 "No home channel set for weixin"

`hermes send -t weixin` fails with this when no launchd plist manages
the profile. The `--to weixin:chat_id` format is rejected the same way.

**Fix**: Set the env var inline:
```bash
WEIXIN_HOME_CHANNEL='<chat_id>' hermes -p <profile> send -t weixin -f /tmp/msg.txt
```
The chat_id is in `~/.hermes/profiles/<profile>/channel_directory.json`
under `platforms.weixin[].id`.

## §3 gateway_state.json stale "running" after SIGTERM/SIGKILL

`gateway_state.json` and `gateway.lifecycle.json` show `gateway_state:
"running"` with the dead PID **indefinitely** after SIGTERM/SIGKILL/OOM.
No exit path runs to update them. This is the same class of bug as the
stale dispatcher lock — a sentinel that survives its owner.

**Diagnose** — never trust the state file alone; cross-check the PID:
```bash
PID=$(python3 -c "import json;print(json.load(open('$HOME/.hermes/profiles/<profile>/gateway_state.json'))['pid'])")
ps -p $PID -o pid= && echo "ALIVE" || echo "DEAD — state file is stale"
```

**Fix**: Clear stale state, then restart:
```bash
rm -f ~/.hermes/profiles/<profile>/gateway.pid ~/.hermes/profiles/<profile>/gateway_state.json
# Restart via launchd or manual background
```

## WeChat long-reply format rule

When a reply is long enough to risk WeChat truncation, **split into
multiple messages** and attach a **PDF with the complete content** on
the last message. This is a confirmed user preference for this
deployment — embed it in the reply workflow, not just memory.

- Generate the PDF with Chrome headless (`--print-to-pdf`) from an HTML
  file, the same pipeline used for reports and presentations.
- Short replies (a few paragraphs) do NOT need the split+PDF treatment.

## Related Skills

- `weixin-channel-configuration` — weixin credential setup, multiplex
  profile-env pitfall, iLink token format, QR-setup account file location
- `gateway-crash-loop-troubleshooting` — crash loops, port conflicts,
  dispatcher locks, launchd plist management

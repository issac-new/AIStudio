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
  │    → curl iLink directly (see §1) — READ THE RAW errmsg, do not act on -2 alone
  │       ├─ errcode -14 "session timeout" → §1a (probe getconfig first: account vs context token)
  │       └─ errcode -2 "prepare failed"   → §1c (server-side delivery block, do not retry)
  │       └─ errcode -2 (any other errmsg) → §1b (genuine rate limit, classify duration)
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
| `{"errcode":-2,"errmsg":"prepare failed"}` | Server-side delivery block for THAT chat | §1c below |
| `{"errcode":-2,...}` (other errmsg) | Genuine rate limit | §1b below |

### §1a Session timeout fix (errcode -14)

**Distinguish two depths of expiry first** — probe `getconfig`/`getupdates` on the
SAME account token before assuming inbound can fix it:

| Probe result | Depth | Recovery |
|--------------|-------|----------|
| `ret / errcode -14`, or the call itself fails to connect | **Account-level expiry** — the account cannot reach iLink's authenticated surface, so the inbound-poll loop never connects and can NOT refresh it | QR re-auth on the bound device; an inbound won't help |
| `ret 0`, or a "missing required param"-style `-2` (auth reached) | Account reachable; only the `context_token` is stale | inbound refresh works (§1a fix below) |

**Root cause (context-token staleness)**: The gateway was dead for hours/days. No
inbound message refreshed the iLink `context_token`, so it expired on iLink's
**server side**. Waiting 30s/5min does NOT help — only an inbound message can
refresh it.

**Fix**:
1. Restart the gateway (resumes inbound polling).
2. Ask the user to send **any message** from WeChat to the bot.
3. That single inbound refreshes `context_token` server-side.
4. Outbound sends work immediately after.

For **account-level expiry**, do NOT promise a retry/inbound will clear it — the
send only recovers after QR re-auth. Full re-bind procedure (QR fetch, 30 s
long-poll trap, credential file naming, .env swap, smoke test):
`weixin-channel-configuration` → `references/qr-rebind.md`.

### §1b Genuine rate limit fix (errcode -2, non-"prepare failed")

`-2` with any errmsg other than `prepare failed` means iLink's **server-side**
frequency limiter rejected the send — the local 30s cooldown circuit is just the
adapter's reaction to it. Do NOT assume it is transient: verify with cheap
read-only endpoints before choosing a strategy.

### §1c `-2 "prepare failed"` — server-side delivery block, do not retry

When the raw errmsg is exactly `prepare failed` on a **getconfig-healthy** account,
it is a per-chat server-side delivery block, NOT a rate limit. The account can be
fully authenticated yet still refuse to deliver to THAT chat — canonical case: a
bot account bound to one WeChat (e.g. 爸爸's bot) cannot send into another bot's
bound WeChat (妈妈's chat).

- **Retrying is futile** — the block is per-chat, not a cooldown; looping only
  re-opens the local 30s cooldown and burns time.
- **A healthy sibling account is NOT a fallback delivery path** into another
  account's chat. Route through the account actually bound to the target chat, or
  escalate — never fall back to a sibling account and call deliverable arrival
  that never happened.
- Same wire rules as §1a for account-level expiry: if the bound account's getconfig
  is -14, the block is upstream and needs QR re-auth before anything is sent.

**Classify duration first** (same token, direct curl — read endpoints bypass the
sendmessage limiter):

| Probe | Returns | Meaning |
|-------|---------|---------|
| `getupdates` / `getconfig` | ret 0 | Token + account healthy; only the sendmessage endpoint is throttled → account-level send throttle |
| any probe | -14 | Session expired — treat as §1a |

- **Short throttle** (minutes): queue writes are cheap and local — enqueue to a
  persistent backlog file and retry on a low-frequency tick (≥20 min, stop the
  tick on first failure so the cooldown is not renewed). Never let an auto-retry
  script hammer sendmessage: every real attempt that gets -2 re-opens the local
  cooldown and can extend the server-side throttle window.
- **Throttle persisting >24h**: waiting is no longer the plan. Escalate to the
  user to re-verify the WeChat client login state on the phone (QR re-scan
  refreshes the session) — account-level send throttles at this duration are not
  self-clearing in practice.

Either way, **keep the email channel as the delivery bottom line** — it is
unaffected by iLink throttling.

## §2 "No home channel set for weixin"

`hermes send -t weixin` fails with this when the gateway config has no home
channel for the platform. The `--to weixin:chat_id` format always works; the
bare `weixin` form is what fails.

**Permanent fix** — write the home channel into `~/.hermes/config.yaml` (under
`platforms.weixin`):

```yaml
platforms:
  weixin:
    enabled: true
    home_channel:
      platform: weixin
      chat_id: '<chat_id>'
      name: Home
```

`hermes config set WEIXIN_HOME_CHANNEL <chat_id>` is NOT the permanent fix —
it writes a custom top-level key that the gateway config does not read (it
warns "not a recognized config key"). The resolution path for `hermes send` is
`gateway.config.load_gateway_config().get_home_channel()`, which only reads the
`platforms.weixin.home_channel` block.

**Inline workaround** (one-shot, e.g. inside a wrapper script):
```bash
WEIXIN_HOME_CHANNEL='<chat_id>' hermes send -t weixin -f /tmp/msg.txt
```

**Operational consequence**: any auto-retry mechanism (backlog tick, cron
push) resolves the target via the home channel. If it is missing, every retry
fails on a dead path while burning the item's attempt counter — fix the config
BEFORE re-queuing failed deliveries.

The chat_id is in `~/.hermes/profiles/<profile>/channel_directory.json`
under `platforms.weixin[].id` (or `hermes send --list weixin`).

### Multi-profile deployments: the PROFILE-level config must mirror the block

In multiplex deployments (cron delivering through a worker/orchestrator
profile's gateway), the delivery path resolves the home channel from the
**profile-level** `~/.hermes/profiles/<profile>/config.yaml`, not only the
top-level `~/.hermes/config.yaml`. When the profile config lacks the
`platforms.weixin` block entirely, every cron push fails with
`no delivery target resolved` — which looks like "weixin is down" but is a
config gap. Mirror the whole `platforms.weixin` block (enabled + home_channel)
into the profile config, then restart that gateway.

**Verification signature after the fix**: manually fire one delivery; a
failure of `iLink rate limited; cooldown 30s` is SUCCESS, not a residual
problem — it proves the target now resolves and the send genuinely reached
iLink, with the cooldown being the adapter's normal transient protection
circuit (the next scheduled tick delivers). Stop debugging at this signature;
do not keep treating the cooldown as a failure.

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

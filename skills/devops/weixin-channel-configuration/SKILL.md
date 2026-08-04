---
name: weixin-channel-configuration
description: Use when Hermes weixin is enabled but never connects.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [gateway, weixin, wechat, ilink, multiplex, profile-env, troubleshooting]
    related_skills:
      - gateway-platform-management
      - gateway-crash-loop-troubleshooting
      - email-channel-configuration
---

# Weixin Channel Configuration & Troubleshooting

Operational knowledge for the Hermes **weixin** platform (personal WeChat via
Tencent's iLink Bot API: `ilinkai.weixin.qq.com`, bot identity `xxx@im.bot`).
Complements `gateway-platform-management` (platform-add mechanics) with the
**diagnostic path** for "enabled but never connects".

## When to Use

- `platforms.weixin.enabled: true` in config but startup log shows
  `Gateway running with 3 platform(s)` and weixin is not among them
- WeChat messages stop flowing after a gateway restart
- No `Connecting to weixin...` line in gateway startup log — **not even a
  skip/error warning**
- Setting up weixin credentials for the first time in a SwarmStudio-managed
  multiplex deployment

## 🔴 Root Cause #1: multiplex mode reads the PROFILE .env, not global

With `multiplex_profiles: true`, the unified gateway runs as the **active
profile** (startup log: `Active profile: orchestrator`) and resolves platform
credentials from **that profile's `.env`**
(`~/.hermes/profiles/<profile>/.env`), NOT the global `~/.hermes/.env`.

The `_PLATFORM_CONNECTED_CHECKERS[Platform.WEIXIN]` lambda requires:
`extra.account_id AND (token OR extra.token)`. If the token/account_id only
exist in the global `.env`, the platform is silently skipped — the startup
loop never even logs `Connecting to weixin...`.

**Classic symptom**: matrix/email connect, weixin doesn't. Check:
```bash
grep -c "WEIXIN" ~/.hermes/.env                          # global — present
grep -c "WEIXIN" ~/.hermes/profiles/orchestrator/.env    # profile — MISSING
```

**Fix**:
```bash
echo "WEIXIN_TOKEN=<token>" >> ~/.hermes/profiles/orchestrator/.env
echo "WEIXIN_ACCOUNT_ID=<account-id>" >> ~/.hermes/profiles/orchestrator/.env
```

## 🔴 Root Cause #2: account file in wrong HERMES_HOME

Weixin persists credentials at `HERMES_HOME/weixin/accounts/<account_id>.json`.
In a unified deployment HERMES_HOME=`~/.hermes`, but QR-setup may have saved
the file under the profile home (`~/.hermes/profiles/orchestrator/weixin/`).
The adapter looks ONLY at `HERMES_HOME/weixin/accounts/`.

**Fix**:
```bash
mkdir -p ~/.hermes/weixin/accounts
cp ~/.hermes/profiles/orchestrator/weixin/accounts/*.json ~/.hermes/weixin/accounts/
```

## Diagnostic Sequence (fastest path to root cause)

```bash
# 1. Which platforms actually connected?
grep "Gateway running with" ~/.hermes/profiles/orchestrator/logs/gateway.log | tail -1

# 2. Credentials present in the RIGHT .env?
grep -c "WEIXIN" ~/.hermes/.env
grep -c "WEIXIN" ~/.hermes/profiles/orchestrator/.env

# 3. Effective config as the running gateway sees it:
HERMES_HOME=~/.hermes HERMES_PROFILE=orchestrator \
  ~/.hermes-web-ui/desktop-runtime/hermes/*/mac-arm64/python/bin/python3 -c "
from gateway.config import load_gateway_config, Platform
cfg = load_gateway_config()
print(cfg.platforms.get(Platform.WEIXIN))"
# token=None + extra={} → credential resolution failed (Root Cause #1)

# 4. Token validity (iLink API): auth passes when you get "ilink_user_id required"
curl -s -X POST https://ilinkai.weixin.qq.com/ilink/bot/getconfig \
  -H "Content-Type: application/json" \
  -H "AuthorizationType: ilink_bot_token" \
  -H "Authorization: Bearer <token>" \
  -H "iLink-App-Id: bot" \
  -H "iLink-App-ClientVersion: 66048" \
  -d '{"account_id":"<account-id>","app_id":"bot"}'
# {"ret":-2,"errmsg":"ilink_user_id required"} → token VALID (auth ok, param missing)
# {"ret":...,"errmsg":"invalid token"} → token expired, re-run QR setup

# 5. Account file in unified home?
ls ~/.hermes/weixin/accounts/
```

## Restart Pattern (SwarmStudio-managed)

`hermes gateway restart` is **blocked from inside the gateway process**
(SIGTERM propagates). Kill the PID instead — SwarmStudio's
`autoRestartEnabled` + `scheduleRestart` respawns it automatically:

```bash
kill -TERM $(ps aux | grep "hermes_cli.main gateway run" | grep -v grep | awk '{print $2}' | head -1)
sleep 10
ps aux | grep "hermes_cli.main gateway run" | grep -v grep | head -2   # new PID
tail -60 ~/.hermes/profiles/orchestrator/logs/gateway.log | grep -i "weixin\|Gateway running"
```

Verify success: `✓ weixin connected` and `Gateway running with 4 platform(s)`.

## Pitfalls

- **iLink token format** is `account_id:secret` (e.g.
  `${WEIXIN_ACCOUNT_ID}:0600...`) — the full string is the token, keep it intact.
- **`hermes config set platforms.weixin.enabled`** writes to the PROFILE
  config when `active_profile` is set, NOT the global config the SwarmStudio
  startup check reads. Edit global `~/.hermes/config.yaml` directly
  (patch/write_file) for the platforms section.
- **Old poll errors are historical**: `Cannot connect to host
  ilinkai.weixin.qq.com:443 [nodename nor servname provided]` = transient DNS
  failure from days ago. `dig +short ilinkai.weixin.qq.com` returning IPs
  means DNS is fine NOW.
- **Rate-limit cooldown** (`sendmessage rate limited; cooldown active 30s`)
  is transient — not a config problem.
- **Weixin adapter is JS/shell-free in gateway**: `check_weixin_requirements()`
  only needs `aiohttp` + `cryptography` installed in the SwarmStudio
  desktop-runtime python, not the Hermes venv.

## Related Skills

- `gateway-platform-management` — platform-add mechanics, config-set-vs-global
  resolution, iLink bot limitations (DM works, groups usually don't)
- `gateway-crash-loop-troubleshooting` — crash loops, port conflicts, locks
- `email-channel-configuration` — the same profile-.env pitfall for the
  email channel (QQ Mail / agently-cli)

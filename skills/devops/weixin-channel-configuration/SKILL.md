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
- Startup log shows `both configure weixin with the same credential —
  refusing to start the duplicate` for a profile pair (Root Cause #3)
- One child's/person's account connects while another's does not, on the
  same host
- Setting up weixin credentials for the first time in a SwarmStudio-managed
  multiplex deployment

> **One gateway, many accounts.** In `multiplex_profiles: true` mode there is
> exactly ONE host gateway (`lsof -nP -iTCP:8650 -sTCP:LISTEN`) serving every
> profile, and each profile may own a DISTINCT weixin account. Account
> separation is achieved by per-profile credentials — never by adding a second
> gateway, a second port, or a per-profile launchd job.

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

## QR Re-bind (account-level expiry / bot migration)

When `getconfig` itself returns `-14 session timeout` for the account token,
the expiry is **account-level**: no inbound message can refresh it and the only
recovery is QR re-auth of the bot account. The QR flow has sharp edges (2-minute
QR lifetime, 30-second long-poll that breaks naive timeouts, credential file
naming, .env dual blocks) — follow `references/qr-rebind.md` end to end
instead of improvising the API calls.

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
  `<main-bot-account-id>@im.bot:0600...`) — the full string is the token, keep it intact.
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
- **Multiplex: global config.yaml has platforms.weixin.enabled, profile config.yaml may not** — in `multiplex_profiles: true` mode, the gateway reads platform enablement from the **global** `~/.hermes/config.yaml` (under `gateway:` → `platforms:`), but credentials from the **active profile's** `.env`. If global has weixin enabled but profile .env lacks WEIXIN_TOKEN/WEIXIN_ACCOUNT_ID, the platform silently fails to connect (no "Connecting to weixin..." log line). Fix: ensure shared `.env.common` has the credentials so `generate-configs.py` propagates them to all profiles.
- **Shared .env.common is the single source for credentials** — `generate-configs.py` merges `.env.common` + `profiles.yaml` env_extra into each profile's `.env`. If WEIXIN_TOKEN/WEIXIN_ACCOUNT_ID are only in global `~/.hermes/.env` (or only in one profile's `.env`), other profiles won't get them. The fix is adding them to `.env.common` (or to each profile's `env_extra` in `profiles.yaml`) and re-running `generate-configs.py`.
- **Account file location is unified HERMES_HOME (`~/.hermes/weixin/accounts/`)**, not per-profile — even with multiplex, the weixin adapter looks only at `$HERMES_HOME/weixin/accounts/<account_id>.json` where `HERMES_HOME=~/.hermes`. If QR setup saved it under a profile home (`~/.hermes/profiles/<profile>/weixin/accounts/`), copy it to the unified location.
- **SwarmStudio auto-restart after kill works** — kill the gateway PID (`kill -TERM <pid>`), SwarmStudio's `autoRestartEnabled` + `scheduleRestart` respawns it with the new config. Verify in logs: `✓ weixin connected` and `Gateway running with N platform(s)` including weixin.
- **Bot re-bind swaps more than the token** — after a QR re-bind, the profile `.env` (profile-specific block), the `weixin/accounts/<id>.json` file, and the gateway restart all three must land; skipping the smoke test leaves a route that looks configured but has never delivered.

## Multi-account multiplex (verified 2026-09-26)

Two weixin bot accounts on ONE 8650 multiplex gateway (dad `<main-bot-account-id>@im.bot` on orchestrator, mom `<[已移除]-bot-account-id>@im.bot` on [已移除]-orchestrator) works: give each profile its own `WEIXIN_TOKEN`/`WEIXIN_ACCOUNT_ID` via `profiles.yaml` `env_extra` (NOT `.env.common`, which fans the same credential out to all 47 profiles and trips the duplicate-credential guard), run `generate-configs.py` for ALL profiles to purge stale copies, then hard-restart. `kill -TERM <pid>` + `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator` is the reliable restart; `hermes gateway restart` refuses (host-lock) and `kickstart` alone does NOT kill a live gateway.

Access tightening (pairing instead of allow-all): set `GATEWAY_ALLOW_ALL_USERS=false` in `.env.common`, regenerate, and BEFORE restart seed each profile's pairing store `platforms/pairing/weixin-approved.json` with `{"<wechat_user_id>": {"user_name": ..., "approved_at": <epoch>}}` — otherwise the humans behind the bots get locked out. New unknown senders then receive a pairing code; approve with `hermes -p <profile> pairing approve weixin <CODE>`. Per-profile stores mean the multiplexed secondary profile's approvals live under its own profile dir.

### Restart race: "Weixin: aiohttp/cryptography not installed" (root-caused 2026-09-26)

If weixin is skipped at startup with `Weixin: aiohttp/cryptography not installed` / `[MULTIPLEX] ... adapter creation returned None`, do NOT reinstall deps blindly. Root cause seen: an interrupted/cross-repo `hermes update` (marker `~/.hermes/profiles/orchestrator/.hermes-update-in-progress`) leaves a **mixed venv**: `venv/bin/python3` is 3.11 while deps sync into `installs/<env>/venv` (3.14); the 3.11 interpreter then fails to load cp314 `.so` files (pydantic_core/aiohttp). Fix procedure:
1. `ps aux | grep update` — kill any zombie update chains, especially from **other repo checkouts** (e.g. `/Volumes/.../hermes/tools/python...`) that hold the global marker;
2. remove stale marker file(s) under `~/.hermes/profiles/*/.hermes-update-in-progress`;
3. run `./venv/bin/hermes update` to completion (TUI + web UI must both build ✓);
4. remove marker again if it lingers after the updater exits;
5. restart gateway (kill -TERM + `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator`), then confirm `Connected account=` for both bots and `Gateway running with 4 platform(s)`.

### Per-member memory banks (bank_aliases, verified 2026-09-26)

The hindsight plugin supports `bank_id_template: "[已移除]-{user}"` + `bank_aliases: {wechat_id: member}` in `~/.hermes/profiles/<p>/hindsight/config.json`. The alias fold runs BEFORE template render (`plugins/hindsight/settings.py: resolve_bank_aliases`), so one parent's second weixin id maps onto the same `{user}` value → both ids share ONE bank; unmapped strangers each get their own bank (default per-user behavior); empty user (cron/CLI/delegate) falls back to the static `bank_id` so headless runs keep the profile-wide bank. To onboard a parent's second weixin: pairing-approve it, then add one line to `bank_aliases` — no code change. Old shared bank stays as fallback/history; new member banks (e.g. `[已移除]`) are auto-created on first write (PUT /v1/default/banks/{id} is idempotent).

Gateway restart quirk: a restart right after editing `~/.hermes/plugins/hindsight/**` can transiently log `Weixin: aiohttp/cryptography not installed` → `skipping platform 'weixin'` for the SECONDARY profile (module-import race at boot), dropping mom's bot to "Gateway running with 2 platform(s)". Fix: restart again (kill -TERM <pid> + `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator`) until `Gateway running with 4 platform(s)` and BOTH `✓ weixin connected` lines appear.

## Related Skills

- `gateway-platform-management` — platform-add mechanics, config-set-vs-global
  resolution, iLink bot limitations (DM works, groups usually don't)
- `gateway-crash-loop-troubleshooting` — crash loops, port conflicts, locks
- `email-channel-configuration` — the same profile-.env pitfall for the
  email channel (QQ Mail / agently-cli)

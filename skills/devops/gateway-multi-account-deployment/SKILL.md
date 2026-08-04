---
name: gateway-multi-account-deployment
description: Deploy a second account on its own gateway under multiplex.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [gateway, weixin, multiplex, second-account, credential-persistence, qr-login, profile-env]
    related_skills:
      - weixin-channel-configuration
      - in-session-team-deployment
      - gateway-platform-management
---

# Gateway Multi-Account Deployment

How to bring up a SECOND platform account (typically a second WeChat /
weixin) on a dedicated gateway profile while `multiplex_profiles: true`
is on — the credential-persistence and startup facts that took two
recurrences to learn (2026-07-25 → 2026-08-01, [已移除] team deployment).

## When to Use

- User asks to add a second WeChat account / second gateway process
- Deploying a dedicated team gateway (e.g. [已移除]-orchestrator, port 8651)
- Weixin connects, then silently disappears after a config regeneration
- Fixing a weixin channel that "used to work" after `generate-configs.py`

## Core Rule 1: credentials live in THREE places

Under multiplex, the gateway reads platform credentials from the ACTIVE
profile's `.env` (`~/.hermes/profiles/<profile>/.env`), NOT the global
`~/.hermes/.env`. Write weixin credentials to ALL THREE:

| Location | Why | If missing |
|----------|-----|------------|
| `~/.hermes/profiles/<profile>/.env` | what the gateway actually reads | platform silently skipped (no log line at all) |
| `~/.hermes/.env` (global) | non-multiplex fallback | single-profile runs lose the channel |
| `~/.hermes/shared/.env.common` | the regeneration source for generate-configs.py | next `generate-configs.py` run wipes the profile .env copy |

Symptom of missing #3: weixin works, then after any profile regeneration
the channel is gone again. 2026-07-25 fix only wrote global .env → recurred;
2026-08-01 wrote all three → stayed fixed.

## Core Rule 2: second account must NOT inherit first account's creds

`.env.common` is copied into EVERY profile's generated .env. If it carries
the FIRST account's `WEIXIN_TOKEN/WEIXIN_ACCOUNT_ID`, the second gateway
will bind the wrong account (duplicate keys in the generated file). Fix:

- In `.env.common`: keep weixin entries as EMPTY placeholders
  (`WEIXIN_TOKEN=`) plus a comment explaining the second account owns them
- Real values go in the profile's own `.env` / profiles.yaml `env_extra`

## Core Rule 3: second gateway needs `--force`

With `multiplex_profiles: true`, starting a dedicated gateway for another
profile exits 1:

```
✗ The default gateway is running as a profile multiplexer and already
  serves profile '[已移除]-orchestrator'. Pass --force to start a separate
  profile gateway anyway.
```

Start it with:
```bash
hermes -p <profile> gateway run --replace --force &
```

After startup, the second gateway logs:
```
kanban dispatcher: another gateway already holds the dispatcher lock ...;
this gateway will NOT dispatch.
```
That is EXPECTED — the main gateway's dispatcher iterates ALL boards,
so tasks still get dispatched. Do not chase it.

## Programmatic QR login (no separate terminal needed)

When the user can't open a second terminal, drive the weixin QR login
from inside the session:

```bash
GW_PY=$HOME/.hermes-web-ui/desktop-runtime/hermes/0.19.0/mac-arm64/python/bin/python3
export HERMES_HOME=~/.hermes/profiles/<profile>
cd ~/.hermes/hermes-agent && $GW_PY -c "
import asyncio, os
os.environ['HERMES_HOME'] = '<profile home>'
from gateway.platforms.weixin import qr_login, check_weixin_requirements
if not check_weixin_requirements(): raise SystemExit('missing deps')
creds = asyncio.run(qr_login('<profile home>', timeout_seconds=480))
if creds:
    print(creds['account_id'], creds['token'], creds['base_url'])
"
```

- Use the **SwarmStudio runtime python** (`~/.hermes-web-ui/desktop-runtime/
  hermes/<ver>/mac-arm64/python/bin/python3`) — system python3 lacks
  yaml/qrcode/aiohttp (conda plugin crashes otherwise)
- Prints an ASCII QR in the output stream → user scans with the phone
  → polls until confirmed → saves `weixin/accounts/<id>.json` into the
  profile HERMES_HOME → prints the credential dict
- Run it as a background process (`background=true,
  notify_on_complete=true`) and poll the output preview for the QR + result
- After success: write credentials to profile .env (Rule 1) and fix
  .env.common placeholders (Rule 2), then start the gateway (Rule 3)

## Verification

```bash
# gateway up with the second account
tail -30 ~/.hermes/profiles/<profile>/logs/gateway.log | grep -E "weixin|Gateway running"
# expect: ✓ weixin connected / Gateway running with 3-4 platform(s)

# no duplicate weixin keys in generated .env
grep -c "^WEIXIN" ~/.hermes/profiles/<profile>/.env

# account file in the RIGHT home
ls ~/.hermes/profiles/<profile>/weixin/accounts/
```

## Pitfalls

- `hermes gateway restart` is blocked from inside the gateway process —
  kill the PID; SwarmStudio auto-restarts it.
- iLink token format is `account_id:secret` — the full string is the token.
- The token-validity probe: POST `https://ilinkai.weixin.qq.com/ilink/bot/getconfig`
  with the token; `{"ret":-2,"errmsg":"ilink_user_id required"}` = auth OK
  (missing param, not bad token); "invalid token" = expired, re-run QR.
- First inbound DM from a new account triggers pairing approval when
  `WEIXIN_DM_POLICY=pairing` — warn the user before end-to-end testing.

## Related Skills

- `weixin-channel-configuration` — full diagnostic sequence for
  "enabled but never connects"
- `in-session-team-deployment` — board + profiles + gateway pipeline
  (includes the same --force and .env.common lessons)
- `gateway-platform-management` — platform-add mechanics, iLink bot limits

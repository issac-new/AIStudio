---
name: gateway-platform-management
description: >-
  Add new messaging platforms (WeChat, Telegram, etc.) to a SwarmStudio-managed
  unified gateway, understand API Server message routing, and work around the
  hermes config set active_profile resolution behavior. Use when adding a channel,
  diagnosing why config set doesn't write to global config, or checking if API
  Server messages go to Kanban.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [gateway, platform, weixin, config, api-server, kanban-routing]
    related_skills: [swarmstudio-gateway-management, email-channel-configuration]
---

# Gateway Platform Management

Operational knowledge for adding messaging platforms to a SwarmStudio-managed
unified gateway, and understanding message routing behavior per platform.

## When to Use

- Adding a new messaging platform (WeChat/Weixin, Telegram, Discord, etc.)
- `hermes config set` writes to profile config instead of global config
- Checking whether API Server messages route to Kanban
- Understanding which platforms trigger Kanban triage vs direct execution

## hermes config set resolves active_profile, not global

When `~/.hermes/active_profile` is set (e.g. to `orchestrator`), running
`hermes config set <key> <value>` writes to the **profile** config.yaml
(`~/.hermes/profiles/orchestrator/config.yaml`), NOT the global
`~/.hermes/config.yaml`. This happens even with `HERMES_HOME=~/.hermes`.

To write to the **global** config (needed for SwarmStudio's multiplex and
platforms sections), edit `~/.hermes/config.yaml` directly with `patch`
or `write_file`. The `patch` tool on a profile config.yaml is blocked by
the security-sensitive write guard; use `hermes config set` for profile
configs and `patch`/`write_file` for the global config.

## API Server messages do NOT route to Kanban

Messages received via the API Server (port 8650) are treated like TUI/CLI
messages — they are **executed directly** by the orchestrator agent, not
routed to Kanban. Only Matrix and Email messages go through the Kanban
triage flow (when they have a `**Source:** Matrix` header). This is by
design: API Server serves synchronous dashboard chat and programmatic
calls where the caller waits for a response.

### Platform routing summary

| Source | Kanban? | Why |
|--------|---------|-----|
| Matrix | Yes (triage) | Async messaging, needs task tracking |
| Email | Yes (if user explicitly asks) | Async, but default = no auto-process |
| API Server | No | Synchronous, caller waits for response |
| TUI / CLI | No | User is present, needs immediate response |

## Adding new messaging platforms (WeChat/Weixin example)

To add a new platform to the unified gateway:

1. **Install deps** in BOTH the Hermes venv AND SwarmStudio's desktop-runtime:
   ```bash
   /Users/<user>/.hermes/hermes-agent/venv/bin/pip install aiohttp cryptography
   # Verify SwarmStudio runtime too:
   /Users/<user>/.hermes-web-ui/desktop-runtime/hermes/0.18.0/mac-arm64/python/bin/python3 -c "import aiohttp, cryptography"
   ```

2. **Enable the platform** in BOTH global and orchestrator configs:
   ```bash
   # Profile config (via hermes config set — resolves active_profile)
   HERMES_HOME=~/.hermes hermes --profile orchestrator config set platforms.weixin.enabled true
   # Global config (via patch tool — needed for SwarmStudio's startup check)
   # Edit ~/.hermes/config.yaml: add `weixin: enabled: true` under platforms:
   ```

3. **Add credentials** to `~/.hermes/.env` (global, for unified gateway):
   ```bash
   WEIXIN_ACCOUNT_ID=your-account-id
   WEIXIN_TOKEN=your-bot-token
   ```

4. **Run interactive setup** for QR-code platforms (WeChat):
   ```bash
   # Must run in a real terminal (PTY), not from TUI
   hermes --profile orchestrator gateway setup
   # → Select Weixin → scan QR with phone → credentials auto-saved
   ```

5. **Restart gateway** (kill PID, SwarmStudio auto-respawns):
   ```bash
   kill $(python3 -c "import json; print(json.load(open('~/.hermes/profiles/orchestrator/gateway.pid'))['pid'])")
   ```

6. **Verify** in gateway log:
   ```bash
   tail -5 ~/.hermes/profiles/orchestrator/logs/gateway.log
   # Should show: ✓ weixin connected
   ```

### Weixin iLink bot limitations

- Connects as an **iLink bot identity** (e.g. `xxx@im.bot`), NOT your
  personal WeChat account
- **DM messages work reliably**
- **Group messages usually DON'T work** — iLink bot identity is typically
  not pushed group events from normal WeChat groups
- For enterprise WeChat, use the `wecom` platform adapter instead
- Platform docs: `~/.hermes/hermes-agent/website/docs/user-guide/messaging/weixin.md`

## Related Skills

- `swarmstudio-gateway-management` (default profile) — multiplex_profiles config,
  dashboard state symlink fix, launchd→SwarmStudio migration, active_profile
  resolution. This skill complements it with platform-add and routing details.
- `email-channel-configuration` — email platform setup, IMAP/SMTP vs
  agently-cli. Same pattern: enable in config + add creds to .env + restart.
- `gateway-crash-loop-troubleshooting` — crash loops, port conflicts, dispatcher
  lock issues.

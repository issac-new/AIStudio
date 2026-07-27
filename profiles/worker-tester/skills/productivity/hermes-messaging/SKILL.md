---
name: hermes-messaging
description: "Send and manage messages across all Hermes-supported messaging platforms: Matrix, Telegram, Discord, Slack, Signal, WhatsApp, Yuanbao, Feishu, iMessage, and more."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [messaging, send_message, matrix, telegram, discord, slack, signal, whatsapp, yuanbao, feishu, imessage, gateway, chat]
    related_skills: [yuanbao, imessage]
---

# Hermes Messaging

Send and manage messages across all Hermes-supported messaging platforms using the `send_message` tool and platform-specific adapters.

## When to Use

- User asks to send a message to any messaging platform
- Cross-platform message delivery (DMs, group chats, rooms, threads)
- Sending media attachments (images, files, audio, video)
- Listing available messaging targets/channels
- Adding/removing emoji reactions

## When NOT to Use

- Email → use `send_email` or email-specific tools
- SMS (non-iMessage) → use `send_message` with `target: "sms:+NUMBER"`
- Internal Hermes notifications → use `deliver` parameter or logging

## Core Tool: `send_message`

The `send_message` tool is the universal interface for all messaging platforms.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | No | `send` (default), `list`, `react`, `unreact` |
| `target` | string | Yes* | Delivery target format: `platform:identifier` |
| `message` | string | Yes* | Message text. Include `MEDIA:<path>` for attachments |
| `emoji` | string | No | For `react` action: emoji to react with |
| `message_id` | string | No | For `react`/`unreact`: target message ID |

*Required for `send`/`react`/`unreact`; omit for `list`

### Target Format by Platform

| Platform | Target Format | Example |
|----------|-------------|---------|
| **Matrix** | `matrix:!roomid:server.org` | `matrix:!abc123:matrix.org` |
| **Matrix DM** | `matrix:@user:server.org` (requires existing DM room) | `matrix:@alice:matrix.org` |
| **Telegram** | `telegram:CHAT_ID` or `telegram:CHAT_ID:THREAD_ID` | `telegram:-1001234567890` |
| **Discord** | `discord:CHANNEL_ID` or `discord:#channel-name` | `discord:#general` |
| **Slack** | `slack:#channel` or `slack:CHAT_ID` | `slack:#engineering` |
| **Signal** | `signal:+PHONE_NUMBER` | `signal:+15551234567` |
| **WhatsApp** | `whatsapp:PHONE_NUMBER` | `whatsapp:+15551234567` |
| **Yuanbao** | `yuanbao:direct:ACCOUNT_ID` or `yuanbao:group:GROUP_CODE` | `yuanbao:group:328306697` |
| **Feishu** | `feishu:CHAT_ID` | `feishu:oc_xxx` |
| **iMessage** | Use `imsg` CLI directly (see `imessage` skill) | — |
| **SMS** | `sms:+PHONE_NUMBER` | `sms:+15551234567` |
| **Email** | `email:address@example.com` | `email:team@example.com` |
| **Mattermost** | `mattermost:channel_id` | `mattermost:team:channel` |
| **Home Assistant** | `homeassistant:notify.ENTITY` | `homeassistant:notify.mobile_app` |
| **Ntfy** | `ntfy:TOPIC` | `ntfy:alerts-channel` |

## Platform-Specific Details

### Matrix Gateway Setup

For `send_message` to work through the Gateway (not just direct HTTP API), Matrix must be properly enabled in both `.env` and `config.yaml`:

**1. `.env` — Authentication:**
```bash
export MATRIX_HOMESERVER="http://localhost:8008"  # or https://matrix.example.com
export MATRIX_ACCESS_TOKEN="syt_xxxxxxxx"
export MATRIX_USER_ID="@bot:matrix.example.com"    # optional, for identity
```

**2. `config.yaml` — Enable platform:**
```bash
hermes config set platforms.matrix.enabled true
```

This writes to `config.yaml`:
```yaml
platforms:
  matrix:
    enabled: true
```

**3. Restart Gateway:**
```bash
hermes gateway restart
```

**4. Verify connection (CRITICAL — `hermes status` is misleading):**
```bash
# ❌ hermes status does NOT show Matrix in "Messaging Platforms" even when connected
# ✅ Use logs instead:
hermes logs | grep -i "matrix"
```

Expected output:
```
✓ matrix connected
Matrix: using access token for @bot:matrix.example.com (device XYZ)
Matrix: initial sync complete, joined 2 rooms
```

**5. Send via `send_message` tool:**
```json
{
  "action": "send",
  "target": "matrix:!roomid:server.org",
  "message": "Hello via Gateway!"
}
```

**Note:** The user explicitly prefers Gateway-only workflow. When asked about Matrix messaging, provide Gateway-focused steps without offering HTTP API alternatives unless specifically requested.

### Matrix

**Critical Pitfall: User IDs vs Room IDs**

Matrix uses two distinct identifiers:
- **User ID**: `@user:server.org` — identifies a person, NOT a message destination
- **Room ID**: `!roomid:server.org` — identifies a chat room where messages are sent

**You CANNOT send directly to a user ID.** You must send to a room ID. To DM someone on Matrix:

1. A DM room must already exist between sender and recipient
2. Use the DM room's `!roomid:server.org` as the target
3. If no DM room exists, create one via Matrix client or API first

**Configuration required:**
```yaml
matrix:
  homeserver: "https://matrix.example.com"
  access_token: "syt_xxxxxxxx"
```

Or environment variables:
```bash
export MATRIX_HOMESERVER="https://matrix.example.com"
export MATRIX_ACCESS_TOKEN="syt_xxxxxxxx"
```

**Features:**
- Markdown auto-converts to HTML (`org.matrix.custom.html` format)
- Media support: images, video, audio, files
- Thread support via `thread_id`
- Reactions supported
- Optional end-to-end encryption (E2EE)

**Matrix-specific tools** (when in Matrix context):
- `matrix_send_reaction`
- `matrix_redact_message`
- `matrix_create_room`
- `matrix_invite_user`
- `matrix_fetch_history`
- `matrix_set_presence`

### Telegram

- Supports topics/threads via `telegram:CHAT_ID:THREAD_ID`
- Rich media support (images, files, voice messages)
- Bot token required in config

### Discord

- Supports threads and forum channels
- `discord:#channel-name` resolves via channel directory
- Rich embeds and media attachments

### Yuanbao

See `yuanbao` skill for detailed @mention and DM workflows.

### iMessage

See `imessage` skill for macOS Messages.app integration.

## Sending Media Attachments

Include `MEDIA:<local_path>` in the message text:

```json
{
  "action": "send",
  "target": "telegram:-1001234567890",
  "message": "Check this out! MEDIA:/tmp/report.pdf"
}
```

**Media support by platform:**

| Platform | Text | Images | Video | Audio | Files |
|----------|------|--------|-------|-------|-------|
| Matrix | ✅ | ✅ | ✅ | ✅ | ✅ |
| Telegram | ✅ | ✅ | ✅ | ✅ | ✅ |
| Discord | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slack | ✅ | ❌ | ❌ | ❌ | ❌ |
| Signal | ✅ | ✅ | ✅ | ✅ | ✅ |
| WhatsApp | ✅ | ❌ | ❌ | ❌ | ❌ |
| Yuanbao | ✅ | ✅ | ❌ | ❌ | ✅ |
| Feishu | ✅ | ✅ | ✅ | ✅ | ✅ |

Platforms without native media support will drop attachments with a warning.

## Listing Available Targets

```json
{
  "action": "list"
}
```

Returns all configured messaging channels across connected platforms.

## Reactions

```json
{
  "action": "react",
  "target": "matrix:!roomid:server.org",
  "emoji": "👍",
  "message_id": "$event_id"
}
```

## Workflow: Send a Message

1. **Identify platform** from user's request
2. **Verify configuration** — check if platform is configured (token, homeserver, etc.)
3. **Resolve target** — use channel directory or ask user for room ID / chat ID
4. **Confirm content** — especially for DMs, new contacts, or bulk sends
5. **Send via `send_message`** tool
6. **Report result** — success/failure with message ID if available

## Pitfalls

1. **Matrix user IDs are not send targets** — always use room IDs (`!xxx`) for Matrix
2. **Matrix room ALIASES (`#name:server`) cannot be used directly** — `send_message` only accepts room IDs (`!xxx`). Aliases must be resolved to room IDs first via the Matrix API (`GET /_matrix/client/v3/directory/room/%23alias:server`)
3. **Matrix room creation requires HTTP API, not `send_message`** — `send_message` sends messages to existing rooms only. To create rooms or invite users, use the Matrix Client-Server API directly or the `matrix_room_manager.py` script
4. **DM rooms must exist** — Matrix, Discord DMs require pre-existing rooms
5. **Phone number formatting** — Signal/WhatsApp need `+` prefix: `+15551234567`
6. **Media paths must exist** — verify file before sending
7. **Thread IDs are platform-specific** — Telegram uses numeric thread IDs, Matrix uses event IDs
8. **Gateway must be running** — for some platforms (Discord, Telegram), the gateway needs to be active for full media support
9. **Matrix Gateway config requires BOTH `.env` AND `config.yaml`** — `.env` variables alone are not enough; `platforms.matrix.enabled: true` must be set in `config.yaml` via `hermes config set platforms.matrix.enabled true`
10. **`hermes status` does NOT show Matrix in Messaging Platforms even when connected** — verify via `hermes logs | grep -i "matrix"` instead; look for `✓ matrix connected` and `joined N rooms`
11. **`hermes -p orchestrator tools enable kanban` 可能返回 "Unknown toolset 'kanban'" 但成功** — 这是已知行为，kanban 工具集由 dispatcher 自动注入（通过 `HERMES_KANBAN_TASK` 环境变量），不需要显式启用。但 `memory` 和 `messaging` 需要手动启用。
12. **Worker profiles 不需要启动 Gateway** — worker 由 dispatcher 自动 spawn（`hermes -p worker-coder chat -q ...`），不需要运行 `hermes gateway start`。Worker 只需要配置好工具集和模型即可。
13. **Worker 工具集必须包含执行工具** — worker-coder 需要 `terminal`, `file`, `web`, `code_execution` 等工具才能实际工作。Orchestrator 作为调度器应限制工具集（只保留 `kanban`, `memory`, `messaging`），避免直接执行实现任务。
14. **Synapse SQLite "Problem storing device" error** — When `POST /_matrix/client/v3/login` returns "Problem storing device" / "disk I/O error", it's a SQLite device-store concurrency issue, not a permanent failure. Existing access tokens are still valid. Workaround: read tokens directly from `homeserver.db` via Python sqlite3 (see `references/synapse-sqlite-troubleshooting.md`). Long-term fix: migrate Synapse to PostgreSQL.

15. **Missing Matrix Python deps cause silent message drops** — If `mautrix` is not installed, the gateway starts fine (email connects, cron runs) but Matrix messages are silently ignored — no error logged, no `inbound message` lines in gateway.log. Fix: `pip install mautrix aiohttp-socks asyncpg aiosqlite`. See `references/matrix-dependency-troubleshooting.md` for full diagnosis, the `python-olm` compilation failure on macOS Clang 21, and the encryption-skip workaround.

## References

- `references/matrix-dependency-troubleshooting.md` — Matrix Gateway dependency diagnosis, python-olm compilation failure on macOS, fix steps
- `references/matrix-target-formats.md` — Matrix room ID vs user ID deep dive, alias resolution, DM creation, room creation + invite workflow, common errors
- `references/send_message_tool_source.md` — Key source code excerpts for debugging send failures
- `references/gateway-kanban-multi-agent.md` — **Deep dive into Gateway message routing + Kanban multi-agent architecture**: complete Matrix→Orchestrator→Worker setup steps, configuration checklist, debugging guide, and environment variables
- `references/synapse-sqlite-troubleshooting.md` — **Synapse SQLite "Problem storing device" error on login**: root cause analysis, extract access tokens directly from the database, verify with whoami, Docker container details, long-term fixes (PostgreSQL migration)
- `scripts/resolve_matrix_alias.py` — CLI tool to resolve `#alias:server` → `!roomid:server` for use with `send_message`
- `scripts/matrix_room_manager.py` — Full room lifecycle manager: create, invite, set alias, send message, list rooms

## Related Skills

- `yuanbao` — Yuanbao group @mention and DM workflows
- `imessage` — macOS iMessage/SMS via `imsg` CLI

## Session History & Prompt Retrieval

When the user asks to review their past prompts or session history, use the `session_search` tool with the following patterns:

- **Search specific keywords**: `session_search(query="keyword", role_filter="user", sort="newest", limit=10)`
- **Browse all recent sessions**: `session_search(limit=20)`
- **View a specific session**: `session_search(session_id="...", around_message_id=...)`

### Pitfalls

1. **No results does NOT mean no history** — the FTS5 index may not match the exact query. Try broader terms or browse mode (`session_search()` without query).
2. **Role filter matters** — `role_filter="user"` only shows user messages; omit it to see assistant/tool responses too.
3. **Context compaction hides early turns** — long sessions compact earlier messages into summaries. Use `around_message_id` to scroll into specific segments.
4. **Session IDs are ephemeral** — they rotate on context window resets. Don't hardcode them in skills or memory.

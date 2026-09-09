---
name: hermes-gateway-operations
description: >-
  Gateway + Dashboard unified startup, multi-board Kanban architecture,
  worker parallelism without independent gateways, and bulk session/task
  cleanup. Covers launchd plist setup, the start-gateway-with-dashboard.sh
  script, dispatcher multi-board enumeration, and SQLite-based pruning.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [gateway, dashboard, kanban, launchd, multi-board, session-pruning]
    related_skills: [hermes-profile-config, kanban-orchestrator]
---

# Hermes Gateway Operations

Operational procedures for running a single-gateway multi-profile Hermes
deployment with dashboard, multi-board Kanban, and bulk cleanup.

## When to Use

- Starting gateway + dashboard together under launchd
- Understanding worker parallelism without independent gateways
- Creating and managing multiple Kanban boards for different teams
- Bulk-deleting sessions or tasks

## Gateway + Dashboard Unified Startup (macOS launchd)

### Architecture

```
launchd (ai.hermes.gateway-<profile>)
  └─ start-gateway-with-dashboard.sh
       ├─ nohup hermes dashboard --host 127.0.0.1 --port 9119 --skip-build
       └─ exec hermes --profile <profile> gateway run --replace
```

The dashboard runs as a **child process** of the gateway (PPID = gateway PID).
`--skip-build` uses the pre-compiled web dist — no npm needed at runtime.
`exec` replaces the shell so launchd directly supervises the gateway process.
Worker profiles do NOT need this script — they have no gateway.

### Setup

1. Add `HERMES_DASHBOARD=1`, `HERMES_DASHBOARD_HOST=127.0.0.1`,
   `HERMES_DASHBOARD_PORT=9119` to `~/.hermes/shared/.env.common`.
2. Copy the start script to `~/.hermes/shared/start-gateway-with-dashboard.sh`.
3. Rewrite launchd plist `ProgramArguments` to call the script:
   ```
   /bin/bash ~/.hermes/shared/start-gateway-with-dashboard.sh <profile> --replace
   ```
4. Add `HERMES_DASHBOARD` env vars to the plist's `EnvironmentVariables`.
5. Reload:
   ```bash
   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.hermes.gateway-<profile>.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.hermes.gateway-<profile>.plist
   ```
6. Verify:
   ```bash
   lsof -i :8650 -sTCP:LISTEN   # gateway
   lsof -i :9119 -sTCP:LISTEN   # dashboard
   ```

### Reload after config changes

```bash
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-<profile>
```

Use this after regenerating configs via `generate-configs.py` — it restarts
the gateway process under launchd supervision, picking up new config.yaml
and .env files.

## Worker Parallelism Without Independent Gateways

Workers do NOT need their own gateway process. The Kanban dispatcher's
`_default_spawn()` function (`hermes_cli/kanban_db.py:8169`) spawns each
worker as a fire-and-forget subprocess:

```
hermes -p <assignee> --cli --accept-hooks chat -q "work kanban task <id>"
```

Each worker is an independent OS process with its own Python interpreter,
session context, and terminal. Key env vars injected per worker:
- `HERMES_KANBAN_TASK` — task ID to execute
- `HERMES_KANBAN_DB` — shared SQLite board path
- `HERMES_HOME` — profile-scoped config directory
- `TERMINAL_CWD` — task workspace directory

**Parallelism** = `max_in_progress_per_profile` x number of worker profiles.
E.g. 8 workers x 4 = 32 concurrent tasks. Only the orchestrator profile
runs a gateway (with api_server + matrix + dashboard).

### max_in_progress_per_profile tuning

| Value | Total (8 workers) | Use case |
|-------|-------------------|----------|
| 2 | 16 | Conservative, low API rate limits |
| 3 | 24 | Balanced |
| 4 | 32 | Aggressive, watch API rate limits |
| 5+ | 40+ | Only with high-RPM API or local model |

Consider: M1 Pro 32GB can handle 32 concurrent worker processes (~100-200MB
each = 3-6GB). The bottleneck is usually API RPM/TPM, not local resources.

## Multi-Board Kanban Architecture

The dispatcher (`gateway/kanban_watchers.py:1063-1078`) automatically
enumerates ALL non-archived boards on every 60s tick — no restart needed
when creating new boards:

```python
def _tick_once():
    boards = _kb.list_boards(include_archived=False)
    for b in boards:
        _tick_once_for_board(b["slug"])  # independent dispatch per board
```

Tasks on different boards are dispatched independently. Worker profiles are
isolated by assignee name — a worker assigned to team A will never pick up
tasks from team B's board.

### Board management

```bash
hermes kanban boards list                                    # list all boards
hermes kanban boards create <slug> --name "Name" --icon "X" --color "#hex"
hermes kanban boards rename <slug> "New Name"                # slug is immutable
hermes kanban boards set-default-workdir <slug> <path>       # set workspace root
hermes kanban boards rm <slug>                               # archive/delete
```

**Pitfall**: The `default` board slug is system-reserved and cannot be
deleted, even if empty. Create a separate slug (e.g. `hack`) for specialized
boards instead of trying to repurpose `default`.

### Bulk task deletion

```bash
sqlite3 ~/.hermes/kanban/boards/<slug>/kanban.db "DELETE FROM tasks;"
```

This removes ALL tasks including archived ones. The board itself remains.

## Session Pruning (Bulk Deletion)

`hermes sessions prune --before <date> --include-archived --yes` only deletes
sessions with message records. For thorough cleanup, use direct SQLite:

```bash
TODAY_START=$(python3 -c "import datetime; print(datetime.datetime(2026,7,22).timestamp())")

for p in orchestrator worker-coder worker-researcher; do
    db=~/.hermes/profiles/$p/state.db
    # Delete sessions before today
    sqlite3 "$db" "DELETE FROM sessions WHERE started_at < $TODAY_START;"
    # Delete orphan messages (whose session_id no longer exists)
    sqlite3 "$db" "DELETE FROM messages WHERE session_id NOT IN (SELECT id FROM sessions);"
    # Reclaim disk space
    sqlite3 "$db" "VACUUM;"
done
```

### Pitfall: `hermes sessions prune` leaves some sessions

The CLI prune may leave sessions that lack message records or have
non-standard `started_at` formats. Direct SQLite `DELETE FROM sessions
WHERE started_at < <epoch>` is more reliable for bulk cleanup.

### Pitfall: orphan messages bloat the DB

Deleting sessions without deleting their messages leaves orphan rows in the
`messages` table. Always run the orphan cleanup + VACUUM after bulk session
deletion to reclaim disk space (e.g. 68MB DB with 874 orphan messages →
significant shrinkage after VACUUM).

## Pitfalls

### skill_manage cross_profile=True doesn't work for patched skills

When a skill exists in the `default` profile (symlinked into `orchestrator`),
`skill_manage(action='patch', cross_profile=True)` still reports "not found
in active profile". The `cross_profile` flag is recognized but doesn't
resolve the skill lookup. Workaround: use the `patch` tool with the
absolute file path, or create a new skill in the active profile.

### launchctl kickstart vs bootout/bootstrap

- `launchctl kickstart -k gui/$(id -u)/<label>` — restarts the service
  (kills + respawns). Use for config reloads.
- `launchctl bootout` + `bootstrap` — fully unloads and reloads the plist
  definition. Use when the plist file itself changed (ProgramArguments,
  EnvironmentVariables, etc.).

---

## Gateway 重启的安全时序门控（2026-08-24 实例）

> 实例：改 hermes 源码（kanban_db.py 增 metadata 列）需 gateway/dispatcher 重启
> 加载 patched 代码才生效。但此时 worker 正在 running 改源码，且主 gateway
> （8650）早已挂掉。何时重启、怎么重启，需要一套判断，不能盲目杀/起进程。

### 何时才是"安全重启窗口"

重启 gateway/dispatcher 会**中断所有 running worker**（它们是 dispatcher spawn 的子进程）。
重启前**必须**先查全集群 running 任务，空窗才动手：

```bash
for b in swarm hack product ops [已移除] platform [已移除]; do
  db=~/.hermes/kanban/boards/$b/kanban.db
  [ -f "$db" ] && sqlite3 "$db" \
    "SELECT '$b', id, assignee FROM tasks WHERE status='running';" 2>/dev/null
done
# 有输出 = 有 worker 在跑 → 等它跑完；空 = 安全窗口
```

**坑**：新建的 kanban 任务会被 dispatcher **秒拾取**进 running。所以"建任务"和"重启 gateway"
不能在同一拍做——先把要建的卡建完、等它们全 done，再重启。边建边重启会反复打断新 worker。

### 非 launchd 环境（SwarmStudio 管控）的主端口诊断与恢复

本集群 gateway 归 **SwarmStudio** 管（非 launchd，profile 下有 `.gateway-launchd-unsupported`
标记）。launchctl 那套不适用。主 orchestrator gateway 挂掉（如 8650 无监听）时的诊断：

```bash
# 1. 确认无监听 vs 有监听（对照健康的 [已移除] 8651）
lsof -iTCP:8650 -sTCP:LISTEN   # 空 = 主 gateway 挂了
lsof -iTCP:8651 -sTCP:LISTEN   # 有 = [已移除] 正常（参照）

# 2. 找 gateway 进程真实形态（注意区分）
ps aux | grep -iE "gateway run|tui_gateway|--profile.*gateway" | grep -v grep
# 'orchestrator serve' 不监听 8650；只有 'gateway run' 才监听

# 3. 查挂掉原因（orchestrator gateway 日志尾部）
tail -30 ~/.hermes/profiles/orchestrator/logs/gateway.log
# 典型: "Gateway stopped by an unexpected signal ... Exiting with code 1"
# macOS 无 systemd 自动复活 → 挂了就一直是挂的

# 4. 确认期望启动命令（gateway_state.json 的 argv）
cat ~/.hermes/profiles/orchestrator/gateway_state.json | python3 -m json.tool | grep -A5 argv
# 参照 [已移除]: hermes_cli.main --profile [已移除]-orchestrator gateway run --replace --force
```

**恢复**：主 gateway 重启命令形如
`hermes_cli.main --profile orchestrator gateway run --replace`
（前台进程，归 SwarmStudio 管）。**这属 HumanGate 高级操作**（长期驻留进程 + 影响
Matrix/Weixin 渠道收发 + 第三方管控），不要让 agent 盲目自主执行——应给图爸出方案，
确认时机（worker 空窗）与执行方（agent 重启 vs 图爸经 SwarmStudio 重启）后再动。

**顺带收益**：若本次重启是为了让某个源码 patch（如新增 DB 列）生效，可在同一重启里
一并恢复挂掉的主 gateway——一次重启解决两件事。

### 🔴 Gateway 重启可能触发 git pull 冲掉主仓未提交改动（2026-08-25 实例）

`gateway run --replace --force` 启动路径若带更新检查（或同日有独立更新机制），会把
hermes-agent 主仓 pull 到新 HEAD——**工作树里未 commit 的改动（含 worker 当天交付的
源码 patch）会被整体冲掉**。判例：F2/F3/F4 三组改动当天 done 并核验，同日 gateway
重启后 HEAD 跳新，三组改动全丢只剩 1 行默认值 diff。

**防护纪律**：
- worker 改 hermes-agent 主仓源码后**必须完成即 commit**（卡验收标准里「git log 可见」
  是硬项）——commit 了的改动上游 pull 不会丢
- orchestrator 核验 worker 源码交付时，**核验对象是 git log 不是工作树**——
  `git log --oneline | grep <关键词>` 见到 commit 才算落地；只 grep 工作树文件不算
- 重启 gateway 前若主仓有未提交改动，先评估是否需要 commit 保护再重启

**matrix 依赖缺失修复**（mautrix 等报 "required packages not installed"）：
```bash
cd ~/.hermes/hermes-agent
# 纯文本 Matrix（够用）：不带 encryption extra，避开 python-olm 源码编译（cmake 失败）
venv/bin/pip install mautrix==0.21.1 aiosqlite==0.22.1 asyncpg==0.31.0 aiohttp-socks==0.11.0 Markdown
# E2EE 加密才需要：brew install cmake libolm 后再装 'mautrix[encryption]'
```
装完重启 gateway 生效（适配器在启动时初始化）。

## Gateway lifecycle 通知抑制（gateway_restart_notification，2026-08-28 实例）

> 实例：邮箱被 `Gateway online` / `shutting down` 类 home-channel 通知刷屏。
> 同一收件箱（your@example.com）被 orchestrator + [已移除]-orchestrator 两个网关进程
> 各发一次，造成重复噪声。抑制后日志落 `Shutdown notification suppressed ...`。

### 机制

每个平台若配置了 `home_channel`，网关每次启动/关闭都会向该渠道发一条
"Gateway online" / "shutting down" 一次性通知。判定逻辑在 `gateway/run.py`：
- `_send_home_channel_startup_notifications`（启动, ~L24964）
- `_notify_active_sessions_of_shutdown`（关闭, ~L10981）
- 抑制检查：`run.py:24988` 与 `run.py:10943`
  `if platform_cfg is not None and not platform_cfg.gateway_restart_notification: continue`
- `home_channel` 来源：email → `EMAIL_HOME_ADDRESS` 环境变量；matrix → `MATRIX_HOME_ROOM`。
- 缺省 `gateway_restart_notification: true`（即发送）。

### 抑制命令

```bash
# 当前 active profile（$HERMES_HOME 指向的 profile 的 config.yaml）
hermes config set platforms.email.gateway_restart_notification false
hermes config set platforms.matrix.gateway_restart_notification false

# 针对非 active 的 secondary/profile（用 HERMES_HOME 覆盖写入目标 profile 的 config.yaml）
env HERMES_HOME=/Users/YOURNAME/.hermes/profiles/[已移除]-orchestrator \
  hermes config set platforms.email.gateway_restart_notification false
```

- 配置键路径是 `platforms.<name>.gateway_restart_notification`，**不是**
  `gateway.platforms.<name>...`（后者是文档里的 plausible-but-wrong 写法）。
- `hermes config set` 把 `"false"` 字符串自动 coerce 为 bool 写入 config.yaml
  （实测落盘为 `'gateway_restart_notification': False`，bool 类型）。
- 写入后即生效**于文件**，但**内存中运行的旧进程仍是旧配置**，必须重启网关。

### 重启与验证

```bash
hermes gateway restart        # 返回快，但进程起满需等数秒
# 若已停止/超时：hermes gateway start
sleep 10
hermes gateway status         # 确认相关 profile 均 running
# 验证日志无新通知：
grep -h "Shutdown notification suppressed\|Sent home-channel startup" \
  ~/.hermes/profiles/orchestrator/logs/gateway.log | tail
# 期望看到：'Shutdown notification suppressed for home channel: email has gateway_restart_notification=false'
# 且不再出现：'Sent home-channel startup notification to email:...'
```

### 坑：multiplex 下多 profile 共享同一 home_channel → 必须逐个置 false

`gateway.multiplex_profiles=true` 时，多个网关进程各自独立读取自己 profile 的
config.yaml，但 `EMAIL_HOME_ADDRESS` 通常指向**同一收件箱**。只给 orchestrator 置
false，[已移除] 进程仍会发那条通知——必须对所有启用 email 平台的 profile 都置 false，
噪声才彻底消失。本集群实测：两 profile 的 `EMAIL_ADDRESS` / `EMAIL_HOME_ADDRESS`
均为 `your@example.com`（账号相同，非不同账号）。

### 坑：hermes gateway restart 可能前台超时

`hermes gateway restart` 在 drain 期（默认 up to 1815s 上限）会卡住并触发 foreground
超时（默认 180s）。超时 ≠ 失败——进程仍在后台 restart。改用 `hermes gateway start`（已
停止时），或在 `terminal(background=true, notify=true)` 中跑 restart，再用
`hermes gateway status` 轮询确认。

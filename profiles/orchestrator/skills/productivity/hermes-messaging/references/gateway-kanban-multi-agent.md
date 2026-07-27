# Gateway + Kanban 多 Agent 消息路由架构

> 参考文档：深入理解 Hermes Gateway 如何将消息从 Matrix/Telegram/Discord 路由到 Agent，以及如何通过 Kanban 实现 Orchestrator + Worker 多 Agent 协作。
> 适用于：需要理解 Gateway 内部消息流、配置多 Agent 架构、调试消息路由问题的场景。

---

## 一、Gateway 消息处理完整流程

### 1. 平台适配器层（Platform Adapter）

每个平台（Matrix/Telegram/Discord/Slack...）有独立的适配器：

```
Matrix Homeserver → MatrixAdapter
Telegram API      → TelegramAdapter
Discord Gateway   → DiscordAdapter
Slack Events API  → SlackAdapter
```

**以 Matrix 为例（`gateway/platforms/matrix.py`）：**

```python
class MatrixAdapter(BasePlatformAdapter):
    async def _on_room_message(self, event):
        # 1. 过滤自身消息
        if self._is_self_sender(sender): return
        # 2. 过滤桥接用户（@_telegram_xxx）
        if self._is_system_or_bridge_sender(sender): return
        # 3. 检查用户白名单
        if not self._is_allowed_matrix_room_event(room_id): return
        # 4. 去重
        if self._is_duplicate_event(event_id): return
        # 5. 启动宽限期过滤
        # 6. 包装为 MessageEvent，调用 _message_handler
```

### 2. 会话管理层（BasePlatformAdapter）

```python
class BasePlatformAdapter:
    async def handle_message(self, event: MessageEvent):
        # 生成 session_key = platform + chat_id + user_id + thread_id
        session_key = build_session_key(event.source)
        
        # 检查是否已有 Agent 在运行
        if session_key in self._active_sessions:
            # 命令绕过（/stop, /new, /reset）
            # clarify 拦截
            # 普通消息排队到 _pending_messages
            return
        
        # 启动后台任务处理
        self._start_session_processing(event, session_key)
```

### 3. GatewayRunner 核心处理（`gateway/run.py`）

```python
class GatewayRunner:
    async def _handle_message(self, event):
        # 1. 插件钩子 pre_gateway_dispatch
        # 2. 用户授权检查
        # 3. 未授权 DM 提供配对码
        # 4. 拦截 update/clarify/confirm
        # 5. 运行中 Agent 处理（中断、排队、/steer）
        # 6. 调用 _handle_message_with_agent()
        
    async def _handle_message_with_agent(self, event, source, session_key):
        # 1. 获取/创建 session
        # 2. 构建 session context
        # 3. 加载对话历史
        # 4. 自动压缩过大的上下文（hygiene）
        # 5. 调用 _run_agent()
        
    async def _run_agent(self, message, context_prompt, history, source, session_id):
        # 创建/复用 AIAgent 实例
        agent = AIAgent(...)
        result = await agent.run_conversation(...)
        return result
```

### 4. AIAgent 对话层（`run_agent.py`）

```python
class AIAgent:
    def run_conversation(self):
        # 1. 构建 system prompt（技能、记忆、环境信息）
        # 2. 调用 LLM API
        # 3. 处理工具调用（tool calling）
        # 4. 返回最终响应
```

---

## 二、Kanban 多 Agent 架构

### 核心概念

| 概念 | 说明 |
|------|------|
| **Board** | 任务队列，独立的 SQLite DB |
| **Task** | 任务行，包含 title, body, assignee, status |
| **Link** | 父子任务依赖关系 |
| **Comment** | 任务评论，Agent 间通信协议 |
| **Workspace** | 工作目录：scratch（临时）/ dir（持久）/ worktree（git） |
| **Dispatcher** | 后台循环，每 60 秒分配任务给 Worker |
| **Tenant** | 可选命名空间，软隔离 |

### 状态流转

```
triage → todo → ready → running → blocked → done → archived
```

### Orchestrator + Worker 架构

```
┌────────────────────────────────────────┐
│  Orchestrator Profile                  │
│  （接收所有 Gateway 消息）               │
│                                        │
│  Gateway → AIAgent (orchestrator)       │
│              ↓                         │
│         kanban_create()                │
│              ↓                         │
│         ~/.hermes/kanban.db            │
└────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────┐
│  Dispatcher（内嵌在 Gateway）            │
│  每 60 秒检查，spawn Worker 进程        │
└────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────┐
│  Worker Profile（独立进程）              │
│                                        │
│  hermes -p worker-coder chat -q "..."   │
│  env: HERMES_KANBAN_TASK=xxx            │
│  env: HERMES_KANBAN_WORKSPACE=xxx       │
│  env: HERMES_KANBAN_BOARD=default       │
│                                        │
│  Worker 工具集：kanban_show,            │
│  kanban_complete, kanban_block,        │
│  kanban_heartbeat, kanban_comment      │
└────────────────────────────────────────┘
```

### 配置示例

```yaml
# ~/.hermes/profiles/orchestrator/config.yaml
kanban:
  dispatch_in_gateway: true
  dispatch_interval_seconds: 60
  max_in_progress: 5
  max_in_progress_per_profile: 2
  auto_decompose: true
  auto_decompose_per_tick: 3
  failure_limit: 2
  default_assignee: "worker-coder"
```

### 创建和使用

```bash
# 创建 profiles
hermes profile create orchestrator --description "主控 Agent"
hermes profile create worker-coder --description "编写代码"
hermes profile create worker-researcher --description "研究分析"

# Orchestrator 配置 Gateway
hermes profile use orchestrator
hermes gateway setup
hermes gateway start

# Orchestrator 在对话中创建任务
# （通过 kanban_create 工具调用）
```

---

## 三、关键环境变量

### Worker 进程环境变量

| 变量 | 说明 |
|------|------|
| `HERMES_KANBAN_TASK` | 任务 ID |
| `HERMES_KANBAN_WORKSPACE` | 工作目录 |
| `HERMES_KANBAN_BOARD` | Board slug |
| `HERMES_KANBAN_DB` | SQLite DB 路径 |
| `HERMES_KANBAN_WORKSPACES_ROOT` | Workspaces 根目录 |
| `HERMES_KANBAN_BRANCH` | Git branch |
| `HERMES_KANBAN_RUN_ID` | 运行 ID |
| `HERMES_KANBAN_CLAIM_LOCK` | Claim lock |
| `HERMES_KANBAN_GOAL_MODE` | Goal-loop 模式 |
| `HERMES_PROFILE` | Worker profile 名 |
| `HERMES_TENANT` | 租户命名空间 |

### Matrix Gateway 环境变量

| 变量 | 说明 |
|------|------|
| `MATRIX_HOMESERVER` | Homeserver URL |
| `MATRIX_ACCESS_TOKEN` | 访问令牌 |
| `MATRIX_USER_ID` | Bot 用户 ID |
| `MATRIX_PASSWORD` | 密码登录 |
| `MATRIX_ALLOWED_USERS` | 允许的用户 |
| `MATRIX_ALLOWED_ROOMS` | 允许的房间 |
| `MATRIX_REQUIRE_MENTION` | 房间中是否需要 @mention |
| `MATRIX_AUTO_THREAD` | 自动创建线程 |
| `MATRIX_SESSION_SCOPE` | 会话范围 |
| `MATRIX_E2EE_MODE` | E2EE 模式 |

---

## 四、调试指南

### 查看 Gateway 日志

```bash
# 当前 profile 的 Gateway 日志
tail -f ~/.hermes/logs/gateway.log

# 或特定 profile
tail -f ~/.hermes/profiles/orchestrator/logs/gateway.log
```

### 查看 Worker 日志

```bash
# 默认 board
tail -f ~/.hermes/kanban/logs/<task_id>.log

# 特定 board
tail -f ~/.hermes/kanban/boards/<slug>/logs/<task_id>.log
```

### 查看 Dispatcher 状态

```bash
# 查看 Kanban 任务列表
hermes kanban list

# 查看特定任务
hermes kanban show <task_id>

# 查看 board 统计
hermes kanban stats

# 实时监控
hermes kanban watch
```

### 常见问题排查

| 问题 | 排查方法 |
|------|----------|
| Dispatcher 不 spawn worker | 检查 `kanban.dispatch_in_gateway: true`；检查 Worker profile 是否存在；检查任务状态是否为 `ready` |
| Worker 崩溃 | 查看 worker 日志；检查 `reap_worker_zombies` 输出 |
| 消息不路由 | 检查 Gateway 日志中的 `inbound message` 行；检查 session_key 生成 |
| Matrix 不响应 | 检查 `_on_room_message` 是否被调用；检查过滤条件 |
| 上下文过大 | 查看 `Session hygiene` 日志；检查压缩是否触发 |

---

## 五、完整配置步骤（实战记录）

### 场景：Matrix 用户发送消息 → Orchestrator 接收 → 自动创建 Kanban 任务 → Worker 执行

#### 1. 检查现有环境

```bash
# 查看已有 profiles
hermes profile list

# 查看当前 board
hermes -p orchestrator kanban boards list
```

#### 2. 配置 Orchestrator Profile

```bash
# 切换到 orchestrator profile
hermes profile use orchestrator

# 配置 Matrix 无需 @mention 即可响应
hermes config set matrix.require_mention false

# 配置 Kanban 参数
hermes config set kanban.orchestrator_profile orchestrator
hermes config set kanban.default_assignee worker-coder
```

**Orchestrator `config.yaml` 关键配置：**
```yaml
matrix:
  require_mention: false        # 允许直接发消息，无需 @mention
  auto_thread: true             # 自动创建线程
  
kanban:
  dispatch_in_gateway: true     # Gateway 内嵌 dispatcher
  dispatch_interval_seconds: 60  # 每 60 秒检查
  orchestrator_profile: orchestrator  # 分解任务分配给 orchestrator
  default_assignee: worker-coder     # 未分配任务默认给 worker-coder
  auto_decompose: true           # 自动分解 triage 任务
  auto_decompose_per_tick: 3     # 每 tick 最多分解 3 个
  
# 工具集（orchestrator 只需要 kanban + memory + messaging）
# 注意：hermes-cli 已包含 web/terminal/file，但 orchestrator 作为调度器
# 应限制工具集，避免直接执行实现任务
toolsets:
  - hermes-cli
  - kanban
  - memory
  - messaging
```

#### 3. 创建 Worker Profiles

```bash
# 创建 worker profiles（从 orchestrator 克隆配置）
hermes profile create worker-coder --description "编写代码、调试、技术实现" --clone
hermes profile create worker-researcher --description "研究分析、信息搜集" --clone

# 为 worker 启用执行工具（worker 需要实际工作能力）
worker-coder tools enable terminal
worker-coder tools enable file
worker-coder tools enable web
worker-coder tools enable code_execution

worker-researcher tools enable terminal
worker-researcher tools enable file
worker-researcher tools enable web
worker-researcher tools enable browser
```

**Worker 不需要运行 Gateway**，它们由 dispatcher 自动 spawn。

#### 4. 初始化 Kanban Board

```bash
# 初始化 kanban（如未创建）
hermes -p orchestrator kanban init

# 切换到目标 board
hermes -p orchestrator kanban boards switch kanban001
```

#### 5. 启动 Gateway

```bash
# 启动 orchestrator 的 Gateway
hermes -p orchestrator gateway start

# 或重启以应用配置更改
hermes -p orchestrator gateway restart
```

#### 6. 验证配置

```bash
# 查看 Gateway 状态
hermes -p orchestrator gateway status

# 查看实时日志（确认 Matrix 连接和 dispatcher 启动）
tail -f ~/.hermes/profiles/orchestrator/logs/gateway.log

# 期望看到：
# - "✓ matrix connected"
# - "Matrix: initial sync complete, joined N rooms"
# - "kanban dispatcher: default_assignee='worker-coder'"
# - "kanban dispatcher: embedded in gateway (interval=60.0s)"
```

---

## 六、关键环境变量

### Worker 进程环境变量

| 变量 | 说明 |
|------|------|
| `HERMES_KANBAN_TASK` | 任务 ID |
| `HERMES_KANBAN_WORKSPACE` | 工作目录 |
| `HERMES_KANBAN_BOARD` | Board slug |
| `HERMES_KANBAN_DB` | SQLite DB 路径 |
| `HERMES_KANBAN_WORKSPACES_ROOT` | Workspaces 根目录 |
| `HERMES_KANBAN_BRANCH` | Git branch |
| `HERMES_KANBAN_RUN_ID` | 运行 ID |
| `HERMES_KANBAN_CLAIM_LOCK` | Claim lock |
| `HERMES_KANBAN_GOAL_MODE` | Goal-loop 模式 |
| `HERMES_PROFILE` | Worker profile 名 |
| `HERMES_TENANT` | 租户命名空间 |

### Matrix Gateway 环境变量

| 变量 | 说明 |
|------|------|
| `MATRIX_HOMESERVER` | Homeserver URL |
| `MATRIX_ACCESS_TOKEN` | 访问令牌 |
| `MATRIX_USER_ID` | Bot 用户 ID |
| `MATRIX_PASSWORD` | 密码登录 |
| `MATRIX_ALLOWED_USERS` | 允许的用户（逗号分隔） |
| `MATRIX_ALLOWED_ROOMS` | 允许的房间 |
| `MATRIX_REQUIRE_MENTION` | 房间中是否需要 @mention |
| `MATRIX_AUTO_THREAD` | 自动创建线程 |
| `MATRIX_SESSION_SCOPE` | 会话范围 |
| `MATRIX_E2EE_MODE` | E2EE 模式 |

---

## 七、调试指南

### 查看 Gateway 日志

```bash
# 当前 profile 的 Gateway 日志
tail -f ~/.hermes/profiles/orchestrator/logs/gateway.log

# 查看最近的日志
tail -20 ~/.hermes/profiles/orchestrator/logs/gateway.log
```

### 查看 Worker 日志

```bash
# 默认 board
tail -f ~/.hermes/kanban/logs/<task_id>.log

# 特定 board
tail -f ~/.hermes/kanban/boards/<slug>/logs/<task_id>.log
```

### 查看 Dispatcher 状态

```bash
# 查看 Kanban 任务列表
hermes -p orchestrator kanban list

# 查看特定任务
hermes -p orchestrator kanban show <task_id>

# 查看 board 统计
hermes -p orchestrator kanban stats

# 实时监控
hermes -p orchestrator kanban watch

# 查看 worker 分配情况
hermes -p orchestrator kanban assignees
```

### 常见问题排查

| 问题 | 排查方法 |
|------|----------|
| Dispatcher 不 spawn worker | 检查 `kanban.dispatch_in_gateway: true`；检查 Worker profile 是否存在；检查任务状态是否为 `ready` |
| Worker 崩溃 | 查看 worker 日志；检查 `reap_worker_zombies` 输出 |
| 消息不路由 | 检查 Gateway 日志中的 `inbound message` 行；检查 session_key 生成；检查 `matrix.require_mention` 设置 |
| Matrix 不响应 | 检查 `_on_room_message` 是否被调用；检查过滤条件（白名单、去重） |
| 上下文过大 | 查看 `Session hygiene` 日志；检查压缩是否触发 |
| Gateway 启动但 dispatcher 未启动 | 检查 `kanban.dispatch_in_gateway` 配置；检查 kanban.db 是否存在 |

---

## 八、关键源码文件

| 功能 | 文件 |
|------|------|
| Matrix 适配器 | `gateway/platforms/matrix.py` |
| 基础适配器 | `gateway/platforms/base.py` |
| GatewayRunner | `gateway/run.py` |
| AIAgent | `run_agent.py` |
| Dispatcher | `gateway/kanban_watchers.py` |
| 任务分配 | `hermes_cli/kanban_db.py` |
| Worker spawn | `hermes_cli/kanban_db.py::_default_spawn()` |
| Kanban 工具 | `tools/kanban_tools.py` |

---

## 九、配置检查清单

在启动 Gateway 前，确认以下配置：

- [ ] Orchestrator profile 存在且为当前 profile
- [ ] Matrix 环境变量已设置（`MATRIX_HOMESERVER`, `MATRIX_ACCESS_TOKEN`）
- [ ] `matrix.require_mention` 已按需配置（false = 直接响应）
- [ ] Kanban board 已初始化（`hermes kanban init`）
- [ ] Worker profiles 已创建（worker-coder, worker-researcher 等）
- [ ] Worker 已启用必要工具（terminal, file, web, code_execution）
- [ ] `kanban.dispatch_in_gateway` 为 true
- [ ] `kanban.orchestrator_profile` 已设置
- [ ] `kanban.default_assignee` 已设置（fallback）
- [ ] Gateway 日志目录存在（`~/.hermes/profiles/<name>/logs/`）

# Orchestrator Agent Rules for Matrix → Kanban001
# 本文件定义了 orchestrator profile 接收 Matrix 消息后的处理规则
# 放置位置: ~/.hermes/profiles/orchestrator/orchestrator_rules.md
# 
# 生效方式: 在 orchestrator profile 的 config.yaml 中通过 agent.environment_hint 引用
# 或在 orchestrator agent 的系统提示中注入此规则
#
# ⚠️ 适用范围: 本规则仅对 **Matrix Gateway** 消息生效。
#    来自 TUI/CLI 的消息不走 Kanban，由 orchestrator 直接执行（见 SOUL.md 平台路由规则）。

---

## 全局强制规则：编码开发必须通过 ACP 调用 Claude Code

> 详见 `SOUL.md` 顶部「🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code」。本节不再重复，以下仅保留故障处理补充。

### 故障处理
ACP 连续两次故障 → `kanban_block(kind="dependency", reason="ACP provider 持续故障")` 并退出。

---

---

## 0. 平台路由规则

> 详见 `SOUL.md`「Platform routing rules」和「TUI/CLI routing」。以下仅补充 rules 特有内容。

### 0.1 Email 全局规则

> ⚠️ **最高优先级**: orchestrator **不自动处理、不自动回复**两个邮箱的邮件，除非用户明确要求。

- `your@email.com` — IMAP channel（gateway 原生 email adapter）
- `your@email.com` — agently-cli（agent.qq.com OAuth）

**"明确要求"判定**：
- ✅ 用户在 TUI/CLI/Matrix 中直接说"检查邮件""读邮件""回复xxx的邮件""发邮件给xxx"
- ❌ cron job 触发、邮件到达通知、其他 agent 转发的邮件摘要 — **不构成明确要求**

详见 `email_kanban_rules.md`。

### 0.2 智能路由规则（所有 Gateway 平台）

> **适用**: 所有 Gateway 渠道 — Matrix、Weixin、API Server、Email
> **不适用**: TUI/CLI（始终直接执行，不创建看板任务）

> ⚠️ **与 SOUL.md 顶部强制规则联动**: SOUL.md 顶部的「智能路由留痕」强制规则定义了**量化触发条件**（工具调用次数/文件写入次数），本节定义路由判定标准和留痕方式。两者共同构成完整的智能路由执行链。**量化触发条件优先于下表的主观判定标准**。

#### 路由判定标准

| 复杂度 | 判定标准 | 处理方式 |
|--------|---------|---------|
| **轻量** | 工具调用 ≤2 且 文件写入 =0 | 直接执行，不创建看板任务 |
| **中等** | 工具调用 3-5 或 文件写入 1-2 | 直接执行 + 轻量留痕（§0.2.1） |
| **重型** | 工具调用 ≥6 或 文件写入 ≥3 或 涉及研究/编码/安全/部署 | 走完整看板流程：§0.5 board 路由 → `kanban_create(triage=True)` |

#### 0.2.1 轻量留痕机制

对"中等"复杂度的消息，执行完成后**立即**:

1. `kanban_create(title=<10-20字摘要>, assignee="orchestrator", board="swarm", initial_status="running", tenant=<platform tenant>)` — 创建任务
2. `kanban_complete(summary=<1-2句执行摘要>, metadata={"platform": "<platform>", "action": "<操作类型>"})` — 立即标记完成

**效果**: board 上显示 `done`，有完整追踪记录（时间、内容、结果），不引入 triage/dispatch 延迟。

#### 0.2.2 Tenant 格式（全平台统一语义）

所有 Gateway 平台使用统一六段式 tenant，**六段语义跨平台严格对齐**：

```
<chat_name>:<topic>:<user_id>:<chat_id>:<session_id>:<platform>
```

**平台字段映射表**:

| 段 | 语义 | Matrix | Weixin | API Server | Email |
|----|------|--------|--------|------------|-------|
| 1 chat_name | 会话/上下文名称 | 群聊显示名；DM 留空 | 群聊名；私信用 OpenID 前缀 | API 路径或客户端标识 | 发件人显示名；无则用邮箱 |
| 2 topic | 话题/主题 | `**Channel Topic:**` | 群聊话题；无则留空 | 请求路径摘要 | 邮件主题（去 `Re:`/`Fwd:` 前缀） |
| 3 user_id | 发送者标识 | `@user:homeserver` | OpenID 或 weixin user id | API key 名称 / 调用者标识 | 发件人邮箱地址 |
| 4 chat_id | 会话标识 | room_id（**去 homeserver 后缀**） | 群聊 ID；私信用 `weixin-dm` | 请求 ID / 会话 ID | 收件人邮箱地址 |
| 5 session_id | 消息标识 | event_id / thread_id | msg_id | request_id | message_id（agently `msg_xxx` / IMAP UID） |
| 6 platform | 固定后缀 | `matrix` | `weixin` | `api_server` | `email` |

**提取规则**:
- 段 1-2：从 `**Source:**` 和 `**Channel Topic:**` 提取；**无则留空**，严禁从消息内容推断
- 段 3：从 `**User:**` 或 `**User ID:**` 行提取，**严禁**从消息体或 `msg=...` 前缀解析
- 段 4：从 `**Source:**` 中提取会话标识并做平台特定处理（Matrix 去 homeserver 后缀）
- 段 5：各平台消息/事件唯一标识
- 段 6：固定平台后缀

**DM（私聊）场景统一格式**:
```
<platform>-dm::<user_id>:<chat_id>:<session_id>:<platform>
```
- 段 1（chat_name）和段 2（topic）在 DM 场景均留空
- 适用于 Matrix 私聊、Weixin 私信、API Server 单调用、Email 单对单

**群聊场景统一格式**:
```
<群聊名>:<话题>:<user_id>:<chat_id>:<session_id>:<platform>
```

**各平台示例**:

| 平台 | 场景 | Tenant 值 |
|------|------|-----------|
| Matrix | 群聊（有名+有话题） | `跨团队协作群01:记忆服务讨论:@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| Matrix | 群聊（有名+无话题） | `跨团队协作群01::@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| Matrix | 私聊 | `matrix-dm::@testuser3:@testuser3:$eventId:matrix` |
| Weixin | 群聊 | `技术交流群:API重构讨论:oWxn4S1uW3:gh_abc123:msg_001:weixin` |
| Weixin | 私信 | `weixin-dm::oWxn4S1uW3:weixin-dm:msg_001:weixin` |
| API Server | 调用 | `chat/completions:summary-request:api-key-prod:req_abc123:req_001:api_server` |
| Email | 收到邮件 | `张三:项目报告:zhangsan@example.com:your@email.com:msg_xxx:email` |
| Email | DM 本质 | `email-dm::zhangsan@example.com:your@email.com:msg_xxx:email` |

#### 0.2.3 重型任务路由

判定为"重型"时，按 §0.5 Board 路由规则确定 board（swarm/product/ops），然后:

```python
kanban_create(
    title=<消息摘要>,
    body=<完整任务描述>,
    board=<§0.5 判定结果>,
    tenant=<platform tenant>,
    workspace_kind="worktree",
    triage=True
)
```

回复用户: "已创建任务到 {board}: [task title]。任务完成后会在此收到通知。"

---

## 0.5 Board 路由规则（五看板统一调度）

### 域景

系统当前有五个看板，由 orchestrator 统一路由：

| 看板 | slug | 用途 | profile_scope |
|------|------|------|---------------|
| **协作看板** | `swarm` | 常规软件开发、架构设计、代码审查、测试、部署 | orchestrator, architect, project-manager, requirement-analyst, worker-coder, worker-deployer, worker-researcher, worker-reviewer, worker-tester |
| **产品看板** | `product` | 产品管理、用户研究、需求优先级、反馈分析 | orchestrator, product-manager, product-researcher, product-feedback, product-prioritizer |
| **运维看板** | `ops` | SRE、事件响应、DevOps自动化、高管摘要 | orchestrator, ops-sre, ops-incident-commander, ops-devops, ops-exec-summary |

### 0.5.1 路由判定流程

```
Matrix / Email / Weixin / API Server 消息到达
    ↓
[内容分析] 提取关键词、消息主题
    ↓
[多级分类判定]
    ↓
   ├─ 产品/市场/用户研究？ → board="product", 按 §0.5.7 分配 product profile
   ├─ 运维/SRE/事件响应？ → board="ops", 按 §0.5.8 分配 ops profile
   └─ 其他（软件开发/研究/部署等） → board="swarm", 按常规 §4 分配 worker profile
```

> 📖 **Board 路由关键词表** 已外置到 `references/board-keywords.md` — 路由判定时用 `read_file` 按需加载。


### 0.5.4 Swarm 看板保持原逻辑

非安全类消息（软件开发、架构设计、研究、部署、文档等）继续路由到 `swarm` 看板，assignee 分配规则遵循 §4（基本分配策略）。

> 📖 **Product 看板路由规则** 已外置到 `references/product-routing-rules.md` — 路由判定时用 `read_file` 按需加载。

> 📖 **Ops 看板路由规则** 已外置到 `references/ops-routing-rules.md` — 路由判定时用 `read_file` 按需加载。


> 📖 **路由示例** 已外置到 `references/routing-examples.md` — 路由判定时用 `read_file` 按需加载。

### 0.5.6 路由判定优先级

4. **产品关键词匹配**: 按 §0.5.7 关键词表匹配 → `product` 看板
5. **运维关键词匹配**: 按 §0.5.8 关键词表匹配 → `ops` 看板
7. **默认**: 无匹配 → `swarm` 看板

### 0.5.10 方法论路由建议（PUA Methodology Router）

> 来源：tanweai/pua 方法论智能路由，适配 Hermes 五看板环境。
> 在 `kanban_create` 的 body 中附带方法论建议，worker 执行任务前 `skill_view('pua-methodology-router')` 加载。

看板判定后，根据任务类型在 body 中附带方法论建议：

| Hermes 看板 | 任务类型 | 推荐方法论 | 核心方法 |
|------------|---------|-----------|---------|
| **swarm** (编码) | build/create/implement | ⬛ Musk | The Algorithm: 质疑→删除→简化→加速→自动化 |
| **swarm** (审查) | review/refactor | ⬜ Jobs | 减法优先 + 像素级完美 + DRI |
| **swarm** (研究) | research/search | ⚫ 百度 | 搜索第一 + 信息检索 |
| **swarm** (架构) | design/architecture | 🔶 Amazon | Working Backwards + 6-Pager |
| **product** | 产品/用户研究 | 🟧 小米 | 参与感三三法则 + 和用户交朋友 |
| **ops** | deploy/config/运维 | 🟠 阿里 | 定目标→追过程→拿结果 + 复盘四步法 |
| **通用/模糊** | 无明确类型 | 🟠 阿里 | 通用闭环（默认） |

**失败切换链**：worker 连续失败时，按失败模式切换方法论（不回头，不重复）：
- 原地打转 → ⬛ Musk → 🟣 拼多多 → 🔴 华为
- 放弃/推锅 → 🟤 Netflix → 🔴 华为 → ⬛ Musk
- 质量差 → ⬜ Jobs → 🟧 小米 → 🟤 Netflix
- 没搜就猜 → ⚫ 百度 → 🔶 Amazon → 🟡 字节
- 被动等待 → 🟦 京东 → 🔵 美团 → 🟠 阿里
- 空口完成 → 🟡 字节 → 🟦 京东 → 🟠 阿里
- 思维固化 → 🪟 Microsoft → 🔵 美团 → ⬜ Jobs → ⬛ Musk

> 详细路由表、切换规则、14种方法论速查见 `skill_view('pua-methodology-router')`。

---

## 1. 核心规则总览

当 orchestrator agent (profile: orchestrator) 通过 **Matrix Gateway** 接收到任何消息时，必须遵循以下规则：

1. **强制登记**: 每条 Matrix 消息必须在 swarm 板上创建任务
2. **租户隔离**: 不同 Matrix 群聊/用户的消息使用结构化的 tenant 字段隔离
3. **状态通知**: kanban 任务状态变化时自动通知 Matrix 用户

> ⚠️ 以上规则 **不适用于 TUI/CLI 会话**。TUI 会话中 orchestrator 直接用工具执行用户请求，不创建 Kanban 任务。

---

## 2. 消息处理流程

```
Matrix 消息到达
    ↓
[提取元数据] 群聊 roomId、room name、用户名称
    ↓
[Board 路由判定] 按 §0.5 判定 → board="swarm"
    ↓
[创建 Kanban 任务] board=<判定结果>, tenant=<结构化 tenant 值>
    ↓
[自动订阅通知] 将 Matrix 聊天订阅到任务状态变更
    ↓
[回复用户] 确认任务已创建

⚠️ TUI/CLI 消息不走此流程 — 直接执行，不创建 Kanban 任务。
```

---

## 3. 租户规则 (Tenant Isolation)

### 3.1 租户字段格式

所有平台使用统一六段式 tenant（见 §0.2.2）。Matrix 平台的具体字段映射：

```
<群聊名称>:<話題摘要>:<user_id>:<room_id>:<session_id>:matrix
```

> **全平台统一格式见 §0.2.2**，本节仅补充 Matrix 平台特有规则。

### 3.2 会话上下文提取规则

Orchestrator 在系统提示中收到的会话上下文示例：

```
**Source:** Matrix (group: 部门kanban房间)
**User ID:** @testuser1:matrix.test
**Channel Topic:** Hindsight 记忆服务讨论
```

提取映射：

| Tenant 段 | 系统提示字段 | 说明 |
|-----------|-------------|------|
| `群聊名称` | `**Source:** Matrix (group: ...)` 中的群组名称 | 房间显示名，若无则用 `chat_id` 去 homeserver 后缀 |
| `話題摘要` | `**Channel Topic:** ...` | **若无则留空**，严禁从消息内容或标题中提取 |
| `user_id` | `**User:** ...` 或 `**User ID:** ...` | 消息实际发送者（在群聊中发消息的人），**不可**从消息体或 `msg='...'` 前缀解析 |
| `room_id` | `**Source:**` 中提取 roomId 并**去除 homeserver 后缀** | 如 `!<matrix-room-id>:matrix.test` → `!<matrix-room-id>` |
| `session_id` | Matrix 消息的 event_id | 由 auto_thread 机制传入，等于每条消息的事件 ID |
| `matrix` | 固定值 | 来源平台后缀 |

### 3.3 示例

| 场景 | Tenant 值（完整六段式） |
|------|------------------------|
| 群聊消息（有 chat_name、有话题） | `跨团队协作群01:记忆服务讨论:@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| 群聊消息（有 chat_name、无话题） | `跨团队协作群01::@testuser3:!<matrix-room-id>:$<event-id>:matrix` |
| 群聊消息（chat_name=空） | `!短chatId::@testuser1:!<matrix-room-id>:$eventId:matrix` |
| 私聊消息 | `@testuser3::@testuser3:@testuser3:$eventId:matrix` |

### 3.4 租户隔离效果

- 同一租户的任务在 kanban 列表中可聚合查看
- 不同租户的任务完全隔离，worker 上下文互不干扰
- 租户名称写入 `HERMES_TENANT` 环境变量，影响 memory 和 workspace

---

## 3.5 全局规则：workspace 类型设置

所有 kanban 任务创建时，**必须显式设置 workspace_kind 参数**。

禁止项：
- ❌ **不允许使用 `"scratch"`**（包括省略参数依赖默认值）

默认值：
- ✅ **`workspace_kind="worktree"`** — **默认值**，Git worktree 模式，每个任务在独立分支上工作，天然支持持久化和并行执行
- ✅ `workspace_kind="dir"` — 固定目录模式（仅用于非 Git 任务或临时文件操作）

> **主仓库路径**：`~/hermes-docker-sandbox/workspace/`（已初始化 Git 仓库）。使用 `workspace_kind="worktree"` 时，系统自动在主仓库下创建 `.worktrees/<task-id>` 子目录和独立分支，无需手动指定 `workspace_path`。

### 3.5.1 调用示例

```python
# 默认场景 — git worktree（推荐，持久化 + 并行执行）
kanban_create(
    title="...",
    workspace_kind="worktree",
    # workspace_path 无需指定 — 系统自动在主仓库下创建 .worktrees/<task-id>
    ...
)

# 项目关联场景 — worktree + project（分支名带项目前缀）
kanban_create(
    title="...",
    workspace_kind="worktree",
    project="my-project",
    ...
)

# 特殊场景 — 固定目录（非 Git 任务、临时文件操作）
kanban_create(
    title="...",
    workspace_kind="dir",
    workspace_path="~/hermes-docker-sandbox/workspace/<task-specific-subdir>",
    ...
)
```

### 3.5.2 调用规则

调用 `kanban_create()` 时：
- **默认** `workspace_kind="worktree"` — 适用于绝大多数任务（代码编写、研究、安全测试等）
- `workspace_kind="dir"` — 仅用于非 Git 任务或需要固定路径的临时文件操作
- `workspace_kind` 默认 `"worktree"`；`"scratch"` 不在允许范围内（无持久化、无并行支持）
- worktree 模式下无需指定 `workspace_path`（系统自动在主仓库 `.worktrees/` 下创建）

### 3.5.3 Worktree 持久化与并行执行

**持久化**：Worker 在 worktree 中的 Git 提交会保留在独立分支上（`wt/<task-id>` 或 `<project-slug>/<task-id>`），即使 worktree 目录被清理，分支仍存在于主仓库中，可随时恢复或审查。

**并行执行**：多个任务各自在独立的 worktree 分支上并行工作，互不干扰。Dispatcher 可同时 spawn 多个 worker，每个 worker 在自己的 worktree 中操作，不会产生文件冲突。

### 3.6 父任务完成时打包 workspace 到子任务

> 完整打包流程和伪代码见 `references/workspace-packaging.md`（按需 `read_file` 加载）。

## 4. 分配规则

### 4.1 基本分配策略

Orchestrator **不进行智能分类**（安全分类除外，见 §0.5），创建任务时统一使用默认分配：

| 情况 | 分配 |
|------|------|
| 所有消息（默认） | assignee 留空，由后续流程处理 |
| 明确指定 worker 的消息 | 按用户要求指定 assignee |

### 4.2 可用 Workers

当前系统配置的 worker profiles:

**Swarm 看板**:
- `worker-coder`: 代码编写、技术实现、调试
- `worker-researcher`: 研究分析、信息收集、总结报告
- `worker-deployer`: 应用部署、环境配置
- `worker-reviewer`: 代码审查、质量检查
- `worker-tester`: 测试、验证

**Hack 看板**（见 §0.5.3 自动分配规则）:

**Product 看板**（见 §0.5.7 自动分配规则）:
- `product-manager`: 产品全生命周期、PRD、路线图、跨职能协调
- `product-researcher`: 用户画像、竞品分析、TAM/SAM/SOM、趋势研究
- `product-feedback`: 多渠道反馈收集、情感分析、痛点排序
- `product-prioritizer`: RICE评分、待办列表排序、依赖映射

**Ops 看板**（见 §0.5.8 自动分配规则）:
- `ops-sre`: SLO定义、错误预算、可观测性、混沌工程
- `ops-incident-commander`: 严重度分类、协调响应、post-mortem
- `ops-devops`: IaC、CI/CD流水线、K8s、零停机部署
- `ops-exec-summary`: SCQA框架、高管摘要、决策支持

### 4.3 特殊场景

| 消息类型 | 处理方式 |
|----------|---------|
| 问候/闲聊 (hello, hi, 你好, 在吗等) | 直接回复，不创建任务 |
| 以 `/` 开头的命令 | 优先处理 slash command，不创建任务 |
| 转接/联系请求 | 说明无法转接，统一走 kanban 创建任务 |

---

## 5. 状态变更通知规则

> 通知事件类型、自动订阅机制和格式示例见 `references/notification-format.md`（按需 `read_file` 加载）。

## 6. 配置检查清单

确保 orchestrator profile 的 `config.yaml` 已配置:

```yaml
# 必需: 启用 kanban 工具集
kanban:
  dispatch_in_gateway: true
  default_assignee: worker-coder
  orchestrator_profile: orchestrator

# 必需: 启用 Matrix 平台
platforms:
  matrix:
    enabled: true

# 可选: 启用所有相关工具集
toolsets:
- hermes-cli
- kanban
- memory
- messaging
- terminal

# 可选: 跨 profile 通知
# 在 worker profile 的 config.yaml 中:
notification_sources: ['*']  # 或 ['orchestrator']
```

---

> 📖 **话题标签规范** 已外置到 `references/topic-tags.md` — 路由判定时用 `read_file` 按需加载。

> 📖 **Matrix 协作约定** 已外置到 `references/matrix-conventions.md` — 路由判定时用 `read_file` 按需加载。

## 8. 特殊场景处理

### 8.3 TUI/CLI 消息（不走 Kanban）

当 orchestrator 通过 TUI/CLI 接收消息时（无 `**Source:**` 行）：
- **直接执行** — 回答问题、写代码、用工具
- **不创建 Kanban 任务**
- **不需要 tenant 提取**

详见 SOUL.md 中的「平台路由规则」。

### 8.4 Gateway 消息（智能路由）

当 orchestrator 通过任何 Gateway 渠道（Matrix/Weixin/API Server/Email）接收消息时，按 §0.2 智能路由规则处理：
- **轻量** → 直接执行，不留痕
- **中等** → 直接执行 + 轻量留痕（§0.2.1）
- **重型** → 走完整看板流程（§0.5 board 路由）

> Email 额外约束: 仅在用户明确要求时才进入智能路由流程（§0.1）。

---

### 8.1 多消息聚合

同一用户在短时间内（30秒内）发送多条消息:
- 聚合为单个 kanban 任务
- 更新任务 body 追加新内容
- 如果已有在途任务，追加到该任务的 comments

---

> 📖 **实现示例** 已外置到 `references/implementation-examples.md` — 路由判定时用 `read_file` 按需加载。

---

## §0.6 Skill 自演进与运行时学习（借鉴 JiuwenSwarm Symphony）

> 来源：openJiuwen-ai/jiuwenswarm (Apache-2.0) Symphony 引擎。
> 核心理念：能力越用越强而非越跑越僵。

### §0.6.1 动态 Overlay 权重

每次任务完成后，通过 `kanban_comment` 记录 outcome 事件：
```json
{
  "evolution_event": {
    "plan_id": "<task_id>",
    "outcome": "success|failure|needs_input",
    "selected_skill_ids": ["skill-a", "skill-b"],
    "failure_type": "wrong_skill|skill_error|incomplete|refusal|empty",
    "failure_attribution": "all_edges|terminal_edge|explicit|success_only"
  }
}
```

路由决策时参考历史成功率（通过 `hindsight_recall` 检索）：
- 高成功率 skill（runtime_weight > 1.0）→ 优先路由
- 低成功率 skill（runtime_weight < 1.0）→ 需要改进或替代
- needs_input 不影响权重（用户缺少输入不是 skill 的错）

### §0.6.2 五维评估驱动的路由优化

路由决策不只看任务复杂度（§0.2），还参考 skill 历史五维评估：
- success_rate < 0.5 的 skill → 标注"低可靠"，路由时降级
- compliance 不通过的 skill → 禁止路由
- latency 过高的 skill → 标注"慢"，考虑替代

### §0.6.3 Experience Bank 经验检索

任务开始前，通过 `hindsight_recall` 检索相关经验模式：
- 搜索同类任务的成功/失败模式
- 提取 error_type 分类指导路由调整
- 注入历史经验作为上下文

### §0.6.4 Beam 规划增强

任务分解不只创建单层子任务，而是搜索最优 skill 编排路径：
1. Forward: 从已有 skills 向前搜索可以 feed 的下游
2. Backward: 从目标 artifacts 向后搜索可以产出的 skills
3. 历史成功率影响路径选择
4. `kanban_create(parents=[...])` 表达 skill 间依赖

> 完整协议见 `skill_view('skill-self-evolution-fusion')`。

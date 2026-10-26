# AI 协作中心（cockpit）接入 kanban 真实数据设计

**日期**：2026-06-23
**状态**：待评审
**适用项目**：hermes-studio（`upstream/hermes-studio`），二次开发在 `overlay/`
**关联设计**：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（cockpit 原视觉与交互设计）
**关联审计**：`docs/superpowers/specs/2026-06-22-cockpit-implementation-gap-audit.md`

---

## 0. 背景与目标

### 0.1 现状

cockpit 页面（`/hermes/cockpit`）目前是纯 mock 驱动的演示态：
- 16 个 Vue 组件全部从 `useCockpitStore` 取数据
- `useCockpitStore` 的全部数据来自 `overlay/custom/client/cockpit/fixtures/seed.ts`（13 个硬编码数组）
- 与真实 kanban store（`useKanbanStore`）零耦合，无任何 API 调用

### 0.2 目标

**去除 mock 数据，所有页面数据及筛选项的底层数据必须来自 hermes agent 的 kanban 数据**，并保留 cockpit 已实现的全部交互能力。

### 0.3 数据通路确认

cockpit 消费的"kanban 数据"通路：
```
hermes-agent SQLite (kanban.db)
  └─ execHermes(['kanban', ...]) CLI 子进程
      └─ hermes-studio Koa 路由 /api/hermes/kanban/* (38 条，overlay 已增 18 条)
          └─ useKanbanStore (Pinia, REST + WebSocket 事件流)
              └─ useCockpitStore (本次改造新增消费者)
```

**关键约束**：cockpit 只走 `/api/hermes/kanban/*`，不直连 hermes-agent 的 `/api/plugins/kanban/*`（那是 agent dashboard 内嵌用）。

---

## 1. 关键决策记录（16 项）

| # | 维度 | 决策 |
|---|------|------|
| 1 | 改造范围 | **务实分层**：底层数据（任务/注意力/时序/文件/筛选/统计/负责人）100% 接 kanban；无对应物的部分（评审表单/模板/聊天消息/终端）降级为"客户端草稿态"或"复用现有 store action" |
| 2 | 左栏分组 | 取消原 human/cluster/direct 三类，**按 `tenant` 分组**，tenant 作为筛选项 |
| 3 | 优先级映射 | 阈值分桶：`priority≥3→P0`、`=2→P1`、`=1→P2`、`=0/null→P3` |
| 4 | 注意力条 | **仅按 `status` 派生**（blocked→high、review→medium），不依赖 `/diagnostics` |
| 5 | 时序事件流 | **三层合并**：task_events + runs + search-sessions 对话 |
| 6 | 文件树 | **新增 patch 路由** `GET /workspace-files` 列目录（现有 `/artifact` 只能读单文件，不能列目录） |
| 7 | 聊天入口 | tenant 三段式编码 + 精简壳内嵌（不跳转） |
| 8 | 协作图 | **中心辐射式**（当前任务为中心，父/子任务、人员、协作频道三类辐射） |
| 9 | tenant 编码 | **三段式 `prefix:id:name`**，session 用 `id@profile` 合并参数 |
| 10 | 历史回溯 | task_events + comments **合并**派生 |
| 11 | 工作项表单 | **localStorage 草稿 + comment 落盘**（提交时写 kanban comment） |
| 12 | 架构方案 | **方案 C 混合**：派生数据 computed 自 useKanbanStore（无副本），客户端态仍本地 |
| 13 | 历史聚合 patch | **加** `079-timeline-aggregate`（1 次请求拿全量） |
| 14 | 协作图画布 | 左上角**全屏/最小化按钮 + 放大/缩小按钮 + 可拖拽画布** |
| 15 | 聊天实现 | **精简壳 + 复用 store action**（不内嵌重型 Panel，不调 router.push，固定本页） |
| 16 | 聊天生命周期 | **进入 cockpit 全初始化**（matrix client + group socket + chat sessions 并发保活） |

---

## 2. 总体架构

### 2.1 核心原则

**单一数据源 + 适配层 + 客户端态分离**（方案 C）。

- **底层真数据** 100% 来自 `useKanbanStore`（已接 `/api/hermes/kanban/*` + WebSocket 事件流）。
- cockpit 不再持有任何 kanban 数据副本，`useCockpitStore` 的"数据类状态"全部改为 computed 派生。
- 16 个组件**保持现有 getter 契约不变**，改动集中在 store 内部 + 适配模块 + 一个新路由 patch + tenant 解析模块。

### 2.2 模块结构（cockpit 目录重构）

```
overlay/custom/client/cockpit/
├── index.ts                          # 路由注册（不变）
├── store/
│   ├── cockpit.ts                    # 重构：派生态 computed + 客户端态 ref + bootstrap
│   └── cockpit-kv.ts                 # 新增：localStorage 适配（草稿/模板）
├── adapters/                         # 新增：kanban → cockpit 适配层
│   ├── task-adapter.ts               # KanbanTask → CockpitTask + priority 分桶
│   ├── attention-adapter.ts          # KanbanTask.status → AttentionItem
│   ├── event-adapter.ts              # task_events + runs + search-sessions → CockpitEvent
│   ├── collab-adapter.ts             # tenant 字符串解析 → CollabChannel + 跳转契约
│   ├── topology-adapter.ts           # task_links + assignee + tenant → 中心辐射节点
│   ├── history-adapter.ts            # events + comments 合并 → HistoryItem
│   └── chat-adapter.ts               # matrix/chat/group 消息归一 → ChatMessage
├── api/
│   └── workspace-files.ts            # 新增：调 GET /workspace-files（patch 路由）
├── fixtures/
│   └── seed.ts                       # 删除（mock 数据彻底移除）
├── views/CockpitView.vue             # 改：onMounted 调 store.bootstrap()
└── components/                       # 16 个组件：保持 getter 契约，少量字段适配
```

### 2.3 数据流

```
useKanbanStore (tasks/comments/events/runs/...)  ←─ REST + WebSocket
        │
        ▼
useCockpitStore.computed (经 adapters/* 映射)
   ├─ tasks            = kanban.tasks.map(taskAdapter.toCockpit)
   ├─ attention        = kanban.tasks.map(attentionAdapter.toAttention).filter(Boolean)
   ├─ events           = eventAdapter.mergeDetail(detail)         ← 选中任务懒加载
   ├─ fileTree         = workspace-files API                      ← 选中任务懒加载
   ├─ channels         = collabAdapter.parse(selectedTask.tenant)
   ├─ topology         = topologyAdapter.build(selectedTask, links, assignee, tenant)
   └─ history          = historyAdapter.merge(allEvents, allComments)  ← 打开弹窗时懒加载
        │
        ▼
16 components (getter 契约不变)
```

### 2.4 关键不变量

| 不变量 | 说明 |
|--------|------|
| 组件接口稳定 | `store.tasks`/`store.attention`/`store.eventsForTimeline` 等现有 getter 名全部保留，16 个组件无需改 import |
| 类型映射收敛 | `KanbanTask` → `CockpitTask` 的转换只在 `adapters/task-adapter.ts` 一处 |
| 单一数据源 | kanban 数据只在 `useKanbanStore` 一份，cockpit store 不缓存副本（computed 自动响应 WebSocket 刷新） |
| 客户端态隔离 | 草稿/模板/筛选/折叠/selectedTaskId 在 cockpit store 或 localStorage，永不与 kanban 混淆 |
| overlay 约束 | 所有改动在 `overlay/`；唯一新增后端是 2 条 patch 路由（`078`、`079`） |

---

## 3. 数据字段映射规则

### 3.1 任务字段映射（`task-adapter.ts`）

| CockpitTask 字段 | 来源（KanbanTask） | 转换规则 |
|---|---|---|
| `id` | `KanbanTask.id` | 直接取 |
| `title` | `KanbanTask.title` | 直接取 |
| `priority` | `KanbanTask.priority` (number) | 阈值分桶：`≥3→P0`、`=2→P1`、`=1→P2`、`=0/null→P3` |
| `status` | `KanbanTask.status` | 直接取，**存原始 9 值**（triage/todo/scheduled/ready/running/blocked/review/done/archived）；左栏筛选 chip 显示时再经 `bucketStatus` 合并为 5 桶（见 §3.2）|
| `assignee` | `KanbanTask.assignee` | null → `'未分配'`；否则原样（profile 名） |
| `workspace` | `KanbanTask.workspace_path` | null → `'~'`；否则原样 |
| `tenant`（新增） | `KanbanTask.tenant` | 原样保留（可能是 `matrix:...:名称` 编码串或自由文本） |
| ~~`category`~~ | **删除** | 原 human/cluster/direct 三类分组取消，字段从 CockpitTask 移除 |

**类型变更**：

```ts
// before
interface CockpitTask { id, title, category, priority, status, assignee, workspace }
// after
interface CockpitTask { id, title, priority, status, assignee, workspace, tenant }
```

**优先级分桶函数**：

```ts
export function bucketPriority(p: number | null | undefined): CockpitPriority {
  if (p == null || p <= 0) return 'P3'
  if (p === 1) return 'P2'
  if (p === 2) return 'P1'
  return 'P0'  // p >= 3
}
```

### 3.2 左栏分组与筛选

**分组维度变更**：原 `human/cluster/direct` → **按 `tenant` 分组**。

- 分组键：`task.tenant ?? '(未指定)'`
- 组排序：组内按 priority 升序（P0 在前）+ 同档按 `created_at` 降序
- 筛选 chip 三组改为：
  - **优先级**：P0 / P1 / P2 / P3（不变）
  - **状态**：5 桶（合并 kanban 9 状态，见下）
  - **tenant**：动态生成（从 `useKanbanStore.tasks` 去重 `tenant` 字段；含 `'(未指定)'`）

**状态合并映射**（避免左栏状态 chip 过多）：

```ts
export type CockpitStatusBucket = 'review' | 'blocked' | 'running' | 'todo' | 'done'

export function bucketStatus(s: KanbanTaskStatus): CockpitStatusBucket {
  switch (s) {
    case 'review': return 'review'
    case 'blocked': return 'blocked'
    case 'running': case 'ready': case 'scheduled': return 'running'
    case 'triage': case 'todo': return 'todo'
    case 'done': case 'archived': return 'done'
  }
}
```

**CockpitStatus 类型变更**：原 7 值 → 5 桶值（`review|blocked|running|todo|done`）。注意：此 5 桶类型仅用于**筛选 chip 的状态维度**；`CockpitTask.status` 字段仍存原始 9 值（见 §3.1），筛选匹配时用 `bucketStatus(task.status) ∈ filters.statuses` 判定。

### 3.3 注意力条映射（`attention-adapter.ts`）

**数据源**：仅按 `KanbanTask.status` 派生（决策 #4），不依赖 `/diagnostics`。

```ts
export function toAttention(t: KanbanTask): AttentionItem | null {
  if (t.status === 'blocked') return {
    id: 'att-' + t.id, taskId: t.id, severity: 'high',
    title: `阻塞 · ${t.title}`,
  }
  if (t.status === 'review') return {
    id: 'att-' + t.id, taskId: t.id, severity: 'medium',
    title: `待审 · ${t.title}`,
  }
  return null
}

// store: attention = computed(() => kanban.tasks.map(toAttention).filter(Boolean))
```

### 3.4 时序事件流映射（`event-adapter.ts`）

**数据源**：三层合并（决策 #5）：`task_events` + `runs` + `search-sessions`。

选中任务时懒加载 `GET /api/hermes/kanban/:id`（`kanbanApi.getTask(id)`，返回 `KanbanTaskDetail{task, events, runs, comments, parents, children, session, latest_summary}`）+ `GET /api/hermes/kanban/search-sessions?task_id=&profile=`（**kanban 端点无封装函数**，需在 `api/workspace-files.ts` 同侧新建 `api/kanban-extras.ts` 用裸 `request()` 封装，参考 `KanbanTaskDrawer.vue:104-106`）。

| CockpitEvent 字段 | 来源 | 转换规则 |
|---|---|---|
| `id` | 合成 | `'evt-' + 来源类型 + 原id`（如 `evt-event-123`、`evt-run-45`、`evt-msg-67`） |
| `taskId` | 任务上下文 | 当前选中任务 id |
| `actor` | event.payload.actor / run.profile / msg.role | event 无 actor 取 `'system'`；run 取 `profile`；msg.role=`user`→assignee，`assistant`→profile |
| `kind` | 派生 | event→`A2A`（系统/agent 触发）；run→`A2A`；msg.role=`user`→`A2H`，`assistant`→`A2A` |
| `what` | event.kind/payload / run.outcome/summary / msg.content | event 按 kind 查文案表（见下）；run→`outcome ? '执行:'+outcome : '执行'`；msg→截断 80 字符 |
| `when` | created_at 格式化 | `HH:mm`（当天）或 `MM-DD HH:mm`（非当天）|
| `pending` | 派生 | event.kind 含 `pending`/run.status=`running`→true，否则 false |
| `ts` | created_at | 原始毫秒（排序用）|
| ~~`nodeIds`~~ | **移除** | 节点级时序联动改由协作图承担（见 3.7） |

**event.kind 文案表**（覆盖 kanban 常见事件）：

| event.kind | what 文案 |
|---|---|
| `created` | `创建任务` |
| `status_changed` | `状态 → ${payload.to}` |
| `assigned` | `指派给 ${payload.assignee}` |
| `commented` | `评论：${payload.body 截断}` |
| `linked` | `关联父任务 ${payload.parent_id}` |
| `dispatched` | `派发执行` |
| `completed` | `完成：${payload.result 截断}` |
| `blocked` | `标记阻塞：${payload.reason 截断}` |
| `*_failed` | `失败：${payload.error 截断}` |
| 其他/未知 | `${event.kind}`（fallback，不报错） |

CockpitEvent 排序：按 `ts` 升序（旧在前，新在后）；折叠逻辑：`recentEventsForTimeline(threshold)` 保留。

### 3.5 文件树映射（`api/workspace-files.ts` + 新 patch 路由）

**新后端路由**（overlay patch `078-workspace-files.patch` 注入 hermes-studio kanban 路由）：

```
GET /api/hermes/kanban/workspace-files?task_id=<id>&path=<sub>&depth=<n>
```

控制器逻辑详见 §4.1。

**前端**：`workspace-files.ts` 封装 fetch；`CockpitFileTree.vue` 改为按需懒加载（点目录节点才拉子层）。

**FileNode 结构**（基本不变）：`id`=相对路径、`name`、`isDir`、`children?`。

**"modified" 标记**（原 mock 标 M）：kanban 无 diff 数据 → **去掉 M 徽章**（保持诚实）。如需标记，可用 `task.attachments` 命中文件名标 `A` 徽章（可选增强，不在 P3 必做）。

### 3.6 协作频道解析（`collab-adapter.ts`）—— tenant 编码

**tenant 三段式格式**（决策 #9/#10）：

```
<prefix>:<id>[:<subid>]:<name>
```

| prefix | 格式 | 示例 |
|---|---|---|
| `matrix` | `matrix:<roomId>:<name>` | `matrix:!abc:matrix.org:Auth联调` |
| `session` | `session:<sessionId>@<profile>:<name>` | `session:sess_001@arch:架构讨论` |
| `group` | `group:<roomId>:<name>` | `group:!room2:matrix.org:后端组` |
| 无前缀/其他 | 自由文本 | `platform-team`（仅作分组键，不解析为频道） |

**解析函数契约**：

```ts
export interface ParsedTenant {
  kind: 'matrix' | 'session' | 'group' | 'plain'
  label: string              // 可读名称（最后一节）
  routeTarget?: RouteLocationRaw  // kind=plain 时无
  raw: string                // 原始 tenant
}

export function parseTenant(tenant: string | null | undefined): ParsedTenant | null {
  if (!tenant) return null
  const parts = tenant.split(':')
  const prefix = parts[0]
  if (prefix === 'matrix' || prefix === 'group') {
    // roomId 可能含冒号（如 !abc:matrix.org），用最后一节作 name
    const id = parts.slice(1, -1).join(':')
    const name = parts[parts.length - 1] || id
    return {
      kind: prefix, label: name, raw: tenant,
      routeTarget: {
        name: prefix === 'matrix' ? 'hermes.matrixChatRoom' : 'hermes.groupChatRoom',
        params: { roomId: id },
      },
    }
  }
  if (prefix === 'session') {
    const rest = parts.slice(1).join(':')
    const atIdx = rest.indexOf('@')
    const sessionId = atIdx > 0 ? rest.slice(0, atIdx) : rest
    const profile = atIdx > 0 ? rest.slice(atIdx + 1).split(':')[0] : undefined
    const name = rest.split(':').slice(1).join(':') || sessionId
    return {
      kind: 'session', label: name, raw: tenant,
      routeTarget: {
        name: 'hermes.session',
        params: { sessionId },
        query: profile ? { profile } : {},
      },
    }
  }
  return { kind: 'plain', label: tenant, raw: tenant }
}
```

**CollabChannel（右栏协作入口条 CockpitCollabBar）**：每个任务的 `parseTenant` 结果 → 一个 channel；`kind` 映射 `'matrix'→'matrix'`、`'session'→'chat'`、`'group'→'group'`、`plain→不显示为频道`。

**协作图频道节点**：同源，`target` 字段直接用 `routeTarget`。

### 3.7 协作图映射（`topology-adapter.ts`）—— 中心辐射式

选中任务时构建**一个中心节点 + 三类辐射节点**：

```
                  ┌─ 父任务节点 (task_links.parents)
                  │
当前任务(中心) ───┼─ 子任务节点 (task_links.children)
                  │
                  ├─ 人员节点 (assignee + created_by + 当前用户)
                  │
                  └─ 频道节点 (解析 tenant 得 matrix/session/group)
```

**节点定义**（GraphNode 字段精简）：

```ts
export type GraphNodeRelation = 'center' | 'parent' | 'child' | 'person' | 'channel'

export interface GraphNode {
  id: string
  taskId: string             // 关联任务（频道节点为当前任务 id）
  label: string
  kind: GraphNodeRelation    // 替代原 project/req/file/test 枚举
  focus: boolean             // 仅 center 为 true
  target?: {                 // 频道/任务节点的跳转目标（点节点触发）
    routeName?: string
    taskId?: string          // 任务节点：selectTask 用
    routeTarget?: RouteLocationRaw  // 频道节点：跳聊天（实际不跳转，走内嵌）
  }
}
```

| 节点类型 | 数据来源 | label | 点击行为 |
|---|---|---|---|
| `center` | 当前选中任务 | `task.title` | 无（自身）|
| `parent` | `GET /:id` 返回的 `parents[]` + 拉 `GET /:id` 详情 | 父任务 title | `selectTask(parentId)` |
| `child` | `children[]` 同上 | 子任务 title | `selectTask(childId)` |
| `person` | `task.assignee` + `task.created_by` + 当前用户 | profile 名 | 无（或显示 tooltip "负责 N 个任务"，P2 增强可选）|
| `channel` | 解析 `task.tenant`（见 3.6）| tenant 的可读名称 | `selectChannel(channelId)` 切右栏协作模式 |

**连线**（GraphRelation 简化）：中心 → 每个辐射节点 1 条无向边；不再有 A2A/A2H 标签（节点类型已隐含语义）。

**移除**：
- `topologyLevel` 切换段组（项目/需求/应用级）—— 纯 kanban 数据下无对应概念
- `appTopology/reqTopology/projTopology` 三池切换
- 拖拽节点的位置持久化（中心辐射用固定布局）

**节点数上限**：父任务+子任务+人员+频道 节点总数若超过 12，折叠多余为"... +N"（避免图过密）。

### 3.8 历史回溯映射（`history-adapter.ts`）

**数据源**：task_events + comments 合并（决策 #10）。

```ts
export interface HistoryItem {
  id: string           // 'h-evt-'+event.id 或 'h-cmt-'+comment.id
  when: string         // created_at 格式化
  taskId: string
  action: string       // 见下表
  title: string        // event.what 截断 / comment.body 截断
  archived: boolean    // = (对应 task 的 status === 'archived')
}
```

**action 派生表**：

| 来源 | action |
|---|---|
| event.kind=`status_changed` 且 `payload.to=done` | `'决策'` |
| event.kind=`status_changed` 且 `payload.to=review` | `'审批'` |
| event.kind=`commented` / comment | `'补充'` |
| event.kind=`linked` | `'关联'` |
| event.kind=`assigned` | `'委派'` |
| event.kind=`completed` | `'决策'` |
| 其他 event | `'评估'` |

**加载范围**：全局（跨所有任务），1 次请求调聚合路由 `GET /timeline?limit=&since=`（patch `079`）。

### 3.9 工作项表单（localStorage 草稿）

**CockpitWorkspace 的 decision/riskTags/opinion/score**：纯 localStorage，键 `cockpit:workitem:<taskId>`。

| 时机 | 行为 |
|---|---|
| 进入任务（selectTask） | 从 localStorage 读草稿填入表单（无草稿则空表单） |
| 表单字段 onChange | 防抖 300ms 写回 localStorage |
| 点"提交决定" | 拼成 comment 文本（`[决策:${decision}] 风险:${tags.join(',')} ${opinion}`），调 `kanbanApi.addComment(taskId, { body: text })`（注意：函数名是 `addComment` 非 `createComment`，请求体是 `{body, author?}`），成功后清 localStorage 草稿 + 触发 `loadTaskDetail` 刷新时序流 |
| 点"稍后处理" | 仅保证草稿已写 localStorage（无网络调用） |

**模板（A2uiTemplate）**：localStorage `cockpit:templates`，纯客户端 CRUD，无 kanban 落点。

### 3.10 终端（Claude Code 终端）

原 mock 终端：**保留为纯客户端态**，`sendTerminalCommand` 不执行真实命令（kanban 无 sandbox 编程接口）。`store.terminalLines` 保留初始 5 行提示。

> 注：原 cockpit spec §9 "Claude Code 真实集成"列为开放问题，本次不在范围。

---

## 4. 后端 patch 路由设计

### 4.1 必需 patch：`078-workspace-files.patch`

> 编号说明：07x 段中 070-075 已被 cockpit 自身 patch 占用、054-069 为 matrix，故 kanban 接入 patch 从 078 起（下一可用编号）。

**注入目标**：`packages/server/src/routes/hermes/kanban.ts`（追加路由）+ `packages/server/src/controllers/hermes/kanban.ts`（追加控制器方法）。

**路由**：

```ts
kanbanRoutes.get('.../workspace-files', ctrl.listWorkspaceFiles)
```

**控制器逻辑**（沙箱 + 递归列目录）：

```ts
// controllers/hermes/kanban.ts 追加
async function listWorkspaceFiles(ctx) {
  const taskId = ctx.query.task_id as string | undefined
  const sub = (ctx.query.path as string | undefined) ?? ''
  const depth = Math.min(parseInt(ctx.query.depth as string) || 2, 4)  // 上限 4 防滥用

  if (!taskId) { ctx.status = 400; ctx.body = { error: 'task_id is required' }; return }

  // 1. 取任务的 workspace_path（经 kanban CLI，沙箱隔离）
  const task = await kanbanCli.show(taskId)
  if (!task?.workspace_path) { ctx.body = { path: '', entries: [] }; return }

  // 2. 沙箱根：与 readArtifact 一致（~/.hermes/kanban/workspaces）
  //    非 default board 时需 board-aware 解析（见 §7.2 风险）
  const workspacesRoot = resolve(homedir(), '.hermes', 'kanban', 'workspaces')
  const root = resolve(workspacesRoot, task.workspace_path)
  if (!isPathWithin(root, workspacesRoot)) {
    ctx.status = 403; ctx.body = { error: 'workspace path out of sandbox' }; return
  }
  const target = sub ? resolve(root, sub) : root
  if (!isPathWithin(target, root)) {
    ctx.status = 403; ctx.body = { error: 'sub path out of task workspace' }; return
  }

  // 3. 递归列目录
  const entries = await readDirTree(target, depth)
  ctx.body = { path: sub, entries }
}

async function readDirTree(dir: string, depth: number): Promise<FileEntry[]> {
  if (depth <= 0) return []
  const names = await fs.readdir(dir)
  return Promise.all(names.map(async (name) => {
    const full = join(dir, name)
    const stat = await fs.stat(full)
    const entry: FileEntry = { name, isDir: stat.isDirectory(), size: stat.size, modified: stat.mtimeMs }
    if (entry.isDir && depth > 1) {
      entry.children = await readDirTree(full, depth - 1)
    }
    return entry
  }))
}
```

**响应格式**：

```ts
interface FileEntry {
  name: string
  isDir: boolean
  size: number
  modified: number         // mtimeMs
  children?: FileEntry[]
}
// 200: { path: string, entries: FileEntry[] }
// 400: { error } (缺 task_id)
// 403: { error } (越界)
// 404: { error } (任务不存在)
```

**前端 client**（`api/workspace-files.ts`）：

```ts
export async function listWorkspaceFiles(
  taskId: string, sub = '', depth = 2
): Promise<FileNode[]> {
  const params = new URLSearchParams({ task_id: taskId, depth: String(depth) })
  if (sub) params.set('path', sub)
  const res = await request<{ path: string; entries: FileEntry[] }>(
    `/api/hermes/kanban/workspace-files?${params}`
  )
  return mapEntries(res.entries, sub)  // FileEntry[] → FileNode[]，id = 相对路径
}
```

### 4.2 必需 patch：`079-timeline-aggregate.patch`

**注入目标**：同上（路由 + 控制器）。

**路由**：

```ts
kanbanRoutes.get('.../timeline', ctrl.listTimeline)
```

**控制器逻辑**：

```ts
async function listTimeline(ctx) {
  const limit = Math.min(parseInt(ctx.query.limit as string) || 100, 500)
  const since = ctx.query.since ? parseInt(ctx.query.since as string) : 0

  // 1. 拉所有任务（或最近 N 个）
  const { tasks } = await kanbanCli.list({ board: requestBoard(ctx) })

  // 2. 并发拉每任务的 events + comments
  const items = await Promise.all(tasks.map(async (t) => {
    const detail = await kanbanCli.show(t.id)
    return {
      taskId: t.id,
      taskTitle: t.title,
      taskStatus: t.status,
      events: detail.events ?? [],
      comments: detail.comments ?? [],
    }
  }))

  // 3. 合并 + 按 created_at 降序 + 截断
  const merged = items.flatMap(it => [
    ...it.events.map(e => ({
      source: 'event', id: `evt-${e.id}`, taskId: it.taskId,
      taskTitle: it.taskTitle, taskArchived: it.taskStatus === 'archived',
      ts: e.created_at, kind: e.kind, payload: e.payload,
    })),
    ...it.comments.map(c => ({
      source: 'comment', id: `cmt-${c.id}`, taskId: it.taskId,
      taskTitle: it.taskTitle, taskArchived: it.taskStatus === 'archived',
      ts: c.created_at, author: c.author, body: c.body,
    })),
  ])
    .filter(x => x.ts >= since)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)

  ctx.body = { items: merged, total: merged.length }
}
```

**前端**：`history-adapter.ts` 调此路由，前端再做 action 派生（按 §3.8 表）。

### 4.3 遵循 AGENTS.md 的 patch 注入

按 overlay 约定，patch 文件命名为 `078-...`、`079-...`（07x 段中 070-075 已被 cockpit 自身占用，故 kanban 接入从 078 起），经 `npm run inject` 注入。**不直接修改 upstream 文件**。

---

## 5. 前端改动详解

### 5.1 store/cockpit.ts 重构

#### 状态分类（重构后）

```ts
export const useCockpitStore = defineStore('cockpit', () => {
  const kanban = useKanbanStore()  // ← 单一数据源

  // ── 派生态（computed，只读，不缓存）──
  const tasks = computed(() => kanban.tasks.map(taskAdapter.toCockpit))
  const attention = computed(() =>
    kanban.tasks.map(attentionAdapter.toAttention).filter(Boolean)
  )
  const selectedTask = computed(() =>
    tasks.value.find(t => t.id === selectedTaskId.value) ?? null
  )
  const channels = computed(() => {
    const tt = selectedTask.value?.tenant
    const parsed = collabAdapter.parseTenant(tt)
    return parsed && parsed.kind !== 'plain'
      ? [{ id: 'ch-' + selectedTaskId.value, taskId: selectedTaskId.value,
          kind: parsed.kind === 'session' ? 'chat' : parsed.kind,
          label: parsed.label, routeTarget: parsed.routeTarget }]
      : []
  })
  const topologyForSelectedTask = computed(() =>
    topologyAdapter.build(selectedTask.value, _detailCache.value[selectedTaskId.value ?? ''])
  )

  // ── 客户端态（ref，本地）──
  const selectedTaskId = ref<string | null>(null)
  const filters = ref<CockpitFilters>({ priorities: [], statuses: [], tenants: [] })
  const collapsed = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  const workspaceMode = ref<WorkspaceMode>('work')
  const activeChannelId = ref<string | null>(null)
  const maximized = ref(false)
  const terminalMode = ref(false)
  const terminalLines = ref<TerminalLine[]>([ /* 保留初始 5 行 */ ])
  const historyOpen = ref(false)
  const historyFilters = ref<HistoryFilters>({ actions: [], archived: 'all' })
  const archivedMode = ref(false)
  const templateManagerOpen = ref(false)
  const focusedGraphNodeId = ref<string | null>(null)
  const selectedGraphNodeIds = ref<Record<string, string[]>>({})

  // ── 懒加载态（ref，按需拉取后填充）──
  const _detailCache = ref<Record<string, KanbanTaskDetail>>({})
  const _fileTreeCache = ref<Record<string, FileNode[]>>({})
  const events = ref<CockpitEvent[]>([])
  const fileTrees = ref<Record<string, FileNode[]>>({})
  const history = ref<HistoryItem[]>([])

  // ── bootstrap：替代原 loadSeed ──
  async function bootstrap() {
    // 并发初始化（决策 #16）
    await Promise.allSettled([
      kanban.fetchTasks(),
      kanban.fetchAssignees(),
      chatStore.loadSessions(),
      groupChatStore.connect().then(() => groupChatStore.loadRooms()),
      matrixClientStore.initClient(),
    ])
    if (kanban.tasks.length) await selectTask(kanban.tasks[0].id)
    kanban.startEventStream()  // WebSocket 自动刷新（注意：公开函数是 startEventStream，非 connectEventStream）
  }

  // ── selectTask：联动加载 ──
  async function selectTask(id: string | null) {
    selectedTaskId.value = id
    focusedGraphNodeId.value = null
    archivedMode.value = false
    if (!id) { events.value = []; return }
    await loadTaskDetail(id)
  }

  async function loadTaskDetail(id: string) {
    if (_detailCache.value[id]) {
      events.value = eventAdapter.mergeDetail(_detailCache.value[id])
    } else {
      const detail = await kanbanApi.getTask(id)
      _detailCache.value[id] = detail
      events.value = eventAdapter.mergeDetail(detail)
    }
    // 懒加载文件树根
    if (!_fileTreeCache.value[id]) {
      try {
        _fileTreeCache.value[id] = await workspaceFilesApi.list(id)
        fileTrees.value = { ..._fileTreeCache.value }
      } catch { /* 见 §7 错误降级 */ }
    }
  }

  // ── sendMessage（升级为真实 store action 分发，决策 #15）──
  async function sendMessage(text: string) {
    const ch = activeChannel.value
    if (!ch || !text.trim()) return
    switch (ch.kind) {
      case 'matrix': await matrixComposerStore.sendMessage(text); break
      case 'chat':   await chatStore.sendMessage(text); break
      case 'group':  await groupChatStore.sendMessage(text); break
    }
  }

  // ── messagesForActiveChannel（按 kind 切换数据源）──
  const messagesForActiveChannel = computed(() => {
    const ch = activeChannel.value
    if (!ch) return []
    switch (ch.kind) {
      case 'matrix': return matrixRoomStore.messages.map(chatAdapter.fromMatrix)
      case 'chat':   return chatStore.activeMessages.map(chatAdapter.fromChat)
      case 'group':  return groupChatStore.currentMessages.map(chatAdapter.fromGroup)
    }
    return []
  })

  // ── 工作项草稿（localStorage）──
  const workItemForSelectedTask = computed(() => {
    const id = selectedTaskId.value
    return id ? cockpitKv.loadDraft(id) : null
  })
  function updateWorkItem(patch: Partial<WorkItem>) {
    const id = selectedTaskId.value
    if (!id) return
    const cur = cockpitKv.loadDraft(id) ?? { id: 'w-' + id, taskId: id, decision: 'conditional', riskTags: [], opinion: '', modifiedFiles: [] }
    cockpitKv.saveDraft(id, { ...cur, ...patch })
  }
  async function submitWorkItem() {
    const id = selectedTaskId.value
    const draft = id ? cockpitKv.loadDraft(id) : null
    if (!id || !draft) return
    const text = `[决策:${draft.decision}] 风险:${draft.riskTags.join(',')} ${draft.opinion}`.trim()
    await kanbanApi.createComment(id, text)
    cockpitKv.clearDraft(id)
    delete _detailCache.value[id]
    await loadTaskDetail(id)  // 刷新时序流，显示 commented 事件
  }

  // ── 历史加载 ──
  async function openHistory() {
    historyOpen.value = true
    try {
      const res = await kanbanApi.getTimeline({ limit: 100 })
      history.value = historyAdapter.merge(res.items)
    } catch { history.value = [] }
  }

  // ── WebSocket 联动：选中任务收到事件时 invalidate ──
  // kanban store 不暴露 per-event 钩子，WS 刷新会整体替换 tasks ref。
  // cockpit watch tasks 数组引用变化 → 比对选中任务是否仍在 + detail 是否需重载。
  watch(() => kanban.tasks, (newTasks) => {
    const id = selectedTaskId.value
    if (!id) return
    if (!newTasks.some(t => t.id === id)) return  // 选中任务不在新列表，跳过
    // 乐观策略：WS 刷新大概率影响选中任务，invalidate 其 detail 缓存并重载
    if (_detailCache.value[id]) {
      delete _detailCache.value[id]
      loadTaskDetail(id)
    }
  }, { deep: false })

  // … 其余 getter/methods 保持原契约（sortedTasks/filteredTasks/tasksByTenant/...）
})
```

#### 移除的原 mock 状态

| 原 store 字段 | 处理 |
|---|---|
| `appTopology/reqTopology/projTopology` ref | 改为 computed（topologyAdapter 从 selectedTask 派生） |
| `appRelations` ref | 改为 computed（中心辐射自动生成） |
| `channels` ref | 改为 computed（parseTenant(selectedTask.tenant)） |
| `messages` ref | **移除**（改为 messagesForActiveChannel computed） |
| `workItems` ref | **移除**（改读 localStorage） |
| `templates` ref | **移除**（改读 localStorage） |
| `terminalLines` 初始 5 行 | **保留**（纯客户端态） |

### 5.2 改动影响矩阵

| 文件 | 改动类型 | 改动内容 |
|---|---|---|
| `store/cockpit.ts` | **重构** | 数据状态改 computed 派生，移除 mock 装载点，加 bootstrap/selectTask/sendMessage/submitWorkItem |
| `store/cockpit-kv.ts` | **新增** | localStorage 适配（草稿/模板） |
| `adapters/task-adapter.ts` | **新增** | KanbanTask → CockpitTask + priority 分桶 |
| `adapters/attention-adapter.ts` | **新增** | status → AttentionItem |
| `adapters/event-adapter.ts` | **新增** | events + runs + sessions 合并 |
| `adapters/collab-adapter.ts` | **新增** | tenant 三段式解析 |
| `adapters/topology-adapter.ts` | **新增** | 中心辐射图节点构建 |
| `adapters/history-adapter.ts` | **新增** | events + comments 合并 |
| `adapters/chat-adapter.ts` | **新增** | matrix/chat/group 消息归一 |
| `api/workspace-files.ts` | **新增** | 调新 patch 路由的 client |
| `fixtures/seed.ts` | **删除** | mock 数据彻底移除 |
| `views/CockpitView.vue` | **小改** | `onMounted` 改调 `store.bootstrap()` |
| `components/CockpitKanban.vue` | **中改** | 分组键 category→tenant，状态 chip 合并 5 桶 |
| `components/CockpitCollabMap.vue` | **中改** | 中心辐射图渲染 + 移除层级切换 + 画布控件（全屏/缩放/拖拽） |
| `components/CockpitTimeline.vue` | **小改** | 字段适配（actor/what/nodeIds 移除） |
| `components/CockpitWorkspace.vue` | **小改** | 表单接 localStorage 草稿 + 提交写 comment |
| `components/CockpitCollabBar.vue` | **小改** | channel 从 parseTenant 派生 |
| `components/CockpitChatPane.vue` | **中改** | mock 消息流移除，改为精简壳 + 真实 store action 分发 |
| `components/CockpitFileTree.vue` | **中改** | 懒加载 workspace-files API |
| `components/CockpitHistoryModal.vue` | **小改** | 数据源换 events+comments 合并（调聚合路由） |
| `components/CockpitAttention.vue` | **无改动** | 仍读 `store.attention`（getter 内部换源） |
| `components/CockpitTopBar.vue` | **无改动** | 纯展示 |
| `components/CockpitModeBar.vue` | **无改动** | 纯模式切换 |
| `components/CockpitColumnRail.vue` | **无改动** | 折叠 rail |
| `components/CockpitGraphNode.vue` | **小改** | 节点 kind 枚举调整（GraphNodeRelation） |
| `components/CockpitFileNode.vue` | **无改动** | 递归节点 |
| `components/CockpitTerminalPane.vue` | **无改动** | 保留客户端态终端 |
| `components/CockpitTemplateManager.vue` | **小改** | 模板源换 localStorage |
| `patches/078-...workspace-files.patch` | **新增** | 后端列目录路由 |
| `patches/079-...timeline-aggregate.patch` | **新增** | 历史聚合路由 |

**总计**：1 重构 + 9 新增 adapter/api/kv + 1 删除 + 10 小中改 + 6 无改动 + 2 patch。

### 5.3 协作图画布控件（决策 #14）

`CockpitCollabMap.vue` 新增：

- **左上角工具栏**：
  - `⛶ 全屏` / `🗅 最小化` 按钮（全屏 = 中栏占满除左栏外的空间；最小化 = 中栏收为 rail）
  - `+ 放大` / `− 缩小` 按钮（zoom 级别 0.5x–2x，步进 0.1）
- **画布拖拽**：
  - 鼠标按住画布空白处可拖拽平移（pan）
  - 滚轮缩放（zoom，与按钮联动）
  - transform 状态存 store（`canvasTransform: { x, y, scale }`），cockpit 内保持
- **节点位置**：中心辐射用极坐标计算（中心 0,0；辐射节点按 120° 三扇区分布），拖拽画布不影响节点相对位置

### 5.4 CockpitChatPane 升级为精简壳 + 真实 store action（决策 #15）

**结构**（扩展现有 70 行 CockpitChatPane）：head + msgs + input，按 `activeChannel.kind` 分发到真实 store。

**store action 分发表**：

| channel.kind | 初始化（bootstrap 一次） | 拉消息（selectChannel） | 发消息（sendMessage） |
|---|---|---|---|
| `matrix` | `matrixClientStore.initClient()` + 等 `syncState==='PREPARED'` | `matrixRoomStore.selectRoom(roomId)` + `ensureTimelineLoaded` | `matrixComposerStore.sendMessage(text)` |
| `chat`（agent session） | `chatStore.loadSessions()` | `chatStore.switchSession(sessionId)`（socket resume） | `chatStore.sendMessage(text)` |
| `group` | `groupChatStore.connect()` + `loadRooms()` | `groupChatStore.joinRoom(roomId)` | `groupChatStore.sendMessage(text)` |

**生命周期**：`bootstrap()` 末尾并发初始化三个 store（`Promise.allSettled`，单个失败不阻塞），全程保活；cockpit 卸载时（`onUnmounted`）仅 disconnect group socket（matrix client 跨页保活，agent socket 由 chatStore 自管）。

**消息源 computed**（按 activeChannel.kind 切换）：

```ts
const messagesForActiveChannel = computed(() => {
  const ch = activeChannel.value
  if (!ch) return []
  switch (ch.kind) {
    case 'matrix': return matrixRoomStore.activeRoomMessages.map(chatAdapter.fromMatrix)
    case 'chat':   return chatStore.messages.map(chatAdapter.fromChat)
    case 'group':  return groupChatStore.sortedMessages.map(chatAdapter.fromGroup)
  }
  return []
})
```

> 注：`chatStore.messages`（非 activeMessages）、`groupChatStore.sortedMessages`、`matrixRoomStore.activeRoomMessages` 是经核实的真实 getter 名。matrix 的元素是 `MatrixEvent` SDK 实例（非 plain object），`chatAdapter.fromMatrix` 需用 `event.getId()/getSender()/getContent()/getTs()` 等方法访问。

**matrix store 导入路径**：`import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'` 等（matrix 在 overlay custom，不在 upstream；store id 用连字符 `'matrix-client'/'matrix-room'/'matrix-composer'/'matrix-right-panel'`）。

**chatStore.sendMessage**：签名 `sendMessage(content: string, attachments?: Attachment[])`，content 是字符串。`chatStore.switchSession(sessionId, focusId?)`、`chatStore.loadSessions(profile?, preferredSessionId?)`。

**groupChatStore**：`connect()` / `disconnect()`（非 async）/ `loadRooms()` / `joinRoom(roomId)` / `sendMessage(content, attachments?)`。

**matrixClientStore**：`initClient()`（无参，幂等，从 localStorage 读 credentials）+ `syncState` ref（值域 `''/'PREPARED'/'SYNCING'/'RECONNECTING'/'ERROR'/'STOPPED'`，`'PREPARED'` 为就绪）。

**matrixRoomStore**：`selectRoom(roomId: string | null)`（非 async）+ `activeRoomMessages` computed。

**matrixComposerStore**：`sendMessage(text: string)`。

**chat-adapter 归一**：

```ts
export interface ChatMessage {
  id: string
  channelId: string
  author: string
  isMe: boolean
  text: string
  ts: number
}

// matrix-js-sdk event → ChatMessage
export function fromMatrix(ev: MatrixEvent): ChatMessage { /* … */ }
// chatStore message → ChatMessage
export function fromChat(m: ChatStoreMessage): ChatMessage { /* … */ }
// groupChatStore message → ChatMessage
export function fromGroup(m: GroupMessage): ChatMessage { /* … */ }
```

**布局约束**：cockpit 右栏内嵌容器设 `min-width: 520px`，禁用三个 store 自带的 sidebar（cockpit 已有 CockpitCollabBar 作为频道切换 UI）。

### 5.5 store 契约保留清单（确保 16 个组件不破坏）

| 保留的 store API | 内部实现变更 |
|---|---|
| `tasks` | ref → computed（taskAdapter） |
| `attention`、`attentionCount` | ref → computed（attentionAdapter） |
| `selectedTask`、`selectedTaskId` | selectedTask 改 computed |
| `sortedTasks`、`filteredTasks`、`tasksByTenant`（原 tasksByCategory） | computed，分组键 category→tenant |
| `events`、`eventsForTimeline`、`recentEventsForTimeline` | events 改 ref（懒加载），eventsForTimeline computed |
| `topologyForSelectedTask` | computed（topologyAdapter） |
| `relationsForSelectedTask` | computed（中心辐射自动生成） |
| `workItemForSelectedTask` | computed（读 localStorage） |
| `filesForSelectedTask` | computed（读懒加载缓存） |
| `channelsForSelectedTask`、`activeChannel` | computed（parseTenant） |
| `selectTask` | 改 async，加 loadTaskDetail |
| `filters` | categories→tenants |
| `updateWorkItem`、`toggleRiskTag` | 改写 localStorage |
| `sendMessage` | 改真实 store action 分发 |
| `saveTemplateFromCurrentWorkItem` 等 | 改读写 localStorage |

---

## 6. 实施分阶段

| 阶段 | 范围 | 关键产出 | 依赖 |
|---|---|---|---|
| **P0 基建** | adapter 骨架 + store 重构基础 + 删除 seed.ts + cockpit-kv | `adapters/` 目录、`store/cockpit.ts` 拆派生态/客户端态、`CockpitView.vue` 改调 `bootstrap()` | 无 |
| **P1 左栏+注意力** | task-adapter + attention-adapter + CockpitKanban tenant 分组 + CockpitAttention | 左栏任务来自 kanban、注意力条派生 | P0 |
| **P2 中栏时序+协作图** | event-adapter + topology-adapter + CockpitTimeline + CockpitCollabMap（中心辐射 + 画布控件） | 时序流三层合并、协作图可拖拽/缩放/全屏 | P0 |
| **P3 右栏工作项+文件树** | workspace-files patch (`078`) + CockpitFileTree 懒加载 + CockpitWorkspace localStorage 草稿 + 提交写 comment | 文件树真数据、评审表单落盘 | P0 |
| **P4 右栏协作（聊天精简壳）** | chat-adapter + CockpitChatPane 升级 + bootstrap 全初始化 + CollabBar tenant 解析 | 三类聊天固定本页、store action 复用 | P0 |
| **P5 历史回溯** | history-adapter + timeline-aggregate patch (`079`) + CockpitHistoryModal | 全局历史聚合 | P0 + patch 079 |
| **P6 收尾** | 模板管理器 localStorage + 终端保留 + i18n + E2E | 完整能力、文档 | 全部 |

**实施顺序**：P0 → P1 → P2 → P3 → P4 → P5 → P6。每阶段独立可验证，每阶段一个 commit。

---

## 7. 错误处理与降级

| 失败场景 | 降级行为 |
|---|---|
| `fetchTasks` 失败（后端不可达） | 左栏空 + 顶部 banner "无法加载任务，请检查 hermes-agent" + 重试按钮 |
| `getTask(id)` 失败 | 时序流空 + "加载失败" 占位；不影响左栏 |
| `listWorkspaceFiles` 失败/404 | 文件树空 + "无 workspace 或不可访问" |
| `parseTenant` 解析失败 | 不显示频道节点/入口，tenant 仍作分组键显示原始串 |
| WebSocket 断线 | kanban store 已有指数退避重连，cockpit 派生态自动停摆；不影响已加载数据 |
| localStorage 满 | 草稿写失败静默忽略，表单仍可填（仅丢失持久化） |
| Matrix client 初始化失败（无 homeserver 配置） | bootstrap 并发初始化容错（`Promise.allSettled`），聊天窗显示"Matrix 未配置"占位 |
| chat socket resume 失败 | 聊天窗显示"会话加载失败"占位 + 重试按钮 |
| group socket 连接失败 | 同上 |
| event.kind 文案表无匹配 | adapter fallback 到 `event.kind` 原值，不报错 |

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| **tenant 三段式格式未被创建任务方遵守** | parseTenant 容错（解析失败 → plain 分组键），文档约定写入 spec 与后续 AGENTS 说明 |
| **Matrix client 初始化失败（无 homeserver 配置）** | bootstrap 并发初始化容错，单 store 失败不阻塞其他；聊天窗显示"Matrix 未配置"占位 |
| **workspace-files patch 与 readArtifact 沙箱不一致**（非 default board 越界） | 控制器复用 `isPathWithin` + board-aware 的 workspacesRoot 解析；首版仅支持 default board，非 default board 返回 403 + 提示 |
| **聊天 socket 全保活占用资源** | 提供 feature flag（`features.cockpitChat`）可关；文档注明资源开销 |
| **event.kind 文案表不全** | adapter 对未知 kind fallback 到 `event.kind` 原值，不报错 |
| **WebSocket 收到事件但 detail 缓存未 invalidate** | 监听 `kanban.lastEvent` watch + 失败重试机制 |
| **协作图节点数过多**（任务依赖链深） | 节点数上限 12，超出折叠为"... +N" |
| **cockpit 卸载时 group socket 未断开** | `onUnmounted` 显式 `groupChatStore.disconnect()`；matrix client 保活（与 MatrixChatPanel 一致） |

---

## 9. 测试策略

### 9.1 单元测试（更新现有 14 个测试文件 + 新增 adapter 测试）

| 测试文件 | 改动 |
|---|---|
| `__tests__/cockpit-store.test.ts` | mock `useKanbanStore`，验证派生 computed 正确 |
| `__tests__/task-adapter.test.ts`（新增） | priority 分桶边界（3/2/1/0/null/5）、status 合并 |
| `__tests__/collab-adapter.test.ts`（新增） | tenant 三段式解析（matrix/session/group/plain/null，含 roomId 带冒号） |
| `__tests__/event-adapter.test.ts`（新增） | 三层合并、ts 排序、id 去重、kind 派生 |
| `__tests__/attention-adapter.test.ts`（新增） | blocked/review 进注意力条、severity 正确、其他不进 |
| `__tests__/chat-adapter.test.ts`（新增） | matrix/chat/group 三类消息归一为 ChatMessage |
| `__tests__/topology-adapter.test.ts`（新增） | 中心辐射节点构建、节点数上限折叠 |
| `__tests__/history-adapter.test.ts`（新增） | events+comments 合并、action 派生表 |
| 13 个组件测试 | 更新断言（数据来自 mock kanban store 而非 seed） |

### 9.2 关键测试用例（必须覆盖）

1. **priority 分桶边界**：`bucketPriority(3)=P0`、`bucketPriority(0)=P3`、`bucketPriority(null)=P3`、`bucketPriority(5)=P0`
2. **status 合并**：`running/ready/scheduled → 'running'`、`done/archived → 'done'`
3. **tenant 解析**：
   - `matrix:!abc:ms.org:Auth联调` → kind=matrix, roomId=`!abc:ms.org`, label=`Auth联调`
   - `session:sess_001@arch:架构讨论` → kind=session, sessionId=`sess_001`, profile=`arch`
   - `group:!room2:ms.org:后端组` → kind=group, roomId=`!room2:ms.org`
   - `platform-team` → kind=plain, 仅分组键
   - `null` → null（不解析）
4. **event 三层合并**：同任务 events + runs + sessions 按 ts 排序、id 去重、kind 派生正确
5. **attention 派生**：仅 blocked/review 任务进注意力条、severity 正确
6. **chat 消息归一**：matrix/chat/group 三类消息经 adapter 后 isMe/author/text/ts 字段一致

### 9.3 E2E 验收（手动）

| 场景 | 验收点 |
|---|---|
| 进入 cockpit（kanban 有任务） | 左栏任务列表来自 kanban、注意力条按 status 显示 |
| 切换左栏任务 | 中栏时序流刷新、协作图重绘、右栏工作项草稿加载、文件树懒加载 |
| 文件树点目录 | 子目录展开、调 workspace-files API |
| 协作图点任务节点 | 中栏时序流切换到该任务 |
| 协作图点频道节点 | 右栏切到协作模式、内嵌聊天窗加载该频道消息 |
| 协作图画布 | 左上角全屏/最小化、放大/缩小、拖拽画布 |
| 聊天窗发消息 | 调真实 store action、消息出现在列表、socket/SDK 推送回声 |
| 工作项填表+提交 | 草稿写 localStorage、提交写 kanban comment、时序流出现 commented 事件 |
| 历史弹窗 | 1 次请求拿聚合 events+comments、按 action 过滤 |
| WebSocket 推送任务变更 | 左栏任务实时刷新、注意力条更新、选中任务时序流 invalidate 重载 |
| kanban 无任务 | 空状态 + 重试按钮 |
| 后端不可达 | 顶部 banner 错误提示 |

---

## 10. 验收标准（Definition of Done）

- [ ] `fixtures/seed.ts` 删除，cockpit 全页无 mock 数据
- [ ] 左栏/注意力/筛选 100% 来自 `useKanbanStore`
- [ ] 时序流/文件树/协作图/历史来自 kanban API（含新增 2 条 patch 路由）
- [ ] 聊天窗固定本页，复用 3 个真实 store action，无 router.push
- [ ] 工作项表单 localStorage 草稿 + kanban comment 落盘
- [ ] 协作图中心辐射 + 画布控件（全屏/缩放/拖拽）
- [ ] 全部单元测试通过、adapter 覆盖率 ≥80%
- [ ] `npm run inject` 成功、`npm run build` 无 TS 错误
- [ ] 在 feature 分支开发、测试通过后 merge 回 main

---

## 11. 不在本次范围

- A2UI 模板的"生成→编辑→锁定→复用"高级流水线（仅保留 localStorage CRUD）
- 协作图多层级切换（项目/需求/应用级）
- Claude Code 终端真实 sandbox 集成（保留客户端态）
- Matrix 房间内嵌的 RightPanel（phase 视图）
- kanban schema 扩展（不加新表/字段）
- hermes-agent 代码修改（只通过 hermes-studio patch）
- 非默认 board 的 workspace-files 支持（首版仅 default board）

---

## 12. 已核实的实施契约（写计划时采用，不再延后）

以下细节在写实施计划前已核实，给出确定值：

1. **`useKanbanStore` 事件刷新机制**：不暴露 `lastEvent`/`lastEventTs`。WS 推送会整体替换 `tasks` ref（`fetchTasks(true)` silent 模式）。cockpit watch `kanban.tasks` 引用变化即可感知刷新。公开的事件流函数是 `startEventStream()` / `connectEvents()` / `stopEventStream()`（非 `connectEventStream`，后者是模块私有）。
2. **`useKanbanStore` 数据 API**：`fetchTasks(silent=false)` / `fetchAssignees()` 均无 board 参数（内部读 `selectedBoard`），返回 `Promise<void>`，结果写入各自 ref。`tasks: ref<KanbanTask[]>`。`selectedBoard: ref<string>`（默认 `'default'`），cockpit 可不管 board 切换。
3. **`kanbanApi` 函数名（经核实，非猜测）**：
   - 取任务详情：`getTask(id, opts?): Promise<KanbanTaskDetail>`
   - 创建评论：`addComment(taskId, { body, author? }, opts?)`（非 `createComment`）
   - 列任务：`listTasks(opts?): Promise<KanbanTask[]>`
   - **`searchSessions`（kanban 端点）无封装函数**，需用裸 `request<{results: any[]}>('/api/hermes/kanban/search-sessions?...')` 自建（参考 `KanbanTaskDrawer.vue:104-106`）。同名 `searchSessions` 在 `api/hermes/sessions.ts` 是不同端点 `/api/hermes/search/sessions`，勿混用。
   - `request<T>(path, options?): Promise<T>` 在 `@/api/client`，path 是相对路径。
4. **`KanbanTaskDetail` 字段**：`{ task, latest_summary, session?, comments, events, runs, parents?, children? }`。`parents/children` 是 `string[]`（task id 数组，optional）。
5. **chatStore（store id `'chat'`）**：`loadSessions(profile?, preferredSessionId?)` / `switchSession(sessionId, focusId?)` / `sendMessage(content: string, attachments?)` / `messages` computed（非 activeMessages）/ `activeSessionId` ref。元素 `Message{ id, role, content, timestamp, ... }`。
6. **groupChatStore（store id `'groupChat'`）**：`connect()` / `disconnect()`（非 async）/ `loadRooms()` / `joinRoom(roomId)` / `sendMessage(content, attachments?)` / `sortedMessages` computed（也有未排序 `messages` ref）/ `currentRoomId` ref。
7. **matrix stores（在 overlay `@/custom/matrix-chat/stores/`，store id 用连字符）**：
   - `matrix-client`：`initClient()`（无参、幂等、从 localStorage 读 credentials）+ `syncState` ref（`''/'PREPARED'/'SYNCING'/'RECONNECTING'/'ERROR'/'STOPPED'`，`'PREPARED'`=就绪）。
   - `matrix-room`：`selectRoom(roomId: string | null)`（非 async）+ `activeRoomMessages` computed（元素是 `MatrixEvent` SDK 实例，用 `getId()/getSender()/getContent()/getTs()` 方法访问）。
   - `matrix-composer`：`sendMessage(text: string)`。
8. **测试基础设施**：Vitest（`npm test` = `vitest run`，在 overlay 目录跑）。配置 `overlay/vitest.config.ts`（alias `@/custom`→`overlay/custom/client`、`@`→upstream client src、include `custom/**/*.test.ts`）。现有 13 个 cockpit 测试不 mock kanban（greenfield 接入），需自建 `vi.mock('@/stores/hermes/kanban', ...)` 模式（工厂 hoisted，用 `vi.hoisted` 引用外部变量）。文件头加 `// @vitest-environment jsdom` 按需启用 DOM。
9. **overlay patch 机制**：patch 文件是 unified diff（`git apply` 兼容），路径相对于 `upstream/hermes-studio`（如 `packages/client/src/...`）。series 文件是应用顺序权威。**改 overlay 自己的 custom 文件不需要 patch**（直接改源码）；只有改上游 hermes-studio 才需 patch。下一可用编号：`078`/`079`（07x 段属 cockpit/接入）。

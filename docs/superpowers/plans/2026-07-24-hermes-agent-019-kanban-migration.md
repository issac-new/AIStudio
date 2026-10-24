# hermes-agent v0.19.0 kanban 能力迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 hermes-agent v0.19.0 的 kanban 能力缺口迁移到 overlay 的「Swarm kanban」与「AI 协作中心」工作区页面，使两处 UI 与后端对齐。

**Architecture:** 4 阶段顺序推进：P1 扩 `KanbanTask` TS 接口（+19 字段）→ P2 补 5 个缺失 HTTP wrapper → P3 在 `CockpitWorkspace.vue` 加 5 个只读 meta 行 + events/runs 区段 → P4 新增 attach-from-URL HTTP 路由 + UI。每阶段一个 feat 分支，顺序收口。

**Tech Stack:** overlay patch 体系（unified diff + `npm run inject`）、Vue 3 + Pinia + TypeScript、Koa + @koa/router、vitest、markdown-it。

## Global Constraints

- **只改 `overlay/`**：upstream（`upstream/hermes-studio/`、`upstream/hermes-agent/`）严禁直接改；所有变更经 `overlay/patches/` 的 unified diff patch + `overlay/custom/` 代码，由 `npm run inject` 注入。
- **向后兼容**：新 TS 字段一律 `optional`（`?`）或 `| null`；新 wrapper 函数为纯 additive；不删既有函数签名。
- **patch 序号**：下一可用 164；按 phase 顺序占用至 172。
- **worktree 规则**（user-level AGENTS.md §1）：每 phase 一个 feat 分支位于 `.claude/worktrees/`，≤3 并行，顺序收口；P2 依赖 P1，P3 依赖 P2，P4 依赖 P2，故不并行。
- **不自动推送 github**（项目规则 2026-06-29）：merge 到本地 main 即止，不 `git push origin` 除非用户明确要求。
- **构建产物不主动上传 github**（项目规则 2026-07-21）。
- **命名修正**（对账发现）：spec §7.1 中的 `removeAttachment`/`setOrchestration` 实际在 client 已存在为 `deleteAttachment`/`saveOrchestration`；P2 真正缺失 wrapper 只有 5 个。

**参考 spec**：`docs/superpowers/specs/2026-07-24-hermes-agent-019-kanban-migration-design.md`

**前置事实**（已核对）：
- `upstream/hermes-studio/packages/client/src/api/hermes/kanban.ts:7` `KanbanTask` 现有 15 字段（id/title/body/assignee/status/priority/created_by/created_at/started_at/completed_at/workspace_kind/workspace_path/tenant/project_id/result/skills/latest_summary）。
- `upstream/hermes-studio/packages/server/src/services/hermes/hermes-kanban.ts:33` service 侧 `KanbanTask` 同名接口，字段相同但无 `latest_summary`。
- `upstream/hermes-agent/hermes_cli/kanban_db.py:840` Python `Task` dataclass 共 35 字段，含待补 19 个。
- overlay 注入后 client `kanban.ts` 已有 wrapper：`patchTask`/`decomposeTask`/`deleteTask`/`listAttachments`/`uploadAttachment`/`downloadAttachment`/`deleteAttachment`/`getOrchestration`/`saveOrchestration`/`saveProfileDescription`/`autoGenerateProfileDescription`/`getHomeChannels`/`subscribeHomeChannel`/`unsubscribeHomeChannel`/`getDiagnostics`。
- overlay 自建 `overlay/custom/client/cockpit/api/kanban-extras.ts` 有 `listWorkspaceFiles`/`getTimeline`/`searchSessions`（未迁入主 client）。
- `overlay/custom/server/security/url-guard.ts` 提供 `assertSafeOutboundUrl(rawUrl, { allowHttp: true })` + `UnsafeUrlError`，可直接复用于 P4。
- `upstream/hermes-studio/packages/server/src/controllers/hermes/kanban.ts:1007` `MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024`；`:1021` `safeAttachmentName`；`:1017` `taskAttachmentsDir`；`:1056` `addAttachment`。

---

## File Structure

| 文件 | 责任 | phase |
|---|---|---|
| `overlay/patches/164-client-api-kanban-task-fields.patch` | client `KanbanTask` +19 字段 | P1 |
| `overlay/patches/165-server-service-hermes-kanban-task-fields.patch` | service `KanbanTask` +19 字段 | P1 |
| `overlay/patches/166-client-api-kanban-wrappers.patch` | 补 `readArtifact`/`debugHomeChannels` + 迁入 `listWorkspaceFiles`/`getTimeline`/`searchSessions`；P4 追加 `uploadAttachmentFromUrl` | P2+P4 |
| `overlay/custom/client/cockpit/api/kanban-extras.ts` | 改为 re-export 主 client（保兼容）| P2 |
| `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 5 个只读 meta 行 + events/runs 区段 | P3 |
| `overlay/patches/167-cockpit-kanban-fields-en.patch` | `cockpit.*` i18n en | P3 |
| `overlay/patches/168-cockpit-kanban-fields-zh.patch` | `cockpit.*` i18n zh | P3 |
| `overlay/patches/169-server-controllers-kanban-attach-url.patch` | `uploadAttachmentFromUrl` controller | P4 |
| `overlay/patches/170-server-routes-kanban-attach-url.patch` | `POST /:id/attachments/url` route | P4 |
| `overlay/patches/171-kanban-attach-url-en.patch` | `kanban.attachFromUrl*` i18n en | P4 |
| `overlay/patches/172-kanban-attach-url-zh.patch` | `kanban.attachFromUrl*` i18n zh | P4 |
| `overlay/patches/series` | 追加 164-172 | 全 |
| `overlay/custom/client/kanban/components/KanbanAttachments.vue` | 「从 URL 添加」输入框 + 按钮 | P4 |

---

## Task 1: P1 — KanbanTask 接口 +19 字段

**分支**：`feat/wp-kanban-p1-task-fields`（worktree `.claude/worktrees/wp-kanban-p1-task-fields`，从 `origin/main` 起分支）

**Files:**
- Create: `overlay/patches/164-client-api-kanban-task-fields.patch`
- Create: `overlay/patches/165-server-service-hermes-kanban-task-fields.patch`
- Modify: `overlay/patches/series`（追加 2 行）

**Interfaces:**
- Produces: `KanbanTask` 接口新增 19 个 optional/nullable 字段（client + service 同步）。P2 的 wrapper 返回类型与 P3 的 UI 读取均依赖这些字段。

### Step 1.1: 创建 worktree 并安装依赖

- [ ] **创建 worktree**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git fetch origin --prune
git worktree add .claude/worktrees/wp-kanban-p1-task-fields -b feat/wp-kanban-p1-task-fields origin/main
cd .claude/worktrees/wp-kanban-p1-task-fields
npm install   # 已有 node_modules 软链，秒过
```

### Step 1.2: 写 patch 164（client KanbanTask +19 字段）

- [ ] **创建 patch 164**

文件：`overlay/patches/164-client-api-kanban-task-fields.patch`

```diff
diff --git a/packages/client/src/api/hermes/kanban.ts b/packages/client/src/api/hermes/kanban.ts
--- a/packages/client/src/api/hermes/kanban.ts
+++ b/packages/client/src/api/hermes/kanban.ts
@@ -22,6 +22,25 @@ export interface KanbanTask {
   result: string | null
   skills: string[] | null
+  // ─── v0.19 运维状态字段（overlay 补齐，均 optional/nullable，向后兼容）───
+  branch_name?: string | null
+  idempotency_key?: string | null
+  consecutive_failures?: number
+  worker_pid?: number | null
+  last_failure_error?: string | null
+  max_runtime_seconds?: number | null
+  last_heartbeat_at?: number | null
+  current_run_id?: number | null
+  workflow_template_id?: string | null
+  current_step_key?: string | null
+  model_override?: string | null
+  max_retries?: number | null
+  goal_mode?: boolean
+  goal_max_turns?: number | null
+  session_id?: string | null
+  block_kind?: string | null
+  block_recurrences?: number
+  claim_lock?: string | null
+  claim_expires?: number | null
   latest_summary?: string | null
 }
```

> 上下文锚点：`skills` 与 `latest_summary` 之间。注入器用 `@@ -22,6 +22,25 @@` 行号定位，若漂移 inject 会报错并提示调整。

### Step 1.3: 写 patch 165（service KanbanTask +19 字段）

- [ ] **创建 patch 165**

文件：`overlay/patches/165-server-service-hermes-kanban-task-fields.patch`

```diff
diff --git a/packages/server/src/services/hermes/hermes-kanban.ts b/packages/server/src/services/hermes/hermes-kanban.ts
--- a/packages/server/src/services/hermes/hermes-kanban.ts
+++ b/packages/server/src/services/hermes/hermes-kanban.ts
@@ -48,6 +48,25 @@ export interface KanbanTask {
   tenant: string | null
   project_id: string | null
   result: string | null
   skills: string[] | null
+  // ─── v0.19 运维状态字段（overlay 补齐，均 optional/nullable，向后兼容）───
+  branch_name?: string | null
+  idempotency_key?: string | null
+  consecutive_failures?: number
+  worker_pid?: number | null
+  last_failure_error?: string | null
+  max_runtime_seconds?: number | null
+  last_heartbeat_at?: number | null
+  current_run_id?: number | null
+  workflow_template_id?: string | null
+  current_step_key?: string | null
+  model_override?: string | null
+  max_retries?: number | null
+  goal_mode?: boolean
+  goal_max_turns?: number | null
+  session_id?: string | null
+  block_kind?: string | null
+  block_recurrences?: number
+  claim_lock?: string | null
+  claim_expires?: number | null
 }
```

> service 侧无 `latest_summary`，字段插在 `skills` 之后、`}` 之前。

### Step 1.4: 追加 series

- [ ] **追加 patch 164/165 到 series**

在 `overlay/patches/series` 末尾追加：

```
164-client-api-kanban-task-fields.patch
165-server-service-hermes-kanban-task-fields.patch
```

### Step 1.5: inject + typecheck

- [ ] **运行 inject**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```
Expected: 输出 `appliedPatches` 含 164/165，无 patch apply 失败。

- [ ] **运行 typecheck**

```bash
npm run typecheck
```
Expected: 0 errors。若报 `@@ -22,6` 行号漂移，按 inject 报错调整 patch 164/165 的 hunk 头。

### Step 1.6: 提交

- [ ] **commit**

```bash
cd .claude/worktrees/wp-kanban-p1-task-fields
git add patches/164-client-api-kanban-task-fields.patch patches/165-server-service-hermes-kanban-task-fields.patch patches/series
git commit -m "feat(kanban): 补齐 KanbanTask 接口 19 个 v0.19 运维状态字段 — patch 164/165

对应 hermes_cli/kanban_db.py Task dataclass：block_kind/block_recurrences
（阻塞语义）、consecutive_failures/last_failure_error/max_retries（失败
熔断）、worker_pid/last_heartbeat_at/current_run_id/max_runtime_seconds
（worker 活性）、goal_mode/goal_max_turns（goal 循环）、session_id/
idempotency_key/branch_name（派生溯源）、workflow_template_id/
current_step_key/model_override（工作流编排）、claim_lock/claim_expires
（claim 锁）。均 optional/nullable，向后兼容。"
```

### Step 1.7: 收口合回 main + 清理

- [ ] **rebase + merge + 清理**

```bash
# 在 worktree 内
git fetch origin --prune
git rebase origin/main          # 应无冲突（纯 additive）
git push -u origin feat/wp-kanban-p1-task-fields   # 遵项目规则：需用户确认后才 push；此处先 push 分支以便 PR（若用户要求）
# 实际操作：若用户未要求 push，跳过上一行

# 切回 main 主工作区
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git pull --ff-only origin main
git merge --no-ff feat/wp-kanban-p1-task-fields
# 不主动 git push origin main（遵项目规则 2026-06-29）

# 清理
git worktree remove .claude/worktrees/wp-kanban-p1-task-fields
git branch -d feat/wp-kanban-p1-task-fields
git worktree prune
```

- [ ] **验证清理**

```bash
git worktree list   # 只剩 main
git branch          # 不再列 feat/wp-kanban-p1-task-fields
```

---

## Task 2: P2 — 补 5 个缺失 HTTP wrapper + 迁入 cockpit-extras

**分支**：`feat/wp-kanban-p2-wrappers`（rebase 到 P1 后的 main）

**Files:**
- Create: `overlay/patches/166-client-api-kanban-wrappers.patch`
- Modify: `overlay/custom/client/cockpit/api/kanban-extras.ts`
- Modify: `overlay/patches/series`

**Interfaces:**
- Consumes: P1 的 `KanbanTask` 扩展字段（wrapper 返回类型用到）。
- Produces: 主 client `kanban.ts` 新增 `readArtifact`/`debugHomeChannels`/`listWorkspaceFiles`/`getTimeline`/`searchSessions` + 新类型 `FileNode`/`TimelineItem`/`SessionSearchResult`（从 cockpit-extras 迁入）。P3/P4 依赖这些 wrapper。

### Step 2.1: 创建 worktree

- [ ] **创建 worktree**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git fetch origin --prune
git worktree add .claude/worktrees/wp-kanban-p2-wrappers -b feat/wp-kanban-p2-wrappers main
cd .claude/worktrees/wp-kanban-p2-wrappers
```

> 从本地 main（已含 P1）起分支，不从 origin/main（避免漏 P1）。

### Step 2.2: 写 patch 166

- [ ] **创建 patch 166**

文件：`overlay/patches/166-client-api-kanban-wrappers.patch`

此 patch 在 client `kanban.ts` 末尾追加 5 个 wrapper + 3 个从 cockpit-extras 迁入的类型。锚点：文件末尾最后一个 `}` 后。

```diff
diff --git a/packages/client/src/api/hermes/kanban.ts b/packages/client/src/api/hermes/kanban.ts
--- a/packages/client/src/api/hermes/kanban.ts
+++ b/packages/client/src/api/hermes/kanban.ts
@@ -660,3 +660,72 @@ export async function unsubscribeHomeChannel(
   )
   return { ok: true }
 }
+
+// ─── Artifact（读取任务 workspace 内文件）──────────────────────
+
+export async function readArtifact(taskId: string, path: string, opts?: KanbanBoardOptions): Promise<Blob> {
+  const params = boardParams(opts?.board)
+  params.set('task_id', taskId)
+  params.set('path', path)
+  const res = await fetch(appendQuery('/api/hermes/kanban/artifact', params))
+  if (!res.ok) throw new Error(`readArtifact failed: ${res.status}`)
+  return res.blob()
+}
+
+// ─── Home channels（调试）───────────────────────────────────────
+
+export async function debugHomeChannels(opts?: KanbanBoardOptions): Promise<unknown> {
+  const res = await request<unknown>(appendQuery('/api/hermes/kanban/debug-home-channels', boardParams(opts?.board)))
+  return res
+}
+
+// ─── 从 cockpit-extras 迁入主 client（统一数据路径）─────────────
+
+export interface SessionSearchResult {
+  id: string
+  title?: string
+  [k: string]: unknown
+}
+
+export interface FileNode {
+  id: string
+  name: string
+  isDir: boolean
+  size: number
+  modified: number
+  children?: FileNode[]
+}
+
+export interface TimelineItem {
+  source: 'event' | 'comment'
+  id: string
+  taskId: string
+  taskTitle: string
+  taskArchived: boolean
+  ts: number
+  kind?: string
+  payload?: Record<string, unknown> | null
+  author?: string
+  body?: string
+}
+
+export async function searchSessions(taskId: string, profile: string): Promise<SessionSearchResult[]> {
+  const q = new URLSearchParams({ task_id: taskId, profile })
+  const res = await request<{ results: SessionSearchResult[] }>(`/api/hermes/kanban/search-sessions?${q}`)
+  return res.results ?? []
+}
+
+export async function listWorkspaceFiles(taskId: string, board?: string, sub = '', depth = 2): Promise<FileNode[]> {
+  const q = new URLSearchParams({ task_id: taskId, depth: String(depth) })
+  if (sub) q.set('path', sub)
+  if (board) q.set('board', board)
+  const res = await request<{ path: string; entries: FileNode[] }>(`/api/hermes/kanban/workspace-files?${q}`)
+  return res.entries ?? []
+}
+
+export async function getTimeline(opts: { limit?: number; since?: number } = {}): Promise<{ items: TimelineItem[]; total: number }> {
+  const q = new URLSearchParams()
+  if (opts.limit != null) q.set('limit', String(opts.limit))
+  if (opts.since != null) q.set('since', String(opts.since))
+  const qs = q.toString()
+  const path = `/api/hermes/kanban/timeline${qs ? `?${qs}` : ''}`
+  return request<{ items: TimelineItem[]; total: number }>(path)
+}
```

> 注：`listWorkspaceFiles` 返回的 `entries` 字段实际是后端 `RawFileEntry[]`（含 `children` 递归），与 `FileNode` 结构兼容（`FileNode.id` 在原 cockpit-extras 中是计算字段，但后端 `workspace-files` 返回的 entries 本身就是树形且含 id——核对后端 `controllers/hermes/kanban.ts` 的 `listWorkspaceFiles` 实现，确认 entries 已是 `FileNode` 形态，故直接返回 `res.entries`，去掉原 cockpit-extras 的 `mapEntries` 转换）。

### Step 2.3: 改 cockpit-extras 为 re-export

- [ ] **改写 `overlay/custom/client/cockpit/api/kanban-extras.ts`**

把整个文件替换为：

```ts
// 原自建 wrapper 已迁入主 client（patch 166），此处 re-export 保向后兼容。
// 调用方 import { listWorkspaceFiles, getTimeline, searchSessions,
//   SessionSearchResult, FileNode, TimelineItem } from '@/custom/cockpit/api/kanban-extras'
// 仍可工作，指向主 client 的实现。
export {
  searchSessions,
  listWorkspaceFiles,
  getTimeline,
  type SessionSearchResult,
  type FileNode,
  type TimelineItem,
} from '@/api/hermes/kanban'
```

### Step 2.4: 追加 series

- [ ] **追加 patch 166 到 series**

```
166-client-api-kanban-wrappers.patch
```

### Step 2.5: inject + typecheck + test

- [ ] **inject**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```
Expected: 含 166，无失败。

- [ ] **typecheck**

```bash
npm run typecheck
```
Expected: 0 errors。若 `kanban-extras.ts` 的 re-export 报 "no exported member"，核对主 client 是否真的 export 了该名（可能 inject 未生效，重跑）。

- [ ] **vitest**

```bash
npm test -- --run cockpit/__tests__/files-root-plumbing
```
Expected: PASS（这是唯一引用 `listWorkspaceFiles` 的测试，验证 re-export 链路通）。

### Step 2.6: 提交

- [ ] **commit**

```bash
cd .claude/worktrees/wp-kanban-p2-wrappers
git add patches/166-client-api-kanban-wrappers.patch custom/client/cockpit/api/kanban-extras.ts patches/series
git commit -m "feat(kanban): 补 5 个缺失 HTTP wrapper + 迁入 cockpit-extras — patch 166

- 新增 readArtifact（GET /artifact，读 workspace 文件为 Blob）
- 新增 debugHomeChannels（GET /debug-home-channels）
- 从 cockpit-extras 迁入 listWorkspaceFiles/getTimeline/searchSessions
  及 FileNode/TimelineItem/SessionSearchResult 类型，统一数据路径
- cockpit-extras.ts 改为 re-export 主 client，保向后兼容"
```

### Step 2.7: 收口

- [ ] **rebase + merge + 清理**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge --no-ff feat/wp-kanban-p2-wrappers
git worktree remove .claude/worktrees/wp-kanban-p2-wrappers
git branch -d feat/wp-kanban-p2-wrappers
git worktree prune
```

---

## Task 3: P3 — CockpitWorkspace 只读 meta 行 + events/runs 区段

**分支**：`feat/wp-kanban-p3-cockpit-ui`

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Create: `overlay/patches/167-cockpit-kanban-fields-en.patch`
- Create: `overlay/patches/168-cockpit-kanban-fields-zh.patch`
- Modify: `overlay/patches/series`

**Interfaces:**
- Consumes: P1 的 19 个 `KanbanTask` 字段；P2 的 `FileNode`/`TimelineItem`（events 复用 adapter）；cockpit store 的 `selectedTaskDetail`（`cockpit.ts:448`，含 `events`/`runs`）。
- Produces: CockpitWorkspace 渲染 5 个只读 meta 行 + events/runs 区段。

### Step 3.1: 创建 worktree

- [ ] **创建 worktree**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git worktree add .claude/worktrees/wp-kanban-p3-cockpit-ui -b feat/wp-kanban-p3-cockpit-ui main
cd .claude/worktrees/wp-kanban-p3-cockpit-ui
```

### Step 3.2: 在 CockpitWorkspace.vue script 加 computed + timeAgo

- [ ] **在 `<script setup>` 的 `task` computed 之后（约 line 33）插入**

在 `const workItem = computed(...)` 之前插入：

```ts
// ── v0.19 运维状态只读字段（P3）──
const workerHealth = computed(() => {
  const t = task.value
  if (!t) return null
  const pid = t.worker_pid
  if (!pid) return null
  return {
    pid,
    heartbeat: t.last_heartbeat_at ?? null,
    runId: t.current_run_id ?? null,
    maxRuntime: t.max_runtime_seconds ?? null,
  }
})
const failureCircuit = computed(() => {
  const t = task.value
  if (!t) return null
  const cf = t.consecutive_failures ?? 0
  if (cf === 0 && !t.last_failure_error) return null
  return {
    count: cf,
    max: t.max_retries ?? null,
    error: t.last_failure_error ?? null,
    tripped: t.max_retries != null && cf >= t.max_retries,
  }
})
const claimLock = computed(() => {
  const t = task.value
  if (!t?.claim_lock) return null
  return { lock: t.claim_lock, expires: t.claim_expires ?? null }
})
const workflowMeta = computed(() => {
  const t = task.value
  if (!t) return null
  if (!t.workflow_template_id && !t.current_step_key && !t.model_override && !t.goal_mode) return null
  return {
    template: t.workflow_template_id ?? null,
    step: t.current_step_key ?? null,
    model: t.model_override ?? null,
    goalMode: t.goal_mode ?? false,
    goalMaxTurns: t.goal_max_turns ?? null,
  }
})
const derivation = computed(() => {
  const t = task.value
  if (!t) return null
  if (!t.session_id && !t.idempotency_key && !t.branch_name && !t.block_kind && !t.block_recurrences) return null
  return {
    sessionId: t.session_id ?? null,
    idempotencyKey: t.idempotency_key ?? null,
    branch: t.branch_name ?? null,
    blockKind: t.block_kind ?? null,
    blockRecurrences: t.block_recurrences ?? 0,
  }
})
const events = computed(() => store.selectedTaskDetail?.events ?? [])
const runs = computed(() => store.selectedTaskDetail?.runs ?? [])

function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '-'
  const secs = Math.floor((Date.now() / 1000) - ts)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}
function formatRuntime(sec: number | null | undefined): string {
  if (!sec) return '-'
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m${sec % 60}s`
}
```

### Step 3.3: 在模板 flow 区插入 5 个 meta 行

- [ ] **在「Home-channel 通知订阅」row（约 line 501）之前插入 5 个 meta 行**

```vue
      <!-- v0.19 Worker 健康 -->
      <div v-if="workerHealth" class="cockpit-workspace__flow-row">
        <span class="cockpit-workspace__field-label">{{ t('cockpit.workerHealth') }}</span>
        <span class="cockpit-workspace__field-val">PID {{ workerHealth.pid }}</span>
        <span class="cockpit-workspace__field-val--muted">· {{ t('cockpit.heartbeat') }} {{ timeAgo(workerHealth.heartbeat) }}</span>
        <span v-if="workerHealth.runId" class="cockpit-workspace__field-val--muted">· run #{{ workerHealth.runId }}</span>
        <span v-if="workerHealth.maxRuntime" class="cockpit-workspace__field-val--muted">· {{ t('cockpit.maxRuntime') }} {{ formatRuntime(workerHealth.maxRuntime) }}</span>
      </div>

      <!-- v0.19 失败熔断 -->
      <div v-if="failureCircuit" class="cockpit-workspace__flow-row" :class="{ 'is-error': failureCircuit.tripped }">
        <span class="cockpit-workspace__field-label">{{ t('cockpit.failureCircuit') }}</span>
        <span class="cockpit-workspace__field-val">{{ failureCircuit.count }}{{ failureCircuit.max != null ? ` / ${failureCircuit.max}` : '' }}</span>
        <span v-if="failureCircuit.tripped" class="cockpit-workspace__field-val" style="color: var(--error)">⚠ {{ t('cockpit.circuitTripped') }}</span>
        <span v-if="failureCircuit.error" class="cockpit-workspace__field-val--muted" :title="failureCircuit.error">{{ failureCircuit.error.slice(0, 60) }}</span>
      </div>

      <!-- v0.19 Claim 锁 -->
      <div v-if="claimLock" class="cockpit-workspace__flow-row">
        <span class="cockpit-workspace__field-label">{{ t('cockpit.claimLock') }}</span>
        <span class="cockpit-workspace__field-val">{{ claimLock.lock }}</span>
        <span v-if="claimLock.expires" class="cockpit-workspace__field-val--muted">· exp {{ timeAgo(claimLock.expires) }}</span>
      </div>

      <!-- v0.19 Workflow 编排 -->
      <div v-if="workflowMeta" class="cockpit-workspace__flow-row">
        <span class="cockpit-workspace__field-label">{{ t('cockpit.workflow') }}</span>
        <span v-if="workflowMeta.template" class="cockpit-workspace__field-val--muted">{{ workflowMeta.template }}</span>
        <span v-if="workflowMeta.step" class="cockpit-workspace__field-val--muted">· step {{ workflowMeta.step }}</span>
        <span v-if="workflowMeta.model" class="cockpit-workspace__field-val--muted">· {{ workflowMeta.model }}</span>
        <span v-if="workflowMeta.goalMode" class="cockpit-workspace__field-val">· {{ t('cockpit.goalMode') }}{{ workflowMeta.goalMaxTurns ? ` (${workflowMeta.goalMaxTurns}t)` : '' }}</span>
      </div>

      <!-- v0.19 派生溯源 -->
      <div v-if="derivation" class="cockpit-workspace__flow-row">
        <span class="cockpit-workspace__field-label">{{ t('cockpit.derivation') }}</span>
        <span v-if="derivation.sessionId" class="cockpit-workspace__field-val--muted" :title="derivation.sessionId">sess {{ derivation.sessionId.slice(0, 8) }}</span>
        <span v-if="derivation.idempotencyKey" class="cockpit-workspace__field-val--muted">· idem {{ derivation.idempotencyKey.slice(0, 8) }}</span>
        <span v-if="derivation.branch" class="cockpit-workspace__field-val--muted">· {{ derivation.branch }}</span>
        <span v-if="derivation.blockKind" class="cockpit-workspace__field-val--muted">· {{ derivation.blockKind }}{{ derivation.blockRecurrences > 0 ? ` ×${derivation.blockRecurrences}` : '' }}</span>
      </div>
```

### Step 3.4: 在 Worker Log 区段之前插入 events + runs 区段

- [ ] **在 `<!-- ═══ Worker Log ═══ -->`（约 line 526）之前插入**

```vue
        <!-- ═══ Events ═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.events') }}</label>
          <div v-if="!events.length" class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</div>
          <div v-else class="cockpit-workspace__event-list">
            <div v-for="ev in events.slice(0, 20)" :key="ev.id" class="cockpit-workspace__event">
              <span class="cockpit-workspace__event-kind">{{ ev.kind }}</span>
              <span class="cockpit-workspace__event-ts">{{ formatTime(ev.created_at) }}</span>
            </div>
          </div>
        </div>

        <!-- ═══ Run History ═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.runHistory') }}</label>
          <div v-if="!runs.length" class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</div>
          <div v-else class="cockpit-workspace__run-list">
            <div v-for="r in runs.slice(0, 10)" :key="r.id" class="cockpit-workspace__run">
              <span class="cockpit-workspace__run-id">#{{ r.id }}</span>
              <span class="cockpit-workspace__run-profile">{{ r.profile || '-' }}</span>
              <span class="cockpit-workspace__run-status">{{ r.status }}{{ r.outcome ? `/${r.outcome}` : '' }}</span>
              <span class="cockpit-workspace__field-val--muted">{{ formatTime(r.started_at) }}</span>
            </div>
          </div>
        </div>
```

### Step 3.5: 加 CSS（meta 行 is-error + event/run list）

- [ ] **在 `<style scoped>` 的 `.cockpit-workspace__action-msg.is-err` 之后插入**

```scss
.cockpit-workspace__flow-row.is-error {
  background: rgba(var(--error-rgb, 255, 77, 79), 0.06);
  border-radius: 3px;
  padding: 4px 6px;
}
.cockpit-workspace__event-list,
.cockpit-workspace__run-list {
  display: flex; flex-direction: column; gap: 3px; max-height: 200px; overflow-y: auto;
}
.cockpit-workspace__event,
.cockpit-workspace__run {
  display: flex; align-items: center; gap: 8px; font-size: 11px; padding: 2px 4px;
}
.cockpit-workspace__event-kind {
  font-family: ui-monospace, monospace; font-size: 10px; padding: 1px 6px;
  border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary);
}
.cockpit-workspace__event-ts { color: var(--text-muted); font-family: ui-monospace, monospace; }
.cockpit-workspace__run-id { font-family: ui-monospace, monospace; color: var(--text-muted); }
.cockpit-workspace__run-profile { color: var(--accent-primary); }
.cockpit-workspace__run-status { color: var(--text-secondary); }
```

### Step 3.6: 写 i18n patch 167（en）

- [ ] **创建 patch 167**

文件：`overlay/patches/167-cockpit-kanban-fields-en.patch`

锚点：`packages/client/src/i18n/locales/en.ts` 的 `cockpit: {` 块内，`comments:` 之前。实际行号需 inject 时核对；若漂移用上下文行匹配。

```diff
diff --git a/packages/client/src/i18n/locales/en.ts b/packages/client/src/i18n/locales/en.ts
--- a/packages/client/src/i18n/locales/en.ts
+++ b/packages/client/src/i18n/locales/en.ts
@@ -XXX,6 +XXX,7 @@ export const en = {
     // ─── v0.19 kanban 运维状态字段 ───
+    workerHealth: 'Worker',
+    heartbeat: 'heartbeat',
+    maxRuntime: 'max runtime',
+    failureCircuit: 'Failures',
+    circuitTripped: 'circuit tripped',
+    claimLock: 'Claim',
+    workflow: 'Workflow',
+    goalMode: 'goal mode',
+    derivation: 'Origin',
+    events: 'Events',
+    runHistory: 'Run history',
     comments: 'Comments',
```

> 实施时先读 `en.ts` 找到 `cockpit:` 块内 `comments:` 行的确切行号，替换 `@@ -XXX` 与上下文。`XXX` 是占位指示「实施者需填实际行号」，不是 plan 占位——实施时必须确定。

### Step 3.7: 写 i18n patch 168（zh）

- [ ] **创建 patch 168**

文件：`overlay/patches/168-cockpit-kanban-fields-zh.patch`

同结构，`packages/client/src/i18n/locales/zh.ts`：

```diff
+    workerHealth: 'Worker',
+    heartbeat: '心跳',
+    maxRuntime: '最长运行',
+    failureCircuit: '失败',
+    circuitTripped: '熔断',
+    claimLock: 'Claim 锁',
+    workflow: '工作流',
+    goalMode: 'goal 模式',
+    derivation: '溯源',
+    events: '事件',
+    runHistory: '运行历史',
```

### Step 3.8: 追加 series + inject + 验证

- [ ] **追加 167/168 到 series**

```
167-cockpit-kanban-fields-en.patch
168-cockpit-kanban-fields-zh.patch
```

- [ ] **inject + typecheck**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject && npm run typecheck
```
Expected: 0 errors。若 i18n patch 行号漂移，读 en.ts/zh.ts 找 `comments:` 实际行号修正 hunk 头。

- [ ] **vitest**

```bash
npm test -- --run cockpit/__tests__/cockpit-workspace
```
Expected: PASS（现有测试不触及新字段，应仍绿；若有 snapshot 需更新则 `--update`）。

- [ ] **dev server 手动巡检**

```bash
npm run dev
```
选一个 running 任务：确认 Worker 健康行显示 PID + heartbeat；选 blocked 任务：确认 block_kind/recurrences；选失败任务：确认熔断高亮；选有 events/runs 的任务：确认两区段渲染。

### Step 3.9: 提交 + 收口

- [ ] **commit**

```bash
git add custom/client/cockpit/components/CockpitWorkspace.vue patches/167-cockpit-kanban-fields-en.patch patches/168-cockpit-kanban-fields-zh.patch patches/series
git commit -m "feat(cockpit): 工作区加 v0.19 运维状态 meta 行 + events/runs 区段

CockpitWorkspace.vue 新增 5 个只读 meta 行：Worker 健康（pid/
heartbeat/run_id/max_runtime）、失败熔断（consecutive_failures/
max_retries + last_failure_error，熔断时高亮）、Claim 锁、Workflow
编排（含 goal_mode）、派生溯源（session_id/idempotency/branch/
block_kind/recurrences）。另加 events + run history 两区段（复用
selectedTaskDetail.events/runs）。i18n patch 167/168 补 en/zh。"
```

- [ ] **收口**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge --no-ff feat/wp-kanban-p3-cockpit-ui
git worktree remove .claude/worktrees/wp-kanban-p3-cockpit-ui
git branch -d feat/wp-kanban-p3-cockpit-ui
git worktree prune
```

---

## Task 4: P4 — attach-from-URL 新 HTTP 路由 + UI

**分支**：`feat/wp-kanban-p4-attach-url`

**Files:**
- Create: `overlay/patches/169-server-controllers-kanban-attach-url.patch`
- Create: `overlay/patches/170-server-routes-kanban-attach-url.patch`
- Modify: `overlay/patches/166-client-api-kanban-wrappers.patch`（追加 `uploadAttachmentFromUrl` wrapper）
- Modify: `overlay/custom/client/kanban/components/KanbanAttachments.vue`
- Create: `overlay/patches/171-kanban-attach-url-en.patch`
- Create: `overlay/patches/172-kanban-attach-url-zh.patch`
- Modify: `overlay/patches/series`

**Interfaces:**
- Consumes: `assertSafeOutboundUrl`/`UnsafeUrlError`（`overlay/custom/server/security/url-guard.ts`，已注入到 `packages/server/src/custom/security/url-guard.ts`）；`MAX_ATTACHMENT_BYTES`/`safeAttachmentName`/`taskAttachmentsDir`/`addAttachment`（controller 内既有）。
- Produces: `POST /api/hermes/kanban/:id/attachments/url` 路由；client `uploadAttachmentFromUrl` wrapper；KanbanAttachments UI「从 URL 添加」。

### Step 4.1: 创建 worktree

- [ ] **创建 worktree**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git worktree add .claude/worktrees/wp-kanban-p4-attach-url -b feat/wp-kanban-p4-attach-url main
cd .claude/worktrees/wp-kanban-p4-attach-url
```

### Step 4.2: 写 patch 169（controller）

- [ ] **创建 patch 169**

文件：`overlay/patches/169-server-controllers-kanban-attach-url.patch`

在 `controllers/hermes/kanban.ts` 末尾追加 `uploadAttachmentFromUrl`。锚点：文件末尾最后一个 `}` 后。需新增 import `assertSafeOutboundUrl`/`UnsafeUrlError`。

```diff
diff --git a/packages/server/src/controllers/hermes/kanban.ts b/packages/server/src/controllers/hermes/kanban.ts
--- a/packages/server/src/controllers/hermes/kanban.ts
+++ b/packages/server/src/controllers/hermes/kanban.ts
@@ -1,4 +1,5 @@
 import type { Context } from 'koa'
+import { fetch } from 'undici'
 import { readFile, stat, copyFile } from 'fs/promises'
 import { resolve, normalize, isAbsolute } from 'path'
 import { homedir } from 'os'
@@ -17,6 +18,9 @@ import {
 import { listUserProfiles } from '../../db/hermes/users-store'
+// HERMES_CUSTOM[AttachUrl] BEGIN: SSRF-guarded URL attachment
+import { assertSafeOutboundUrl, UnsafeUrlError } from '../../custom/security/url-guard'
+// HERMES_CUSTOM[AttachUrl] END
 const DEFAULT_PROFILE = 'default'
@@ -1355,3 +1359,72 @@ export async function unsubscribeHome(ctx: Context) {
   }
 }
+
+// HERMES_CUSTOM[AttachUrl] BEGIN: attach-from-URL
+//
+// Agent surface 有 kanban_attach_url（Python 工具，TS service 无法直调），且
+// upstream CLI `kanban attach` 只收本地路径。此 controller 在 service 端用
+// fetch 下载 URL 到内存，复用既有 addAttachment() 写入 task 附件目录，对齐
+// agent 的 _download_url_with_cap（25MB 上限 + http/https + SSRF 守卫）。
+export async function uploadAttachmentFromUrl(ctx: Context) {
+  const taskId = ctx.params.id
+  const board = ctx.query.board as string | undefined
+  const bodyResult = requestBody(ctx)
+  if (rejectBadRequest(ctx, bodyResult.error)) return
+  const body = bodyResult.value
+  const url = optionalString(body, 'url')
+  const filename = optionalString(body, 'filename')
+  const contentType = optionalString(body, 'content_type')
+  if (rejectBadRequest(ctx, url.error)) return
+
+  // SSRF 守卫：协议白名单 http/https + 拒绝内网/回环/链路本地
+  let safeOrigin: string
+  try {
+    safeOrigin = await assertSafeOutboundUrl(url.value!, { allowHttp: true })
+  } catch (err: unknown) {
+    ctx.status = 400
+    ctx.body = { error: err instanceof UnsafeUrlError ? err.message : 'Invalid URL' }
+    return
+  }
+
+  // 重新拼接 path/query（assertSafeOutboundUrl 返回规范化 origin）
+  let parsedUrl: URL
+  try {
+    parsedUrl = new URL(url.value!)
+  } catch {
+    ctx.status = 400
+    ctx.body = { error: 'Invalid URL' }
+    return
+  }
+ const targetUrl = safeOrigin + parsedUrl.pathname + parsedUrl.search
+
+  try {
+    const resp = await fetch(targetUrl, { redirect: 'follow' })
+    if (!resp.ok) {
+      ctx.status = 502
+      ctx.body = { error: `Fetch failed: ${resp.status}` }
+      return
+    }
+    const contentLength = Number(resp.headers.get('content-length') || 0)
+    if (contentLength > MAX_ATTACHMENT_BYTES) {
+      ctx.status = 413
+      ctx.body = { error: `Attachment too large (max ${MAX_ATTACHMENT_BYTES} bytes)` }
+      return
+    }
+    const buf = Buffer.from(await resp.arrayBuffer())
+    if (buf.length > MAX_ATTACHMENT_BYTES) {
+      ctx.status = 413
+      ctx.body = { error: `Attachment too large (max ${MAX_ATTACHMENT_BYTES} bytes)` }
+      return
+    }
+
+    const safeName = safeAttachmentName(filename.value || parsedUrl.pathname.split('/').pop() || 'download')
+    const destDir = taskAttachmentsDir(taskId, board)
+    await mkdir(destDir, { recursive: true })
+    const record = await addAttachment({
+      task_id: taskId,
+      filename: safeName,
+      stored_path: join(destDir, safeName),
+      content_type: contentType.value || resp.headers.get('content-type') || undefined,
+      size: buf.length,
+      uploaded_by: requestedProfile(ctx) || 'url',
+    }, board)
+    await writeFile(record.stored_path, buf)
+    // 同步到任务 workspace（对齐 uploadAttachment 行为）
+    await syncAttachmentToWorkspace(taskId, board, safeName, record.stored_path)
+    ctx.body = { attachment: record }
+  } catch (err: any) {
+    ctx.status = 500
+    ctx.body = { error: err.message }
+  }
+}
+// HERMES_CUSTOM[AttachUrl] END
```

> `fetch` 用 `undici`（Node 18+ 内置，hermes-studio 已用）；若 import 路径报错改用全局 `fetch`（删除 `import { fetch }` 行）。

### Step 4.3: 写 patch 170（route）

- [ ] **创建 patch 170**

文件：`overlay/patches/170-server-routes-kanban-attach-url.patch`

在 `routes/hermes/kanban.ts` 的 `:id/attachments` 行之前插入 url 路由（避免被 `:id` catch-all 吞）。

```diff
diff --git a/packages/server/src/routes/hermes/kanban.ts b/packages/server/src/routes/hermes/kanban.ts
--- a/packages/server/src/routes/hermes/kanban.ts
+++ b/packages/server/src/routes/hermes/kanban.ts
@@ -33,6 +33,7 @@ kanbanRoutes.get('/api/hermes/kanban/:id/attachments', ctrl.listAttachments)
 kanbanRoutes.post('/api/hermes/kanban/:id/attachments', ctrl.uploadAttachment)
+kanbanRoutes.post('/api/hermes/kanban/:id/attachments/url', ctrl.uploadAttachmentFromUrl)
 kanbanRoutes.get('/api/hermes/kanban/attachments/:id', ctrl.downloadAttachment)
 kanbanRoutes.delete('/api/hermes/kanban/attachments/:id', ctrl.removeAttachment)
```

> 上下文锚点：现有 `:id/attachments` POST 与 `attachments/:id` GET 之间。实施时读实际行号。

### Step 4.4: 追加 patch 166 加 `uploadAttachmentFromUrl` wrapper

- [ ] **编辑 patch 166，在末尾追加**

在 `overlay/patches/166-client-api-kanban-wrappers.patch` 的 `getTimeline` 函数之后追加：

```diff
+
+// ─── Attach from URL（P4）──────────────────────────────────────
+
+export async function uploadAttachmentFromUrl(
+  taskId: string,
+  url: string,
+  opts?: KanbanBoardOptions & { filename?: string; contentType?: string },
+): Promise<KanbanAttachment> {
+  const res = await request<{ attachment: KanbanAttachment }>(
+    appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/attachments/url`, boardParams(opts?.board)),
+    { method: 'POST', body: JSON.stringify({ url, filename: opts?.filename, content_type: opts?.contentType }) },
+  )
+  return res.attachment
+}
```

同步更新该 patch 的 hunk 头行数（`@@ -660,3 +660,72 @@` → 实际 `+660,82 @@` 等，按追加行数重算）。

### Step 4.5: 改 KanbanAttachments.vue 加「从 URL 添加」

- [ ] **在 `KanbanAttachments.vue` script 加 url state + handler**

在 `const uploadLoading = ref(false)` 之后加：

```ts
const urlInput = ref('')
const urlUploading = ref(false)

async function handleUploadFromUrl() {
  const url = urlInput.value.trim()
  if (!url || !props.taskId) return
  urlUploading.value = true
  try {
    await store.uploadTaskAttachmentFromUrl?.(props.taskId, url)
    message.success(t('kanban.message.attachmentUploaded', 'Attachment uploaded'))
    urlInput.value = ''
    await store.fetchAttachments?.(props.taskId)
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.attachUrlFailed', 'Attach from URL failed'))
  } finally {
    urlUploading.value = false
  }
}
```

> `store.uploadTaskAttachmentFromUrl` 是 store 层 thin wrapper，需在 `stores/hermes/kanban.ts` 补（见 Step 4.6）。若 store 未暴露则直接调 `uploadAttachmentFromUrl`（P2 已迁入主 client），此处优先用 store 保持一致。

- [ ] **在模板 `.section-head-row` 之后插入 URL 输入行**

```vue
    <div class="url-input-row">
      <NInput
        v-model:value="urlInput"
        size="tiny"
        :placeholder="t('kanban.attachFromUrlPlaceholder', 'https://...')"
      />
      <NButton
        size="tiny"
        :loading="urlUploading"
        :disabled="!urlInput.trim()"
        @click="handleUploadFromUrl"
      >
        {{ t('kanban.attachFromUrl', 'From URL') }}
      </NButton>
    </div>
```

- [ ] **加 CSS**

```scss
.url-input-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
```

### Step 4.6: store 层补 thin wrapper

- [ ] **在 `overlay/custom/client/kanban/` 或 patch 022 覆盖的 `stores/hermes/kanban.ts` 补 action**

读 `upstream/hermes-studio/packages/client/src/stores/hermes/kanban.ts`（注入后）确认是否已有 `uploadTaskAttachment`，仿照其模式加：

```ts
async function uploadTaskAttachmentFromUrl(taskId: string, url: string, opts?: { board?: string; filename?: string; contentType?: string }) {
  const att = await kanbanApi.uploadAttachmentFromUrl(taskId, url, opts)
  // 更新本地 attachments 缓存
  const cur = attachments.value[taskId] ?? []
  attachments.value = { ...attachments.value, [taskId]: [...cur, att] }
  return att
}
```

> 若该文件由 patch 022 注入，则需新建 patch `173-client-store-kanban-attach-url.patch`；若 `stores/hermes/kanban.ts` 已是 overlay custom 文件则直接改。实施时先 `grep -n uploadTaskAttachment upstream/hermes-studio/packages/client/src/stores/hermes/kanban.ts` 确认。

### Step 4.7: 写 i18n patch 171/172

- [ ] **patch 171（en）**

文件：`overlay/patches/171-kanban-attach-url-en.patch`

锚点 `packages/client/src/i18n/locales/en.ts` 的 `kanban:` 块内 `message:` 子块。

```diff
+    attachFromUrl: 'From URL',
+    attachFromUrlPlaceholder: 'https://...',
+    message: {
+      attachUrlFailed: 'Attach from URL failed',
+    },
```

- [ ] **patch 172（zh）**

文件：`overlay/patches/172-kanban-attach-url-zh.patch`

```diff
+    attachFromUrl: '从 URL',
+    attachFromUrlPlaceholder: 'https://...',
+    message: {
+      attachUrlFailed: '从 URL 添加附件失败',
+    },
```

### Step 4.8: 追加 series + inject + 验证

- [ ] **追加 169-172 到 series**

```
169-server-controllers-kanban-attach-url.patch
170-server-routes-kanban-attach-url.patch
171-kanban-attach-url-en.patch
172-kanban-attach-url-zh.patch
```

- [ ] **inject + typecheck**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject && npm run typecheck
```
Expected: 0 errors。

- [ ] **vitest**

```bash
npm test -- --run kanban
```
Expected: PASS。

- [ ] **手动 attach-url 测试**

```bash
npm run dev
```
在某任务附件区输入公网 URL（如 `https://example.com/test.txt`）确认下载+入库；输入 `http://169.254.169.254/` 确认返回 400（SSRF 拒绝）。

### Step 4.9: 提交 + 收口

- [ ] **commit**

```bash
git add patches/169-*.patch patches/170-*.patch patches/166-*.patch patches/171-*.patch patches/172-*.patch custom/client/kanban/components/KanbanAttachments.vue patches/series
git commit -m "feat(kanban): attach-from-URL 新 HTTP 路由 + UI — patch 169-172

- controller uploadAttachmentFromUrl：fetch 下载 URL → 复用 addAttachment
  写入，25MB 双校验 + assertSafeOutboundUrl SSRF 守卫（复用 url-guard.ts）
- route POST /api/hermes/kanban/:id/attachments/url
- client wrapper uploadAttachmentFromUrl（追加到 patch 166）
- KanbanAttachments.vue 加「从 URL」输入行
- i18n 171/172 en/zh"
```

- [ ] **收口**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge --no-ff feat/wp-kanban-p4-attach-url
git worktree remove .claude/worktrees/wp-kanban-p4-attach-url
git branch -d feat/wp-kanban-p4-attach-url
git worktree prune
```

---

## Task 5: 全量验证

**Files:** 无新文件；只跑验证。

### Step 5.1: 全量 inject + typecheck + test

- [ ] **验证**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
npm run typecheck
npm test
```
Expected: inject 含 164-172；typecheck 0 errors；vitest 全绿。

### Step 5.2: dev server 全量巡检

- [ ] **巡检清单**

```bash
npm run dev
```
- SwarmKanban：orchestration panel、home-channel、attachments（含 From URL）功能正常。
- CockpitWorkspace：选 running/blocked/failed 任务，确认 5 个 meta 行 + events/runs 区段渲染正确。
- 输入内网 URL 确认 SSRF 拒绝。

### Step 5.3: 更新 RELEASE-NOTES

- [ ] **追加 release notes**

读 `overlay/RELEASE-NOTES.md`，追加 1.9 节：

```markdown
## 1.9 — hermes-agent v0.19.0 kanban 能力对账

- KanbanTask 接口补 19 个 v0.19 运维状态字段（patch 164/165）
- client 补 5 个缺失 HTTP wrapper + 迁入 cockpit-extras（patch 166）
- CockpitWorkspace 加 Worker 健康/失败熔断/Claim 锁/Workflow/派生溯源 5 个 meta 行 + events/runs 区段（patch 167/168）
- 新增 attach-from-URL HTTP 路由 + UI，含 SSRF 守卫（patch 169-172）
```

- [ ] **commit release notes**

```bash
git add RELEASE-NOTES.md
git commit -m "docs: release notes 1.9 — hermes-agent v0.19.0 kanban 能力对账"
```

> 不主动 push github（遵项目规则）。构建产物不主动上传（遵项目规则 2026-07-21）。

---

## 自检清单（实施者对照 spec 逐条确认）

- [ ] spec §6 P1：KanbanTask +19 字段（patch 164/165）✓
- [ ] spec §7 P2：5 个 wrapper（readArtifact/debugHomeChannels/listWorkspaceFiles/getTimeline/searchSessions）+ cockpit-extras re-export（patch 166）✓
- [ ] spec §8 P3：CockpitWorkspace 5 meta 行 + events/runs + i18n（patch 167/168 + custom .vue）✓
- [ ] spec §9 P4：attach-url controller + route + wrapper + UI + i18n + SSRF（patch 169-172 + patch 166 追加 + custom .vue）✓
- [ ] spec §10 分支策略：4 个 feat 分支顺序收口 ✓
- [ ] spec §11 不做项：agent 内部策略/运维 CLI/cast 清理均未做 ✓
- [ ] spec §12 验证：inject/typecheck/vitest/dev 巡检/release notes ✓

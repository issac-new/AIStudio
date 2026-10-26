# hermes-agent v0.19.0 kanban 能力迁移至「Swarm kanban」与「AI 协作中心」工作区 — 设计

- 日期：2026-07-24
- 状态：已批准（方案 A，4 阶段；Phase 4 纳入）
- 关联前置 spec：`docs/superpowers/specs/2026-06-24-cockpit-workitem-kanban-migration-design.md`（已实施）
- 目标 upstream 版本：`hermes-agent` v0.19.0（tag `v2026.7.20`）、`hermes-studio` v0.6.32

## 1. 背景与目标

hermes-agent 已升级至 v0.19.0（overlay 提交 `b6beb42`）。本次对 v0.18.2 → v0.19.0 间 kanban 源码差异做全量重审，并把缺口迁移到 overlay 的两处 kanban UI：

- **Swarm kanban**：`overlay/custom/client/kanban/`（`SwarmKanbanView.vue` + `KanbanTaskDrawer.vue` + `KanbanAttachments.vue` 等）。
- **AI 协作中心 / Cockpit 工作区**：`overlay/custom/client/cockpit/components/CockpitWorkspace.vue`（右栏 `work` 模式，叠加在 kanban 字段之上的人工评审表单）。

目标是让两处 UI 与 v0.19.0 后端能力对齐：补齐 Task 数据模型字段、补齐缺失的 HTTP client wrapper、把 drawer 已有但 cockpit 缺失的 events/runs/worker-health 展示迁入工作区、并新增 attach-from-URL 能力。

## 2. 能力对账结论（v0.19.0 后端 vs overlay 现有 surface）

### 2.1 Task 数据模型字段（Python `Task` dataclass 35 字段 vs TS `KanbanTask` 15 字段）

`hermes_cli/kanban_db.py:840` `Task` 共 35 字段；`packages/client/src/api/hermes/kanban.ts:7` `KanbanTask` 仅声明 15 个。**19 个字段未在 TS 接口声明**：

| 分类 | 字段 | TS 接口 | CockpitWorkspace | KanbanTaskDrawer |
|---|---|---|---|---|
| 阻塞语义 | `block_kind` `block_recurrences` | ❌ | ❌ | ❌ |
| 失败熔断 | `consecutive_failures` `last_failure_error` `max_retries` | ❌ | ❌ | ❌ |
| Worker 活性 | `worker_pid` `last_heartbeat_at` `current_run_id` `max_runtime_seconds` | ❌ | ❌ | ❌ |
| Goal 循环 | `goal_mode` `goal_max_turns` | ❌ | ❌ | ✅（`(task as any)` cast 只读）|
| 派生溯源 | `session_id` `idempotency_key` `branch_name` | ❌ | ❌（仅 tenant 解析）| ❌ |
| 工作流编排 | `workflow_template_id` `current_step_key` `model_override` | ❌ | ❌ | ❌ |
| Claim 锁 | `claim_lock` `claim_expires` | ❌ | ❌ | ❌ |

### 2.2 HTTP 路由 vs TS client wrapper

`kanban.ts` 23 个方法 vs `routes/hermes/kanban.ts` 38 条路由，**缺 15 个 wrapper**：`getOrchestration`/`setOrchestration`/`readArtifact`/`homeChannels`/`debugHomeChannels`/`subscribeHome`/`unsubscribeHome`/`listAttachments`/`uploadAttachment`/`downloadAttachment`/`removeAttachment`/`decomposeTask`/`patchTask`/`deleteTask`，以及 `listWorkspaceFiles`/`listTimeline`/`searchSessions`（已在 `overlay/custom/client/cockpit/api/kanban-extras.ts` 自建，未迁入主 client）。

### 2.3 CockpitWorkspace vs KanbanTaskDrawer 能力差

| 能力 | CockpitWorkspace | KanbanTaskDrawer |
|---|---|---|
| events 事件流 | ❌ | ✅（`:1058-1083`）|
| runs 运行历史 | ❌ | ✅（`:1112-1145`）|
| goal_mode 展示 | ❌ | ✅（`:772-775`）|
| 19 个新字段只读展示 | ❌ | ❌ |
| attach-from-URL | ❌ | ❌（agent 有 `kanban_attach_url` 工具，HTTP/dashboard 无对应路由）|

### 2.4 v0.19.0 新增（相对 v0.18.2）

- **附件工具集**：agent `kanban_attach`/`kanban_attach_url`/`kanban_attachments` + CLI `attach`/`attachments`/`attach-rm` + `AttachmentTooLarge` + 25MB 统一上限 + SSRF 守卫。
- **kanban_stop nudge**（`agent/kanban_stop.py`）：worker 不调终端工具就 finish 时合成续跑提示——纯 agent 运行时，无 UI 入口。
- **ArtifactPreservationError**：`kanban_complete` 保留 scratch workspace 的错误处理——纯 agent。
- **judge_goal 5 元组**：goal 完成门禁——纯 agent。

后三项是 agent 运行时策略，**不迁移到 UI**——它们是 worker 行为，dashboard 只能通过 events/runs 观察结果。

## 3. 方案选择

采用**方案 A：分阶段字段 + wrapper 对账**，4 个独立可发布阶段，每阶段一个 feat 分支，顺序收口（P2 依赖 P1 接口，P3 依赖 P2 wrapper，P4 依赖 P2 wrapper 框架）。

否决方案 B（一次性合并 patch batch）：review 负担大、回滚难、与 patch 序号体系冲突。
否决方案 C（跳过 attach-url）：留真实缺口，与"全量对账"目标不符。

## 4. 设计原则

1. **只改 `overlay/`** — upstream 严禁直接改；所有变更通过 patch + custom 代码经 `npm run inject` 注入。
2. **向后兼容** — 新字段一律 `optional`（`?`）或 `| null`，不破坏现有调用方与序列化。
3. **沿用现有 patch 序号体系** — 下一可用序号 164，按 phase 顺序占用至 173。
4. **沿用现有数据路径** — 草稿批量提交（字段编辑类）+ 即时执行（动作命令类），与 `2026-06-24` spec 一致。
5. **复用既有子组件** — `KanbanDiagnosticsSection`/`KanbanAttachments`/`KanbanMarkdown`/`event-adapter` 已是可复用单元。

## 5. 改动文件清单（按 phase）

| Phase | 文件 | 改动 |
|---|---|---|
| P1 | `overlay/patches/164-client-api-kanban-task-fields.patch` | `KanbanTask` 接口 +19 字段 |
| P1 | `overlay/patches/165-server-service-hermes-kanban-task-fields.patch` | service 侧 `KanbanTask` 接口同步 +19 字段 |
| P2 | `overlay/patches/166-client-api-kanban-wrappers.patch` | 补 15 个缺失 HTTP wrapper + 迁入 cockpit-extras 三个函数 |
| P2 | `overlay/custom/client/cockpit/api/kanban-extras.ts` | 改为 re-export 主 client（保兼容）|
| P3 | `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 5 个只读 meta 行 + events/runs 区段 + goal_mode |
| P3 | `overlay/patches/168-i18n-cockpit-kanban-fields-en.patch` + `169-...-zh.patch` | `cockpit.*` 新 key（en/zh 双）|
| P4 | `overlay/patches/170-server-controllers-kanban-attach-url.patch` | `uploadAttachmentFromUrl(ctx)` controller |
| P4 | `overlay/patches/171-server-routes-kanban-attach-url.patch` | `POST /api/hermes/kanban/:id/attachments/url` |
| P4 | `overlay/patches/166-client-api-kanban-wrappers.patch`（追加）| `uploadAttachmentFromUrl` client wrapper |
| P4 | `overlay/custom/client/kanban/components/KanbanAttachments.vue` | 「从 URL 添加」输入框 + 按钮 |
| P4 | `overlay/patches/172-i18n-kanban-attach-url-en.patch` + `173-...-zh.patch` | `kanban.attachFromUrl` 等 key |
| 全 phase | `overlay/patches/series` | 追加 164-173 |

> P3 不单独出 patch 167（`CockpitWorkspace.vue` 是 custom 代码，直接改文件即可，无需 patch 形态）。

## 6. Phase 1 — Task 字段接口扩展

### 6.1 KanbanTask 接口新增字段（client + service 同步）

参考 patch 010/014 现有 `+  project_id: string | null` 风格，2 空格缩进，紧接 `skills` 之后插入。两处接口（client `kanban.ts` + service `hermes-kanban.ts`）同步：

```ts
export interface KanbanTask {
  // ... 现有 15 字段 ...
  skills: string[] | null
  // ─── v0.19 运维状态字段（overlay 补齐，均 optional/nullable，向后兼容）───
  branch_name?: string | null
  idempotency_key?: string | null
  consecutive_failures?: number
  worker_pid?: number | null
  last_failure_error?: string | null
  max_runtime_seconds?: number | null
  last_heartbeat_at?: number | null
  current_run_id?: number | null
  workflow_template_id?: string | null
  current_step_key?: string | null
  model_override?: string | null
  max_retries?: number | null
  goal_mode?: boolean
  goal_max_turns?: number | null
  session_id?: string | null
  block_kind?: string | null
  block_recurrences?: number
  claim_lock?: string | null
  claim_expires?: number | null
}
```

对应 Python `Task` dataclass 字段已逐一核对存在。

### 6.2 验证

`npm run inject` 后 `npm run typecheck` 确认无类型错误。不动 UI，仅接口扩展。

## 7. Phase 2 — 缺失 HTTP wrapper 补齐

### 7.1 新增 15 个 wrapper（参考 patch 010 `getHomeChannels` 风格）

写入 `packages/client/src/api/hermes/kanban.ts`（经 patch 166 注入）：

```ts
// ─── Orchestration ──────────────────────────────────────────────
export async function getOrchestration(opts?: KanbanBoardOptions): Promise<KanbanOrchestration>
export async function setOrchestration(data: Partial<KanbanOrchestration>, opts?: KanbanBoardOptions): Promise<KanbanOrchestration>

// ─── Artifact ──────────────────────────────────────────────────
export async function readArtifact(taskId: string, path: string, opts?: KanbanBoardOptions): Promise<Blob>

// ─── Home channels ─────────────────────────────────────────────
export async function getHomeChannels(taskId: string | null, opts?: KanbanBoardOptions): Promise<HomeChannel[]>
export async function debugHomeChannels(opts?: KanbanBoardOptions): Promise<unknown>
export async function subscribeHomeChannel(taskId: string, platform: string, opts?: ...): Promise<{ ok: boolean }>
export async function unsubscribeHomeChannel(taskId: string, platform: string, opts?: ...): Promise<{ ok: boolean }>

// ─── Attachments ───────────────────────────────────────────────
export async function listAttachments(taskId: string, opts?: KanbanBoardOptions): Promise<KanbanAttachment[]>
export async function uploadAttachment(taskId: string, file: File, opts?: KanbanBoardOptions): Promise<KanbanAttachment>
export async function downloadAttachment(attachmentId: number, opts?: KanbanBoardOptions): Promise<Blob>
export async function removeAttachment(attachmentId: number, opts?: KanbanBoardOptions): Promise<{ ok: boolean }>

// ─── Task lifecycle ────────────────────────────────────────────
export async function patchTask(taskId: string, patch: KanbanTaskPatch, opts?: KanbanBoardOptions): Promise<KanbanTask>  // 已存在则跳过
export async function decomposeTask(taskId: string, opts?: KanbanBoardOptions & { author?: string }): Promise<unknown>
export async function deleteTask(taskId: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean }>

// ─── 从 cockpit-extras 迁入主 client ───────────────────────────
export async function listWorkspaceFiles(taskId: string, board?: string, sub = '', depth = 2): Promise<FileNode[]>
export async function getTimeline(opts: { limit?: number; since?: number } = {}): Promise<{ items: TimelineItem[]; total: number }>
export async function searchSessions(taskId: string, profile: string): Promise<SessionSearchResult[]>
```

### 7.2 迁移 `cockpit-extras.ts`

三个函数迁入主 `kanban.ts` 后，`cockpit-extras.ts` 改为 `export * from '@/api/hermes/kanban'` re-export，保向后兼容（零调用点改动）。

### 7.3 store 层

`packages/client/src/stores/hermes/kanban.ts`（patch 022 已增强）若已有同名方法则不重复；仅补缺失的 attachment store action。

### 7.4 验证

`npm run typecheck` + `npm test`（vitest，含 kanban store 测试 037/038/039）。手动：SwarmKanban 的 orchestration panel、home-channel、attachments 功能不退化。

## 8. Phase 3 — CockpitWorkspace 能力补齐

### 8.1 新增 5 个只读 meta 行

在 `CockpitWorkspace.vue` 模板 `cockpit-workspace__flow` 区（line 388-511 之间）插入新 `<div class="cockpit-workspace__flow-row">`：

- **Worker 健康**：`worker_pid` · `last_heartbeat_at`（相对时间）· `current_run_id` · `max_runtime_seconds`
- **失败熔断**：`consecutive_failures` / `max_retries` · `last_failure_error`（`consecutive_failures >= max_retries` 时 `is-error` 高亮）
- **Claim 锁**：`claim_lock` · `claim_expires`（倒计时）
- **Workflow 编排**：`workflow_template_id` · `current_step_key` · `model_override` · `goal_mode`/`goal_max_turns`
- **派生溯源**：`session_id` · `idempotency_key` · `branch_name` · `block_kind` · `block_recurrences`

全部 `v-if` 守卫，字段为 null/0 时不渲染。时间字段复用 `KanbanAttachments.vue:27 timeAgo` 模式。i18n key 加在 `cockpit.*` 命名空间（patch 168/169）。

### 8.2 events + runs 区段（搬 KanbanTaskDrawer.vue:1058-1145）

在 Worker Log 区段（line 526）之前插入 Events 与 Run History 两区段。数据源：`store.selectedTaskDetail?.events`/`?.runs`（`cockpit.ts` detail 已含，见 `2026-06-24` spec §4.4）。复用 `overlay/custom/client/cockpit/adapters/event-adapter.ts` 做 kind→label 映射。

### 8.3 goal_mode 行

P1 接口扩展后，drawer 现有 `(task as any).goal_mode` cast 可改为 `task.value?.goal_mode`，在「Workflow 编排」meta 行内联展示（顺手清理 cast）。

### 8.4 验证

`npm run inject` + dev server：选 running 任务确认 worker_pid/heartbeat/run_id 渲染；选 blocked 任务确认 block_kind/recurrences；选 failed 任务确认熔断高亮。扩展 `cockpit-workspace.test.ts` 覆盖新字段。

## 9. Phase 4 — attach-from-URL 新 HTTP 路由 + UI

### 9.1 约束与方案

upstream CLI `kanban attach` 只收本地路径；agent `kanban_attach_url` 是 Python 工具，TS service 无法直调。**方案**：service 端用 `fetch(url)` 下载（带 25MB 上限 + http/https-only + SSRF 守卫，对齐 agent `_download_url_with_cap`），再调既有 `addAttachment()`（`controllers/hermes/kanban.ts:1056`）写入 task 附件目录。

### 9.2 后端 controller + route（patch 170/171）

```ts
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:'])

export async function uploadAttachmentFromUrl(ctx: Context) {
  const taskId = ctx.params.id
  const board = ctx.query.board as string | undefined
  const bodyResult = requestBody(ctx)
  if (rejectBadRequest(ctx, bodyResult.error)) return
  const body = bodyResult.value
  const url = optionalString(body, 'url')
  const filename = optionalString(body, 'filename')
  const contentType = optionalString(body, 'content_type')
  if (rejectBadRequest(ctx, url.error)) return

  let parsedUrl: URL
  try { parsedUrl = new URL(url.value) }
  catch { ctx.status = 400; ctx.body = { error: 'Invalid URL' }; return }
  if (!ALLOWED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    ctx.status = 400; ctx.body = { error: 'Only http/https URLs allowed' }; return
  }

  try {
    const resp = await fetch(parsedUrl, { redirect: 'follow' })
    if (!resp.ok) { ctx.status = 502; ctx.body = { error: `Fetch failed: ${resp.status}` }; return }
    const contentLength = Number(resp.headers.get('content-length') || 0)
    if (contentLength > MAX_ATTACHMENT_BYTES) { ctx.status = 413; ctx.body = { error: 'Too large' }; return }
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length > MAX_ATTACHMENT_BYTES) { ctx.status = 413; ctx.body = { error: 'Too large' }; return }

    const safeName = safeAttachmentName(filename.value || parsedUrl.pathname.split('/').pop() || 'download')
    const destDir = taskAttachmentsDir(taskId, board)
    await mkdir(destDir, { recursive: true })
    const record = await addAttachment({
      task_id: taskId, filename: safeName, stored_path: join(destDir, safeName),
      content_type: contentType.value || resp.headers.get('content-type') || undefined,
      size: buf.length, uploaded_by: requestedProfile(ctx) || 'url',
    }, board)
    await writeFile(record.stored_path, buf)
    ctx.body = { attachment: record }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message }
  }
}
```

route（插在 `:id/attachments` 之前避免 catch-all）：
```ts
kanbanRoutes.post('/api/hermes/kanban/:id/attachments/url', ctrl.uploadAttachmentFromUrl)
```

### 9.3 前端 wrapper + UI（patch 166 追加 + KanbanAttachments.vue）

```ts
export async function uploadAttachmentFromUrl(taskId: string, url: string, opts?: KanbanBoardOptions & { filename?: string; contentType?: string }): Promise<KanbanAttachment>
```

`KanbanAttachments.vue` 头部加「从 URL 添加」输入框 + 按钮，script 内 `urlInput`/`urlUploading` ref + `handleUploadFromUrl` 调 store 新 action `uploadTaskAttachmentFromUrl`。

### 9.4 安全守卫

- URL 协议白名单 http/https（对齐 agent `_download_url_with_cap`）。
- 25MB 上限双校验（content-length + 实际 buffer）。
- SSRF：复用 `overlay/custom/server/security/url-guard.ts` 拒绝内网元数据端点（169.254.169.254 等），对齐 agent `tools/url_safety.py`。

### 9.5 验证

单元测试：`uploadAttachmentFromUrl` controller（mock fetch）— 成功/超大/非法协议/SSRF。手动：公网 URL 确认下载+入库；内网 IP 确认拒绝。

## 10. 执行顺序与分支策略

按 user-level AGENTS.md §1 worktree 并行规则，每 phase 一个 feat 分支（`.claude/worktrees/`，≤3 并行），顺序收口：

1. `feat/wp-kanban-p1-task-fields` → P1 → merge main → 清理
2. `feat/wp-kanban-p2-wrappers`（rebase 到 P1 后 main）→ P2 → merge → 清理
3. `feat/wp-kanban-p3-cockpit-ui` → P3 → merge → 清理
4. `feat/wp-kanban-p4-attach-url` → P4 → merge → 清理

P2 依赖 P1 接口字段；P3 依赖 P2 wrapper；P4 依赖 P2 wrapper 框架。故顺序收口，不并行。

## 11. 不做（out of scope）

- **agent 内部策略迁移**：`kanban_stop.py` nudge、`ArtifactPreservationError`、`judge_goal` 5 元组——纯 agent 运行时，无 UI 入口。
- **运维 CLI**（`tail`/`watch`/`claim`/`promote`/`gc`/`ctx`/`asg`/`hb`）：dashboard 不直接对应；`notify-*` 已通过 HTTP `home-channels` 间接暴露；`runs` 数据已通过 `getTask` detail 暴露，P3 直接用。
- **强制清理 `(task as any)` cast**：P1 后可顺手清理 drawer 内 goal_mode cast，但非强制，留作 P3 附带。

## 12. 验证计划（全 phase 合并后）

- `npm run inject` 成功，`.overlay-injected.json` 含 164-173。
- `npm run typecheck` + `npm test`（vitest 全绿）。
- dev server 手动巡检：SwarmKanban orchestration/home/attachments 不退化；CockpitWorkspace 新 meta 行/events/runs/attach-url 全部可用。
- 构建产物不主动上传 github（遵从项目规则 2026-07-21）；x64.zip 可按 carve-out 同步 modelscope（若用户触发「构建 win」）。

## 13. 风险与回退

- **P1 接口扩展**：纯 additive，风险最低；若 inject 后类型冲突则回滚 patch 164/165。
- **P2 wrapper 迁移 cockpit-extras**：re-export 保兼容，风险低；若调用点遗漏则补 import。
- **P3 UI**：新 meta 行 v-if 守卫，空字段不渲染，不影响现有布局；events/runs 复用既有 detail 数据，无新请求。
- **P4 attach-url**：新增 HTTP 路由 + 外部 fetch，SSRF 是主要风险；白名单 + 上限 + 复用 `url-guard.ts` 三重守卫；失败可独立回滚 patch 170-173 不影响 P1-P3。

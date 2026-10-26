# Cockpit 接入 Kanban 真实数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 cockpit 页面从 mock 驱动改造为 100% 由 `useKanbanStore` 派生数据驱动，保留全部已实现的交互能力。

**Architecture:** 方案 C 混合——cockpit store 的"数据类状态"改为 computed 自 `useKanbanStore`（单一数据源、无副本），"客户端态"（草稿/模板/筛选/折叠）仍本地；通过 7 个 adapter 模块收敛字段映射；新增 2 条后端 patch 路由（workspace-files 列目录、timeline 聚合）；聊天用精简壳 + 复用三个真实 store action 固定本页。

**Tech Stack:** Vue 3 + Pinia + TypeScript + Vitest + @vue/test-utils；overlay patch（unified diff 经 `npm run inject` 注入）；后端 Koa + hermes-agent CLI 子进程桥。

**Spec:** `docs/superpowers/specs/2026-06-23-cockpit-kanban-integration-design.md`（契约见 §12）

**前置须知（所有任务通用）：**
- 工作目录：`/Volumes/nvme2230/lab/ncwk/`。overlay 仓库在 `overlay/`（是 git 仓库）。改 `overlay/custom/**` 直接编辑源码（**不需要 patch**）；改 `upstream/hermes-studio/**` 必须经 patch（写 `overlay/patches/NNN-*.patch` 并登记到 `overlay/patches/series`，`npm run inject` 应用）。
- 分支：开始前 `cd overlay && git checkout -b feat/cockpit-kanban-integration`。
- 测试：`cd overlay && npm test`（= `vitest run`）。alias：`@`→upstream client src、`@/custom`/`@custom`→`overlay/custom/client`。
- cockpit 源码根：`overlay/custom/client/cockpit/`。
- 现有测试范式见 `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`（直接实例化真实 store 后赋值数据，不 mock 依赖）。

---

## File Structure

**新建文件（overlay 直接编辑，无 patch）：**

| 文件 | 责任 |
|------|------|
| `overlay/custom/client/cockpit/adapters/task-adapter.ts` | `KanbanTask`→`CockpitTask` + `bucketPriority` + `bucketStatus` |
| `overlay/custom/client/cockpit/adapters/attention-adapter.ts` | `KanbanTask`→`AttentionItem \| null` |
| `overlay/custom/client/cockpit/adapters/collab-adapter.ts` | `tenant` 三段式解析 → `ParsedTenant` |
| `overlay/custom/client/cockpit/adapters/event-adapter.ts` | `KanbanTaskDetail`+sessions → `CockpitEvent[]` |
| `overlay/custom/client/cockpit/adapters/topology-adapter.ts` | 中心辐射节点构建 |
| `overlay/custom/client/cockpit/adapters/history-adapter.ts` | events+comments → `HistoryItem[]` |
| `overlay/custom/client/cockpit/adapters/chat-adapter.ts` | matrix/chat/group 消息归一 → `ChatMessage` |
| `overlay/custom/client/cockpit/store/cockpit-kv.ts` | localStorage 草稿/模板 |
| `overlay/custom/client/cockpit/api/kanban-extras.ts` | search-sessions + getTimeline + listWorkspaceFiles client（裸 request 封装） |
| `overlay/custom/client/cockpit/__tests__/{task,attention,collab,event,topology,history,chat}-adapter.test.ts` | 7 个 adapter 单元测试 |
| `overlay/custom/client/cockpit/__tests__/cockpit-kv.test.ts` | localStorage 适配测试 |
| `overlay/custom/client/cockpit/__tests__/kanban-extras.test.ts` | client 封装测试（mock request） |
| `overlay/patches/078-server-kanban-workspace-files.patch` | 后端 GET /workspace-files 路由+控制器（注入 upstream） |
| `overlay/patches/079-server-kanban-timeline-aggregate.patch` | 后端 GET /timeline 路由+控制器（注入 upstream） |

**修改文件（overlay 直接编辑）：**

| 文件 | 改动 |
|------|------|
| `overlay/custom/client/cockpit/store/cockpit.ts` | 重构：派生态 computed + 客户端态 ref + bootstrap |
| `overlay/custom/client/cockpit/views/CockpitView.vue` | onMounted 调 `store.bootstrap()` |
| `overlay/custom/client/cockpit/components/CockpitKanban.vue` | 分组键 category→tenant，状态 chip 5 桶 |
| `overlay/custom/client/cockpit/components/CockpitCollabMap.vue` | 中心辐射图 + 画布控件（全屏/缩放/拖拽） |
| `overlay/custom/client/cockpit/components/CockpitTimeline.vue` | 字段适配（nodeIds 移除） |
| `overlay/custom/client/cockpit/components/CockpitWorkspace.vue` | 表单接 localStorage 草稿 + 提交写 comment |
| `overlay/custom/client/cockpit/components/CockpitCollabBar.vue` | channel 从 parseTenant 派生 |
| `overlay/custom/client/cockpit/components/CockpitChatPane.vue` | 精简壳 + 真实 store action 分发 |
| `overlay/custom/client/cockpit/components/CockpitFileTree.vue` | 懒加载 workspace-files API |
| `overlay/custom/client/cockpit/components/CockpitHistoryModal.vue` | 数据源换聚合路由 |
| `overlay/custom/client/cockpit/components/CockpitGraphNode.vue` | 节点 kind 枚举调整 |
| `overlay/custom/client/cockpit/components/CockpitTemplateManager.vue` | 模板源换 localStorage |
| `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` | mock kanban store，更新断言 |
| `overlay/patches/series` | 登记新 patch 078/079 |

**删除文件：**
| 文件 | 原因 |
|------|------|
| `overlay/custom/client/cockpit/fixtures/seed.ts` | mock 数据彻底移除 |

---

## Phase P0：基建（adapter 骨架 + store 重构基础 + 删除 seed）

### Task 1: 分支与基线验证

**Files:** 无（环境准备）

- [ ] **Step 1: 创建 feature 分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/cockpit-kanban-integration
```

- [ ] **Step 2: 验证基线测试通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test`
Expected: 所有现有测试 PASS（14 个 cockpit 测试文件全绿）。若失败先记录基线失败，不修复（属上游问题）。

- [ ] **Step 3: 验证注入可用**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run inject && npm test`
Expected: inject 成功、测试仍 PASS。

---

### Task 2: task-adapter（priority 分桶 + status 合并）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/task-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/task-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/task-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bucketPriority, bucketStatus, toCockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { KanbanTask } from '@/api/hermes/kanban'

const baseTask = (over: Partial<KanbanTask> = {}): KanbanTask => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null,
  ...over,
})

describe('bucketPriority', () => {
  it('maps >=3 to P0', () => {
    expect(bucketPriority(3)).toBe('P0')
    expect(bucketPriority(5)).toBe('P0')
    expect(bucketPriority(100)).toBe('P0')
  })
  it('maps 2 to P1', () => { expect(bucketPriority(2)).toBe('P1') })
  it('maps 1 to P2', () => { expect(bucketPriority(1)).toBe('P2') })
  it('maps 0/null/undefined/negative to P3', () => {
    expect(bucketPriority(0)).toBe('P3')
    expect(bucketPriority(null)).toBe('P3')
    expect(bucketPriority(undefined)).toBe('P3')
    expect(bucketPriority(-1)).toBe('P3')
  })
})

describe('bucketStatus', () => {
  it('review → review', () => { expect(bucketStatus('review')).toBe('review') })
  it('blocked → blocked', () => { expect(bucketStatus('blocked')).toBe('blocked') })
  it('running/ready/scheduled → running', () => {
    expect(bucketStatus('running')).toBe('running')
    expect(bucketStatus('ready')).toBe('running')
    expect(bucketStatus('scheduled')).toBe('running')
  })
  it('triage/todo → todo', () => {
    expect(bucketStatus('triage')).toBe('todo')
    expect(bucketStatus('todo')).toBe('todo')
  })
  it('done/archived → done', () => {
    expect(bucketStatus('done')).toBe('done')
    expect(bucketStatus('archived')).toBe('done')
  })
})

describe('toCockpitTask', () => {
  it('maps core fields + bucketed priority + tenant, drops category', () => {
    const t = toCockpitTask(baseTask({ id: 't9', title: 'Hello', priority: 3, status: 'review', assignee: 'bob', workspace_path: '~/ws/x', tenant: 'matrix:!r:s.ms:Auth' }))
    expect(t).toEqual({
      id: 't9', title: 'Hello', priority: 'P0', status: 'review',
      assignee: 'bob', workspace: '~/ws/x', tenant: 'matrix:!r:s.ms:Auth',
    })
    expect(t).not.toHaveProperty('category')
  })
  it('null assignee → 未分配; null workspace → ~', () => {
    const t = toCockpitTask(baseTask({ assignee: null, workspace_path: null }))
    expect(t.assignee).toBe('未分配')
    expect(t.workspace).toBe('~')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- task-adapter`
Expected: FAIL（`Cannot find module '@/custom/cockpit/adapters/task-adapter'`）

- [ ] **Step 3: 写最小实现**

Create `overlay/custom/client/cockpit/adapters/task-adapter.ts`:

```ts
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'

export type CockpitPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type CockpitStatusBucket = 'review' | 'blocked' | 'running' | 'todo' | 'done'

/** CockpitTask.status 存原始 9 值；仅筛选 chip 用 bucketStatus 合并为 5 桶 */
export type CockpitStatus = KanbanTaskStatus

export interface CockpitTask {
  id: string
  title: string
  priority: CockpitPriority
  status: CockpitStatus
  assignee: string
  workspace: string
  tenant: string | null
}

export function bucketPriority(p: number | null | undefined): CockpitPriority {
  if (p == null || p <= 0) return 'P3'
  if (p === 1) return 'P2'
  if (p === 2) return 'P1'
  return 'P0' // p >= 3
}

export function bucketStatus(s: KanbanTaskStatus): CockpitStatusBucket {
  switch (s) {
    case 'review': return 'review'
    case 'blocked': return 'blocked'
    case 'running': case 'ready': case 'scheduled': return 'running'
    case 'triage': case 'todo': return 'todo'
    case 'done': case 'archived': return 'done'
  }
}

export function toCockpitTask(t: KanbanTask): CockpitTask {
  return {
    id: t.id,
    title: t.title,
    priority: bucketPriority(t.priority),
    status: t.status,
    assignee: t.assignee ?? '未分配',
    workspace: t.workspace_path ?? '~',
    tenant: t.tenant,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- task-adapter`
Expected: PASS（全部用例绿）

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/task-adapter.ts custom/client/cockpit/__tests__/task-adapter.test.ts
git commit -m "feat(cockpit): add task-adapter with priority/status bucketing"
```

---

### Task 3: attention-adapter

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/attention-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/attention-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/attention-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toAttention } from '@/custom/cockpit/adapters/attention-adapter'
import type { KanbanTask } from '@/api/hermes/kanban'

const t = (over: Partial<KanbanTask> = {}): KanbanTask => ({
  id: 't1', title: 'T', body: null, assignee: null, status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('toAttention', () => {
  it('blocked → high severity, prefix 阻塞', () => {
    expect(toAttention(t({ id: 'b1', title: 'X', status: 'blocked' }))).toEqual({
      id: 'att-b1', taskId: 'b1', severity: 'high', title: '阻塞 · X',
    })
  })
  it('review → medium severity, prefix 待审', () => {
    expect(toAttention(t({ id: 'r1', title: 'Y', status: 'review' }))).toEqual({
      id: 'att-r1', taskId: 'r1', severity: 'medium', title: '待审 · Y',
    })
  })
  it('other statuses → null', () => {
    for (const s of ['triage', 'todo', 'running', 'ready', 'scheduled', 'done', 'archived'] as const) {
      expect(toAttention(t({ status: s }))).toBeNull()
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- attention-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/adapters/attention-adapter.ts`:

```ts
import type { KanbanTask } from '@/api/hermes/kanban'

export type AttentionSeverity = 'high' | 'medium' | 'low'

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  title: string
  taskId: string
}

/** 仅按 status 派生（决策 #4）：blocked→high、review→medium，其余不进注意力条 */
export function toAttention(task: KanbanTask): AttentionItem | null {
  if (task.status === 'blocked') {
    return { id: `att-${task.id}`, taskId: task.id, severity: 'high', title: `阻塞 · ${task.title}` }
  }
  if (task.status === 'review') {
    return { id: `att-${task.id}`, taskId: task.id, severity: 'medium', title: `待审 · ${task.title}` }
  }
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- attention-adapter`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/attention-adapter.ts custom/client/cockpit/__tests__/attention-adapter.test.ts
git commit -m "feat(cockpit): add attention-adapter (status-derived)"
```

---

### Task 4: collab-adapter（tenant 三段式解析）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/collab-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/collab-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/collab-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTenant } from '@/custom/cockpit/adapters/collab-adapter'

describe('parseTenant', () => {
  it('null/undefined/empty → null', () => {
    expect(parseTenant(null)).toBeNull()
    expect(parseTenant(undefined)).toBeNull()
    expect(parseTenant('')).toBeNull()
  })

  it('matrix prefix → matrix routeTarget', () => {
    const r = parseTenant('matrix:!abc:matrix.org:Auth联调')!
    expect(r.kind).toBe('matrix')
    expect(r.label).toBe('Auth联调')
    expect(r.routeTarget).toEqual({
      name: 'hermes.matrixChatRoom',
      params: { roomId: '!abc:matrix.org' },
    })
  })

  it('group prefix → groupChatRoom routeTarget', () => {
    const r = parseTenant('group:!room2:matrix.org:后端组')!
    expect(r.kind).toBe('group')
    expect(r.label).toBe('后端组')
    expect(r.routeTarget).toEqual({
      name: 'hermes.groupChatRoom',
      params: { roomId: '!room2:matrix.org' },
    })
  })

  it('session prefix with @profile → session routeTarget with profile query', () => {
    const r = parseTenant('session:sess_001@arch:架构讨论')!
    expect(r.kind).toBe('session')
    expect(r.label).toBe('架构讨论')
    expect(r.routeTarget).toEqual({
      name: 'hermes.session',
      params: { sessionId: 'sess_001' },
      query: { profile: 'arch' },
    })
  })

  it('session prefix without @profile → no profile query', () => {
    const r = parseTenant('session:sess_002:讨论2')!
    expect(r.kind).toBe('session')
    expect(r.routeTarget).toEqual({
      name: 'hermes.session',
      params: { sessionId: 'sess_002' },
      query: {},
    })
  })

  it('unknown prefix → plain (no routeTarget)', () => {
    const r = parseTenant('platform-team')!
    expect(r.kind).toBe('plain')
    expect(r.label).toBe('platform-team')
    expect(r.routeTarget).toBeUndefined()
  })

  it('preserves raw', () => {
    expect(parseTenant('matrix:!a:b.ms:X')!.raw).toBe('matrix:!a:b.ms:X')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- collab-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/adapters/collab-adapter.ts`:

```ts
import type { RouteLocationRaw } from 'vue-router'

export type TenantKind = 'matrix' | 'session' | 'group' | 'plain'

export interface ParsedTenant {
  kind: TenantKind
  label: string
  routeTarget?: RouteLocationRaw
  raw: string
}

/**
 * tenant 三段式解析（决策 #9/#10）：
 *   matrix:<roomId>:<name>           （roomId 可含冒号，如 !abc:matrix.org）
 *   session:<sessionId>[@<profile>]:<name>
 *   group:<roomId>:<name>
 *   <其他>                            （plain，仅作分组键）
 */
export function parseTenant(tenant: string | null | undefined): ParsedTenant | null {
  if (!tenant) return null
  const parts = tenant.split(':')
  const prefix = parts[0]

  if (prefix === 'matrix' || prefix === 'group') {
    // 最后一节是 name，其余（去掉 prefix）拼回 roomId（roomId 可能含冒号）
    if (parts.length < 3) {
      // 格式不全（如 'matrix:X'），fallback 为 plain
      return { kind: 'plain', label: tenant, raw: tenant }
    }
    const id = parts.slice(1, -1).join(':')
    const name = parts[parts.length - 1] || id
    return {
      kind: prefix,
      label: name,
      raw: tenant,
      routeTarget: {
        name: prefix === 'matrix' ? 'hermes.matrixChatRoom' : 'hermes.groupChatRoom',
        params: { roomId: id },
      },
    }
  }

  if (prefix === 'session') {
    // rest = '<sessionId>[@<profile>]:<name>'
    const rest = parts.slice(1).join(':')
    const firstColon = rest.indexOf(':')
    const idPart = firstColon >= 0 ? rest.slice(0, firstColon) : rest
    const name = firstColon >= 0 ? rest.slice(firstColon + 1) : idPart
    const atIdx = idPart.indexOf('@')
    const sessionId = atIdx > 0 ? idPart.slice(0, atIdx) : idPart
    const profile = atIdx > 0 ? idPart.slice(atIdx + 1) : undefined
    return {
      kind: 'session',
      label: name || sessionId,
      raw: tenant,
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

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- collab-adapter`
Expected: PASS（全部 7 个用例）

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/collab-adapter.ts custom/client/cockpit/__tests__/collab-adapter.test.ts
git commit -m "feat(cockpit): add collab-adapter for tenant 3-segment parsing"
```

---

### Task 5: cockpit-kv（localStorage 草稿/模板）

**Files:**
- Create: `overlay/custom/client/cockpit/store/cockpit-kv.ts`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-kv.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/cockpit-kv.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadDraft, saveDraft, clearDraft, loadTemplates, saveTemplates,
  DraftWorkItem, A2uiTemplate,
} from '@/custom/cockpit/store/cockpit-kv'

beforeEach(() => localStorage.clear())

const draft: DraftWorkItem = {
  id: 'w-t1', taskId: 't1', decision: 'conditional',
  riskTags: ['concurrency'], opinion: '需补用例', modifiedFiles: ['a.ts'],
}

describe('workitem draft', () => {
  it('loadDraft returns null when absent', () => {
    expect(loadDraft('t1')).toBeNull()
  })
  it('save/load roundtrip', () => {
    saveDraft('t1', draft)
    expect(loadDraft('t1')).toEqual(draft)
  })
  it('saveDraft merges partial onto existing', () => {
    saveDraft('t1', draft)
    saveDraft('t1', { opinion: '改了意见' })
    expect(loadDraft('t1')!.opinion).toBe('改了意见')
    expect(loadDraft('t1')!.riskTags).toEqual(['concurrency']) // 未变
  })
  it('clearDraft removes', () => {
    saveDraft('t1', draft)
    clearDraft('t1')
    expect(loadDraft('t1')).toBeNull()
  })
  it('save failure (quota) is swallowed', () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('quota') }
    expect(() => saveDraft('t1', draft)).not.toThrow()
    Storage.prototype.setItem = orig
  })
})

describe('templates', () => {
  it('loadTemplates returns [] when absent', () => {
    expect(loadTemplates()).toEqual([])
  })
  it('save/load roundtrip', () => {
    const tpls: A2uiTemplate[] = [
      { id: 'tpl1', name: 'T', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] },
    ]
    saveTemplates(tpls)
    expect(loadTemplates()).toEqual(tpls)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- cockpit-kv`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/store/cockpit-kv.ts`:

```ts
export type WorkDecision = 'conditional' | 'reject' | 'approve'

export interface DraftWorkItem {
  id: string
  taskId: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
  score?: number
}

export interface A2uiTemplate {
  id: string
  name: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
}

const DRAFT_KEY = (taskId: string) => `cockpit:workitem:${taskId}`
const TPL_KEY = 'cockpit:templates'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota 失败静默 */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function loadDraft(taskId: string): DraftWorkItem | null {
  const raw = safeGet(DRAFT_KEY(taskId))
  if (!raw) return null
  try { return JSON.parse(raw) as DraftWorkItem } catch { return null }
}

export function saveDraft(taskId: string, patch: Partial<DraftWorkItem>): void {
  const cur = loadDraft(taskId) ?? {
    id: `w-${taskId}`, taskId, decision: 'conditional' as WorkDecision,
    riskTags: [], opinion: '', modifiedFiles: [],
  }
  const merged: DraftWorkItem = { ...cur, ...patch }
  safeSet(DRAFT_KEY(taskId), JSON.stringify(merged))
}

export function clearDraft(taskId: string): void {
  safeRemove(DRAFT_KEY(taskId))
}

export function loadTemplates(): A2uiTemplate[] {
  const raw = safeGet(TPL_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as A2uiTemplate[] : []
  } catch { return [] }
}

export function saveTemplates(list: A2uiTemplate[]): void {
  safeSet(TPL_KEY, JSON.stringify(list))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- cockpit-kv`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/store/cockpit-kv.ts custom/client/cockpit/__tests__/cockpit-kv.test.ts
git commit -m "feat(cockpit): add cockpit-kv localStorage adapter for drafts/templates"
```

---

### Task 6: event-adapter（task_events + runs + sessions 三层合并）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/event-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/event-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/event-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeDetail, formatWhen, kindToWhat } from '@/custom/cockpit/adapters/event-adapter'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'

const today = new Date()
const tsToday = (h: number, m: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).getTime()
const tsOther = new Date(2025, 0, 5, 9, 30).getTime()

const detail = (over: Partial<KanbanTaskDetail> = {}): KanbanTaskDetail => ({
  task: {
    id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
    priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
    workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null,
    result: null, skills: null,
  },
  latest_summary: null,
  comments: [],
  events: [],
  runs: [],
  ...over,
})

describe('formatWhen', () => {
  it('same day → HH:mm', () => {
    const t = tsToday(14, 36)
    expect(formatWhen(t)).toMatch(/^\d{2}:\d{2}$/)
  })
  it('other day → MM-DD HH:mm', () => {
    expect(formatWhen(tsOther)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})

describe('kindToWhat', () => {
  it('covers known kinds', () => {
    expect(kindToWhat('created', {})).toBe('创建任务')
    expect(kindToWhat('status_changed', { to: 'done' })).toBe('状态 → done')
    expect(kindToWhat('assigned', { assignee: 'bob' })).toBe('指派给 bob')
    expect(kindToWhat('completed', { result: 'OK' })).toBe('完成：OK')
  })
  it('fallback to kind for unknown', () => {
    expect(kindToWhat('something_new', {})).toBe('something_new')
  })
})

describe('mergeDetail', () => {
  it('merges events + runs + session messages, sorted by ts asc, unique ids', () => {
    const d = detail({
      events: [
        { id: 1, task_id: 't1', kind: 'created', payload: {}, created_at: tsToday(10, 0), run_id: null },
        { id: 2, task_id: 't1', kind: 'commented', payload: { body: 'hi' }, created_at: tsToday(11, 0), run_id: null },
      ],
      runs: [
        { id: 5, task_id: 't1', profile: 'arch', status: 'completed', outcome: 'success', summary: 'done', error: null, metadata: null, worker_pid: null, started_at: tsToday(9, 0), ended_at: tsToday(9, 30) } as any,
        { id: 6, task_id: 't1', profile: 'qa', status: 'running', outcome: null, summary: null, error: null, metadata: null, worker_pid: null, started_at: tsToday(12, 0), ended_at: null } as any,
      ],
      session: {
        id: 'sess1', title: null, source: 'kanban', model: 'm', started_at: tsToday(8, 0), ended_at: null,
        messages: [
          { id: 'msg1', session_id: 'sess1', role: 'user', content: '请审查', tool_call_id: null, tool_calls: null, tool_name: null, timestamp: tsToday(8, 30), token_count: null, finish_reason: null, reasoning: null },
          { id: 'msg2', session_id: 'sess1', role: 'assistant', content: '好的我来', tool_call_id: null, tool_calls: null, tool_name: null, timestamp: tsToday(8, 45), token_count: null, finish_reason: null, reasoning: null },
        ],
      },
    })
    const out = mergeDetail(d)
    // ts 升序：run5(9:00) → msg1(8:30) → msg2(8:45) → event1(10:00) → event2(11:00) → run6(12:00)
    //   实际：8:30, 8:45, 9:00, 10:00, 11:00, 12:00
    expect(out.map(e => e.ts)).toEqual([
      tsToday(8, 30), tsToday(8, 45), tsToday(9, 0), tsToday(10, 0), tsToday(11, 0), tsToday(12, 0),
    ])
    expect(out.map(e => e.id)).toEqual([
      'evt-msg-msg1', 'evt-msg-msg2', 'evt-run-5', 'evt-event-1', 'evt-event-2', 'evt-run-6',
    ])
    // kind 派生
    const byId = Object.fromEntries(out.map(e => [e.id, e]))
    expect(byId['evt-msg-msg1'].kind).toBe('A2H')        // role=user
    expect(byId['evt-msg-msg2'].kind).toBe('A2A')        // role=assistant
    expect(byId['evt-run-5'].actor).toBe('arch')
    expect(byId['evt-run-6'].pending).toBe(true)          // status=running
    // taskId 继承
    expect(out.every(e => e.taskId === 't1')).toBe(true)
  })

  it('empty detail → empty array', () => {
    expect(mergeDetail(detail())).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- event-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/adapters/event-adapter.ts`:

```ts
import type {
  KanbanTaskDetail, KanbanEvent, KanbanRun, KanbanTaskMessage,
} from '@/api/hermes/kanban'

export type EventActorKind = 'A2H' | 'A2A'

export interface CockpitEvent {
  id: string
  taskId: string
  actor: string
  kind: EventActorKind
  what: string
  when: string
  pending: boolean
  ts: number
}

function trunc(s: string | null | undefined, n = 80): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function formatWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return hm
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

export function kindToWhat(kind: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {}
  switch (kind) {
    case 'created': return '创建任务'
    case 'status_changed': return `状态 → ${p.to ?? '?'}`
    case 'assigned': return `指派给 ${p.assignee ?? '?'}`
    case 'commented': return `评论：${trunc(typeof p.body === 'string' ? p.body : '')}`
    case 'linked': return `关联父任务 ${p.parent_id ?? '?'}`
    case 'dispatched': return '派发执行'
    case 'completed': return `完成：${trunc(typeof p.result === 'string' ? p.result : '')}`
    case 'blocked': return `标记阻塞：${trunc(typeof p.reason === 'string' ? p.reason : '')}`
    default:
      if (kind.endsWith('_failed')) return `失败：${trunc(typeof p.error === 'string' ? p.error : '')}`
      return kind
  }
}

function fromEvent(taskId: string, e: KanbanEvent): CockpitEvent {
  const actor = (e.payload && typeof e.payload.actor === 'string' && e.payload.actor) || 'system'
  return {
    id: `evt-event-${e.id}`,
    taskId,
    actor,
    kind: 'A2A',
    what: kindToWhat(e.kind, e.payload),
    when: formatWhen(e.created_at),
    pending: e.kind.includes('pending'),
    ts: e.created_at,
  }
}

function fromRun(taskId: string, r: KanbanRun): CockpitEvent {
  return {
    id: `evt-run-${r.id}`,
    taskId,
    actor: r.profile ?? 'system',
    kind: 'A2A',
    what: r.outcome ? `执行：${r.outcome}` : '执行',
    when: formatWhen(r.started_at),
    pending: r.status === 'running',
    ts: r.started_at,
  }
}

function fromMessage(taskId: string, assignee: string | null, m: KanbanTaskMessage): CockpitEvent {
  const isUser = m.role === 'user'
  return {
    id: `evt-msg-${m.id}`,
    taskId,
    actor: isUser ? (assignee ?? 'user') : (m.role || 'assistant'),
    kind: isUser ? 'A2H' : 'A2A',
    what: trunc(m.content),
    when: formatWhen(m.timestamp),
    pending: false,
    ts: m.timestamp,
  }
}

export function mergeDetail(d: KanbanTaskDetail): CockpitEvent[] {
  const taskId = d.task.id
  const assignee = d.task.assignee
  const events = (d.events ?? []).map(e => fromEvent(taskId, e))
  const runs = (d.runs ?? []).map(r => fromRun(taskId, r))
  const msgs = (d.session?.messages ?? []).map(m => fromMessage(taskId, assignee, m))
  return [...events, ...runs, ...msgs].sort((a, b) => a.ts - b.ts)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- event-adapter`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/event-adapter.ts custom/client/cockpit/__tests__/event-adapter.test.ts
git commit -m "feat(cockpit): add event-adapter merging events/runs/sessions"
```

---

### Task 7: history-adapter（events + comments 合并 + action 派生）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/history-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/history-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/history-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeTimeline, deriveAction } from '@/custom/cockpit/adapters/history-adapter'

// 聚合路由返回的原始 item 形态（见 Task 23 的 patch 079）
describe('deriveAction', () => {
  it('status_changed to done → 决策', () => {
    expect(deriveAction('event', { kind: 'status_changed', payload: { to: 'done' } })).toBe('决策')
  })
  it('status_changed to review → 审批', () => {
    expect(deriveAction('event', { kind: 'status_changed', payload: { to: 'review' } })).toBe('审批')
  })
  it('commented event → 补充', () => {
    expect(deriveAction('event', { kind: 'commented' })).toBe('补充')
  })
  it('comment source → 补充', () => {
    expect(deriveAction('comment', {})).toBe('补充')
  })
  it('linked → 关联', () => {
    expect(deriveAction('event', { kind: 'linked' })).toBe('关联')
  })
  it('assigned → 委派', () => {
    expect(deriveAction('event', { kind: 'assigned' })).toBe('委派')
  })
  it('completed → 决策', () => {
    expect(deriveAction('event', { kind: 'completed' })).toBe('决策')
  })
  it('other → 评估', () => {
    expect(deriveAction('event', { kind: 'something' })).toBe('评估')
  })
})

describe('mergeTimeline', () => {
  it('merges items sorted desc by ts, assigns action/title/archived', () => {
    const items = [
      { source: 'event', id: 'evt-1', taskId: 't1', taskTitle: 'T1', taskArchived: false,
        ts: 100, kind: 'status_changed', payload: { to: 'review' } },
      { source: 'comment', id: 'cmt-2', taskId: 't2', taskTitle: 'T2', taskArchived: true,
        ts: 200, author: 'alice', body: '回复内容' },
    ]
    const out = mergeTimeline(items)
    expect(out).toEqual([
      { id: 'h-cmt-2', when: expect.any(String), taskId: 't2', action: '补充', title: '回复内容', archived: true },
      { id: 'h-evt-1', when: expect.any(String), taskId: 't1', action: '审批', title: '状态 → review', archived: false },
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- history-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/adapters/history-adapter.ts`:

```ts
import { formatWhen } from './event-adapter'
import { kindToWhat } from './event-adapter'

export interface HistoryItem {
  id: string
  when: string
  taskId: string
  action: string
  title: string
  archived: boolean
}

/** 聚合路由返回的原始 item（见 patch 079） */
export interface TimelineRawItem {
  source: 'event' | 'comment'
  id: string
  taskId: string
  taskTitle: string
  taskArchived: boolean
  ts: number
  // event 字段
  kind?: string
  payload?: Record<string, unknown> | null
  // comment 字段
  author?: string
  body?: string
}

export function deriveAction(source: 'event' | 'comment', item: { kind?: string; payload?: Record<string, unknown> | null }): string {
  if (source === 'comment') return '补充'
  const kind = item.kind ?? ''
  const to = item.payload?.to
  if (kind === 'status_changed' && to === 'done') return '决策'
  if (kind === 'status_changed' && to === 'review') return '审批'
  if (kind === 'commented') return '补充'
  if (kind === 'linked') return '关联'
  if (kind === 'assigned') return '委派'
  if (kind === 'completed') return '决策'
  return '评估'
}

export function mergeTimeline(items: TimelineRawItem[]): HistoryItem[] {
  return items
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map(it => ({
      id: `h-${it.id}`,
      when: formatWhen(it.ts),
      taskId: it.taskId,
      action: deriveAction(it.source, { kind: it.kind, payload: it.payload }),
      title: it.source === 'comment'
        ? (it.body ?? '')
        : kindToWhat(it.kind ?? '', it.payload ?? null),
      archived: it.taskArchived,
    }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- history-adapter`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/history-adapter.ts custom/client/cockpit/__tests__/history-adapter.test.ts
git commit -m "feat(cockpit): add history-adapter merging events+comments"
```

---

### Task 8: topology-adapter（中心辐射节点构建）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/topology-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/topology-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/topology-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTopology, MAX_NODES } from '@/custom/cockpit/adapters/topology-adapter'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'

const task = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1', title: '中心任务', priority: 'P1', status: 'todo',
  assignee: 'alice', workspace: '~/ws', tenant: null, ...over,
})

const detail = (over: Partial<KanbanTaskDetail>): KanbanTaskDetail => ({
  task: { id: 't1', title: '', body: null, assignee: null, status: 'todo', priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
  latest_summary: null, comments: [], events: [], runs: [],
  ...over,
})

// mock parseTenant：matrix/group/session → 有 routeTarget；plain → 无
vi.mock('@/custom/cockpit/adapters/collab-adapter', () => ({
  parseTenant: (t: string | null) => t && t.startsWith('matrix:')
    ? { kind: 'matrix', label: t.split(':').slice(-1)[0], routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: '!r' } }, raw: t }
    : null,
}))
import { vi } from 'vitest'

describe('buildTopology', () => {
  it('center node always present and focused', () => {
    const r = buildTopology(task(), null, [])
    expect(r.nodes.find(n => n.kind === 'center')?.focus).toBe(true)
  })

  it('parent/child from detail, clickable to selectTask', () => {
    const d = detail({ parents: ['p1'], children: ['c1', 'c2'] })
    const siblingTasks: CockpitTask[] = [
      task({ id: 'p1', title: '父任务' }),
      task({ id: 'c1', title: '子1' }),
      task({ id: 'c2', title: '子2' }),
    ]
    const r = buildTopology(task(), d, siblingTasks)
    const parent = r.nodes.find(n => n.kind === 'parent')
    const children = r.nodes.filter(n => n.kind === 'child')
    expect(parent?.label).toBe('父任务')
    expect(parent?.target?.taskId).toBe('p1')
    expect(children.map(n => n.label).sort()).toEqual(['子1', '子2'])
  })

  it('missing sibling task (id not in list) → use id as label', () => {
    const d = detail({ parents: ['ghost'] })
    const r = buildTopology(task(), d, [])
    const parent = r.nodes.find(n => n.kind === 'parent')
    expect(parent?.label).toBe('ghost')
    expect(parent?.target?.taskId).toBe('ghost')
  })

  it('person nodes from assignee + created_by + current user, dedup', () => {
    const d = detail({
      task: { id: 't1', title: '', body: null, assignee: 'alice', status: 'todo', priority: 0, created_by: 'bob', created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
    })
    const r = buildTopology(task({ assignee: 'alice' }), d, [], 'currentUser')
    const people = r.nodes.filter(n => n.kind === 'person').map(n => n.label).sort()
    expect(people).toEqual(['alice', 'bob', 'currentUser'])
  })

  it('channel node from tenant', () => {
    const r = buildTopology(task({ tenant: 'matrix:!r:s.ms:Auth联调' }), null, [])
    const ch = r.nodes.find(n => n.kind === 'channel')
    expect(ch?.label).toBe('Auth联调')
    expect(ch?.target?.routeTarget).toEqual({ name: 'hermes.matrixChatRoom', params: { roomId: '!r' } })
  })

  it('folds to MAX_NODES with +N indicator', () => {
    const d = detail({ parents: Array.from({ length: MAX_NODES + 5 }, (_, i) => `p${i}`) })
    const r = buildTopology(task(), d, [])
    expect(r.nodes.length).toBe(MAX_NODES + 1) // MAX_NODES 个 + 1 个折叠指示
    expect(r.nodes.some(n => n.label.startsWith('+') && n.label.includes(MAX_NODES.toString()))).toBe(true)
  })

  it('relations: center → each non-center node', () => {
    const d = detail({ parents: ['p1'], children: ['c1'] })
    const r = buildTopology(task(), d, [task({ id: 'p1', title: 'P' }), task({ id: 'c1', title: 'C' })], 'me')
    const centerId = r.nodes.find(n => n.kind === 'center')!.id
    const nonCenter = r.nodes.filter(n => n.kind !== 'center' && !n.label.startsWith('+'))
    for (const n of nonCenter) {
      expect(r.relations.some(rel => rel.from === centerId && rel.to === n.id)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- topology-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/adapters/topology-adapter.ts`:

```ts
import type { RouteLocationRaw } from 'vue-router'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'
import type { CockpitTask } from './task-adapter'
import { parseTenant } from './collab-adapter'

export type GraphNodeRelation = 'center' | 'parent' | 'child' | 'person' | 'channel' | 'folded'

export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeRelation
  focus: boolean
  target?: {
    taskId?: string
    routeTarget?: RouteLocationRaw
  }
}

export interface GraphRelation {
  id: string
  from: string
  to: string
}

export interface TopologyResult {
  nodes: GraphNode[]
  relations: GraphRelation[]
}

export const MAX_NODES = 12

export function buildTopology(
  task: CockpitTask | null,
  detail: KanbanTaskDetail | null | undefined,
  allTasks: CockpitTask[],
  currentUser?: string,
): TopologyResult {
  const nodes: GraphNode[] = []
  const relations: GraphRelation[] = []
  if (!task) return { nodes, relations }

  // center
  const centerId = 'g-center'
  nodes.push({
    id: centerId, taskId: task.id, label: task.title, kind: 'center', focus: true,
  })

  // parents / children
  const addTaskNode = (rel: 'parent' | 'child', id: string) => {
    const sibling = allTasks.find(t => t.id === id)
    nodes.push({
      id: `g-${rel}-${id}`, taskId: id,
      label: sibling?.title ?? id, kind: rel, focus: false,
      target: { taskId: id },
    })
  }
  for (const pid of detail?.parents ?? []) addTaskNode('parent', pid)
  for (const cid of detail?.children ?? []) addTaskNode('child', cid)

  // persons (dedup)
  const persons = new Set<string>()
  if (task.assignee && task.assignee !== '未分配') persons.add(task.assignee)
  if (detail?.task.created_by) persons.add(detail.task.created_by)
  if (currentUser) persons.add(currentUser)
  for (const p of persons) {
    nodes.push({ id: `g-person-${p}`, taskId: task.id, label: p, kind: 'person', focus: false })
  }

  // channel from tenant
  const parsed = parseTenant(task.tenant)
  if (parsed && parsed.kind !== 'plain') {
    nodes.push({
      id: `g-channel-${task.id}`, taskId: task.id,
      label: parsed.label, kind: 'channel', focus: false,
      target: { routeTarget: parsed.routeTarget },
    })
  }

  // 折叠：超过 MAX_NODES 时裁剪并加 +N 指示节点
  if (nodes.length > MAX_NODES) {
    const overflow = nodes.length - MAX_NODES
    const kept = [nodes[0], ...nodes.slice(1, MAX_NODES)]
    kept.push({
      id: 'g-folded', taskId: task.id,
      label: `+${overflow} 更多`, kind: 'folded', focus: false,
    })
    nodes.splice(0, nodes.length, ...kept)
  }

  // relations: center → 每个非 center/非 folded
  const center = nodes[0]
  for (const n of nodes.slice(1)) {
    if (n.kind === 'folded') continue
    relations.push({ id: `rel-${center.id}-${n.id}`, from: center.id, to: n.id })
  }

  return { nodes, relations }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- topology-adapter`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/topology-adapter.ts custom/client/cockpit/__tests__/topology-adapter.test.ts
git commit -m "feat(cockpit): add topology-adapter (radial graph builder)"
```

---

### Task 9: chat-adapter（matrix/chat/group 消息归一）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/chat-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/chat-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/chat-adapter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

// MatrixEvent 是 SDK 实例，用方法访问字段。mock 一个最小实现。
const mkMatrixEvent = (over: Partial<{ id: string; sender: string; content: { body?: string }; ts: number }> = {}) => ({
  getId: () => over.id ?? '$1',
  getSender: () => over.sender ?? '@alice:ms.org',
  getContent: () => over.content ?? { body: 'hello' },
  getTs: () => over.ts ?? 1000,
})

vi.mock('@/custom/cockpit/store/cockpit-kv', () => ({})) // 防止间接依赖
import { fromMatrix, fromChat, fromGroup } from '@/custom/cockpit/adapters/chat-adapter'

describe('fromMatrix', () => {
  it('maps SDK event via methods; isMe by currentUserId', () => {
    const ev = mkMatrixEvent({ id: '$e1', sender: '@me:ms.org', content: { body: 'hi' }, ts: 2000 })
    const out = fromMatrix(ev as any, '@me:ms.org', 'ch1')
    expect(out).toEqual({
      id: '$e1', channelId: 'ch1', author: '@me:ms.org', isMe: true, text: 'hi', ts: 2000,
    })
  })
  it('other sender → isMe false', () => {
    const out = fromMatrix(mkMatrixEvent({ sender: '@bob:ms.org' }) as any, '@me:ms.org', 'ch1')
    expect(out.isMe).toBe(false)
  })
})

describe('fromChat', () => {
  it('maps chatStore message (role: user → isMe when sender is current)', () => {
    const out = fromChat({
      id: 'm1', role: 'user', content: '请审查', timestamp: 5000,
    } as any, 'me', 'ch1')
    expect(out).toEqual({
      id: 'm1', channelId: 'ch1', author: 'me', isMe: true, text: '请审查', ts: 5000,
    })
  })
  it('assistant role → isMe false, author = role', () => {
    const out = fromChat({ id: 'm2', role: 'assistant', content: 'ok', timestamp: 6 } as any, 'me', 'ch1')
    expect(out.isMe).toBe(false)
    expect(out.author).toBe('assistant')
  })
})

describe('fromGroup', () => {
  it('maps group message (senderId === currentUserId → isMe)', () => {
    const out = fromGroup({
      id: 'g1', senderId: 'me', senderName: '我', content: '回复', timestamp: 9,
    } as any, 'me', 'ch1')
    expect(out).toEqual({
      id: 'g1', channelId: 'ch1', author: '我', isMe: true, text: '回复', ts: 9,
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- chat-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/adapters/chat-adapter.ts`:

```ts
// 三类聊天消息归一为 ChatMessage。
// matrix 元素是 matrix-js-sdk 的 MatrixEvent 实例（用方法访问字段）；
// chat/group 元素是 plain object。

export interface ChatMessage {
  id: string
  channelId: string
  author: string
  isMe: boolean
  text: string
  ts: number
}

/** MatrixEvent 的最小形状（duck typing，避免直接 import SDK 类型） */
export interface MatrixLikeEvent {
  getId(): string
  getSender(): string
  getContent(): { body?: string }
  getTs(): number
}

export function fromMatrix(ev: MatrixLikeEvent, currentUserId: string, channelId: string): ChatMessage {
  const sender = ev.getSender()
  return {
    id: ev.getId(),
    channelId,
    author: sender,
    isMe: sender === currentUserId,
    text: ev.getContent()?.body ?? '',
    ts: ev.getTs(),
  }
}

/** chatStore.messages 元素形状（Message 接口的部分字段） */
export interface ChatLikeMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'command'
  content: string
  timestamp: number
}

export function fromChat(m: ChatLikeMessage, currentUserId: string, channelId: string): ChatMessage {
  const isUser = m.role === 'user'
  return {
    id: m.id,
    channelId,
    author: isUser ? currentUserId : m.role,
    isMe: isUser, // 简化：role=user 即视为当前用户发出
    text: m.content,
    ts: m.timestamp,
  }
}

/** groupChatStore.sortedMessages 元素形状（ChatMessage from api） */
export interface GroupLikeMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
}

export function fromGroup(m: GroupLikeMessage, currentUserId: string, channelId: string): ChatMessage {
  return {
    id: m.id,
    channelId,
    author: m.senderName || m.senderId,
    isMe: m.senderId === currentUserId,
    text: m.content,
    ts: m.timestamp,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- chat-adapter`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/chat-adapter.ts custom/client/cockpit/__tests__/chat-adapter.test.ts
git commit -m "feat(cockpit): add chat-adapter unifying matrix/chat/group messages"
```

---

### Task 10: kanban-extras（search-sessions + workspace-files + timeline client）

**Files:**
- Create: `overlay/custom/client/cockpit/api/kanban-extras.ts`
- Test: `overlay/custom/client/cockpit/__tests__/kanban-extras.test.ts`

- [ ] **Step 1: 写失败测试**

Create `overlay/custom/client/cockpit/__tests__/kanban-extras.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requestMock = vi.fn()
vi.mock('@/api/client', () => ({ request: (...args: unknown[]) => requestMock(...args) }))

import { searchSessions, listWorkspaceFiles, getTimeline } from '@/custom/cockpit/api/kanban-extras'

beforeEach(() => requestMock.mockReset())

describe('searchSessions', () => {
  it('calls /api/hermes/kanban/search-sessions with task_id+profile', async () => {
    requestMock.mockResolvedValue({ results: [{ id: 's1', title: 't' }] })
    const out = await searchSessions('task-1', 'arch')
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/hermes/kanban/search-sessions?task_id=task-1&profile=arch'),
    )
    expect(out).toEqual([{ id: 's1', title: 't' }])
  })
  it('encodes special chars', async () => {
    requestMock.mockResolvedValue({ results: [] })
    await searchSessions('t space', 'p@')
    const call = requestMock.mock.calls[0][0] as string
    expect(call).toContain('task_id=t%20space')
    expect(call).toContain('profile=p%40')
  })
})

describe('listWorkspaceFiles', () => {
  it('returns mapped FileNode[] from entries', async () => {
    requestMock.mockResolvedValue({
      path: '', entries: [
        { name: 'src', isDir: true, size: 0, modified: 1, children: [
          { name: 'a.ts', isDir: false, size: 10, modified: 2 },
        ] },
        { name: 'p.json', isDir: false, size: 5, modified: 3 },
      ],
    })
    const out = await listWorkspaceFiles('t1', '', 2)
    expect(out).toEqual([
      { id: 'src', name: 'src', isDir: true, children: [
        { id: 'src/a.ts', name: 'a.ts', isDir: false },
      ] },
      { id: 'p.json', name: 'p.json', isDir: false },
    ])
  })
})

describe('getTimeline', () => {
  it('calls /timeline with limit/since', async () => {
    requestMock.mockResolvedValue({ items: [], total: 0 })
    await getTimeline({ limit: 50, since: 1000 })
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/hermes/kanban/timeline?limit=50&since=1000'),
    )
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- kanban-extras`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

Create `overlay/custom/client/cockpit/api/kanban-extras.ts`:

```ts
import { request } from '@/api/client'

/** kanban 端点无封装，参考 KanbanTaskDrawer.vue:104-106 自建 */
export interface SessionSearchResult {
  id: string
  title?: string
  [k: string]: unknown
}

export async function searchSessions(taskId: string, profile: string): Promise<SessionSearchResult[]> {
  const q = new URLSearchParams({ task_id: taskId, profile })
  const res = await request<{ results: SessionSearchResult[] }>(
    `/api/hermes/kanban/search-sessions?${q}`,
  )
  return res.results ?? []
}

// ── workspace-files（patch 078）──
interface RawFileEntry {
  name: string
  isDir: boolean
  size: number
  modified: number
  children?: RawFileEntry[]
}
export interface FileNode {
  id: string       // 相对根的路径
  name: string
  isDir: boolean
  children?: FileNode[]
}

function mapEntries(entries: RawFileEntry[], parentPath: string): FileNode[] {
  return entries.map(e => {
    const id = parentPath ? `${parentPath}/${e.name}` : e.name
    const node: FileNode = { id, name: e.name, isDir: e.isDir }
    if (e.isDir && e.children) node.children = mapEntries(e.children, id)
    return node
  })
}

export async function listWorkspaceFiles(taskId: string, sub = '', depth = 2): Promise<FileNode[]> {
  const q = new URLSearchParams({ task_id: taskId, depth: String(depth) })
  if (sub) q.set('path', sub)
  const res = await request<{ path: string; entries: RawFileEntry[] }>(
    `/api/hermes/kanban/workspace-files?${q}`,
  )
  return mapEntries(res.entries ?? [], sub)
}

// ── timeline 聚合（patch 079）──
export interface TimelineItem {
  source: 'event' | 'comment'
  id: string
  taskId: string
  taskTitle: string
  taskArchived: boolean
  ts: number
  kind?: string
  payload?: Record<string, unknown> | null
  author?: string
  body?: string
}

export async function getTimeline(opts: { limit?: number; since?: number } = {}): Promise<{ items: TimelineItem[]; total: number }> {
  const q = new URLSearchParams()
  if (opts.limit != null) q.set('limit', String(opts.limit))
  if (opts.since != null) q.set('since', String(opts.since))
  const qs = q.toString()
  const path = `/api/hermes/kanban/timeline${qs ? `?${qs}` : ''}`
  return request<{ items: TimelineItem[]; total: number }>(path)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- kanban-extras`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/api/kanban-extras.ts custom/client/cockpit/__tests__/kanban-extras.test.ts
git commit -m "feat(cockpit): add kanban-extras client (search-sessions/workspace-files/timeline)"
```

---

### Task 11: 删除 seed.ts + 清理 CockpitView onMounted

**Files:**
- Delete: `overlay/custom/client/cockpit/fixtures/seed.ts`
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`

- [ ] **Step 1: 删除 seed.ts 并验证 CockpitView 当前引用**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
rm custom/client/cockpit/fixtures/seed.ts
```

- [ ] **Step 2: 修改 CockpitView.vue 移除 loadSeed 引用**

Modify `overlay/custom/client/cockpit/views/CockpitView.vue`。找到 `onMounted(() => loadSeed(store))`（约第 31 行）与其上的 `import { loadSeed } from '@/custom/cockpit/fixtures/seed'`（约第 18 行）。替换为：

```ts
// 在 import 区，移除 loadSeed 那一行
// 在 onMounted 行，替换为：
onMounted(() => store.bootstrap())
```

具体：
- 删除第 18 行 `import { loadSeed } from '@/custom/cockpit/fixtures/seed'`
- 第 31 行 `onMounted(() => loadSeed(store))` 改为 `onMounted(() => store.bootstrap())`

> 注意：`store.bootstrap()` 在 Task 12 才实现，此时 TS 会报错。**这是预期的**——Task 12 紧随其后修复。若 CI 在此中断，可将此任务与 Task 12 合并提交。

- [ ] **Step 3: 跑全量测试观察（预期 cockpit-store 相关失败，因 store 未重构）**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test`
Expected: 现有 cockpit-store.test.ts 等可能失败（store 还未提供 bootstrap）。**不在此 task 修复**，留到 Task 12。

- [ ] **Step 4: 提交（与 Task 12 合并提交，避免中间态破坏）**

**不单独提交**。继续 Task 12，最终一起 commit。

---

### Task 12: store/cockpit.ts 重构（派生态 + 客户端态 + bootstrap）

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

> **这是最大的一个 task**。按"分块替换 + 测试驱动"进行。建议分 5 个子提交（12a–12e）以降低风险。

#### Task 12a: 重构 store —— 派生态 + bootstrap 骨架

- [ ] **Step 1: 重写 cockpit-store.test.ts 为 mock kanban 模式**

Replace 整个 `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` 内容（保留文件头指令与 helper）。骨架：

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// mock kanban store + 依赖的聊天 store + extras
const mockKanbanTasks = vi.hoisted(() => [])
const fetchTasks = vi.fn(async () => { /* 由用例填充 mockKanbanTasks */ })
const fetchAssignees = vi.fn(async () => {})
const startEventStream = vi.fn()
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    tasks: mockKanbanTasks,
    fetchTasks, fetchAssignees, startEventStream,
  }),
}))
const searchSessions = vi.fn(async () => [])
const listWorkspaceFiles = vi.fn(async () => [])
const getTimeline = vi.fn(async () => ({ items: [], total: 0 }))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({
  searchSessions, listWorkspaceFiles, getTimeline,
}))
const getTask = vi.fn(async () => null)
const addComment = vi.fn(async () => ({ ok: true }))
vi.mock('@/api/hermes/kanban', () => ({
  getTask, addComment,
  // 保留其他被引用的导出（类型）—— 由于是 type-only import，编译期擦除
}))
// 聊天 store mock（bootstrap 会调）
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [], disconnect: vi.fn() }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))

import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

beforeEach(() => {
  setActivePinia(createPinia())
  mockKanbanTasks.splice(0, mockKanbanTasks.length)
  fetchTasks.mockClear(); fetchAssignees.mockClear(); startEventStream.mockClear()
  searchSessions.mockClear(); listWorkspaceFiles.mockClear(); getTimeline.mockClear()
  getTask.mockClear(); addComment.mockClear()
  localStorage.clear()
})

describe('cockpit store bootstrap + 派生态', () => {
  it('bootstrap pulls kanban tasks and selects first', async () => {
    mockKanbanTasks.push(
      { id: 't1', title: 'T1', body: null, assignee: 'a', status: 'todo', priority: 3, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: '~/w', tenant: null, project_id: null, result: null, skills: null, latest_summary: null } as any,
    )
    const s = useCockpitStore()
    await s.bootstrap()
    expect(fetchTasks).toHaveBeenCalled()
    expect(s.selectedTaskId).toBe('t1')
    // tasks 是 computed 派生（priority 3 → P0）
    expect(s.tasks[0].priority).toBe('P0')
  })

  it('attention derived from status', async () => {
    mockKanbanTasks.push(
      { id: 'b1', title: '阻塞任务', status: 'blocked', priority: 2, assignee: null, body: null, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null, latest_summary: null } as any,
      { id: 'r1', title: '评审任务', status: 'review', priority: 1, assignee: null, body: null, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null, latest_summary: null } as any,
    )
    const s = useCockpitStore()
    await s.bootstrap()
    expect(s.attention).toHaveLength(2)
    expect(s.attention.find(a => a.taskId === 'b1')!.severity).toBe('high')
    expect(s.attention.find(a => a.taskId === 'r1')!.severity).toBe('medium')
  })

  it('tasksByTenant groups by tenant field', async () => {
    mockKanbanTasks.push(
      { id: 't1', title: 'A', tenant: 'team-x', status: 'todo', priority: 0, assignee: null, body: null, created_by: null, created_at: 1, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, project_id: null, result: null, skills: null, latest_summary: null } as any,
      { id: 't2', title: 'B', tenant: null, status: 'todo', priority: 0, assignee: null, body: null, created_by: null, created_at: 2, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null, project_id: null, result: null, skills: null, latest_summary: null } as any,
    )
    const s = useCockpitStore()
    await s.bootstrap()
    expect(Object.keys(s.tasksByTenant)).toEqual(expect.arrayContaining(['team-x', '(未指定)']))
    expect(s.tasksByTenant['team-x']).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- cockpit-store`
Expected: FAIL（store 还未重构，tasks/attention 不是 computed，无 bootstrap）

- [ ] **Step 3: 重构 store**

Replace `overlay/custom/client/cockpit/store/cockpit.ts` 整个文件。**完整内容**：

```ts
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useKanbanStore } from '@/stores/hermes/kanban'
import * as kanbanApi from '@/api/hermes/kanban'
import { useChatStore } from '@/stores/hermes/chat'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import * as extras from '@/custom/cockpit/api/kanban-extras'
import * as kv from './cockpit-kv'
import * as taskAdapter from '../adapters/task-adapter'
import * as attentionAdapter from '../adapters/attention-adapter'
import * as collabAdapter from '../adapters/collab-adapter'
import * as eventAdapter from '../adapters/event-adapter'
import * as topologyAdapter from '../adapters/topology-adapter'
import * as historyAdapter from '../adapters/history-adapter'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'
import type { ChatMessage } from '../adapters/chat-adapter'
import type { RouteLocationRaw } from 'vue-router'

// 重新导出类型（供组件继续从 store 导入）
export type CockpitTask = taskAdapter.CockpitTask
export type CockpitPriority = taskAdapter.CockpitPriority
export type CockpitStatus = taskAdapter.CockpitStatus
export type AttentionSeverity = attentionAdapter.AttentionSeverity
export type AttentionItem = attentionAdapter.AttentionItem
export type GraphNode = topologyAdapter.GraphNode
export type GraphRelation = topologyAdapter.GraphRelation
export type GraphNodeRelation = topologyAdapter.GraphNodeRelation
export type CockpitEvent = eventAdapter.CockpitEvent
export type HistoryItem = historyAdapter.HistoryItem
export type HistoryFilters = { actions: string[]; archived: 'all' | 'only' | 'exclude' }
export type WorkspaceMode = 'work' | 'chat' | 'term'
export type ChannelKind = 'matrix' | 'chat' | 'group'
export type WorkDecision = kv.WorkDecision
export type DraftWorkItem = kv.DraftWorkItem
export type A2uiTemplate = kv.A2uiTemplate
export type ColumnKey = 'left' | 'mid' | 'right'
export type TerminalLineKind = 'prompt' | 'info' | 'ok' | 'warn' | 'dim'
export interface TerminalLine { kind: TerminalLineKind; text: string }

export interface CockpitFilters {
  priorities: CockpitPriority[]
  statuses: taskAdapter.CockpitStatusBucket[]
  tenants: string[]
}

export interface CollabChannel {
  id: string
  taskId: string
  kind: ChannelKind
  label: string
  routeTarget?: RouteLocationRaw
}

export interface FileNode { id: string; name: string; isDir: boolean; children?: FileNode[] }

const PRIORITY_ORDER: Record<CockpitPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

export const useCockpitStore = defineStore('cockpit', () => {
  const kanban = useKanbanStore()
  const chatStore = useChatStore()
  const groupStore = useGroupChatStore()
  const matrixClient = useMatrixClientStore()
  const matrixRoom = useMatrixRoomStore()
  const matrixComposer = useMatrixComposerStore()

  // ── 派生态（computed，单一数据源）──
  const tasks = computed(() => kanban.tasks.map(taskAdapter.toCockpitTask))
  const attention = computed(() =>
    kanban.tasks.map(attentionAdapter.toAttention).filter((x): x is AttentionItem => x !== null),
  )
  const attentionCount = computed(() => attention.value.length)

  // ── 客户端态 ──
  const selectedTaskId = ref<string | null>(null)
  const filters = ref<CockpitFilters>({ priorities: [], statuses: [], tenants: [] })
  const collapsed = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  const workspaceMode = ref<WorkspaceMode>('work')
  const activeChannelId = ref<string | null>(null)
  const maximized = ref(false)
  const terminalMode = ref(false)
  const terminalLines = ref<TerminalLine[]>([
    { kind: 'dim', text: 'Claude Code · sandbox 模式 · 根目录由当前任务 Workspace 决定' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'info', text: '任务上下文已加载，沙箱就绪，读写限定在根目录内' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'warn', text: '! 输入指令开始编程，如「打开 refresh.ts 看并发问题」' },
  ])
  const historyOpen = ref(false)
  const historyFilters = ref<HistoryFilters>({ actions: [], archived: 'all' })
  const archivedMode = ref(false)
  const templateManagerOpen = ref(false)
  const focusedGraphNodeId = ref<string | null>(null)
  const selectedGraphNodeIds = ref<Record<string, string[]>>({})
  // 协作图画布变换（决策 #14）
  const canvasTransform = ref({ x: 0, y: 0, scale: 1 })

  // ── 懒加载态 ──
  const _detailCache = ref<Record<string, KanbanTaskDetail>>({})
  const _fileTreeCache = ref<Record<string, FileNode[]>>({})
  const events = ref<CockpitEvent[]>([])
  const fileTrees = ref<Record<string, FileNode[]>>({})
  const history = ref<HistoryItem[]>([])

  // ── selectedTask / 派生 getter ──
  const selectedTask = computed(() =>
    tasks.value.find(t => t.id === selectedTaskId.value) ?? null,
  )

  const sortedTasks = computed(() =>
    [...tasks.value].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  )

  const filteredTasks = computed(() =>
    sortedTasks.value.filter(t => {
      const f = filters.value
      const okArr = <T,>(arr: T[], v: T) => arr.length === 0 || arr.includes(v)
      return okArr(f.priorities, t.priority)
        && okArr(f.statuses, taskAdapter.bucketStatus(t.status))
        && okArr(f.tenants, t.tenant ?? '(未指定)')
    }),
  )

  const tasksByTenant = computed(() => {
    const map: Record<string, CockpitTask[]> = {}
    for (const t of filteredTasks.value) {
      const key = t.tenant ?? '(未指定)'
      ;(map[key] ??= []).push(t)
    }
    return map
  })

  // ── 时序事件 ──
  const eventsForSelectedTask = computed(() =>
    selectedTaskId.value
      ? events.value.filter(e => e.taskId === selectedTaskId.value).sort((a, b) => a.ts - b.ts)
      : [],
  )

  const eventsForTimeline = computed(() => {
    // focusedGraphNodeId 在新协作图设计中用于"频道/任务"级时序筛选；保留接口
    return eventsForSelectedTask.value
  })

  function recentEventsForTimeline(threshold: number) {
    const all = eventsForTimeline.value
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    return { visible: all.slice(all.length - threshold), folded: all.slice(0, all.length - threshold) }
  }
  function recentEventsForSelectedTask(threshold: number) { return recentEventsForTimeline(threshold) }

  // ── 协作图 ──
  const topologyForSelectedTask = computed(() => {
    const detail = selectedTaskId.value ? _detailCache.value[selectedTaskId.value] : undefined
    return topologyAdapter.buildTopology(selectedTask.value, detail, tasks.value)
  })
  const relationsForSelectedTask = computed(() => topologyForSelectedTask.value.relations)

  // ── 频道（parseTenant）──
  const channels = computed<CollabChannel[]>(() => {
    const t = selectedTask.value
    if (!t) return []
    const parsed = collabAdapter.parseTenant(t.tenant)
    if (!parsed || parsed.kind === 'plain') return []
    return [{
      id: `ch-${t.id}`, taskId: t.id,
      kind: parsed.kind === 'session' ? 'chat' : parsed.kind,
      label: parsed.label, routeTarget: parsed.routeTarget,
    }]
  })
  const channelsForSelectedTask = computed(() => channels.value)
  const activeChannel = computed(() => channels.value.find(c => c.id === activeChannelId.value) ?? null)

  // ── 文件树 ──
  const filesForSelectedTask = computed(() =>
    selectedTaskId.value ? (fileTrees.value[selectedTaskId.value] ?? []) : [],
  )

  // ── 工作项（localStorage）──
  const workItemForSelectedTask = computed(() => {
    const id = selectedTaskId.value
    return id ? kv.loadDraft(id) : null
  })

  // ── 历史 ──
  const filteredHistory = computed(() =>
    history.value.filter(h => {
      const f = historyFilters.value
      const actionOk = f.actions.length === 0 || f.actions.includes(h.action)
      const archOk = f.archived === 'all' ? true : f.archived === 'only' ? h.archived : !h.archived
      return actionOk && archOk
    }),
  )

  // ── bootstrap ──
  async function bootstrap() {
    await Promise.allSettled([
      kanban.fetchTasks(),
      kanban.fetchAssignees(),
      chatStore.loadSessions(),
      groupStore.connect().then(() => groupStore.loadRooms()).catch(() => {}),
      matrixClient.initClient(),
    ])
    if (kanban.tasks.length) await selectTask(kanban.tasks[0].id)
    kanban.startEventStream?.()
  }

  async function selectTask(id: string | null) {
    selectedTaskId.value = id
    focusedGraphNodeId.value = null
    archivedMode.value = false
    if (!id) { events.value = []; return }
    await loadTaskDetail(id)
  }

  async function loadTaskDetail(id: string) {
    try {
      const detail = _detailCache.value[id] ?? await kanbanApi.getTask(id)
      _detailCache.value[id] = detail
      events.value = eventAdapter.mergeDetail(detail)
      // 可选：拉 agent 会话消息（失败不阻塞）
      const profile = detail.task.assignee ?? undefined
      if (profile) extras.searchSessions(id, profile).catch(() => {}).then(res => {
        if (!res || !res.length) return
        // searchSessions 返回会话列表，cockpit 不直接消费消息（mergeDetail 已从 detail.session 取）
        // 此处仅作占位扩展点
      })
    } catch {
      events.value = []
    }
    if (!_fileTreeCache.value[id]) {
      try {
        _fileTreeCache.value[id] = await extras.listWorkspaceFiles(id)
        fileTrees.value = { ..._fileTreeCache.value }
      } catch {
        fileTrees.value = { ...fileTrees.value, [id]: [] }
      }
    }
  }

  // ── WebSocket 联动：tasks 引用变化 → 选中任务 detail invalidate ──
  watch(() => kanban.tasks, (newTasks) => {
    const id = selectedTaskId.value
    if (!id || !newTasks.some(t => t.id === id)) return
    if (_detailCache.value[id]) {
      delete _detailCache.value[id]
      loadTaskDetail(id)
    }
  })

  // ── 工作区/折叠/筛选 ──
  function toggleCollapsed(col: ColumnKey) { collapsed.value[col] = !collapsed.value[col] }
  function toggleFilter<K extends keyof CockpitFilters>(key: K, value: CockpitFilters[K][number]) {
    const arr = filters.value[key] as CockpitFilters[K][number][]
    const i = arr.indexOf(value)
    if (i >= 0) arr.splice(i, 1) else arr.push(value)
  }
  function setWorkspaceMode(mode: WorkspaceMode) { workspaceMode.value = mode }
  function toggleMaximized() { maximized.value = !maximized.value }

  // ── 文件/节点 ──
  const selectedFileId = ref<string | null>(null)
  function selectFile(id: string | null) { selectedFileId.value = id }
  function toggleGraphNode(taskId: string, nodeId: string) {
    const cur = selectedGraphNodeIds.value[taskId] ?? []
    const i = cur.indexOf(nodeId)
    if (i >= 0) cur.splice(i, 1) else cur.push(nodeId)
    selectedGraphNodeIds.value = { ...selectedGraphNodeIds.value, [taskId]: cur }
  }
  function focusOnGraphNodeForTimeline(nodeId: string) {
    focusedGraphNodeId.value = focusedGraphNodeId.value === nodeId ? null : nodeId
  }

  // ── 工作项 ──
  function updateWorkItem(patch: Partial<DraftWorkItem>) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, patch)
  }
  function toggleRiskTag(tag: string) {
    const id = selectedTaskId.value
    if (!id) return
    const cur = kv.loadDraft(id)
    if (!cur) return
    const i = cur.riskTags.indexOf(tag)
    if (i >= 0) cur.riskTags.splice(i, 1) else cur.riskTags.push(tag)
    kv.saveDraft(id, { riskTags: cur.riskTags })
  }
  async function submitWorkItem() {
    const id = selectedTaskId.value
    const draft = id ? kv.loadDraft(id) : null
    if (!id || !draft) return
    const text = `[决策:${draft.decision}] 风险:${draft.riskTags.join(',')} ${draft.opinion}`.trim()
    await kanbanApi.addComment(id, { body: text })
    kv.clearDraft(id)
    delete _detailCache.value[id]
    await loadTaskDetail(id)
  }

  // ── 频道（聊天精简壳）──
  function selectChannel(id: string | null) {
    activeChannelId.value = id
    if (id) workspaceMode.value = 'chat'
  }
  async function sendMessage(text: string): Promise<void> {
    const ch = activeChannel.value
    if (!ch || !text.trim()) return
    switch (ch.kind) {
      case 'matrix': await matrixComposer.sendMessage(text); break
      case 'chat': await chatStore.sendMessage(text); break
      case 'group': await groupStore.sendMessage(text); break
    }
  }
  const messagesForActiveChannel = computed<ChatMessage[]>(() => {
    const ch = activeChannel.value
    if (!ch) return []
    // 当前用户标识（简化：chat 用 activeSessionId，group 用 currentRoomId 的发送者比对，matrix 用 matrix client userId）
    switch (ch.kind) {
      case 'matrix': return [] // matrix 消息归一需要 currentUserId，由组件层注入 adapter 调用
      case 'chat': return (chatStore as any).messages?.map?.((m: any) => ({ id: m.id, channelId: ch.id, author: m.role === 'user' ? '你' : m.role, isMe: m.role === 'user', text: m.content, ts: m.timestamp })) ?? []
      case 'group': return (groupStore as any).sortedMessages?.map?.((m: any) => ({ id: m.id, channelId: ch.id, author: m.senderName || m.senderId, isMe: false, text: m.content, ts: m.timestamp })) ?? []
    }
    return []
  })
  function disconnectOnUnmount() {
    try { groupStore.disconnect?.() } catch { /* ignore */ }
  }

  // ── 历史 ──
  async function openHistory() {
    historyOpen.value = true
    try {
      const res = await extras.getTimeline({ limit: 100 })
      history.value = historyAdapter.mergeTimeline(res.items)
    } catch {
      history.value = []
    }
  }
  function closeHistory() { historyOpen.value = false }
  function toggleHistoryAction(action: string) {
    const arr = historyFilters.value.actions
    const i = arr.indexOf(action)
    if (i >= 0) arr.splice(i, 1) else arr.push(action)
  }
  function setHistoryArchivedFilter(v: 'all' | 'only' | 'exclude') { historyFilters.value.archived = v }
  function recallHistoryItem(id: string) {
    const item = history.value.find(h => h.id === id)
    if (!item) return
    selectTask(item.taskId)
    archivedMode.value = item.archived
    setWorkspaceMode('work')
    historyOpen.value = false
  }
  function clearArchivedMode() { archivedMode.value = false }

  // ── 联动：注意力/时序 ──
  function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
    selectTask(taskId)
    setWorkspaceMode('work')
    _attentionFocusTitle.value = title ?? null
    _attentionFocusDesc.value = desc ?? null
  }
  const _attentionFocusTitle = ref<string | null>(null)
  const _attentionFocusDesc = ref<string | null>(null)
  function focusOnTimelineNode(eventId: string) {
    setWorkspaceMode('work')
  }

  // ── 终端 ──
  function enterTerminal() { terminalMode.value = true; workspaceMode.value = 'term' }
  function exitTerminal() { terminalMode.value = false; workspaceMode.value = 'work' }
  function sendTerminalCommand(cmd: string) {
    const c = cmd.trim()
    if (!c) return
    terminalLines.value.push({ kind: 'prompt', text: c })
    terminalLines.value.push({ kind: 'info', text: `ℹ sandbox 内执行：${c}` })
  }

  // ── 模板（localStorage）──
  function saveTemplateFromCurrentWorkItem(name: string) {
    const id = selectedTaskId.value
    const draft = id ? kv.loadDraft(id) : null
    if (!draft) return
    const list = kv.loadTemplates()
    list.push({ id: 'tpl-' + Date.now(), name, decision: draft.decision, riskTags: [...draft.riskTags], opinion: draft.opinion, modifiedFiles: [...draft.modifiedFiles] })
    kv.saveTemplates(list)
  }
  function deleteTemplate(id: string) {
    const list = kv.loadTemplates().filter(t => t.id !== id)
    kv.saveTemplates(list)
  }
  function applyTemplateToCurrentWorkItem(templateId: string) {
    const tpl = kv.loadTemplates().find(t => t.id === templateId)
    const id = selectedTaskId.value
    if (!tpl || !id) return
    kv.saveDraft(id, { decision: tpl.decision, riskTags: [...tpl.riskTags], opinion: tpl.opinion })
    templateManagerOpen.value = false
  }
  function openTemplateManager() { templateManagerOpen.value = true }
  function closeTemplateManager() { templateManagerOpen.value = false }
  const templates = computed(() => kv.loadTemplates())

  return {
    // 派生态
    tasks, attention, attentionCount, selectedTask, selectedTaskId,
    sortedTasks, filteredTasks, tasksByTenant,
    events, eventsForSelectedTask, eventsForTimeline, recentEventsForTimeline, recentEventsForSelectedTask,
    topologyForSelectedTask, relationsForSelectedTask,
    channels, channelsForSelectedTask, activeChannel,
    filesForSelectedTask, workItemForSelectedTask,
    filteredHistory, messagesForActiveChannel, templates,
    // 客户端态
    filters, collapsed, workspaceMode, activeChannelId, maximized,
    terminalMode, terminalLines, historyOpen, historyFilters, archivedMode,
    templateManagerOpen, focusedGraphNodeId, selectedGraphNodeIds, selectedFileId,
    _attentionFocusTitle, _attentionFocusDesc, history, fileTrees, canvasTransform,
    // 方法
    bootstrap, selectTask, loadTaskDetail,
    toggleCollapsed, toggleFilter, setWorkspaceMode, toggleMaximized,
    selectFile, toggleGraphNode, focusOnGraphNodeForTimeline,
    updateWorkItem, toggleRiskTag, submitWorkItem,
    selectChannel, sendMessage, disconnectOnUnmount,
    openHistory, closeHistory, toggleHistoryAction, setHistoryArchivedFilter, recallHistoryItem, clearArchivedMode,
    focusOnTaskFromAttention, focusOnTimelineNode,
    enterTerminal, exitTerminal, sendTerminalCommand,
    saveTemplateFromCurrentWorkItem, deleteTemplate, applyTemplateToCurrentWorkItem, openTemplateManager, closeTemplateManager,
  }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test -- cockpit-store`
Expected: PASS（3 个 bootstrap/派生测试绿）

- [ ] **Step 5: 跑全量测试观察其他 cockpit 组件测试**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test`
Expected: 其他 cockpit 组件测试（kanban/collab-map/workspace 等）可能因 store 接口变化而失败——这些在后续 P1–P6 任务逐个修复。**记录失败清单**，不在此 task 修复。

- [ ] **Step 6: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add -A
git commit -m "feat(cockpit): rewrite store with computed derivations + bootstrap; remove seed.ts"
```

---

## Phase P1：左栏 + 注意力条

### Task 13: CockpitKanban.vue（tenant 分组 + 状态 5 桶）

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitKanban.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-kanban.test.ts`

- [ ] **Step 1: 先读现状**

Read `overlay/custom/client/cockpit/components/CockpitKanban.vue` 与 `__tests__/cockpit-kanban.test.ts` 全文，理解现有 `tasksByCategory`/`filters.categories`/状态 chip 的用法。

- [ ] **Step 2: 写失败测试（按新 tenant 分组契约）**

Update `__tests__/cockpit-kanban.test.ts`，把 `store.tasksByCategory` 断言改为 `store.tasksByTenant`；`filters.categories` 改为 `filters.tenants`；状态 chip 改为 5 桶（review/blocked/running/todo/done）。具体测试代码根据现有文件结构改写（保留 mount 渲染验证，断言 tenant 分组出现）。示例核心断言：

```ts
// 渲染后，应出现按 tenant 分组的区段标题
const groups = wrapper.findAll('[data-tenant-group]')
expect(groups.map(g => g.attributes('data-tenant-group'))).toContain('team-x')
// 状态筛选 chip 应为 5 个
const statusChips = wrapper.findAll('[data-filter="status"]')
expect(statusChips).toHaveLength(5)
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- cockpit-kanban`
Expected: FAIL

- [ ] **Step 4: 改 CockpitKanban.vue**

关键改动：
- 模板里 `v-for="(tasksInCat, cat) in store.tasksByCategory"` → `v-for="(tasksIn, tenant) in store.tasksByTenant"`
- 类别 chip 区块 → tenant chip 区块（动态从 `store.tasks` 去重 tenant 生成）
- 状态 chip 从原 7 个 → 5 个（review/blocked/running/todo/done）
- `store.toggleFilter('categories', ...)` → `store.toggleFilter('tenants', ...)`
- 移除 `import` 里对 `CockpitCategory` 的引用

tenant chip 动态列表 computed（在组件 setup 内）：
```ts
const tenantOptions = computed(() => {
  const set = new Set<string>()
  for (const t of store.tasks) set.add(t.tenant ?? '(未指定)')
  return [...set].sort()
})
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- cockpit-kanban`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(cockpit): CockpitKanban group by tenant + 5 status buckets"
```

---

### Task 14: CockpitAttention.vue 验证（无组件改动，仅断言数据源）

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-attention.test.ts`

- [ ] **Step 1: 读现状 + 写测试**

CockpitAttention.vue 读 `store.attention`（getter 名未变）。更新测试，mock kanban tasks 含 blocked/review 任务，断言 attention 条正确显示。

```ts
// 核心：mock kanban 后，store.attention 应为 2 项，组件渲染 2 个条目
mockKanbanTasks.push(blockedTask, reviewTask, otherTask)
await store.bootstrap()
const wrapper = mount(CockpitAttention)
expect(wrapper.findAll('[data-attention-item]')).toHaveLength(2)
```

- [ ] **Step 2: 跑测试**

Run: `npm test -- cockpit-attention`
Expected: PASS（组件无改动，仅数据源已切换）

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "test(cockpit): verify attention derives from kanban status"
```

---

## Phase P2：中栏时序 + 协作图

### Task 15: CockpitTimeline.vue 字段适配

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitTimeline.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-timeline.test.ts`

- [ ] **Step 1: 读现状，识别 nodeIds 残留用法**

Read CockpitTimeline.vue，搜索 `nodeIds`、`selectedTimelineNode`（原节点级时序筛选）。新设计移除 nodeIds（CockpitEvent 已无此字段）。

- [ ] **Step 2: 写测试**

Update 测试：mock 一个 task，bootstrap 后 `store.events` 含 events+runs+msgs 合并项，断言渲染顺序与文案。

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- cockpit-timeline`
Expected: FAIL（如有 nodeIds 引用）

- [ ] **Step 4: 改组件**

移除所有 `nodeIds` / `selectedTimelineNodeId` 相关分支；保留 `recentEventsForTimeline` 折叠逻辑。

- [ ] **Step 5: 跑测试确认通过 + 提交**

```bash
npm test -- cockpit-timeline
git add -A
git commit -m "feat(cockpit): timeline consume merged events (no nodeIds)"
```

---

### Task 16: CockpitGraphNode.vue kind 枚举调整

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitGraphNode.vue`

- [ ] **Step 1: 读现状**

kind 原 `project/req/file/test`，新设计 `center/parent/child/person/channel/folded`。

- [ ] **Step 2: 改组件**

更新 `<script>` 里 kind→样式/图标的映射，与 `GraphNodeRelation` 对齐。center 用实心圆+focus、parent/child 用矩形、person 用圆形、channel 用带前缀字（M/S/G）、folded 用灰色椭圆。

- [ ] **Step 3: 跑全量测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat(cockpit): GraphNode adapt to new relation enum"
```

---

### Task 17: CockpitCollabMap.vue 中心辐射 + 画布控件

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitCollabMap.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-collab-map.test.ts`

> 这是 P2 的重头戏。建议拆 2 个提交（17a 渲染、17b 画布控件）。

- [ ] **Step 1: 写测试**

Update `cockpit-collab-map.test.ts`：mock 任务 + detail（parents/children）+ tenant，断言：
- 渲染中心节点（`[data-node-kind="center"]`）
- 渲染 parent/child/person/channel 节点
- 点 parent 节点 → 触发 `store.selectTask(parentId)`（mock 验证调用）
- 点 channel 节点 → `store.selectChannel(chId)`
- 画布工具栏存在：`[data-canvas-fullscreen]`、`[data-canvas-minimize]`、`[data-canvas-zoom-in]`、`[data-canvas-zoom-out]`
- 拖拽画布 → `store.canvasTransform` 变化（mock mouse 事件）

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- cockpit-collab-map`
Expected: FAIL

- [ ] **Step 3: 重写 CockpitCollabMap.vue**

核心结构：
```vue
<script setup lang="ts">
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
const store = useCockpitStore()
const { topologyForSelectedTask: topo } = storeToRefs(store) // 注意：topologyForSelectedTask 返回 {nodes, relations}
// 节点极坐标布局：center (0,0)，三类辐射按 120° 扇区
function nodePos(node, idx, totalInSector, sectorCenterAngle) { /* 极坐标→笛卡尔 */ }
// 画布变换
function onPan(dx, dy) { store.canvasTransform = { ...store.canvasTransform, x: store.canvasTransform.x + dx, y: store.canvasTransform.y + dy } }
function onZoom(delta: number) { store.canvasTransform = { ...store.canvasTransform, scale: Math.min(2, Math.max(0.5, store.canvasTransform.scale + delta)) } }
function toggleFullscreen() { store.toggleMaximized() /* 或独立 collapsed.mid */ }
function onNodeClick(node) {
  if (node.target?.taskId) store.selectTask(node.target.taskId)
  else if (node.target?.routeTarget) {
    const ch = store.channels.find(c => c.routeTarget === node.target!.routeTarget)
    if (ch) store.selectChannel(ch.id)
  }
}
</script>
<template>
  <div class="collab-map">
    <div class="collab-map__toolbar">
      <button data-canvas-fullscreen @click="toggleFullscreen">⛶</button>
      <button data-canvas-minimize @click="store.toggleCollapsed('mid')">🗅</button>
      <button data-canvas-zoom-in @click="onZoom(0.1)">+</button>
      <button data-canvas-zoom-out @click="onZoom(-0.1)">−</button>
    </div>
    <svg class="collab-map__canvas" @mousedown="startPan" @mousemove="onPanMove" @mouseup="endPan" @wheel.prevent="onWheel">
      <g :transform="`translate(${store.canvasTransform.x},${store.canvasTransform.y}) scale(${store.canvasTransform.scale})`">
        <!-- relations: lines -->
        <line v-for="r in topo.relations" :key="r.id" :x1="pos(r.from).x" :y1="pos(r.from).y" :x2="pos(r.to).x" :y2="pos(r.to).y" />
        <!-- nodes -->
        <CockpitGraphNode v-for="n in topo.nodes" :key="n.id" :node="n" :x="pos(n.id).x" :y="pos(n.id).y" @click="onNodeClick(n)" />
      </g>
    </svg>
  </div>
</template>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- cockpit-collab-map`
Expected: PASS

- [ ] **Step 5: 提交（2 个）**

```bash
git add -A
git commit -m "feat(cockpit): radial collab map with canvas controls"
```

---

## Phase P3：右栏工作项 + 文件树

### Task 18: 后端 patch 078（workspace-files 路由）

**Files:**
- Create: `overlay/patches/078-server-kanban-workspace-files.patch`
- Modify: `overlay/patches/series`

> patch 改 upstream，必须先 `npm run inject` 应用基线，在注入后的文件基础上生成 diff。

- [ ] **Step 1: 应用基线注入**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```

- [ ] **Step 2: 手工在注入后的 upstream 文件加路由+控制器（用于生成 diff）**

读 `upstream/hermes-studio/packages/server/src/routes/hermes/kanban.ts`，在现有 kanban 路由区追加：
```ts
kanbanRoutes.get('.../workspace-files', ctrl.listWorkspaceFiles)
```

读 `upstream/hermes-studio/packages/server/src/controllers/hermes/kanban.ts`，追加 `listWorkspaceFiles` + `readDirTree`（实现见 spec §4.1）。

- [ ] **Step 3: 生成 patch**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git add packages/server/src/routes/hermes/kanban.ts packages/server/src/controllers/hermes/kanban.ts
git diff --cached > /Volumes/nvme2230/lab/ncwk/overlay/patches/078-server-kanban-workspace-files.patch
git reset HEAD packages/server/src/routes/hermes/kanban.ts packages/server/src/controllers/hermes/kanban.ts
git checkout -- packages/server/src/routes/hermes/kanban.ts packages/server/src/controllers/hermes/kanban.ts
```

- [ ] **Step 4: 登记到 series**

Edit `overlay/patches/series`，在末尾追加一行 `078-server-kanban-workspace-files.patch`。

- [ ] **Step 5: 验证 patch 干净应用**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean && npm run inject
```
Expected: inject 成功，无 conflict。

- [ ] **Step 6: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add patches/078-server-kanban-workspace-files.patch patches/series
git commit -m "feat(patch): 078 workspace-files route (kanban dir listing)"
```

---

### Task 19: CockpitFileTree.vue 懒加载

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitFileTree.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-file-tree.test.ts`

- [ ] **Step 1: 写测试**

mock `listWorkspaceFiles` 返回嵌套树，渲染后点目录节点 → 触发懒加载（再次调 listWorkspaceFiles 带 sub 参数）。

- [ ] **Step 2: 跑测试确认失败 → 改组件 → 通过 → 提交**

组件改：`store.filesForSelectedTask`（已 computed 自懒加载缓存）渲染；点目录调 `extras.listWorkspaceFiles(taskId, node.id)` 把结果合并进缓存（或直接 reload 该任务树）。简化：首屏 depth=2 已含 2 层，点更深目录才懒加载。

```bash
npm test -- cockpit-file-tree
git add -A
git commit -m "feat(cockpit): FileTree lazy-loads workspace-files API"
```

---

### Task 20: CockpitWorkspace.vue localStorage 草稿 + 提交写 comment

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitWorkspace.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-workspace.test.ts`

- [ ] **Step 1: 写测试**

mock kanban，selectTask 后 `workItemForSelectedTask` 从 localStorage 读草稿；填表 → `store.updateWorkItem` 写 localStorage；点"提交决定" → `addComment` 被调用、草稿被清。

- [ ] **Step 2: 改组件**

- 模板字段绑定 `store.workItemForSelectedTask`（注意 v-model 需通过本地 ref + watch 同步，因 computed 只读）
- 提交按钮 `@click="store.submitWorkItem()"`
- 移除 M 徽章逻辑（无 diff 数据）

- [ ] **Step 3: 跑测试 + 提交**

```bash
npm test -- cockpit-workspace
git add -A
git commit -m "feat(cockpit): Workspace localStorage draft + comment submission"
```

---

## Phase P4：右栏协作（聊天精简壳）

### Task 21: CockpitCollabBar.vue channel 从 parseTenant 派生

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitCollabBar.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-collab-bar.test.ts`

- [ ] **Step 1: 写测试**

mock task.tenant = `'matrix:!r:s.ms:Auth联调'`，断言 CollabBar 渲染 1 个 channel（label=Auth联调、kind=matrix）；点 channel → `store.selectChannel`。

- [ ] **Step 2: 改组件 → 通过 → 提交**

channel 列表读 `store.channelsForSelectedTask`（已 computed）。

```bash
npm test -- cockpit-collab-bar
git add -A
git commit -m "feat(cockpit): CollabBar channels from parseTenant"
```

---

### Task 22: CockpitChatPane.vue 精简壳 + store action 分发

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitChatPane.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-chat-pane.test.ts`

- [ ] **Step 1: 写测试**

mock activeChannel（kind=chat/group/matrix），mock 各 store 的 sendMessage，断言输入并发送 → 对应 store action 被调；消息列表读 `store.messagesForActiveChannel`。

- [ ] **Step 2: 改组件**

- 模板：`v-for="m in store.messagesForActiveChannel"` 渲染消息
- 输入框 `@keyup.enter="onSend"`，`onSend` 调 `store.sendMessage(text)`
- 移除原 mock `sendMessage`（push 假消息）逻辑

- [ ] **Step 3: 跑测试 + 提交**

```bash
npm test -- cockpit-chat-pane
git add -A
git commit -m "feat(cockpit): ChatPane uses real store actions (no router.push)"
```

---

### Task 23: CockpitView.vue onUnmounted 断开 group socket

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`

- [ ] **Step 1: 改 CockpitView**

`onMounted` 已调 `store.bootstrap()`（Task 11）。加 `onUnmounted(() => store.disconnectOnUnmount())`。

- [ ] **Step 2: 跑全量测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat(cockpit): disconnect group socket on unmount"
```

---

## Phase P5：历史回溯

### Task 24: 后端 patch 079（timeline 聚合路由）

**Files:**
- Create: `overlay/patches/079-server-kanban-timeline-aggregate.patch`
- Modify: `overlay/patches/series`

- [ ] **Step 1–6**：与 Task 18 同模式，注入基线 → 手工加路由+控制器（实现见 spec §4.2）→ 生成 patch → 登记 series → 验证 inject → 提交。

```bash
git add patches/079-server-kanban-timeline-aggregate.patch patches/series
git commit -m "feat(patch): 079 timeline aggregate route"
```

---

### Task 25: CockpitHistoryModal.vue 调聚合路由

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitHistoryModal.vue`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-history-modal.test.ts`

- [ ] **Step 1: 写测试**

mock `getTimeline` 返回 events+comments items，打开 modal → `store.history` 经 historyAdapter 填充；按 action 过滤 chip 工作。

- [ ] **Step 2: 改组件**（如需；`store.filteredHistory` 已 computed，组件大概率只读）

- [ ] **Step 3: 跑测试 + 提交**

```bash
npm test -- cockpit-history-modal
git add -A
git commit -m "feat(cockpit): HistoryModal consumes timeline aggregate"
```

---

## Phase P6：收尾

### Task 26: CockpitTemplateManager.vue 模板源 localStorage

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitTemplateManager.vue`

- [ ] **Step 1: 改组件**

模板列表读 `store.templates`（computed 自 localStorage）。增删 apply 均通过 store 方法（已接 localStorage）。

- [ ] **Step 2: 跑测试 + 提交**

```bash
npm test -- cockpit-template-manager
git add -A
git commit -m "feat(cockpit): TemplateManager reads localStorage templates"
```

---

### Task 27: 全量回归 + 类型检查 + 构建验证

- [ ] **Step 1: 跑全量测试**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test`
Expected: 全部 PASS

- [ ] **Step 2: 跑 inject + 构建**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean && npm run inject && npm run build`
Expected: inject 成功、构建无 TS 错误

- [ ] **Step 3: 手动 E2E 验收（按 spec §9.3 表）**

启动应用，逐项验证：
- 进入 cockpit → 左栏任务来自 kanban
- 切任务 → 时序流/协作图/文件树/工作项刷新
- 文件树点目录展开
- 协作图点任务节点 → 时序切换；点频道 → 右栏聊天加载
- 画布全屏/缩放/拖拽
- 聊天发消息 → store action 调用、回声
- 工作项提交 → kanban comment 写入、草稿清除
- 历史弹窗 → 聚合数据

- [ ] **Step 4: 合并到 main**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge feat/cockpit-kanban-integration
git branch -d feat/cockpit-kanban-integration
```

---

## Notes for the Implementer

1. **每 task 独立提交**，失败回滚不影响前序。
2. **cockpit store 重构（Task 12）是最大风险点**——若中间态破坏多个组件测试，可临时 `git stash` 其他组件改动，先让 store 测试绿，再逐个修复组件。
3. **patch 生成（Task 18/24）必须基于 inject 后的 upstream**，否则 diff 基线错。生成后立即 `npm run clean && npm run inject` 验证。
4. **cockpit 改 overlay custom 文件不需要 patch**（直接编辑源码）；只有 Task 18/24 改 upstream 才走 patch。
5. **matrix store 在 `@/custom/matrix-chat/stores/`**（overlay custom），不在 upstream；store id 用连字符。
6. **chat-adapter 的 matrix 消息归一**需 MatrixEvent 实例的方法访问（getId/getSender/getContent/getTs），已在 adapter 测试覆盖。
7. **cockpit-store.test.ts 的 mock 模式是新建立的范式**（现有 13 个测试不 mock kanban）——后续组件测试沿用此 mock 结构。

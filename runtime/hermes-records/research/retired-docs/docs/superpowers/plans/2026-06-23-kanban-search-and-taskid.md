# Kanban 总览 — 搜索框 & 任务ID & 组优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 kanban 总览栏新增跨源搜索框（kanban 任务+matrix 房间名+hermes 会话全文检索），移除「(未指定)」分组改为混合分组（null tenant 按看板分组），每个任务行显示可复制任务ID。

**Architecture:** 新增 `search-adapter.ts` 纯函数处理搜索命中→任务ID 映射；store 内新增 searchQuery/runSearch 状态+网络+debounce；组件 CockpitKanban.vue 改模板渲染搜索框、混合分组、任务ID 行。全部在 overlay 内，零 upstream 改动。

**Tech Stack:** Vue 3 + Pinia + Vitest + @vue/test-utils; 服务端搜索走 `/api/hermes/search/sessions`（upstream session API）

---

## File Map

| 操做 | 文件 |
|------|------|
| Create | `overlay/custom/client/cockpit/adapters/search-adapter.ts` |
| Create | `overlay/custom/client/cockpit/__tests__/search-adapter.test.ts` |
| Modify | `overlay/custom/client/cockpit/store/cockpit.ts` |
| Modify | `overlay/custom/client/cockpit/components/CockpitKanban.vue` |
| Modify | `overlay/custom/client/cockpit/__tests__/cockpit-kanban.test.ts` |
| Modify | `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` |

---

### Task 1: search-adapter.ts（纯函数，无依赖）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/search-adapter.ts`

- [ ] **Step 1: 写文件**

```ts
import type { CockpitTask } from '@/custom/cockpit/store/cockpit'

export interface MatrixRoomSearchData {
  roomId: string
  name?: string
  topic?: string
}

export interface SessionSearchResult {
  id: string
  title?: string
  snippet?: string
}

/**
 * 检查单个 kanban 任务是否被关键词命中（title / id / boardSlug / tenant / assignee）。
 */
export function matchLocalTask(t: CockpitTask, q: string): boolean {
  const lq = q.toLowerCase()
  const fields = [
    t.title,
    t.id,
    t.boardSlug,
    t.tenant ?? '',
    t.assignee,
  ]
  return fields.some(f => f.toLowerCase().includes(lq))
}

/**
 * 检查单个 matrix 房间是否命中。命中则返回 roomId，否则返回 null。
 */
export function matchMatrixRoom(room: MatrixRoomSearchData, q: string): string | null {
  const lq = q.toLowerCase()
  const fields = [room.name, room.topic].filter(Boolean) as string[]
  if (fields.some(f => f.toLowerCase().includes(lq))) return room.roomId
  return null
}

/**
 * 从 tenant 字符串提取 session id（格式 session:<sessionId>[@<profile>]:<name>）。
 */
export function extractSessionIdFromTenant(tenant: string): string | null {
  if (!tenant.startsWith('session:')) return null
  const rest = tenant.slice('session:'.length)
  const firstColon = rest.indexOf(':')
  const idPart = firstColon >= 0 ? rest.slice(0, firstColon) : rest
  const atIdx = idPart.indexOf('@')
  return atIdx > 0 ? idPart.slice(0, atIdx) : idPart
}

/**
 * 从 tenant 字符串提取 matrix room id（格式 matrix:<roomId>:<name>，roomId 可含冒号）。
 */
export function extractRoomIdFromTenant(tenant: string): string | null {
  if (!tenant.startsWith('matrix:')) return null
  const rest = tenant.slice('matrix:'.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon < 0) return null
  return rest.slice(0, lastColon)
}

/**
 * 核心：将搜索命中映射回 kanban 任务 id 集合。
 *
 * @param tasks       kanban 全部任务
 * @param matrixRooms 本地 matrix 房间列表
 * @param sessionResults hermes 会话全文检索结果（含 session id）
 * @param q           搜索关键词（非空，已 trim）
 * @returns 入选任务的 id 集合
 */
export function mapSearchToTaskIds(
  tasks: CockpitTask[],
  matrixRooms: MatrixRoomSearchData[],
  sessionResults: SessionSearchResult[],
  q: string,
): Set<string> {
  const result = new Set<string>()

  // ① 直接命中任务
  for (const t of tasks) {
    if (matchLocalTask(t, q)) result.add(t.id)
  }

  // ② matrix 房间命中 → 反查 tenant=matrix:<roomId>:* 
  const matchedRoomIds = new Set<string>()
  for (const r of matrixRooms) {
    const roomId = matchMatrixRoom(r, q)
    if (roomId) matchedRoomIds.add(roomId)
  }
  if (matchedRoomIds.size > 0) {
    for (const t of tasks) {
      if (!t.tenant) continue
      const rid = extractRoomIdFromTenant(t.tenant)
      if (rid && matchedRoomIds.has(rid)) result.add(t.id)
    }
  }

  // ③ 会话命中 → 反查 tenant=session:<sessionId>@*:*
  const matchedSessionIds = new Set(sessionResults.map(s => s.id))
  if (matchedSessionIds.size > 0) {
    for (const t of tasks) {
      if (!t.tenant) continue
      const sid = extractSessionIdFromTenant(t.tenant)
      if (sid && matchedSessionIds.has(sid)) result.add(t.id)
    }
  }

  return result
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx tsc --noEmit --project tsconfig.json custom/client/cockpit/adapters/search-adapter.ts 2>&1 | head -20
```
Expected: no errors（或仅已有其他文件的错误）。

---

### Task 2: search-adapter.test.ts (TDD)

**Files:**
- Create: `overlay/custom/client/cockpit/__tests__/search-adapter.test.ts`

- [ ] **Step 1: 写测试文件**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  matchLocalTask,
  matchMatrixRoom,
  extractSessionIdFromTenant,
  extractRoomIdFromTenant,
  mapSearchToTaskIds,
} from '@/custom/cockpit/adapters/search-adapter'
import type { CockpitTask } from '@/custom/cockpit/store/cockpit'

const t = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1', title: '测试任务', priority: 'P3', status: 'todo',
  assignee: 'alice', workspace: '~', tenant: null, boardSlug: 'default',
  createdAt: 0,
  ...over,
})

describe('matchLocalTask', () => {
  it('hits title', () => {
    expect(matchLocalTask(t({ title: 'PR #142 修复' }), 'PR')).toBe(true)
  })
  it('hits id', () => {
    expect(matchLocalTask(t({ id: 'abc-123' }), 'abc')).toBe(true)
  })
  it('hits boardSlug', () => {
    expect(matchLocalTask(t({ boardSlug: 'my-board' }), 'my-board')).toBe(true)
  })
  it('hits tenant', () => {
    expect(matchLocalTask(t({ tenant: 'team-x' }), 'team-x')).toBe(true)
  })
  it('hits assignee', () => {
    expect(matchLocalTask(t({ assignee: 'bob' }), 'bob')).toBe(true)
  })
  it('case-insensitive', () => {
    expect(matchLocalTask(t({ title: 'Hello' }), 'hello')).toBe(true)
  })
  it('no match returns false', () => {
    expect(matchLocalTask(t({ title: 'foo' }), 'zzz')).toBe(false)
  })
  it('null tenant treated as empty string', () => {
    expect(matchLocalTask(t({ tenant: null, title: 'x' }), 'x')).toBe(true)
  })
})

describe('matchMatrixRoom', () => {
  it('hits name', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', name: 'Auth联调' }, 'Auth')).toBe('!r:s')
  })
  it('hits topic', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', topic: 'OAuth2 集成' }, 'OAuth2')).toBe('!r:s')
  })
  it('no match returns null', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', name: 'foo' }, 'zzz')).toBeNull()
  })
  it('case-insensitive', () => {
    expect(matchMatrixRoom({ roomId: '!r:s', name: 'Hello' }, 'hello')).toBe('!r:s')
  })
})

describe('extractSessionIdFromTenant', () => {
  it('extracts with profile', () => {
    expect(extractSessionIdFromTenant('session:sess1@default:My Session')).toBe('sess1')
  })
  it('extracts without profile', () => {
    expect(extractSessionIdFromTenant('session:sess2:My Session')).toBe('sess2')
  })
  it('non-session tenant returns null', () => {
    expect(extractSessionIdFromTenant('matrix:!r:s:Room')).toBeNull()
    expect(extractSessionIdFromTenant('team-x')).toBeNull()
  })
  it('minimal session tenant', () => {
    expect(extractSessionIdFromTenant('session:s1')).toBe('s1')
  })
})

describe('extractRoomIdFromTenant', () => {
  it('extracts roomId with colons', () => {
    expect(extractRoomIdFromTenant('matrix:!abc:matrix.org:My Room')).toBe('!abc:matrix.org')
  })
  it('extracts simple roomId', () => {
    expect(extractRoomIdFromTenant('matrix:!simple:Name')).toBe('!simple')
  })
  it('non-matrix tenant returns null', () => {
    expect(extractRoomIdFromTenant('session:s1@d:X')).toBeNull()
    expect(extractRoomIdFromTenant('team-x')).toBeNull()
  })
})

describe('mapSearchToTaskIds', () => {
  it('direct task hit (title)', () => {
    const tasks = [t({ id: '1', title: 'Fix bug' }), t({ id: '2', title: 'Refactor' })]
    const ids = mapSearchToTaskIds(tasks, [], [], 'bug')
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(false)
  })

  it('matrix room hit maps to task via tenant', () => {
    const tasks = [
      t({ id: '1', title: 'A', tenant: 'matrix:!abc:matrix.org:MyRoom' }),
      t({ id: '2', title: 'B', tenant: 'session:s1:Chat' }),
    ]
    const rooms = [{ roomId: '!abc:matrix.org', name: 'MyRoom' }]
    const ids = mapSearchToTaskIds(tasks, rooms, [], 'MyRoom')
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(false)
  })

  it('session hit maps to task via tenant', () => {
    const tasks = [
      t({ id: '1', title: 'A', tenant: 'session:s1@default:Chat' }),
      t({ id: '2', title: 'B', tenant: 'matrix:!r:m:X' }),
    ]
    const sessions = [{ id: 's1', title: 'Chat session' }]
    const ids = mapSearchToTaskIds(tasks, [], sessions, 'chat')
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(false)
  })

  it('session hit without matching task does not add to result', () => {
    const tasks = [t({ id: '1', title: 'A', tenant: 'session:s999:Other' })]
    const sessions = [{ id: 's1', title: 'Chat' }]
    const ids = mapSearchToTaskIds(tasks, [], sessions, 'chat')
    expect(ids.size).toBe(0)
  })

  it('empty q returns empty set (caller should short-circuit)', () => {
    const ids = mapSearchToTaskIds([t()], [], [], '')
    expect(ids.size).toBe(0)
  })

  it('session in results maps to task even if q does not directly match task', () => {
    // sessionResults 是服务端预匹配的输出，mapSearchToTaskIds 不再对其重检 q
    const tasks = [
      t({ id: '1', title: 'Fix login' }),
      t({ id: '2', title: 'Docs', tenant: 'session:s1@d:AI对话' }),
    ]
    const sessions = [{ id: 's1', title: 'AI session' }]
    const ids = mapSearchToTaskIds(tasks, [], sessions, 'login')
    expect(ids.has('1')).toBe(true) // direct title match
    expect(ids.has('2')).toBe(true) // session s1 in sessionResults → maps to t2 via tenant
  })

  it('union — all three sources match distinct tasks', () => {
    const tasks = [
      t({ id: '1', title: 'Deploy app' }),
      t({ id: '2', title: 'Auth', tenant: 'matrix:!r:m:部署验证频道' }),
      t({ id: '3', title: 'Docs', tenant: 'session:s1:Chat' }),
    ]
    const rooms = [{ roomId: '!r:m', name: '部署验证频道' }]
    const sessions = [{ id: 's1', title: 'Chat stuff' }]
    const ids = mapSearchToTaskIds(tasks, rooms, sessions, '部署')
    expect(ids.has('1')).toBe(true) // direct title hit (title contains '部署')
    expect(ids.has('2')).toBe(true) // matrix room name contains '部署'
    expect(ids.has('3')).toBe(true) // session s1 in sessionResults (pre-matched by server)
    expect(ids.size).toBe(3)
  })
})
```

- [ ] **Step 2: 跑测试，确认全部通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/search-adapter.test.ts 2>&1 | tail -30
```
Expected: 所有测试 PASS.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/adapters/search-adapter.ts custom/client/cockpit/__tests__/search-adapter.test.ts && git commit -m "feat(cockpit): add search-adapter pure functions for cross-source task matching"
```

---

### Task 3: store — searchQuery / runSearch / searchResult / debounce

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`

- [ ] **Step 1: 在 store 顶部新增 import**

在 `import * as extras from '@/custom/cockpit/api/kanban-extras'` 之后新增：

```ts
import { searchSessions as searchHermesSessions } from '@/api/hermes/sessions'
import { mapSearchToTaskIds, type MatrixRoomSearchData } from '@/custom/cockpit/adapters/search-adapter'
```

- [ ] **Step 2: 在 `const cockpitTasks = ref<CockpitTask[]>([])` 之后新增 search state**

```ts
// ── 搜索态 ──
const searchQuery = ref('')
const _sessionSearching = ref(false)
const _sessionSearchCache = ref<Record<string, { ts: number; results: any[] }>>({})
let _searchTimer: ReturnType<typeof setTimeout> | undefined
```

- [ ] **Step 3: 新增 `searchResult` computed**

在 `sortedTasks` computed 之后新增：

```ts
const searchResult = computed<Set<string>>(() => {
  const q = searchQuery.value.trim()
  if (!q) return new Set()
  const mr = (matrixRoom as any).roomList ?? []
  const rooms: MatrixRoomSearchData[] = mr.map((r: any) => ({
    roomId: r.roomId ?? '',
    name: r.name,
    topic: r.getCanonicalAlias?.() ?? undefined,
  }))
  const cacheEntry = _sessionSearchCache.value[q]
  const sessions = cacheEntry?.results ?? []
  return mapSearchToTaskIds(tasks.value, rooms, sessions, q)
})
```

- [ ] **Step 4: 新增 `runSearch` 和 `clearSearch` 方法**

在 `clearDateRangeFilter` 函数之后新增：

```ts
function runSearch(q: string) {
  searchQuery.value = q
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = undefined }
  if (!q.trim()) return
  _searchTimer = setTimeout(async () => {
    const key = q.trim()
    const cached = _sessionSearchCache.value[key]
    if (cached && (Date.now() - cached.ts < 5 * 60 * 1000)) return // 缓存 5min 未过期
    if (_sessionSearching.value) return
    _sessionSearching.value = true
    try {
      const results = await searchHermesSessions(key)
      _sessionSearchCache.value = { ..._sessionSearchCache.value, [key]: { ts: Date.now(), results } }
    } catch { /* 静默：退化为仅本地匹配 */ }
    finally { _sessionSearching.value = false }
  }, 300)
}

function clearSearch() {
  searchQuery.value = ''
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = undefined }
}
```

- [ ] **Step 5: 在 `filteredTasks` 末尾追加搜索筛选**

在 `filteredTasks` computed 的 return 语句中，在 `&& dateOk` 之后追加搜索条件：

将：
```ts
return okArr(f.priorities, t.priority)
  && okArr(f.statuses, taskAdapter.bucketStatus(t.status))
  && okArr(f.tenants, t.tenant ?? '(未指定)')
  && okArr(f.boardSlugs, t.boardSlug)
  && dateOk
```
改为：
```ts
const searchOk = !searchQuery.value.trim() || searchResult.value.has(t.id)
return okArr(f.priorities, t.priority)
  && okArr(f.statuses, taskAdapter.bucketStatus(t.status))
  && okArr(f.tenants, t.tenant ?? '(未指定)')
  && okArr(f.boardSlugs, t.boardSlug)
  && dateOk
  && searchOk
```

- [ ] **Step 6: 在 return 块里暴露新 state 和方法**

在 store 的 return 语句中新增：

```ts
searchQuery, searchResult, _sessionSearching, runSearch, clearSearch,
```

- [ ] **Step 7: 验证编译**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 8: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/store/cockpit.ts && git commit -m "feat(cockpit): add searchQuery/runSearch/searchResult with debounce and hermes session search"
```

---

### Task 4: store — taskGroups（替换 tasksByTenant）+ 移除 (未指定) 逻辑

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`

- [ ] **Step 1: 在 `sortedTasks` computed 之后、`tasksByTenant` 之前，新增 `taskGroups` computed，同时删除旧的 `tasksByTenant`**

将：
```ts
const tasksByTenant = computed(() => {
  const map: Record<string, CockpitTask[]> = {}
  for (const t of filteredTasks.value) {
    const key = t.tenant ?? '(未指定)'
    ;(map[key] ??= []).push(t)
  }
  return map
})
```
替换为：
```ts
const taskGroups = computed(() => {
  const map: Record<string, CockpitTask[]> = {}
  const labelMap: Record<string, string> = {}
  for (const t of filteredTasks.value) {
    if (t.tenant) {
      // 有 tenant：按 tenant 分组
      const key = 'tenant::' + t.tenant
      if (!map[key]) { map[key] = []; labelMap[key] = t.tenant }
      map[key].push(t)
    } else {
      // null tenant：按 boardSlug 分组
      const key = 'board::' + t.boardSlug
      if (!map[key]) { map[key] = []; labelMap[key] = t.boardSlug }
      map[key].push(t)
    }
  }
  return Object.keys(map)
    .sort((a, b) => {
      const aIsBoard = a.startsWith('board::')
      const bIsBoard = b.startsWith('board::')
      if (aIsBoard !== bIsBoard) return aIsBoard ? 1 : -1
      return (labelMap[a] ?? '').localeCompare(labelMap[b] ?? '')
    })
    .map(key => ({ key, label: labelMap[key] ?? key, tasks: map[key] }))
})
```

- [ ] **Step 2: 移除 `tasksByTenant` 的旧引用**

由于 `taskGroups` 替换了 `tasksByTenant`，组件之前引用 `store.tasksByTenant`，现在需要对外暴露 `taskGroups`（但是组件更新也要同步，这里先改 store，组件在 Task 6 改）。

在 store return 块中，把：
```ts
tasksByTenant,
```
改为：
```ts
taskGroups,
```

- [ ] **Step 3: 移除 `filteredTasks` 中的 `(未指定)` tenant 筛选逻辑**

将 filter tenants 那行：
```ts
&& okArr(f.tenants, t.tenant ?? '(未指定)')
```
改为（null tenant 始终通过 tenant 筛选）：
```ts
&& (t.tenant == null || okArr(f.tenants, t.tenant))
```

- [ ] **Step 4: 移除 `tenantGroups` computed（CockpitKanban.vue 里的那个）—— 其实它在组件里，不应该在这里改。此步撤回**

实际上 store 里的 `tasksByTenant` 和 `taskGroups` 的替换已经完成。组件内不需要改 tenantGroups，因为那个 computed 已经在组件里注释删除。

- [ ] **Step 5: 更新 `tenantOptions` computed（在 store 中，如果存在的话）**

`tenantOptions` 在 store 中不存在——它在 `CockpitKanban.vue` 组件中。但是 store 的 `filters.tenants` 筛选逻辑已经在 Step 3 改了。tenant filter chip 列表在组件中生成，不再包含 `(未指定)`（组件同步改）。

- [ ] **Step 6: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/store/cockpit.ts && git commit -m "refactor(cockpit): replace tasksByTenant with taskGroups (hybrid grouping); remove (未指定) logic"
```

---

### Task 5: 更新 cockpit-store.test.ts

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

- [ ] **Step 1: 新增 searchSessions mock**

现有文件已 mock `@/custom/cockpit/api/kanban-extras` 的 `searchSessions`。但新的 store 还需要 mock `@/api/hermes/sessions` 的 `searchSessions as searchHermesSessions`。

在 `vi.mock('@/api/hermes/kanban', ...)` 之后新增：

```ts
const { mockSearchHermesSessions } = vi.hoisted(() => ({
  mockSearchHermesSessions: vi.fn(async (_q: string) => []),
}))
vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return {
    ...actual,
    searchSessions: mockSearchHermesSessions,
  }
})
```

并在 `beforeEach` 中追加：

```ts
mockSearchHermesSessions.mockClear()
mockSearchHermesSessions.mockResolvedValue([])
```

同时 mock `matrix-room` 加上 `roomList`：

```ts
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [] }),
}))
```

- [ ] **Step 2: 把原文的 `tasksByTenant` 测试替换为 `taskGroups` 测试**

找到 `it('tasksByTenant groups by tenant field, null → (未指定)', ...)`，替换为：

```ts
  it('taskGroups: null tenant grouped by boardSlug, valued tenant by tenant', async () => {
    mockKanbanTasks.push(
      kt({ id: 't1', tenant: 'team-x', priority: 0 }),
      kt({ id: 't2', tenant: null, priority: 0, workspace_path: '/w' }),
      kt({ id: 't3', tenant: null, priority: 0, workspace_path: '/w', }), // same as t2 board? no — toCockpitTask takes t.boardSlug from second param. We need to mock boardSlug.
    )
    // The mock kanban store's tasks already get mapped to CockpitTask via toCockpitTask(t, 'default')
    // so both t2 and t3 have boardSlug='default'
    const s = useCockpitStore()
    const groups = s.taskGroups
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('team-x')
    expect(groups[0].tasks.map(t => t.id)).toEqual(['t1'])
    expect(groups[1].label).toBe('default')
    expect(groups[1].tasks.map(t => t.id)).toEqual(['t2', 't3'])
  })
```

- [ ] **Step 3: 新增 tenant 筛选 null 不卡逻辑测试**

```ts
  it('null tenant tasks are not filtered out by tenant chip', async () => {
    mockKanbanTasks.push(
      kt({ id: 'a', tenant: 'x' }),
      kt({ id: 'b', tenant: null }),
    )
    const s = useCockpitStore()
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a', 'b'])
    s.toggleFilter('tenants', 'x')
    // b has null tenant, should still pass the tenant filter
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a', 'b'])
  })
```

- [ ] **Step 4: 跑 store 测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts 2>&1 | tail -30
```
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/__tests__/cockpit-store.test.ts && git commit -m "test(cockpit): update store tests for taskGroups, null-tenant filter, search mock"
```

---

### Task 6: CockpitKanban.vue — 搜索框 + 混合分组 + 任务ID + 样式

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitKanban.vue`

- [ ] **Step 1: 在 script 中新增 copyTaskId 方法**

在 `defineEmits` 之后，`const priorities` 之前新增：

```ts
function copyTaskId(id: string) {
  navigator.clipboard?.writeText(id).catch(() => {})
}
```

- [ ] **Step 2: 移除旧的 `tenantOptions` 中的 `(未指定)` fallback**

将：
```ts
const tenantOptions = computed(() => {
  const set = new Set<string>()
  for (const t of store.tasks) set.add(t.tenant ?? '(未指定)')
  return [...set].sort()
})
```
改为：
```ts
const tenantOptions = computed(() => {
  const set = new Set<string>()
  for (const t of store.tasks) if (t.tenant) set.add(t.tenant)
  return [...set].sort()
})
```

- [ ] **Step 3: 删除旧的 `tenantGroups` computed**

删除组件中的 `tenantGroups` computed（因为 store 已直接提供 `taskGroups`）。

- [ ] **Step 4: 在 template 的 `.cockpit-kanban__head` 中新增搜索框**

将 `<div class="cockpit-kanban__head">` 整个 block 替换为：

```html
    <div class="cockpit-kanban__head">
      <span class="cockpit-kanban__title">kanban总览</span>
      <div class="cockpit-kanban__search">
        <span class="cockpit-kanban__search-icon">🔍</span>
        <input
          type="text"
          class="cockpit-kanban__search-input"
          :value="store.searchQuery"
          placeholder="搜索 会话/任务/房间"
          data-search-input
          @input="store.runSearch(($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="store.searchQuery"
          type="button"
          class="cockpit-kanban__search-clear"
          @click="store.clearSearch()"
        >×</button>
        <span v-if="store._sessionSearching" class="cockpit-kanban__search-spinner" />
      </div>
      <span class="cockpit-kanban__sort">↓ 优先级</span>
    </div>
```

- [ ] **Step 5: 将任务列表从 `tenantGroups` 改为 `taskGroups`**

```html
    <!-- 任务列表（按 tenant/board 混合分组）-->
    <div class="cockpit-kanban__list">
      <div v-for="g in store.taskGroups" :key="g.key" class="cockpit-kanban__cat" :data-tenant-group="g.label">
        <div class="cockpit-kanban__cat-head">
          <span class="cockpit-kanban__cat-mark" />
          {{ g.label }}
          <span class="cockpit-kanban__cat-count">{{ g.tasks.length }}</span>
        </div>
        <button v-for="t in g.tasks" :key="t.id"
          type="button"
          :data-task-id="t.id"
          class="cockpit-kanban__task"
          :class="['is-' + t.priority.toLowerCase(), { 'is-selected': store.selectedTaskId === t.id }]"
          @click="store.selectTask(t.id)">
          <span class="cockpit-sel-bar" />
          <span class="cockpit-kanban__pri">{{ t.priority }}</span>
          <div class="cockpit-kanban__tt" :title="t.title" @dblclick.stop="store.openTitleDetail(t.id, t.title)">{{ t.title }}</div>
          <div class="cockpit-kanban__meta">
            <span class="cockpit-kanban__slug" :data-task-slug="t.boardSlug">@{{ t.boardSlug }}</span>
            <span
              class="cockpit-kanban__id"
              :data-task-id-copy="t.id"
              :title="`点击复制任务ID: ${t.id}`"
              @click.stop="copyTaskId(t.id)"
            >#{{ t.id }}</span>
            <span class="cockpit-kanban__stg" :class="{ 'is-blocked': t.status === 'blocked', 'is-review': t.status === 'review' }">
              {{ statusBucketLabel(t.status) }}
            </span>
            <span class="cockpit-kanban__who">{{ t.assignee }}</span>
          </div>
        </button>
      </div>
    </div>
```

- [ ] **Step 6: 在 style 末尾新增搜索框 + 任务ID 样式**

```scss
/* ── 搜索框 ── */
.cockpit-kanban__head {
  padding: 8px 12px 8px 16px;
  gap: 6px;
  display: flex;
  align-items: center;
}
.cockpit-kanban__search {
  flex: 1; position: relative; display: flex; align-items: center; min-width: 0;
}
.cockpit-kanban__search-icon {
  position: absolute; left: 6px; font-size: 10px; color: var(--text-muted); pointer-events: none; line-height: 1;
}
.cockpit-kanban__search-input {
  width: 100%; font-size: 11px; padding: 3px 24px 3px 22px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-card); color: var(--text-secondary); font-family: inherit; outline: none;
  &::placeholder { color: var(--text-muted); opacity: 0.6; }
  &:focus { border-color: var(--accent-primary); }
}
.cockpit-kanban__search-clear {
  position: absolute; right: 4px; width: 16px; height: 16px; padding: 0;
  border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.cockpit-kanban__search-spinner {
  position: absolute; right: 6px; width: 10px; height: 10px;
  border: 1.5px solid var(--border-color); border-top-color: var(--accent-primary);
  border-radius: 50%; animation: cockpit-kspin 0.6s linear infinite;
}
@keyframes cockpit-kspin { to { transform: rotate(360deg); } }

/* ── 任务ID ── */
.cockpit-kanban__id {
  font-family: monospace; font-size: 9px; color: var(--text-muted);
  cursor: copy; padding: 0 3px; border-radius: 2px;
  &:hover { color: var(--accent-primary); background: rgba(var(--accent-primary-rgb, 0), 0.08); }
}
```

> 注：`--accent-primary-rgb` 若不存在则会 fallback 到 `0`（alpha 0 无效果），安全降级。

- [ ] **Step 7: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/components/CockpitKanban.vue && git commit -m "feat(cockpit): add search box, hybrid grouping (taskGroups), copyable task ID to CockpitKanban"
```

---

### Task 7: 更新 cockpit-kanban.test.ts

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-kanban.test.ts`

- [ ] **Step 1: mock matrix room 加 `roomList`**

找到 `vi.mock('@/custom/matrix-chat/stores/matrix-room', ...)`，改为：

```ts
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [] }),
}))
```

- [ ] **Step 2: mock hermes sessions API**

在 mock stores 块末尾新增：

```ts
const { mockSearchHermesSessions } = vi.hoisted(() => ({
  mockSearchHermesSessions: vi.fn(async (_q: string) => []),
}))
vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, searchSessions: mockSearchHermesSessions }
})
```

- [ ] **Step 3: 在 beforeAll/afterEach 里 mock `navigator.clipboard`**

在 `seed()` 函数之前新增：

```ts
let origClipboard: any
beforeAll(() => { origClipboard = (globalThis as any).navigator?.clipboard })
afterEach(() => {
  if (origClipboard !== undefined) {
    if (!(globalThis as any).navigator) (globalThis as any).navigator = {}
    ;(globalThis as any).navigator.clipboard = origClipboard
  }
})
```

并且在 `beforeEach` 中设置 mock clipboard：

```ts
beforeEach(() => {
  setActivePinia(createPinia())
  mockKanbanTasks.splice(0, mockKanbanTasks.length)
  mockSearchHermesSessions.mockResolvedValue([])
  // mock clipboard
  if (!(globalThis as any).navigator) (globalThis as any).navigator = {}
  ;(globalThis as any).navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
  // ... existing localStorage setup
```

- [ ] **Step 4: 更新 `seed()` 使用新的 tenant/boardSlug**

```ts
function seed() {
  mockKanbanTasks.push(
    kt({ id: '1', title: 'PR #142', priority: 3, status: 'review', tenant: 'team-a' }),
    kt({ id: '2', title: '联调', priority: 2, status: 'blocked', tenant: 'team-a' }),
    kt({ id: '3', title: '发版', priority: 2, status: 'running', tenant: 'team-b' }),
  )
  return useCockpitStore()
}
```
（不变。——注意：seed 中所有任务都有 tenant，不会触发 null-tenant board 分组，所以保持原测试行为即可。但分组 key 变了，`data-tenant-group` 的断言需要调整）

- [ ] **Step 5: 更新分组测试**

原文：
```ts
it('groups tasks by tenant under tenant headers', () => {
  seed()
  const w = mount(CockpitKanban)
  const groups = w.findAll('[data-tenant-group]')
  const keys = groups.map(g => g.attributes('data-tenant-group'))
  expect(keys.sort()).toEqual(['team-a', 'team-b'])
})
```
`data-tenant-group` 现在绑定的值是 `g.label`（tenant 原值或 boardSlug），而且 key 变了但 label 还是 tenant 值。断言应为：

```ts
it('groups tasks by tenant under tenant headers', () => {
  seed()
  const w = mount(CockpitKanban)
  const groups = w.findAll('[data-tenant-group]')
  const labels = groups.map(g => g.attributes('data-tenant-group'))
  expect(labels.sort()).toEqual(['team-a', 'team-b'])
})
```

- [ ] **Step 6: 新增搜索框测试**

```ts
it('renders search input', () => {
  seed()
  const w = mount(CockpitKanban)
  expect(w.find('[data-search-input]').exists()).toBe(true)
})

it('typing in search filters tasks by local match', async () => {
  seed()
  const w = mount(CockpitKanban)
  // 添加一个空 tenant 的任务以验证混合分组
  mockKanbanTasks.push(
    kt({ id: '4', title: '杂项', priority: 1, status: 'todo', tenant: null, workspace_path: '/w' }),
  )
  const s = useCockpitStore()
  // 输入搜索
  await w.find('[data-search-input]').setValue('PR')
  // trigger debounce directly — but runSearch debounces 300ms. For testing, call store method directly:
  s.runSearch('PR')
  // 需要等一个 tick 让 computed 生效
  await nextTick()
  // filteredTasks 应该只含 title 含 PR 的任务 id='1'
  expect(s.filteredTasks.map(t => t.id)).toEqual(['1'])
  // 清理后恢复全部
  s.clearSearch()
  await nextTick()
  expect(s.filteredTasks.map(t => t.id).sort()).toEqual(['1', '2', '3', '4'])
})
```

（需要 `import { nextTick } from 'vue'` 在文件顶部加。）

- [ ] **Step 7: 新增任务ID 测试**

```ts
it('renders task id copy element per task', () => {
  seed()
  const w = mount(CockpitKanban)
  const ids = w.findAll('[data-task-id-copy]')
  expect(ids).toHaveLength(3)
  expect(ids[0].text()).toBe('#1')
})

it('clicking task id copies to clipboard', async () => {
  seed()
  const w = mount(CockpitKanban)
  await w.find('[data-task-id-copy]').trigger('click')
  const clip = (globalThis as any).navigator.clipboard
  expect(clip.writeText).toHaveBeenCalledWith('1')
})
```

- [ ] **Step 8: 针对租户过滤器芯片的新分组测试（无（未指定））**

```ts
it('tenant filter chips exclude (未指定) when all tasks have tenant', () => {
  seed()
  const w = mount(CockpitKanban)
  // 所有 seed 任务都有 tenant，所以 tenant chip 列表无 (未指定)
  expect(w.find('[data-filter="(未指定)"]').exists()).toBe(false)
})
```

并确认 `tenant filter chips are dynamically generated` 测试依然通过。

- [ ] **Step 9: 跑测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-kanban.test.ts 2>&1 | tail -40
```
Expected: ALL PASS.

- [ ] **Step 10: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/__tests__/cockpit-kanban.test.ts && git commit -m "test(cockpit): update kanban tests for search, task ID, hybrid grouping"
```

---

### Task 8: 最终验证 — 全部测试通过

- [ ] **Step 1: 跑所有 cockpit 测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/ 2>&1 | tail -50
```
Expected: ALL TESTS PASS (包括新增和已有测试)。

- [ ] **Step 2: 检查 TypeScript 编译**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "upstream\|node_modules" | head -20
```
Expected: 无新增 TS 错误（只 overlay custom 相关无报错）。

- [ ] **Step 3: 合入 main 分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge feat/kanban-search-taskid
```

- [ ] **Step 4: 最终 Commit（若有最后 fixup）**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git log --oneline -8
```
Expected: 约 6-7 个 atomic commits，功能完整。

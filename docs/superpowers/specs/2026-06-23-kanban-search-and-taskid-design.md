# Design Doc: kanban 总览栏 — 搜索框 & 移除「(未指定)」& 任务ID 显示

**Date:** 2026-06-23
**Status:** Approved
**Scope:** `overlay/custom/client/cockpit/components/CockpitKanban.vue` + `cockpit store` + 新增 `search-adapter`

---

## 1. Goal

针对 cockpit 左栏「kanban 总览」做三项改动：

1. **搜索框**：标题栏右侧增加搜索框，可搜索 web ui 本地会话库、hermes 历史会话（服务端全文检索）、本地 matrix 聊天记录、kanban 任务信息，命中后筛选出对应的 kanban 任务。
2. **移除「-(未指定)」**：该分组名已过时；tenant 为 null 的任务改为按看板分组（混合分组模式）。
3. **任务ID 显示**：每个 kanban 任务行 meta 区新增任务ID 展示，点击复制。

---

## 2. Current State

**文件：** `overlay/custom/client/cockpit/components/CockpitKanban.vue`

- 标题栏（`.cockpit-kanban__head`）：左侧 `kanban总览`，右侧 `↓ 优先级`，无搜索框。
- 筛选器：优先级 / 状态 / 租户 / 看板 / 日期五类 chip 筛选。
- 任务分组：`tenantGroups` computed —— 按 `t.tenant ?? '(未指定)'` 分组，null tenant 单独成组并显示为 `(未指定)`，排序时 `(未指定)` 被推到最后。
- 任务行 meta：`@boardSlug`、状态标签、负责人。无任务ID。

**Store：** `overlay/custom/client/cockpit/store/cockpit.ts`
- `filteredTasks`：按 priority/status/tenant/boardSlug/dateRange 筛选，tenant 比较用 `t.tenant ?? '(未指定)'`。
- `tasksByTenant`：分组 computed，key = `t.tenant ?? '(未指定)'`。
- `filters.tenants`：租户筛选数组，值为 tenant 原值或 `'(未指定)'`。

**相关 API：**
- `/api/hermes/search/sessions?q=...` → `searchSessions(q)`（upstream `api/hermes/sessions.ts`），服务端全文检索会话标题+消息正文，返回 `SessionSearchResult[]`（含 `id`、`title`、`snippet`）。
- `/api/hermes/sessions/hermes` → `fetchHermesSessions()`，返回 hermes 历史会话列表（不含 api_server source）。
- matrix：`useMatrixRoomStore().roomList`（房间列表，含 name/topic），`messageList`（当前房间消息）。

**tenant 映射约定**（`adapters/collab-adapter.ts`）：kanban 任务的 `tenant` 字段可能是：
- `session:<sessionId>[@<profile>]:<name>` → 关联 hermes 会话
- `matrix:<roomId>:<name>` → 关联 matrix 房间（roomId 可含冒号）
- `group:<roomId>:<name>` → 关联群聊
- 其他/普通字符串 → plain 分组键
- `null` → 无关联

---

## 3. Proposed Changes

### 3.1 搜索框（需求 1）

#### 3.1.1 UI 位置

放在 `.cockpit-kanban__head` 标题栏内联，位于 `kanban总览` 文字与 `↓ 优先级` 之间：

```
[ kanban总览 ] [ 🔍 搜索框...        ] [ ↓ 优先级 ]
```

- 紧凑型 input（`flex: 1` 占位），font-size 11px，带 🔍 前缀图标和清除 `×` 按钮（有内容时显示）。
- placeholder：`搜索 会话/任务/房间`。

#### 3.1.2 搜索数据源与策略

输入关键词 `q`（trim 后非空），300ms debounce 触发：

| # | 数据源 | 检索方式 | 字段 |
|---|--------|----------|------|
| ① | **kanban 任务**（本地 `store.tasks`） | 本地 | title、id、boardSlug、tenant、assignee |
| ② | **matrix 房间**（本地 `matrixRoom.roomList`） | 本地 | name、topic |
| ③ | **hermes 会话/历史**（服务端全文检索） | 异步调 `searchSessions(q)` | title、消息正文 snippet |
| ④ | web ui 本地会话库 | 已包含在 ③ 的服务端结果中（同库）；不单独走 ④ 接口 |

> 决策（已确认）：会话/历史走**服务端全文检索**（`/api/hermes/search/sessions`），支持消息正文检索，能力强。matrix 只搜房间名/topic（本地），不拉取各房间消息正文（避免大量异步请求）。

#### 3.1.3 命中 → 筛选任务映射（新增 `search-adapter.ts`）

核心函数 `mapSearchToTaskIds(q, tasks, matrixRooms, sessionResults): Set<string>`，返回入选任务的 id 集合：

```
result = new Set<string>()

① 直接命中任务：
   for t of tasks:
     if [t.title, t.id, t.boardSlug, t.tenant ?? '', t.assignee].some(s => s.toLowerCase().includes(q.toLowerCase())):
       result.add(t.id)

② matrix 房间命中 → 反查 tenant=matrix:<roomId>:* 的任务：
   matchedRoomIds = matrixRooms.filter(r => [r.name, r.topic].some(s => s?.toLowerCase().includes(q))).map(r => r.roomId)
   for t of tasks where t.tenant?.startsWith('matrix:'):
     const parsed = parseTenant(t.tenant)
     if parsed?.kind === 'matrix' && matchedRoomIds.includes(parsed.routeTarget.params.roomId):
       result.add(t.id)

③ 会话命中 → 反查 tenant=session:<sessionId>@*: 的任务：
   matchedSessionIds = sessionResults.map(s => s.id)
   for t of tasks where t.tenant?.startsWith('session:'):
     const parsed = parseTenant(t.tenant)
     if parsed?.kind === 'session' && matchedSessionIds.includes(parsed.routeTarget.params.sessionId):
       result.add(t.id)

return result
```

> 注：`group:<roomId>` 类型的群聊暂不纳入搜索源（matrix 已覆盖主要聊天场景，group 无现成的本地房间列表 store 可遍历），后续如需可扩展。

#### 3.1.4 Store 改动（`cockpit.ts`）

新增 state：
- `searchQuery: ref<string>('')`
- `_sessionSearchCache: ref<Record<string, { ts: number; results: SessionSearchResult[] }>>({})`（query → 缓存，5min TTL）
- `_sessionSearching: ref<boolean>`（loading 态）

新增 computed / 方法：
- `searchResult`（computed）：返回当前 `searchQuery` 对应的任务 id 集合（`Set<string>`）。本地部分同步算；服务端部分异步更新后通过响应式触发重算。
- `runSearch(q: string)`：set searchQuery；本地即时；若 q 非空且缓存未命中且未在请求中，调 `searchSessions(q)`，结果写缓存，更新 `searchResult`。**debounce 300ms**（在 store 内用 setTimeout + 清理上一次 timer 实现）。
- `clearSearch()`：searchQuery 置空，清缓存可保留（下次复用）。

`filteredTasks` 改造（末尾追加 AND 条件）：
```ts
const q = searchQuery.value.trim()
const searchOk = !q || searchResult.value.has(t.id)
return ...原筛选... && searchOk
```
（`searchQuery` 是 store 内的 ref，`searchResult` 是新增 computed。）

> 服务端搜索是异步的：首次输入时本地筛选先生效（①②），③ 的会话结果返回后 `searchResult` 重算，列表自动补入新命中任务。用户无需等待。

#### 3.1.5 CockpitKanban.vue 改动

- `.cockpit-kanban__head` 内新增搜索 input，`v-model` 绑 `store.searchQuery`，`@input` 调 `store.runSearch`（debounce 在 store 内）。
- 清除按钮 `×`：`v-if="store.searchQuery"`，点击 `store.clearSearch()`。
- 搜索中态：input 右侧小 spinner（`v-if="store._sessionSearching"`），或在 input 边框加微动效。

### 3.2 移除「-(未指定)」+ 混合分组（需求 2）

#### 3.2.1 分组逻辑改写

将 `tasksByTenant` 重命名为 `taskGroups`，返回 `Array<{ key: string; label: string; tasks: CockpitTask[] }>`：

```ts
const taskGroups = computed(() => {
  const map: Record<string, CockpitTask[]> = {}
  const labelMap: Record<string, string> = {}
  for (const t of filteredTasks.value) {
    let key: string, label: string
    if (t.tenant) {
      // 有 tenant：按 tenant 分组，label 用 parseTenant 的可读名（fallback tenant 原值）
      key = 'tenant::' + t.tenant
      const parsed = parseTenant(t.tenant)
      label = parsed?.label ?? t.tenant
    } else {
      // null tenant：按 boardSlug 分组
      key = 'board::' + t.boardSlug
      label = t.boardSlug  // 看板 slug 作为分组名
    }
    ;(map[key] ??= []).push(t)
    labelMap[key] = label
  }
  return Object.keys(map)
    .sort((a, b) => {
      // tenant 分组在前（按 label 字母序），board 分组在后
      const aIsBoard = a.startsWith('board::')
      const bIsBoard = b.startsWith('board::')
      if (aIsBoard !== bIsBoard) return aIsBoard ? 1 : -1
      return (labelMap[a]).localeCompare(labelMap[b])
    })
    .map(key => ({ key, label: labelMap[key], tasks: map[key] }))
})
```

#### 3.2.2 同步移除 `(未指定)`

全局搜索 `(未指定)` 字面量，替换/删除：
- `CockpitKanban.vue`：`tenantOptions` computed（`t.tenant ?? '(未指定)'` → 仅收集非 null tenant）、`tenantGroups` 排序里的 `(未指定)` 判断。
- `cockpit.ts`：`filteredTasks` 的 `okArr(f.tenants, t.tenant ?? '(未指定)')` → 改为 `t.tenant != null && okArr(f.tenants, t.tenant)`（null tenant 不参与 tenant 筛选，始终通过该条件）。
- `tests`：更新断言。

> tenant 筛选 chip 仍按实际 tenant 值生成（已无 `(未指定)` 选项）；null tenant 的任务只受 board/优先级/状态/日期/搜索筛选控制。

### 3.3 任务ID 显示（需求 3）

#### 3.3.1 UI

每个任务行 meta 区，在 `@boardSlug` 之后新增：
```html
<span class="cockpit-kanban__id" :data-task-id-copy="t.id"
  :title="`点击复制任务ID: ${t.id}`"
  @click.stop="copyTaskId(t.id)">#{{ t.id }}</span>
```

- monospace，font-size 9px，`var(--text-muted)`；hover 时变色 + cursor copy。
- `@click.stop` 阻止冒泡到任务行的 selectTask。

#### 3.3.2 复制交互

`copyTaskId(id)`：`navigator.clipboard?.writeText(id)`，失败静默（兼容非安全上下文）。可选加一次性 toast/微动效（当前组件无 toast 体系，暂用 title 提示 + 控制台 log）。

> 决策（已确认）：任务ID 支持点击复制。

### 3.4 样式新增

```scss
.cockpit-kanban__head {
  // 调整：给搜索框让位
  padding: 8px 44px 8px 16px;
  gap: 8px;
}
.cockpit-kanban__search {
  flex: 1; position: relative; display: flex; align-items: center;
}
.cockpit-kanban__search-input {
  width: 100%; font-size: 11px; padding: 3px 22px 3px 22px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-card); color: var(--text-secondary); font-family: inherit;
  &:focus { outline: none; border-color: var(--accent-primary); }
}
.cockpit-kanban__search-icon { position: absolute; left: 7px; color: var(--text-muted); pointer-events: none; }
.cockpit-kanban__search-clear {
  position: absolute; right: 4px; width: 16px; height: 16px; padding: 0;
  border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1;
}
.cockpit-kanban__id {
  font-family: monospace; font-size: 9px; color: var(--text-muted);
  cursor: copy; padding: 0 2px;
  &:hover { color: var(--accent-primary); }
}
```

---

## 4. Architecture / Isolation

新增 **`search-adapter.ts`**（纯函数，易测试）：
- `mapSearchToTaskIds(q, tasks, matrixRooms, sessionResults): Set<string>`
- `matchLocalTask(t, q): boolean`
- `matchMatrixRoom(room, q): string | null`（返回 roomId 或 null）

`cockpit.ts` 负责状态、debounce、缓存、异步请求；`CockpitKanban.vue` 只做渲染 + 绑定。`search-adapter.ts` 不依赖 store，纯输入输出。

---

## 5. Error Handling

- `searchSessions(q)` 失败：静默 catch，`searchResult` 退化为仅本地命中（①②）。不阻塞列表渲染。
- matrix `roomList` 为空：② 步跳过，无副作用。
- `navigator.clipboard` 不存在（非 HTTPS）：复制静默失败，title 仍提示。
- debounce timer 清理：store 内用模块级 `let _searchTimer`，runSearch 前 clearTimeout。

---

## 6. Testing

### 6.1 新增 `search-adapter.test.ts`
- `matchLocalTask`：title/id/tenant/assignee 命中各一例 + 大小写。
- `mapSearchToTaskIds`：
  - 仅本地命中（任务 title 含 q）。
  - matrix 房间命中 → 反查到 `matrix:<roomId>:*` 任务。
  - 会话命中 → 反查到 `session:<sessionId>@*: ` 任务。
  - 无对应任务的会话命中 → 不影响任务集。
  - q 为空 → 返回空集（上层 searchOk 逻辑短路）。

### 6.2 更新 `cockpit-kanban.test.ts`
- 搜索框存在（`[data-search-input]`）。
- 输入 q 后任务列表筛选（mock `searchSessions` 返回空，验证本地命中）。
- 混合分组：null tenant 任务归入 boardSlug 分组；有 tenant 归入 tenant 分组。
- 任务行含 `[data-task-id-copy]`。
- 移除 `(未指定)`：seed 含 null tenant 任务，断言不出现 `(未指定)` 分组。

### 6.3 更新 `cockpit-store.test.ts`
- `filteredTasks` 在有 searchQuery 时按 searchResult 收窄。
- `clearSearch` 恢复全部。
- null tenant 任务在 tenant 筛选下不被错误过滤（始终通过 tenant 条件）。

---

## 7. Out of Scope

- group 群聊的搜索源接入（未来可扩展，复用 `mapSearchToTaskIds`）。
- 搜索结果的高级排序/高亮命中片段（本版只做筛选，不做高亮）。
- 搜索历史/记忆（不做 localStorage 持久化）。
- CockpitView 的 kanban 详情弹窗里的 `(未指定)`（line 204）—— 那是详情展示，不在本需求「kanban总览栏」范围内，保留原样（后续如需统一可单独处理）。

---

## 8. Files Touched

| 文件 | 改动 |
|------|------|
| `overlay/custom/client/cockpit/components/CockpitKanban.vue` | 搜索框 UI、混合分组渲染、任务ID 行、样式 |
| `overlay/custom/client/cockpit/store/cockpit.ts` | searchQuery/runSearch/searchResult、taskGroups、filteredTasks 改造、移除 `(未指定)` |
| `overlay/custom/client/cockpit/adapters/search-adapter.ts` | **新增** 搜索映射纯函数 |
| `overlay/custom/client/cockpit/__tests__/search-adapter.test.ts` | **新增** |
| `overlay/custom/client/cockpit/__tests__/cockpit-kanban.test.ts` | 更新：搜索、分组、任务ID |
| `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` | 更新：searchQuery 筛选、null tenant |

全部在 `overlay/` 内，不修改 `upstream/`。

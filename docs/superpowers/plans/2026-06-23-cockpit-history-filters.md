# Cockpit 历史回溯筛选器补齐 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Cockpit 注意力条 🕘 历史弹窗的 5 行筛选器（搜索/时间/类别/动作/状态）+ hover 选中色条 + 点击联动增强

**Architecture:** 纯前端改动，数据源保持 `/api/hermes/kanban/timeline` 不变。HistoryItem 接口添加 `ts`/`source` 字段供筛选使用；store 扩展 `HistoryFilters` 类型和 `filteredHistory` 过滤链；弹窗组件追加 3 行新筛选 UI；i18n 补 9 个新 key。

**Tech Stack:** Vue 3 + Pinia + TypeScript + SCSS + vue-i18n

**设计文档:** `docs/superpowers/specs/2026-06-23-cockpit-history-filters-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `adapters/history-adapter.ts` | 修改 | `HistoryItem` 加 `ts`/`source` 字段；`mergeTimeline` 透传 |
| `store/cockpit.ts` | 修改 | `HistoryFilters` 扩展为 5 维；`filteredHistory` 重写过滤链；新增 4 个 toggle/set 方法；`recallHistoryItem` 加 `setWorkspaceMode` |
| `components/CockpitHistoryModal.vue` | 修改 | 5 行筛选器布局 + 搜索输入 + 时间/类别/chip + 状态三态 + hover 色条样式 |
| `patches/080-i18n-cockpit-history-en.patch` | 新增 | 英文 i18n 9 个新 key |
| `patches/081-i18n-cockpit-history-zh.patch` | 新增 | 中文 i18n 9 个新 key |
| `__tests__/cockpit-history-modal.test.ts` | 修改 | 适配新 HistoryItem 字段 + 新筛选行为 |

---

### Task 1: history-adapter.ts — HistoryItem 加 ts/source 字段

**Files:**
- Modify: `overlay/custom/client/cockpit/adapters/history-adapter.ts`

- [ ] **Step 1: 更新 HistoryItem 接口**

```ts
export interface HistoryItem {
  id: string
  when: string
  ts: number              // 新增：原始毫秒时间戳
  taskId: string
  source: 'event' | 'comment'  // 新增
  action: string
  title: string
  archived: boolean
}
```

- [ ] **Step 2: 更新 mergeTimeline 透传新字段**

```ts
export function mergeTimeline(items: TimelineRawItem[]): HistoryItem[] {
  return items
    .slice()
    .sort((a, b) => toMs(b.ts) - toMs(a.ts))
    .map(it => ({
      id: `h-${it.id}`,
      when: formatWhen(toMs(it.ts)),
      ts: toMs(it.ts),
      taskId: it.taskId,
      source: it.source,
      action: deriveAction(it.source, { kind: it.kind, payload: it.payload }),
      title: it.source === 'comment'
        ? (it.body ?? '')
        : kindToWhat(it.kind ?? '', it.payload ?? null),
      archived: it.taskArchived,
    }))
}
```

- [ ] **Step 3: 运行测试确认编译通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx tsc --noEmit 2>&1 | head -30
```

---

### Task 2: store/cockpit.ts — HistoryFilters 扩展 + 过滤链重写

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`

- [ ] **Step 1: 替换 HistoryFilters 接口**

将：
```ts
export type HistoryFilters = { actions: string[]; archived: 'all' | 'only' | 'exclude' }
```

替换为：
```ts
export interface HistoryFilters {
  search: string
  timeRange: 'today' | 'week' | 'month' | null
  categories: ('event' | 'comment')[]
  actions: string[]
  statuses: ('active' | 'done' | 'archived')[]
}
```

- [ ] **Step 2: 更新 historyFilters 初始值**

将：
```ts
const historyFilters = ref<HistoryFilters>({ actions: [], archived: 'all' })
```

替换为：
```ts
const historyFilters = ref<HistoryFilters>({
  search: '',
  timeRange: null,
  categories: ['event', 'comment'],
  actions: [],
  statuses: ['active', 'done', 'archived'],
})
```

- [ ] **Step 3: 重写 filteredHistory computed**

将：
```ts
const filteredHistory = computed(() =>
  history.value.filter(h => {
    const f = historyFilters.value
    const actionOk = f.actions.length === 0 || f.actions.includes(h.action)
    const archOk = f.archived === 'all' ? true : f.archived === 'only' ? h.archived : !h.archived
    return actionOk && archOk
  }),
)
```

替换为：
```ts
const filteredHistory = computed(() =>
  history.value.filter(h => {
    const f = historyFilters.value

    // 搜索：标题模糊匹配
    const q = f.search.trim().toLowerCase()
    const searchOk = !q || h.title.toLowerCase().includes(q)

    // 时间片（互斥三选一，null=不限）
    let timeOk = true
    if (f.timeRange) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      if (f.timeRange === 'today') {
        timeOk = h.ts >= todayStart
      } else if (f.timeRange === 'week') {
        const dow = now.getDay()
        const mondayOffset = dow === 0 ? -6 : 1 - dow
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset).getTime()
        timeOk = h.ts >= weekStart
      } else {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        timeOk = h.ts >= monthStart
      }
    }

    // 类别（多选）
    const catOk = f.categories.length === 0 || f.categories.includes(h.source)

    // 动作（多选）
    const actionOk = f.actions.length === 0 || f.actions.includes(h.action)

    // 状态（多选，从本地 tasks 查找任务当前状态）
    let statusOk = true
    if (f.statuses.length > 0 && f.statuses.length < 3) {
      const task = tasks.value.find(t => t.id === h.taskId)
      const isDone = task?.status === 'done' || task?.status === 'archived'
      if (f.statuses.includes('active') && !isDone && !h.archived) statusOk = true
      else if (f.statuses.includes('done') && isDone && !h.archived) statusOk = true
      else if (f.statuses.includes('archived') && h.archived) statusOk = true
      else statusOk = false
    }

    return searchOk && timeOk && catOk && actionOk && statusOk
  }),
)
```

- [ ] **Step 4: 添加 4 个新方法**

在 `setHistoryArchivedFilter` 方法旁添加（可保留 `setHistoryArchivedFilter` 但不再使用，或直接替换）：

```ts
function setHistorySearch(v: string) { historyFilters.value.search = v }
function setHistoryTimeRange(v: 'today' | 'week' | 'month' | null) {
  historyFilters.value.timeRange = historyFilters.value.timeRange === v ? null : v
}
function toggleHistoryCategory(v: 'event' | 'comment') {
  const arr = historyFilters.value.categories
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1); else arr.push(v)
}
function toggleHistoryStatus(v: 'active' | 'done' | 'archived') {
  const arr = historyFilters.value.statuses
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1); else arr.push(v)
}
```

- [ ] **Step 5: 增强 recallHistoryItem**

在 `recallHistoryItem` 函数中新增 `setWorkspaceMode('work')`：

```ts
function recallHistoryItem(id: string) {
  const item = history.value.find(h => h.id === id)
  if (!item) return
  selectTask(item.taskId)
  setWorkspaceMode('work')          // 新增：右栏切到工作项模式
  archivedMode.value = item.archived
  historyOpen.value = false
}
```

- [ ] **Step 6: 更新 store return**

在 return 对象中添加新增方法：

```ts
return {
  // ... 已有导出 ...
  setHistorySearch,
  setHistoryTimeRange,
  toggleHistoryCategory,
  toggleHistoryStatus,
  // setHistoryArchivedFilter 可保留或移除
}
```

- [ ] **Step 7: 运行测试确认编译通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx tsc --noEmit 2>&1 | head -30
```

---

### Task 3: CockpitHistoryModal.vue — 5 行筛选器 + hover 色条

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitHistoryModal.vue`

- [ ] **Step 1: 更新 script 定义——替换常量数组**

在 `<script setup lang="ts">` 中将：
```ts
const ACTIONS: { key: string; labelKey: string }[] = [
  { key: '审批', labelKey: 'cockpit.actionApprove' },
  { key: '决策', labelKey: 'cockpit.actionDecide' },
  { key: '补充', labelKey: 'cockpit.actionSupplement' },
  { key: '评估', labelKey: 'cockpit.actionEvaluate' },
  { key: '委派', labelKey: 'cockpit.actionDelegate' },
]
const ARCHIVE_OPTS: { key: 'all' | 'only' | 'exclude'; labelKey: string }[] = [
  { key: 'all', labelKey: 'cockpit.historyAll' },
  { key: 'only', labelKey: 'cockpit.historyArchivedOnly' },
  { key: 'exclude', labelKey: 'cockpit.historyActiveOnly' },
]
```

替换为：
```ts
const TIME_OPTS: { key: 'today' | 'week' | 'month'; labelKey: string }[] = [
  { key: 'today', labelKey: 'cockpit.historyToday' },
  { key: 'week', labelKey: 'cockpit.historyWeek' },
  { key: 'month', labelKey: 'cockpit.historyMonth' },
]
const CAT_OPTS: { key: 'event' | 'comment'; labelKey: string }[] = [
  { key: 'event', labelKey: 'cockpit.historyCatEvent' },
  { key: 'comment', labelKey: 'cockpit.historyCatComment' },
]
const ACTIONS: { key: string; labelKey: string }[] = [
  { key: '审批', labelKey: 'cockpit.actionApprove' },
  { key: '决策', labelKey: 'cockpit.actionDecide' },
  { key: '补充', labelKey: 'cockpit.actionSupplement' },
  { key: '评估', labelKey: 'cockpit.actionEvaluate' },
  { key: '委派', labelKey: 'cockpit.actionDelegate' },
]
const STATUS_OPTS: { key: 'active' | 'done' | 'archived'; labelKey: string }[] = [
  { key: 'active', labelKey: 'cockpit.historyActive' },
  { key: 'done', labelKey: 'cockpit.historyDone' },
  { key: 'archived', labelKey: 'cockpit.historyArchived' },
]
```

- [ ] **Step 2: 替换 filters 模板**

将现有 filters div：
```xml
<div class="cockpit-history-modal__filters">
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyAction') }}</span>
    <button v-for="a in ACTIONS" :key="a.key" type="button" :data-action-filter="a.key"
      class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.actions.includes(a.key) }"
      @click="store.toggleHistoryAction(a.key)">{{ t(a.labelKey) }}</button>
  </div>
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyStatus') }}</span>
    <button v-for="o in ARCHIVE_OPTS" :key="o.key" type="button"
      class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.archived === o.key }"
      @click="store.setHistoryArchivedFilter(o.key)">{{ t(o.labelKey) }}</button>
  </div>
</div>
```

替换为：
```xml
<div class="cockpit-history-modal__filters">
  <!-- Row 1: Search -->
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">🔍</span>
    <input type="text" class="cockpit-history-modal__search"
      :value="store.historyFilters.search"
      @input="store.setHistorySearch(($event.target as HTMLInputElement).value)"
      :placeholder="t('cockpit.historySearchPlaceholder')" />
  </div>
  <!-- Row 2: Time -->
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyTime') }}</span>
    <button v-for="opt in TIME_OPTS" :key="opt.key" type="button"
      class="cockpit-history-modal__chip"
      :class="{ 'is-on': store.historyFilters.timeRange === opt.key }"
      @click="store.setHistoryTimeRange(opt.key)">{{ t(opt.labelKey) }}</button>
  </div>
  <!-- Row 3: Category -->
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyCategory') }}</span>
    <button v-for="c in CAT_OPTS" :key="c.key" type="button"
      class="cockpit-history-modal__chip"
      :class="{ 'is-on': store.historyFilters.categories.includes(c.key) }"
      @click="store.toggleHistoryCategory(c.key)">{{ t(c.labelKey) }}</button>
  </div>
  <!-- Row 4: Action -->
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyAction') }}</span>
    <button v-for="a in ACTIONS" :key="a.key" type="button" :data-action-filter="a.key"
      class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.actions.includes(a.key) }"
      @click="store.toggleHistoryAction(a.key)">{{ t(a.labelKey) }}</button>
  </div>
  <!-- Row 5: Status -->
  <div class="cockpit-history-modal__frow">
    <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyStatus') }}</span>
    <button v-for="o in STATUS_OPTS" :key="o.key" type="button"
      class="cockpit-history-modal__chip"
      :class="{ 'is-on': store.historyFilters.statuses.includes(o.key) }"
      @click="store.toggleHistoryStatus(o.key)">{{ t(o.labelKey) }}</button>
  </div>
</div>
```

- [ ] **Step 3: 添加搜索输入框样式**

在 `<style scoped lang="scss">` 中添加：
```scss
.cockpit-history-modal__search {
  flex: 1; height: 26px; padding: 0 8px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-secondary); color: var(--text-primary);
  font: inherit; font-size: 11px; outline: none;
  &:focus { border-color: var(--accent-primary); }
  &::placeholder { color: var(--text-muted); }
}
```

- [ ] **Step 4: 列表项 hover 加左色条**

在 `.cockpit-history-modal__item` 样式中添加/修改：
```scss
.cockpit-history-modal__item {
  // ... 保留现有定位/布局样式 ...
  position: relative;
  transition: background 0.1s, box-shadow 0.1s;
  &:hover {
    background: var(--bg-secondary);
    box-shadow: inset 3px 0 0 var(--accent-primary);
  }
}
```

- [ ] **Step 5: 运行测试确认编译通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx tsc --noEmit 2>&1 | head -30
```

---

### Task 4: i18n 补丁 — 新增 9 个 cockpit history key

**Files:**
- Create: `overlay/patches/080-i18n-cockpit-history-en.patch`
- Create: `overlay/patches/081-i18n-cockpit-history-zh.patch`

需要在 upstream `packages/client/src/i18n/locales/en.ts` 的 `cockpit: { ... }` 对象内添加新 key，位置在 `schedule` 和 `search` 之间（第 343-344 行之间）。

当前 en.ts 第 341-345 行：
```ts
    schedule: 'Schedule',
    search: 'Search tasks, spaces, agents…',
    actionApprove: 'Approve',
```

在 `search` 行后、`actionApprove` 行前插入 9 个 key。

当前 zh.ts 第 341-345 行：
```ts
    schedule: '日程',
    search: '搜索任务、空间、Agent…',
    actionApprove: '审批',
```

- [ ] **Step 1: 创建英文 i18n patch**

`overlay/patches/080-i18n-cockpit-history-en.patch`:
```patch
diff --git a/packages/client/src/i18n/locales/en.ts b/packages/client/src/i18n/locales/en.ts
index efcc5613..ac029fe2 100644
--- a/packages/client/src/i18n/locales/en.ts
+++ b/packages/client/src/i18n/locales/en.ts
@@ -342,6 +342,15 @@ export default {
     search: 'Search tasks, spaces, agents…',
+    historySearchPlaceholder: 'Search history…',
+    historyToday: 'Today',
+    historyWeek: 'This Week',
+    historyMonth: 'This Month',
+    historyCategory: 'Category',
+    historyCatEvent: 'Events',
+    historyCatComment: 'Comments',
+    historyActive: 'Active',
+    historyDone: 'Done',
     actionApprove: 'Approve',
```

- [ ] **Step 2: 创建中文 i18n patch**

`overlay/patches/081-i18n-cockpit-history-zh.patch`:
```patch
diff --git a/packages/client/src/i18n/locales/zh.ts b/packages/client/src/i18n/locales/zh.ts
index b88b6e96..1b97a61a 100644
--- a/packages/client/src/i18n/locales/zh.ts
+++ b/packages/client/src/i18n/locales/zh.ts
@@ -342,6 +342,15 @@ export default {
     search: '搜索任务、空间、Agent…',
+    historySearchPlaceholder: '搜索历史事件…',
+    historyToday: '今天',
+    historyWeek: '本周',
+    historyMonth: '本月',
+    historyCategory: '类别',
+    historyCatEvent: '事件',
+    historyCatComment: '评论',
+    historyActive: '进行中',
+    historyDone: '已完成',
     actionApprove: '审批',
```

- [ ] **Step 3: 运行 npm run inject 确认 patch 注入成功**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run inject 2>&1 | tail -20
```

---

### Task 5: 测试更新

**Files:**
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-history-modal.test.ts`

- [ ] **Step 1: 更新 seed 数据——添加 ts/source 新字段**

在 `seed()` 函数中，给 mock history 数据添加 `ts` 和 `source`：
```ts
function seed() {
  mockKanbanTasks.push(kt({ id: 't1' }))
  const s = useCockpitStore()
  s.history = [
    { id: 'h-evt-1', when: '今天 14:36', ts: Date.now(), taskId: 't1', source: 'event' as const, action: '审批', title: '审批 PR #142', archived: false },
    { id: 'h-cmt-2', when: '昨天 18:40', ts: Date.now() - 86400000, taskId: 't1', source: 'comment' as const, action: '补充', title: '审批 v2.2', archived: true },
  ]
  return s
}
```

- [ ] **Step 2: 更新 archive 筛选测试——适配 statuses 新字段**

原测试 `it('clicking an archived item sets archived mode')` 无需改动（测试 recallHistoryItem 行为，逻辑不变）。

- [ ] **Step 3: 添加新筛选器的测试**

在现有 `describe('CockpitHistoryModal', ...)` 中添加：
```ts
it('search filter filters by title', () => {
  const s = seed()
  s.setHistorySearch('审批 PR')
  const filtered = s.filteredHistory
  expect(filtered.length).toBe(1)
  expect(filtered[0].id).toBe('h-evt-1')
})

it('time range filter works', () => {
  const s = seed()
  // history item ts 是今天，应该通过 today 筛选
  s.setHistoryTimeRange('today')
  expect(s.filteredHistory.length).toBeGreaterThan(0)
})

it('category filter hides events when only comments selected', () => {
  const s = seed()
  s.toggleHistoryCategory('event')  // 取消事件
  const filtered = s.filteredHistory
  expect(filtered.every(h => h.source === 'comment')).toBe(true)
})

it('status filter shows only archived items', () => {
  const s = seed()
  s.toggleHistoryStatus('active')   // 取消进行中
  s.toggleHistoryStatus('done')     // 取消已完成
  const filtered = s.filteredHistory
  expect(filtered.every(h => h.archived === true)).toBe(true)
})
```

- [ ] **Step 4: 运行测试确认全部通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-history-modal.test.ts 2>&1
```

预期输出：`Tests  1 file | 9 passed (or similar)`

---

## 自审清单

1. **Spec 覆盖**：
   - 搜索筛选 → Task 2 (filteredHistory) + Task 3 (search input)
   - 时间筛选 → Task 2 (filteredHistory) + Task 3 (time chip)
   - 类别筛选 → Task 1 (source field) + Task 2 (filteredHistory) + Task 3 (category chip)
   - 动作筛选 → 已有，Task 3 保持
   - 状态筛选 → Task 2 (filteredHistory + toggleHistoryStatus) + Task 3 (status chip)
   - Hover 左色条 → Task 3 (style)
   - 点击联动增强 → Task 2 (recallHistoryItem)
   - i18n → Task 4

2. **占位符检查**：无 TBD/TODO

3. **类型一致性**：HistoryItem.ts/source 在 Task 1 定义，Task 2 filteredHistory 中引用，Task 5 测试数据中赋值，一致

# Cockpit 历史回溯筛选器补齐设计

**日期**：2026-06-23
**状态**：待评审
**基线设计**：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.8 历史回溯弹窗）
**适用项目**：`overlay/custom/client/cockpit/`

---

## 1. 背景

当前 Cockpit 注意力条右侧 🕘 **历史** 按钮已能打开 `CockpitHistoryModal` 显示历史事件，但与设计规格 §5.8 的 5 行筛选器相比存在缺口：

| 设计要求的筛选器 | 当前实现 |
|-----------------|---------|
| 搜索 | ❌ 缺失 |
| 时间（今天·本周·本月） | ❌ 缺失 |
| 类别 | ❌ 缺失 |
| 动作（审批·决策·补充·评估·委派） | ✅ 已有 |
| 状态（进行中·已完成·已归档） | 🔶 部分（只有 all/archived/active） |

此外 hover 选中语言和点击联动也有待补强。

## 2. 实施策略：渐进式

采用方案三（渐进迭代）：

- **批次 1（本次）**：补齐 5 行筛选器 + hover 色条 + 点击联动增强
- **批次 2（后续）**：中栏时序自动滚动到该条事件 + 右栏标题/待办同步

本 spec 仅覆盖批次 1。

## 3. 批次 1 详细设计

### 3.1 HistoryItem 接口扩展

**文件**：`overlay/custom/client/cockpit/adapters/history-adapter.ts`

```ts
export interface HistoryItem {
  id: string
  when: string
  ts: number              // 新增：原始毫秒时间戳（供时间筛选排序）
  taskId: string
  source: 'event' | 'comment'  // 新增：供类别筛选
  action: string
  title: string
  archived: boolean
}
```

`mergeTimeline` 新增 ts/source 映射：

```ts
export function mergeTimeline(items: TimelineRawItem[]): HistoryItem[] {
  return items
    .slice()
    .sort((a, b) => toMs(b.ts) - toMs(a.ts))
    .map(it => ({
      id: `h-${it.id}`,
      when: formatWhen(toMs(it.ts)),
      ts: toMs(it.ts),                         // 新增
      taskId: it.taskId,
      source: it.source,                       // 新增
      action: deriveAction(it.source, { kind: it.kind, payload: it.payload }),
      title: it.source === 'comment'
        ? (it.body ?? '')
        : kindToWhat(it.kind ?? '', it.payload ?? null),
      archived: it.taskArchived,
    }))
}
```

### 3.2 Store 状态扩展

**文件**：`overlay/custom/client/cockpit/store/cockpit.ts`

`HistoryFilters` 接口扩展：

```ts
export interface HistoryFilters {
  search: string                                   // 新增：搜索关键词
  timeRange: 'today' | 'week' | 'month' | null     // 新增：时间片
  categories: ('event' | 'comment')[]              // 新增：类别多选
  actions: string[]                                // 已有
  statuses: ('active' | 'done' | 'archived')[]     // 新增：状态多选
}
```

初始化默认值：

```ts
const historyFilters = ref<HistoryFilters>({
  search: '',
  timeRange: null,
  categories: ['event', 'comment'],   // 默认全选
  actions: [],
  statuses: ['active', 'done', 'archived'],  // 默认全选
})
```

`filteredHistory` computed 重写（新增搜索 + 时间 + 类别 + 状态过滤链）：

```ts
const filteredHistory = computed(() =>
  history.value.filter(h => {
    const f = historyFilters.value

    // 搜索：标题模糊匹配
    const searchOk = !f.search.trim() || h.title.toLowerCase().includes(f.search.trim().toLowerCase())

    // 时间片
    let timeOk = true
    if (f.timeRange) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      if (f.timeRange === 'today') {
        timeOk = h.ts >= todayStart
      } else if (f.timeRange === 'week') {
        const dayOfWeek = now.getDay()
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset).getTime()
        timeOk = h.ts >= weekStart
      } else if (f.timeRange === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        timeOk = h.ts >= monthStart
      }
    }

    // 类别
    const catOk = f.categories.length === 0 || f.categories.includes(h.source)

    // 动作
    const actionOk = f.actions.length === 0 || f.actions.includes(h.action)

    // 状态（从本地 tasks 查找当前任务状态，避免依赖后端新字段）
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

新增 store toggle 方法：

```ts
function setHistoryTimeRange(v: 'today' | 'week' | 'month' | null) {
  historyFilters.value.timeRange = v
}
function toggleHistoryCategory(v: 'event' | 'comment') {
  const arr = historyFilters.value.categories
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}
function toggleHistoryStatus(v: 'active' | 'done' | 'archived') {
  const arr = historyFilters.value.statuses
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}
function setHistorySearch(v: string) {
  historyFilters.value.search = v
}
```

Store 对外暴露：

```ts
return {
  // ... 已有导出
  setHistoryTimeRange,
  toggleHistoryCategory,
  toggleHistoryStatus,
  setHistorySearch,
}
```

### 3.3 CockpitHistoryModal 视图更新

**文件**：`overlay/custom/client/cockpit/components/CockpitHistoryModal.vue`

#### 布局

```
┌─ cockpit-history-modal ──────────────────────────────────┐
│ 🕘 历史回溯                                       [✕]  │
├──────────────────────────────────────────────────────────┤
│ Row 1: 🔍 [seach input                    ]             │  ← 新增
│ Row 2: 时 间：今天  本周  本月                           │  ← 新增
│ Row 3: 类 别：事件  评论                                 │  ← 新增
│ Row 4: 动 作：审批 决策 补充 评估 委派                   │  ← 保持
│ Row 5: 状 态：进行中  已完成  已归档                     │  ← 修改
├──────────────────────────────────────────────────────────┤
│ [列表项...]                                              │
└──────────────────────────────────────────────────────────┘
```

#### Row 1 — 搜索

```vue
<div class="cockpit-history-modal__frow">
  <span class="cockpit-history-modal__flabel">🔍</span>
  <input type="text" class="cockpit-history-modal__search"
    :value="store.historyFilters.search"
    @input="store.setHistorySearch(($event.target as HTMLInputElement).value)"
    :placeholder="t('cockpit.historySearchPlaceholder')" />
</div>
```

样式：

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

#### Row 2 — 时间（互斥三选一）

```vue
<div class="cockpit-history-modal__frow">
  <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyTime') }}</span>
  <button v-for="opt in TIME_OPTS" :key="opt.key" type="button"
    class="cockpit-history-modal__chip"
    :class="{ 'is-on': store.historyFilters.timeRange === opt.key }"
    @click="store.setHistoryTimeRange(store.historyFilters.timeRange === opt.key ? null : opt.key)">
    {{ t(opt.labelKey) }}
  </button>
</div>
```

```ts
const TIME_OPTS: { key: 'today' | 'week' | 'month'; labelKey: string }[] = [
  { key: 'today', labelKey: 'cockpit.historyToday' },
  { key: 'week', labelKey: 'cockpit.historyWeek' },
  { key: 'month', labelKey: 'cockpit.historyMonth' },
]
```

交互：点击同一 chip 取消选中（回到"不限"）、点击其他 chip 切换。

#### Row 3 — 类别（多选）

```vue
<div class="cockpit-history-modal__frow">
  <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyCategory') }}</span>
  <button v-for="c in CAT_OPTS" :key="c.key" type="button"
    class="cockpit-history-modal__chip"
    :class="{ 'is-on': store.historyFilters.categories.includes(c.key) }"
    @click="store.toggleHistoryCategory(c.key)">
    {{ t(c.labelKey) }}
  </button>
</div>
```

```ts
const CAT_OPTS: { key: 'event' | 'comment'; labelKey: string }[] = [
  { key: 'event', labelKey: 'cockpit.historyCatEvent' },
  { key: 'comment', labelKey: 'cockpit.historyCatComment' },
]
```

#### Row 5 — 状态（调整为三态）

状态判定不依赖后端新增字段，而是通过 store 本地 `tasks` 数组查询任务当前状态：

| 选中项 | 判定逻辑 |
|--------|---------|
| 进行中 | `h.archived === false` 且 `task.status` 非 done/archived |
| 已完成 | `h.archived === false` 且 `task.status === 'done'` |
| 已归档 | `h.archived === true` |

```ts
const STATUS_OPTS: { key: 'active' | 'done' | 'archived'; labelKey: string }[] = [
  { key: 'active', labelKey: 'cockpit.historyActive' },
  { key: 'done', labelKey: 'cockpit.historyDone' },
  { key: 'archived', labelKey: 'cockpit.historyArchived' },
]
```

将原 `ARCHIVE_OPTS` 替换为 `STATUS_OPTS`，chip 点击调用 `store.toggleHistoryStatus()`。

### 3.4 Hover 左色条（统一选中语言）

**文件**：`CockpitHistoryModal.vue`（style）

```scss
.cockpit-history-modal__item {
  // ... 已有样式
  position: relative;
  transition: background 0.1s, box-shadow 0.1s;
  &:hover {
    background: var(--bg-secondary);
    box-shadow: inset 3px 0 0 var(--accent-primary);
  }
  &.is-selected {
    background: rgba(0, 0, 0, 0.05);
    box-shadow: inset 3px 0 0 var(--accent-primary);
  }
}
```

`is-selected` 类在点击后由 store 记录当前选中历史项 id 驱动。

### 3.5 点击联动增强

**文件**：`cockpit.ts`（store）

`recallHistoryItem` 增加：

```ts
function recallHistoryItem(id: string) {
  const item = history.value.find(h => h.id === id)
  if (!item) return
  selectTask(item.taskId)           // ① 左栏选中任务（→ 中栏时序自动刷新）
  setWorkspaceMode('work')          // ② 新增：右栏切到工作项模式
  archivedMode.value = item.archived // ③ 设置归档只读态
  historyOpen.value = false         // ④ 关闭弹窗
}
```

### 3.6 i18n 新增 key

需在 patches 中新增以下 i18n key（简体中文 + 英文）：

| Key | 中文 | English |
|-----|------|---------|
| `cockpit.historySearchPlaceholder` | 搜索历史事件... | Search history... |
| `cockpit.historyTime` | 时间 | Time |
| `cockpit.historyToday` | 今天 | Today |
| `cockpit.historyWeek` | 本周 | This Week |
| `cockpit.historyMonth` | 本月 | This Month |
| `cockpit.historyCategory` | 类别 | Category |
| `cockpit.historyCatEvent` | 事件 | Events |
| `cockpit.historyCatComment` | 评论 | Comments |
| `cockpit.historyActive` | 进行中 | Active |
| `cockpit.historyDone` | 已完成 | Done |

## 4. 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `adapters/history-adapter.ts` | 修改 | `HistoryItem` 加 `ts`/`source` 字段；`mergeTimeline` 透传 |
| `store/cockpit.ts` | 修改 | `HistoryFilters` 扩展、`filteredHistory` 加过滤链、新增 toggle/set 方法、`recallHistoryItem` 增强 |
| `components/CockpitHistoryModal.vue` | 修改 | 5 行筛选器布局 + 搜索输入 + 时间/类别/状态 chip + hover 色条 |
| `patches/...i18n-*.patch` | 修改 | 新增 10 个 i18n key |

## 5. 不变事项

- 数据源不变：仍从 `/api/hermes/kanban/timeline` 拉取
- `openHistory()` 调用流程不变
- 组件仍使用 `<script setup>` Vue 3 组合式 API
- 样式继续使用 Pure Ink CSS 变量
- 测试框架 vitest + @vue/test-utils
- 所有改动在 `overlay/`，不修改 `upstream/`

## 6. 批次 2（后续，不在本次范围）

- 中栏时序流自动滚动到该事件位置
- 右栏工作项标题/待办随历史事件更新

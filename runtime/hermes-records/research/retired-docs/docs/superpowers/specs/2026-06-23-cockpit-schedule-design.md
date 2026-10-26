# Cockpit 顶部日程功能设计

**日期**：2026-06-23
**状态**：待评审
**基线设计**：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.1 顶栏）
**适用项目**：`overlay/custom/client/cockpit/`

---

## 1. 背景

当前 `CockpitTopBar.vue` 已有 `📅 日程` 按钮（带 `scheduleCount` 角标），但点击后调用的是 `store.openHistory()` 打开历史弹窗，与注意力条「🕘 历史」按钮行为重复。设计规格明确要求日程弹窗为**月历视图**（见 §5.1 顶栏），与历史回溯弹窗（§5.8）为独立功能。

本 spec 定义日程弹窗的完整实现方案。

## 2. 数据结构

### 2.1 用户待办（localStorage）

```ts
// cockpit-kv.ts
export interface UserTodo {
  id: string
  date: string        // YYYY-MM-DD
  title: string
  note?: string
  createdAt: number
}
```

### 2.2 日程事件（运行时聚合）

```ts
// cockpit.ts（新增类型）
export interface ScheduleEvent {
  id: string
  date: string            // YYYY-MM-DD
  title: string
  kind: 'task' | 'timeline' | 'todo'
  taskId?: string
  time?: string           // HH:mm（可选）
  archived?: boolean
}
```

三种数据源聚合为一个 `scheduleEvents` computed map：
1. **任务**（`task`）：所有 `cockpitTasks` 按 `createdAt` 日期归类
2. **时间线事件**（`timeline`）：已加载的 `history` 事件按日期归类
3. **用户待办**（`todo`）：从 `localStorage` 加载的 `UserTodo`

## 3. Store 修改（cockpit.ts）

### 3.1 新增状态

```ts
const scheduleOpen = ref(false)
const scheduleSelectedDate = ref('')        // YYYY-MM-DD
const scheduleViewYear = ref(2026)
const scheduleViewMonth = ref(5)            // 0-indexed
const userTodos = ref<UserTodo[]>([])       // 从 localStorage 加载
```

### 3.2 新增 computed

```ts
// 按日期分组的所有日程事件
const scheduleEvents = computed<Record<string, ScheduleEvent[]>>(() => {
  const map: Record<string, ScheduleEvent[]> = {}
  for (const t of tasks.value) {
    const d = dateToStr(new Date(t.createdAt))
    if (!map[d]) map[d] = []
    map[d].push({ id: t.id, date: d, title: t.title, kind: 'task', taskId: t.id })
  }
  for (const h of history.value) {
    const d = extractDateFromHistory(h.when)  // 解析 "HH:mm" → 当天
    if (!d) continue
    if (!map[d]) map[d] = []
    map[d].push({ id: h.id, date: d, title: h.title, kind: 'timeline', taskId: h.taskId })
  }
  for (const t of userTodos.value) {
    if (!map[t.date]) map[t.date] = []
    map[t.date].push({ id: t.id, date: t.date, title: t.title, kind: 'todo' })
  }
  return map
})

const scheduleEventsForSelected = computed<ScheduleEvent[]>(() =>
  scheduleEvents.value[scheduleSelectedDate.value] ?? [],
)

const scheduleDatesWithEvents = computed(() => new Set(Object.keys(scheduleEvents.value)))
```

### 3.3 新增方法

```ts
function openSchedule() {
  scheduleOpen.value = true
  const now = new Date()
  scheduleViewYear.value = now.getFullYear()
  scheduleViewMonth.value = now.getMonth()
  scheduleSelectedDate.value = dateToStr(now)
  userTodos.value = kv.loadUserTodos()
}
function closeSchedule() { scheduleOpen.value = false }
function setScheduleDate(d: string) { scheduleSelectedDate.value = d }

function navigateScheduleMonth(delta: number) {
  let m = scheduleViewMonth.value + delta
  let y = scheduleViewYear.value
  if (m < 0) { m = 11; y-- }
  else if (m > 11) { m = 0; y++ }
  scheduleViewMonth.value = m
  scheduleViewYear.value = y
}

function addUserTodo(date: string, title: string, note?: string) {
  const todo: UserTodo = { id: 'todo-' + Date.now(), date, title, note, createdAt: Date.now() }
  userTodos.value.push(todo)
  kv.saveUserTodos(userTodos.value)
}

function removeUserTodo(id: string) {
  userTodos.value = userTodos.value.filter(t => t.id !== id)
  kv.saveUserTodos(userTodos.value)
}
```

### 3.4 新增 expose

在 return 中添加：
```ts
scheduleOpen, scheduleSelectedDate, scheduleViewYear, scheduleViewMonth, userTodos,
scheduleEvents, scheduleEventsForSelected, scheduleDatesWithEvents,
openSchedule, closeSchedule, setScheduleDate, navigateScheduleMonth,
addUserTodo, removeUserTodo,
```

## 4. 月历渲染逻辑

纯函数，放在组件中或独立工具文件：

```ts
interface CalendarCell {
  day: number           // 1-31, 0 = 非本月
  date: string          // YYYY-MM-DD
  isToday: boolean
  isCurrentMonth: boolean
  hasEvents: boolean
}

function buildCalendar(year: number, month: number, datesWithEvents: Set<string>): CalendarCell[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = dateToStr(new Date())
  const cells: CalendarCell[] = []

  // 上月补齐
  const prevDays = new Date(year, month, 0).getDate()
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i
    const date = `${year}-${pad(month)}-${pad(d)}`  // month 未 +1，即上月
    cells.push({ day: d, date, isToday: false, isCurrentMonth: false, hasEvents: datesWithEvents.has(date) })
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`
    cells.push({ day: d, date, isToday: date === todayStr, isCurrentMonth: true, hasEvents: datesWithEvents.has(date) })
  }
  // 下月补齐至 42 格
  let next = 1
  while (cells.length < 42) {
    const date = `${year}-${pad(month + 2)}-${pad(next)}`
    cells.push({ day: next, date, isToday: false, isCurrentMonth: false, hasEvents: datesWithEvents.has(date) })
    next++
  }
  return cells
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
```

## 5. 组件：CockpitScheduleModal.vue

### 5.1 布局结构

```
┌────────────────────────────────────────────┐
│ 📅 日程                              [✕]   │
├────────────────────────────────────────────┤
│  ◀  2026年6月  ▶   · [今日]                │
├────┬────┬────┬────┬────┬────┬────┤
│ 日 │ 一 │ 二 │ 三 │ 四 │ 五 │ 六 │
├────┼────┼────┼────┼────┼────┼────┤
│    │  1 │  2 │  3 │  4 │  5 │  6 │
│  7 │  8 │  9●│ 10 │ 11 │ 12 │ 13 │
│ 14 │ 15 │ 16 │ 17 │ 18 │ 19 │ 20 │
│ 21 │ 22 │ 23 │ 24│●│ 25 │ 26 │ 27 │
│ 28 │ 29 │ 30 │    │    │    │    │
├────┴────┴────┴────┴────┴────┴────┤
│ 📅 2026-06-09 的日程               │
│ ┌─────────────────────────────┐   │
│ │ 🗓 PR-审核-v1               │   │
│ │   scheduled · P1 · 张三    │   │
│ ├─────────────────────────────┤   │
│ │ 🕘 review-agent 完成评估    │   │
│ │   14:30 · 审查意见已提交    │   │
│ ├─────────────────────────────┤   │
│ │ 📝 与团队同步评审结果        │   │
│ │   [✕] 待办可删除            │   │
│ └─────────────────────────────┘   │
│ [+ 添加待办]                       │
└────────────────────────────────────┘
```

### 5.2 交互行为

| 操作 | 响应 |
|------|------|
| 点击 ◀/▶ | `navigateScheduleMonth(-1/+1)` |
| 点击 [今日] | 重置年月为当前月，选中今天 |
| 点击日期数字 | `setScheduleDate(date)` |
| 点击 [+ 添加待办] | 展开内联输入框（标题 + 备注 + 保存/取消） |
| 待办 [✕] | `removeUserTodo(id)` |
| 点击任务/事件项 | `selectTask(taskId)` + `closeSchedule()` |
| 点击 ✕ | `closeSchedule()` |

### 5.3 数据获取

打开日程时（`openSchedule`）：
1. 设置年月为当前月
2. 选中今天
3. 从 localStorage 加载用户待办
4. 日程事件直接从 store 现有数据聚合（无需额外 API 请求）

### 5.4 组件模板骨架

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const WK = ['日','一','二','三','四','五','六']

const calendarCells = computed(() =>
  buildCalendar(store.scheduleViewYear, store.scheduleViewMonth, store.scheduleDatesWithEvents)
)
</script>

<template>
  <div class="cockpit-schedule-modal">
    <!-- HEADER -->
    <div class="cockpit-schedule__head">
      <span class="cockpit-schedule__title">📅 {{ t('cockpit.schedule') }}</span>
      <button type="button" class="cockpit-schedule__close" @click="store.closeSchedule()">✕</button>
    </div>
    <!-- MONTH NAV -->
    <div class="cockpit-schedule__nav">
      <button @click="store.navigateScheduleMonth(-1)">◀</button>
      <span>{{ store.scheduleViewYear }}年{{ MONTHS[store.scheduleViewMonth] }}</span>
      <button @click="store.navigateScheduleMonth(1)">▶</button>
      <button class="cockpit-schedule__today" @click="store.openSchedule()">{{ t('cockpit.today') || '今日' }}</button>
    </div>
    <!-- CALENDAR GRID -->
    <div class="cockpit-schedule__grid">
      <div v-for="w in WK" :key="w" class="cockpit-schedule__wk">{{ w }}</div>
      <button v-for="(c, i) in calendarCells" :key="i" type="button"
        class="cockpit-schedule__cell"
        :class="{
          'is-other': !c.isCurrentMonth,
          'is-today': c.isToday,
          'is-selected': c.date === store.scheduleSelectedDate,
        }"
        @click="store.setScheduleDate(c.date)"
      >
        <span class="cockpit-schedule__num">{{ c.day }}</span>
        <span v-if="c.hasEvents" class="cockpit-schedule__dot" />
      </button>
    </div>
    <!-- EVENTS LIST -->
    <div class="cockpit-schedule__events">
      <div class="cockpit-schedule__events-label">
        📅 {{ store.scheduleSelectedDate }} {{ t('cockpit.scheduleEvents') || '的日程' }}
      </div>
      <div v-if="store.scheduleEventsForSelected.length === 0" class="cockpit-schedule__empty">
        {{ t('cockpit.scheduleEmpty') || '当天无日程' }}
      </div>
      <div v-for="ev in store.scheduleEventsForSelected" :key="ev.id" class="cockpit-schedule__ev"
        :class="{ 'is-clickable': ev.taskId }"
        @click="ev.taskId && (store.selectTask(ev.taskId), store.closeSchedule())">
        <span class="cockpit-schedule__ev-icon">{{ ev.kind === 'task' ? '🗓' : ev.kind === 'timeline' ? '🕘' : '📝' }}</span>
        <div class="cockpit-schedule__ev-body">
          <span class="cockpit-schedule__ev-title">{{ ev.title }}</span>
          <span v-if="ev.time" class="cockpit-schedule__ev-time">{{ ev.time }}</span>
        </div>
        <button v-if="ev.kind === 'todo'" type="button" class="cockpit-schedule__ev-del"
          @click.stop="store.removeUserTodo(ev.id)">✕</button>
      </div>
    </div>
    <!-- ADD TODO -->
    <div class="cockpit-schedule__add">
      <button type="button" class="cockpit-schedule__add-btn" @click="showAdd = !showAdd">
        + {{ t('cockpit.scheduleAddTodo') || '添加待办' }}
      </button>
      <div v-if="showAdd" class="cockpit-schedule__add-form">
        <input v-model="newTodoTitle" :placeholder="t('cockpit.scheduleTodoPlaceholder') || '待办事项…'"
          class="cockpit-schedule__input" @keyup.enter="saveTodo" />
        <div class="cockpit-schedule__add-actions">
          <button type="button" class="cockpit-schedule__add-save" @click="saveTodo">{{ t('cockpit.save') || '保存' }}</button>
          <button type="button" class="cockpit-schedule__add-cancel" @click="showAdd = false">{{ t('cockpit.cancel') || '取消' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
```

## 6. 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `custom/client/cockpit/components/CockpitScheduleModal.vue` | **新建** | 日程月历弹窗 |
| `custom/client/cockpit/store/cockpit.ts` | 修改 | 新增 schedule 状态、computed、方法 |
| `custom/client/cockpit/store/cockpit-kv.ts` | 修改 | 新增 `UserTodo` 接口及存取方法 |
| `custom/client/cockpit/views/CockpitView.vue` | 修改 | `@schedule` → `openSchedule()` + 挂载 ScheduleModal |
| `custom/client/cockpit/components/CockpitTopBar.vue` | 微调 | `scheduleCount` 从 store 动态计算 |
| i18n en.ts / zh.ts | 修改 | 新增 `cockpit.schedule*` key（如果缺） |

## 7. 不变事项

- 所有样式继续 Pure Ink（CSS 变量，无自定义色值）
- 日程弹窗风格与 `CockpitHistoryModal` 一致（宽 540px，圆角 12px，阴影）
- 沿用 `<script setup>` Vue 3 组合式 API
- 测试框架 vitest + @vue/test-utils
- 日程数据不新增后端 API，全部从前端现有数据聚合 + localStorage
- 注意力条「🕘 历史」按钮保持不变，仍打开 HistoryModal

## 8. Spec Self-Review

- ✅ 无 TBD/TODO 占位符
- ✅ 数据结构清晰，与现有类型一致
- ✅ 组件布局与基线设计一致（月历 + 事件列表 + 添加待办）
- ✅ 无外部依赖（纯 Vue + Pinia + localStorage）
- ✅ 不影响现有功能（日程与历史分离，互不干扰）
- ✅ 范围聚焦：仅涉及日程弹窗相关文件，不涉及其它模块

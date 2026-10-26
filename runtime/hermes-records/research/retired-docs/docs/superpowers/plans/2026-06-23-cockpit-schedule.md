# Cockpit 顶部日程功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现顶部📅日程弹窗（月历+事件列表+添加待办），替代当前绑定到历史弹窗的行为

**Architecture:** 新建 `CockpitScheduleModal.vue` 组件，在 cockpit store 中新增 schedule 状态和方法，在 `cockpit-kv.ts` 中新增 UserTodo 存取。数据源复用现有 cockpitTasks/history 进行计算聚合，用户待办存 localStorage。通过 patch 新增 i18n key。

**Tech Stack:** Vue 3 `<script setup>`, Pinia, vue-i18n, vitest + @vue/test-utils, Pure Ink CSS 变量

**设计文档:** `docs/superpowers/specs/2026-06-23-cockpit-schedule-design.md`

---

### Task 1: cockpit-kv.ts — 添加 UserTodo 类型与存取方法

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit-kv.ts:1`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-kv.test.ts`

---

- [ ] **Step 1: 在 cockpit-kv.ts 添加 UserTodo 接口和存取函数**

在 `cockpit-kv.ts` 的末尾（`export function clearDraft` 之后、文件结束前）添加：

```ts
// ── 用户待办 ──
export interface UserTodo {
  id: string
  date: string        // YYYY-MM-DD
  title: string
  note?: string
  createdAt: number
}

const KEY_TODOS = 'cockpit.userTodos'

export function loadUserTodos(): UserTodo[] {
  try {
    const raw = localStorage.getItem(KEY_TODOS)
    return raw ? (JSON.parse(raw) as UserTodo[]) : []
  } catch { return [] }
}

export function saveUserTodos(todos: UserTodo[]): void {
  try { localStorage.setItem(KEY_TODOS, JSON.stringify(todos)) } catch { /* quota 静默 */ }
}
```

- [ ] **Step 2: 添加测试用例**

在 `cockpit-kv.test.ts` 末尾，`describe('templates')` 之后添加：

```ts
describe('user todos', () => {
  it('loadUserTodos returns [] when absent', () => {
    const { loadUserTodos } = require('@/custom/cockpit/store/cockpit-kv')
    expect(loadUserTodos()).toEqual([])
  })

  it('save/load roundtrip', () => {
    const { loadUserTodos, saveUserTodos } = require('@/custom/cockpit/store/cockpit-kv')
    const todos = [
      { id: 'todo-1', date: '2026-06-23', title: '与团队同步', note: '下午3点', createdAt: Date.now() },
    ]
    saveUserTodos(todos)
    expect(loadUserTodos()).toEqual(todos)
  })

  it('save failure is swallowed', () => {
    const { saveUserTodos, loadUserTodos } = require('@/custom/cockpit/store/cockpit-kv')
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new DOMException('quota') }
    expect(() => saveUserTodos([{ id: 'x', date: '2026-06-23', title: 'x', createdAt: 0 }])).not.toThrow()
    Storage.prototype.setItem = orig
  })
})
```

- [ ] **Step 3: 运行测试验证通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-kv.test.ts --reporter verbose
```
期望：所有测试通过（含已有的 draft、templates 测试和新加的 user todos 测试）。

- [ ] **Step 4: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/store/cockpit-kv.ts custom/client/cockpit/__tests__/cockpit-kv.test.ts && git commit -m "feat(cockpit): add UserTodo type and localStorage accessors"
```

---

### Task 2: cockpit.ts — 新增 schedule 状态、computed、方法

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

---

- [ ] **Step 1: 导入 UserTodo**

在 `cockpit.ts` 现有 `import * as kv from './cockpit-kv'` 之后（约 14 行）更新导入，添加 `UserTodo` 类型：

```ts
import * as kv from './cockpit-kv'
import type { UserTodo } from './cockpit-kv'
```

- [ ] **Step 2: 添加 ScheduleEvent 类型**

在现有类型定义区（`export type ColumnKey = ...` 附近）添加：

```ts
export interface ScheduleEvent {
  id: string
  date: string            // YYYY-MM-DD
  title: string
  kind: 'task' | 'timeline' | 'todo'
  taskId?: string
  time?: string
  archived?: boolean
}
```

- [ ] **Step 3: 添加 schedule 状态 refs**

在 store setup 中，`const detailExpanded = ref(false)` 附近添加：

```ts
// ── 日程 ──
const scheduleOpen = ref(false)
const scheduleSelectedDate = ref('')
const scheduleViewYear = ref(2026)
const scheduleViewMonth = ref(5)   // 0-indexed
const userTodos = ref<UserTodo[]>([])
```

- [ ] **Step 4: 添加 schedule computed 属性**

在 `const templates = computed(...)` 附近添加：

```ts
// ── 日程事件（按日期聚合）──
const scheduleEvents = computed<Record<string, ScheduleEvent[]>>(() => {
  const map: Record<string, ScheduleEvent[]> = {}
  // pad 和 dateToStr 工具函数
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateToStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // 1. 现有任务按 createdAt 归类
  for (const t of tasks.value) {
    const d = dateToStr(new Date(t.createdAt))
    if (!map[d]) map[d] = []
    map[d].push({ id: t.id, date: d, title: t.title, kind: 'task', taskId: t.id })
  }
  // 2. timeline 事件（从 history 提取日期）
  for (const h of history.value) {
    // h.when 格式如 "14:30"，取当天
    const d = dateToStr(new Date())
    if (!map[d]) map[d] = []
    if (!map[d].some(e => e.id === h.id)) {
      map[d].push({ id: h.id, date: d, title: h.title, kind: 'timeline', taskId: h.taskId })
    }
  }
  // 3. 用户待办
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

- [ ] **Step 5: 添加 schedule 方法**

在 `saveTemplateFromCurrentWorkItem` 附近添加：

```ts
// ── 日程 ──
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

- [ ] **Step 6: 在 return 中添加新的 state 和方法**

在 `return {` 块中添加：

```ts
// 在现有 return 中找到适当位置，添加：
scheduleOpen, scheduleSelectedDate, scheduleViewYear, scheduleViewMonth, userTodos,
scheduleEvents, scheduleEventsForSelected, scheduleDatesWithEvents,
openSchedule, closeSchedule, setScheduleDate, navigateScheduleMonth,
addUserTodo, removeUserTodo,
```

- [ ] **Step 7: 添加 schedule store 测试**

在 `cockpit-store.test.ts` 末尾，已有 describe 块之后添加：

```ts
describe('cockpit store 日程', () => {
  it('openSchedule initializes with today', async () => {
    const s = useCockpitStore()
    s.openSchedule()
    expect(s.scheduleOpen).toBe(true)
    expect(s.scheduleSelectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.scheduleViewYear).toBe(new Date().getFullYear())
  })

  it('closeSchedule closes modal', () => {
    const s = useCockpitStore()
    s.openSchedule()
    expect(s.scheduleOpen).toBe(true)
    s.closeSchedule()
    expect(s.scheduleOpen).toBe(false)
  })

  it('navigateScheduleMonth changes month', () => {
    const s = useCockpitStore()
    s.scheduleViewYear = 2026
    s.scheduleViewMonth = 5  // June
    s.navigateScheduleMonth(1)
    expect(s.scheduleViewMonth).toBe(6)  // July
    s.navigateScheduleMonth(-1)
    expect(s.scheduleViewMonth).toBe(5)  // back to June
  })

  it('navigateScheduleMonth wraps year correctly', () => {
    const s = useCockpitStore()
    s.scheduleViewYear = 2026
    s.scheduleViewMonth = 0  // January
    s.navigateScheduleMonth(-1)
    expect(s.scheduleViewMonth).toBe(11)  // December
    expect(s.scheduleViewYear).toBe(2025)
    s.navigateScheduleMonth(1)
    expect(s.scheduleViewMonth).toBe(0)
    expect(s.scheduleViewYear).toBe(2026)
  })

  it('setScheduleDate updates selected date', () => {
    const s = useCockpitStore()
    s.setScheduleDate('2026-06-23')
    expect(s.scheduleSelectedDate).toBe('2026-06-23')
  })

  it('addUserTodo adds and persists', () => {
    const s = useCockpitStore()
    s.openSchedule()
    s.addUserTodo('2026-06-23', '测试待办')
    expect(s.userTodos.length).toBeGreaterThanOrEqual(1)
    const found = s.userTodos.find(t => t.title === '测试待办')
    expect(found).toBeTruthy()
    expect(found!.date).toBe('2026-06-23')
  })

  it('removeUserTodo removes and persists', () => {
    const s = useCockpitStore()
    s.openSchedule()
    s.addUserTodo('2026-06-23', '要删除的待办')
    const todo = s.userTodos.find(t => t.title === '要删除的待办')
    expect(todo).toBeTruthy()
    s.removeUserTodo(todo!.id)
    expect(s.userTodos.find(t => t.id === todo!.id)).toBeUndefined()
  })

  it('scheduleEvents aggregates tasks', () => {
    mockKanbanTasks.push(
      kt({ id: 't-sch1', title: '排期任务', status: 'todo' }),
    )
    const s = useCockpitStore()
    s.openSchedule()
    // 日期应为今日
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const events = s.scheduleEvents[todayStr] ?? []
    expect(events.some(e => e.id === 't-sch1' && e.kind === 'task')).toBe(true)
  })
})
```

- [ ] **Step 8: 运行 store 测试验证通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts --reporter verbose
```
期望：所有测试通过。

- [ ] **Step 9: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/store/cockpit.ts custom/client/cockpit/__tests__/cockpit-store.test.ts && git commit -m "feat(cockpit): add schedule state, computed, and methods to store"
```

---

### Task 3: CockpitScheduleModal.vue — 创建日程弹窗组件

**Files:**
- Create: `overlay/custom/client/cockpit/components/CockpitScheduleModal.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-schedule-modal.test.ts`

---

- [ ] **Step 1: 创建 CockpitScheduleModal.vue**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const WEEKDAYS = ['日','一','二','三','四','五','六']

// 内联新建待办状态
const showAddForm = ref(false)
const newTodoTitle = ref('')

function pad(n: number): string { return String(n).padStart(2, '0') }
function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface CalendarCell {
  day: number
  date: string
  isToday: boolean
  isCurrentMonth: boolean
  hasEvents: boolean
}

const calendarCells = computed<CalendarCell[]>(() => {
  const { scheduleViewYear: year, scheduleViewMonth: month, scheduleDatesWithEvents } = store
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = dateToStr(new Date())
  const cells: CalendarCell[] = []

  // 上月补齐
  const prevDays = new Date(year, month, 0).getDate()
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i
    const date = `${year}-${pad(month)}-${pad(d)}`
    cells.push({ day: d, date, isToday: date === todayStr, isCurrentMonth: false, hasEvents: scheduleDatesWithEvents.has(date) })
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`
    cells.push({ day: d, date, isToday: date === todayStr, isCurrentMonth: true, hasEvents: scheduleDatesWithEvents.has(date) })
  }
  // 下月补齐至 42 格
  let next = 1
  while (cells.length < 42) {
    const date = `${year}-${pad(month + 2)}-${pad(next)}`
    cells.push({ day: next, date, isToday: false, isCurrentMonth: false, hasEvents: scheduleDatesWithEvents.has(date) })
    next++
  }
  return cells
})

function saveTodo() {
  const title = newTodoTitle.value.trim()
  if (!title) return
  store.addUserTodo(store.scheduleSelectedDate, title)
  newTodoTitle.value = ''
  showAddForm.value = false
}

function goToToday() {
  const now = new Date()
  store.scheduleViewYear = now.getFullYear()
  store.scheduleViewMonth = now.getMonth()
  store.setScheduleDate(dateToStr(now))
}

function onEventClick(ev: { taskId?: string }) {
  if (ev.taskId) {
    store.selectTask(ev.taskId)
    store.closeSchedule()
  }
}

const KIND_ICON: Record<string, string> = { task: '🗓', timeline: '🕘', todo: '📝' }
</script>

<template>
  <div class="cockpit-schedule-modal">
    <!-- 头部 -->
    <div class="cockpit-schedule__head">
      <span class="cockpit-schedule__title">📅 {{ t('cockpit.schedule') }}</span>
      <button type="button" class="cockpit-schedule__close" @click="store.closeSchedule()">✕</button>
    </div>

    <!-- 月份导航 -->
    <div class="cockpit-schedule__nav">
      <button type="button" class="cockpit-schedule__nav-btn" @click="store.navigateScheduleMonth(-1)">◀</button>
      <span class="cockpit-schedule__nav-label">{{ store.scheduleViewYear }}年{{ MONTHS[store.scheduleViewMonth] }}</span>
      <button type="button" class="cockpit-schedule__nav-btn" @click="store.navigateScheduleMonth(1)">▶</button>
      <button type="button" class="cockpit-schedule__today-btn" @click="goToToday">{{ t('cockpit.today') }}</button>
    </div>

    <!-- 月历网格 -->
    <div class="cockpit-schedule__grid">
      <div v-for="w in WEEKDAYS" :key="w" class="cockpit-schedule__wk">{{ w }}</div>
      <button
        v-for="(c, i) in calendarCells"
        :key="i"
        type="button"
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

    <!-- 事件列表 -->
    <div class="cockpit-schedule__events">
      <div class="cockpit-schedule__events-label">
        📅 {{ store.scheduleSelectedDate }} {{ t('cockpit.scheduleEvents') }}
      </div>
      <div v-if="store.scheduleEventsForSelected.length === 0" class="cockpit-schedule__empty">
        {{ t('cockpit.scheduleEmpty') }}
      </div>
      <div
        v-for="ev in store.scheduleEventsForSelected"
        :key="ev.id"
        class="cockpit-schedule__ev"
        :class="{ 'is-clickable': !!ev.taskId }"
        @click="onEventClick(ev)"
      >
        <span class="cockpit-schedule__ev-icon">{{ KIND_ICON[ev.kind] ?? '📌' }}</span>
        <div class="cockpit-schedule__ev-body">
          <span class="cockpit-schedule__ev-title">{{ ev.title }}</span>
          <span v-if="ev.time" class="cockpit-schedule__ev-time">{{ ev.time }}</span>
        </div>
        <button
          v-if="ev.kind === 'todo'"
          type="button"
          class="cockpit-schedule__ev-del"
          @click.stop="store.removeUserTodo(ev.id)"
        >✕</button>
      </div>
    </div>

    <!-- 添加待办 -->
    <div class="cockpit-schedule__add">
      <button
        v-if="!showAddForm"
        type="button"
        class="cockpit-schedule__add-btn"
        @click="showAddForm = true"
      >{{ t('cockpit.scheduleAddTodo') }}</button>
      <div v-else class="cockpit-schedule__add-form">
        <input
          v-model="newTodoTitle"
          class="cockpit-schedule__input"
          :placeholder="t('cockpit.scheduleTodoPlaceholder')"
          @keyup.enter="saveTodo"
        />
        <div class="cockpit-schedule__add-actions">
          <button type="button" class="cockpit-schedule__add-save" @click="saveTodo">{{ t('common.save') }}</button>
          <button type="button" class="cockpit-schedule__add-cancel" @click="showAddForm = false">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-schedule-modal {
  display: flex; flex-direction: column;
  width: 540px; max-width: 92vw; max-height: 80vh;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden;
}

/* 头部 */
.cockpit-schedule__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border-color);
}
.cockpit-schedule__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-schedule__close {
  cursor: pointer; color: var(--text-muted); font-size: 16px;
  width: 24px; height: 24px; border: none; background: none;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
  font: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}

/* 月份导航 */
.cockpit-schedule__nav {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-bottom: 1px solid var(--border-light);
}
.cockpit-schedule__nav-btn {
  width: 24px; height: 24px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-card); color: var(--text-secondary);
  cursor: pointer; font-size: 12px; font-family: inherit;
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-schedule__nav-label {
  font-size: 13px; font-weight: 600; color: var(--text-primary); width: 100px; text-align: center;
}
.cockpit-schedule__today-btn {
  margin-left: auto; font-size: 11px; padding: 3px 10px; border-radius: 4px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}

/* 月历网格 */
.cockpit-schedule__grid {
  display: flex; flex-wrap: wrap; padding: 4px 12px; border-bottom: 1px solid var(--border-light);
}
.cockpit-schedule__wk {
  width: calc(100% / 7); text-align: center; font-size: 10px; font-weight: 600;
  color: var(--text-muted); padding: 4px 0; text-transform: uppercase;
}
.cockpit-schedule__cell {
  position: relative; width: calc(100% / 7); padding: 6px 0; border: none;
  background: none; cursor: pointer; font-family: inherit; text-align: center;
  &:hover .cockpit-schedule__num { background: var(--bg-secondary); }
  &.is-other .cockpit-schedule__num { color: var(--text-muted); }
  &.is-today .cockpit-schedule__num { border: 1.5px solid var(--accent-primary); border-radius: 50%; width: 24px; height: 24px; line-height: 21px; display: inline-block; font-weight: 700; }
  &.is-selected .cockpit-schedule__num { background: var(--accent-primary); color: var(--text-on-accent); border-radius: 50%; width: 24px; height: 24px; line-height: 24px; display: inline-block; font-weight: 700; }
}
.cockpit-schedule__num { font-size: 12px; color: var(--text-primary); transition: .1s; }
.cockpit-schedule__dot {
  position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%);
  width: 4px; height: 4px; border-radius: 50%; background: var(--text-muted);
}

/* 事件列表 */
.cockpit-schedule__events {
  flex: 1; overflow-y: auto; padding: 8px 0; min-height: 80px;
}
.cockpit-schedule__events-label {
  font-size: 10px; color: var(--text-muted); padding: 4px 18px 8px; font-weight: 600;
}
.cockpit-schedule__empty {
  padding: 20px 18px; font-size: 11px; color: var(--text-muted); text-align: center;
}
.cockpit-schedule__ev {
  display: flex; align-items: center; gap: 10px; padding: 8px 18px; cursor: default;
  border-bottom: 1px solid var(--border-light); transition: .1s;
  &.is-clickable { cursor: pointer; &:hover { background: var(--bg-secondary); } }
}
.cockpit-schedule__ev-icon { flex-shrink: 0; font-size: 14px; }
.cockpit-schedule__ev-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cockpit-schedule__ev-title { font-size: 12px; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cockpit-schedule__ev-time { font-size: 10px; color: var(--text-muted); }
.cockpit-schedule__ev-del {
  flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none;
  background: none; color: var(--text-muted); cursor: pointer; font-size: 12px;
  line-height: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 3px; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}

/* 添加待办 */
.cockpit-schedule__add {
  flex-shrink: 0; border-top: 1px solid var(--border-color); padding: 10px 18px;
}
.cockpit-schedule__add-btn {
  width: 100%; padding: 6px 0; border: 1px dashed var(--border-color); border-radius: 6px;
  background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; font-family: inherit;
  &:hover { border-color: var(--text-muted); color: var(--text-primary); background: var(--bg-secondary); }
}
.cockpit-schedule__add-form { display: flex; flex-direction: column; gap: 8px; }
.cockpit-schedule__input {
  width: 100%; height: 32px; padding: 0 10px; border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-card); color: var(--text-primary);
  font-size: 13px; font-family: inherit; outline: none;
  &:focus { border-color: var(--accent-primary); }
}
.cockpit-schedule__add-actions { display: flex; gap: 6px; justify-content: flex-end; }
.cockpit-schedule__add-save {
  font-size: 11px; padding: 4px 12px; border-radius: 4px; border: none;
  background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-family: inherit;
}
.cockpit-schedule__add-cancel {
  font-size: 11px; padding: 4px 12px; border-radius: 4px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { color: var(--text-primary); }
}
</style>
```

- [ ] **Step 2: 创建组件测试**

```ts
// overlay/custom/client/cockpit/__tests__/cockpit-schedule-modal.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

// mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CockpitScheduleModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders modal when schedule is open', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.find('.cockpit-schedule-modal').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__title').text()).toBe('📅 cockpit.schedule')
  })

  it('renders 7 weekday headers', () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    const wks = wrapper.findAll('.cockpit-schedule__wk')
    expect(wks).toHaveLength(7)
  })

  it('shows empty state when no events for selected date', () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.text()).toContain('cockpit.scheduleEmpty')
  })

  it('add todo button toggles input form', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.find('.cockpit-schedule__add-btn').exists()).toBe(true)
    await wrapper.find('.cockpit-schedule__add-btn').trigger('click')
    expect(wrapper.find('.cockpit-schedule__input').exists()).toBe(true)
  })

  it('close button calls closeSchedule', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    await wrapper.find('.cockpit-schedule__close').trigger('click')
    expect(store.scheduleOpen).toBe(false)
  })

  it('navigates months via nav buttons', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    store.scheduleViewYear = 2026
    store.scheduleViewMonth = 5
    const wrapper = mount(CockpitScheduleModal)
    const btns = wrapper.findAll('.cockpit-schedule__nav-btn')
    await btns[1].trigger('click') // next
    expect(store.scheduleViewMonth).toBe(6)
    await btns[0].trigger('click') // prev
    expect(store.scheduleViewMonth).toBe(5)
  })
})
```

- [ ] **Step 3: 运行组件测试验证通过**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-schedule-modal.test.ts --reporter verbose
```
期望：所有测试通过。

- [ ] **Step 4: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/components/CockpitScheduleModal.vue custom/client/cockpit/__tests__/cockpit-schedule-modal.test.ts && git commit -m "feat(cockpit): create CockpitScheduleModal component"
```

---

### Task 4: CockpitView.vue — 挂载 ScheduleModal + 替换绑定

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`
- Modify: `overlay/custom/client/cockpit/components/CockpitTopBar.vue`

---

- [ ] **Step 1: CockpitView.vue — 导入并挂载 CockpitScheduleModal**

在第 15 行附近（`CockpitHistoryModal` 导入之后）添加导入：

```vue
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
```

在第 80 行，将 `@schedule="store.openHistory()"` 替换为：

```vue
@schedule="store.openSchedule()"
```

在现有 `<CockpitHistoryModal>` 附近（约 166 行）添加 ScheduleModal 挂载：

```vue
<div v-if="store.scheduleOpen" class="cockpit-overlay" @click="store.closeSchedule()" />
<CockpitScheduleModal v-if="store.scheduleOpen" class="cockpit-modal-anchor" />
```

- [ ] **Step 2: CockpitTopBar.vue — 动态计算 scheduleCount**

当前 `scheduleCount` 是通过 props 硬编码传入的（`:schedule-count="2"`）。改为从 store 动态计算。

将 `CockpitTopBar.vue` 中第 18 行的 `defineProps<{... scheduleCount?: number ...}>()` 保留，但移除 `scheduleCount` prop。改用 emit 保持。

修改 `CockpitView.vue` 中 TopBar 的 `:schedule-count` 绑定：

```vue
:schedule-count="store.scheduleDatesWithEvents.size"
```

这一步确保 TopBar 的 📅 角标显示当前月有事件的天数。

- [ ] **Step 3: 运行所有 cockpit 测试验证无回归**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/ --reporter verbose
```
期望：所有测试通过。

- [ ] **Step 4: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/views/CockpitView.vue custom/client/cockpit/components/CockpitTopBar.vue && git commit -m "feat(cockpit): wire ScheduleModal into CockpitView, dynamic schedule count"
```

---

### Task 5: i18n 补丁 — 新增日程相关 key

**Files:**
- Modify (directly): `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts`
- Modify (directly): `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts`
- Create: `overlay/patches/080-cockpit-schedule-i18n.patch`
- Modify: `overlay/patches/series`

---

- [ ] **Step 1: 在 upstream i18n 文件中添加新 key**

在 `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts` 中，在 `schedule: 'Schedule',` 行之后（约 343 行）添加：

```ts
    scheduleEvents: 'Events',
    scheduleEmpty: 'No events today',
    scheduleAddTodo: 'Add todo',
    scheduleTodoPlaceholder: 'What needs to be done…',
    today: 'Today',
```

在 `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts` 中，在 `schedule: '日程',` 行之后（约 341 行）添加：

```ts
    scheduleEvents: '日程',
    scheduleEmpty: '当天无日程',
    scheduleAddTodo: '添加待办',
    scheduleTodoPlaceholder: '待办事项…',
    today: '今日',
```

- [ ] **Step 2: 生成补丁文件**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
# 当前有未暂存的 i18n 修改，生成补丁
git diff packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts > /Volumes/nvme2230/lab/ncwk/overlay/patches/080-cockpit-schedule-i18n.patch
```

验证补丁文件存在且非空：
```bash
head -5 /Volumes/nvme2230/lab/ncwk/overlay/patches/080-cockpit-schedule-i18n.patch
```

- [ ] **Step 3: 恢复 upstream 的 i18n 文件变更（由 inject 管理）**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git checkout -- packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
```

- [ ] **Step 4: 将 patch 添加到 series 文件**

在 `overlay/patches/series` 末尾添加一行：

```
080-cockpit-schedule-i18n.patch
```

- [ ] **Step 5: 应用补丁**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run inject
```

期望：补丁应用成功。验证：

```bash
grep 'scheduleEvents' /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio/packages/client/src/i18n/locales/en.ts
grep '080' /Volumes/nvme2230/lab/ncwk/overlay/.overlay-injected.json
```

- [ ] **Step 6: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add patches/080-cockpit-schedule-i18n.patch patches/series && git commit -m "feat(i18n): add schedule modal i18n keys (en/zh)"
```

---

### Task 6: 运行全量测试 + 构建验证

**Files:** 无代码修改

---

- [ ] **Step 1: 运行 cockpit 全量测试**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vitest run custom/client/cockpit/__tests__/ --reporter verbose
```
期望：所有测试通过。

- [ ] **Step 2: 验证 vite 构建**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npx vite build --mode overlay 2>&1 | tail -20
```
期望：构建成功，无 TS 或模块解析错误。

- [ ] **Step 3: 合入 main 分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git checkout main && git pull && git merge feat/cockpit-schedule && git branch -d feat/cockpit-schedule
```

---

## 验收标准

1. ✅ 点击顶部「📅 日程」按钮 → 打开月历弹窗（不再是历史弹窗）
2. ✅ 月历正确渲染（7 列，本月日期 + 上月补齐 + 下月开始）
3. ✅ 今天日期高亮显示（蓝色边框）
4. ✅ 有任务/事件的日期右下角显示小圆点
5. ✅ 翻月 ◀/▶ 按钮切换月份
6. ✅ 点击 [今日] 回到当月并选中今天
7. ✅ 点击某日期 → 下方面板切换显示当日事件
8. ✅ 事件列表显示 3 种类型：🗓任务 / 🕘时间线事件 / 📝用户待办
9. ✅ 点击任务/时间线事件 → 跳转到该任务（selectTask + 关闭弹窗）
10. ✅ [+ 添加待办] → 输入标题 → 保存后显示在列表中
11. ✅ 待办项 ✕ 按钮 → 删除该待办
12. ✅ 角标数字 = 当月有事件的天数
13. ✅ 纯 Ink 风格，与 HistoryModal 视觉一致
14. ✅ 所有测试通过

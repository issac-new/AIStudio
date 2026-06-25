<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import type { ScheduleEvent } from '@/custom/cockpit/store/cockpit'

const store = useCockpitStore()
const { t } = useI18n()

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// 内联新建待办（日期 + 时间 + 标题，时间可选作闹钟提醒）
const showAddForm = ref(false)
const newTodoTitle = ref('')
const newTodoDate = ref('')
const newTodoTime = ref('')
const todoInputEl = ref<HTMLInputElement | null>(null)

function pad(n: number): string { return String(n).padStart(2, '0') }
function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// 默认时间 = 当前时间 + 1 小时（向上取整到整点）
function defaultTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  return `${pad(d.getHours())}:00`
}

interface CalendarCell {
  day: number
  date: string
  isToday: boolean
  isCurrentMonth: boolean
  count: number
  topPriority?: string
}

const calendarCells = computed<CalendarCell[]>(() => {
  const { scheduleViewYear: year, scheduleViewMonth: month } = store
  const counts = store.scheduleCountsByDate
  const topPri = store.scheduleTopPriorityByDate
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = dateToStr(new Date())
  const cells: CalendarCell[] = []

  // 上月补齐（补齐日期归到上月日期串，便于点击）
  const prevDays = new Date(year, month, 0).getDate()
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i
    const pm = month === 0 ? 11 : month - 1
    const py = month === 0 ? year - 1 : year
    const date = `${py}-${pad(pm + 1)}-${pad(d)}`
    cells.push({ day: d, date, isToday: date === todayStr, isCurrentMonth: false, count: counts[date] ?? 0, topPriority: topPri[date] })
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`
    cells.push({ day: d, date, isToday: date === todayStr, isCurrentMonth: true, count: counts[date] ?? 0, topPriority: topPri[date] })
  }
  // 下月补齐至 42 格
  let next = 1
  while (cells.length < 42) {
    const nm = month === 11 ? 0 : month + 1
    const ny = month === 11 ? year + 1 : year
    const date = `${ny}-${pad(nm + 1)}-${pad(next)}`
    cells.push({ day: next, date, isToday: false, isCurrentMonth: false, count: counts[date] ?? 0, topPriority: topPri[date] })
    next++
  }
  return cells
})

// 右栏事件流（按时间升序）
const sortedEvents = computed(() => store.scheduleEventsForSelectedSorted)

// 右栏标题：选中日期的可读形式 + 计数
const selectedDateLabel = computed(() => {
  const d = store.scheduleSelectedDate
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  const wk = WEEKDAYS[date.getDay()]
  return `${date.getMonth() + 1}月${date.getDate()}日 周${wk}`
})
const selectedCount = computed(() => sortedEvents.value.length)

// 优先级 → 左色带颜色 / 视觉权重 class
const PRIO_BAR: Record<string, string> = {
  P0: 'var(--error)',
  P1: 'var(--warning, #e6a23c)',
  P2: 'var(--accent-primary)',
  P3: 'var(--border-color)',
}
function eventBarColor(ev: ScheduleEvent): string {
  if (ev.kind === 'todo') return 'var(--accent-info)'
  if (ev.kind === 'timeline') return 'var(--text-muted)'
  return PRIO_BAR[ev.priority ?? 'P3'] ?? 'var(--border-color)'
}
function eventPriClass(ev: ScheduleEvent): string {
  return ev.kind === 'task' && ev.priority ? `is-${ev.priority.toLowerCase()}` : ''
}

// 状态 → 语义标签 class（复用并扩展 Kanban 状态视觉语言）
const STATUS_LABEL: Record<string, string> = {
  triage: '待分类', todo: '待办', scheduled: '已排期', ready: '就绪',
  running: '进行中', blocked: '阻塞', review: '待审', done: '完成', archived: '归档',
}
function statusClass(s?: string): string {
  if (!s) return ''
  // 完成类淡化；阻塞红；进行中蓝；待审橙；其余中性
  if (s === 'blocked') return 'st-blocked'
  if (s === 'running') return 'st-running'
  if (s === 'review') return 'st-review'
  if (s === 'done' || s === 'archived') return 'st-done'
  return 'st-normal'
}
function statusLabel(s?: string): string {
  return s ? (STATUS_LABEL[s] ?? s) : ''
}

const KIND_ICON: Record<string, string> = { task: '🗓', timeline: '🕘', todo: '📝' }

function saveTodo() {
  const title = newTodoTitle.value.trim()
  if (!title) return
  const date = newTodoDate.value || store.scheduleSelectedDate
  // 时间非空 → 计算提醒时刻；为空则无提醒
  let remindAt: number | undefined
  if (newTodoTime.value) {
    const [h, m] = newTodoTime.value.split(':').map(Number)
    const dt = new Date(date + 'T00:00:00')
    dt.setHours(h, m, 0, 0)
    remindAt = dt.getTime()
  }
  store.addUserTodo(date, title, undefined, remindAt)
  newTodoTitle.value = ''
  newTodoTime.value = ''
  showAddForm.value = false
}

async function openAddForm() {
  // 默认日期 = 当前选中日，默认时间 = 当前+1h
  newTodoDate.value = store.scheduleSelectedDate
  newTodoTime.value = defaultTime()
  showAddForm.value = true
  await nextTick()
  todoInputEl.value?.focus()
}

// 待办闹钟时刻可读化（HH:mm）
function todoRemindLabel(ev: ScheduleEvent): string {
  if (ev.kind !== 'todo' || !ev.ts) return ''
  const d = new Date(ev.ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function goToToday() {
  const now = new Date()
  store.scheduleViewYear = now.getFullYear()
  store.scheduleViewMonth = now.getMonth()
  store.setScheduleDate(dateToStr(now))
}

function onEventClick(ev: ScheduleEvent) {
  if (ev.taskId) {
    store.selectTask(ev.taskId)
    store.closeSchedule()
  }
}

// ── 键盘导航 ──
const focusedIndex = ref(-1)
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { store.closeSchedule(); return }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    const cur = new Date(store.scheduleSelectedDate + 'T00:00:00')
    cur.setDate(cur.getDate() + dir)
    // 跨月时自动翻月
    if (cur.getMonth() !== store.scheduleViewMonth || cur.getFullYear() !== store.scheduleViewYear) {
      store.scheduleViewYear = cur.getFullYear()
      store.scheduleViewMonth = cur.getMonth()
    }
    store.setScheduleDate(dateToStr(cur))
    focusedIndex.value = -1
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const evs = sortedEvents.value
    if (evs.length === 0) return
    if (e.key === 'ArrowDown') focusedIndex.value = Math.min(focusedIndex.value + 1, evs.length - 1)
    else focusedIndex.value = Math.max(focusedIndex.value - 1, 0)
    return
  }
  if (e.key === 'Enter') {
    const evs = sortedEvents.value
    const idx = focusedIndex.value >= 0 ? focusedIndex.value : -1
    if (idx >= 0 && idx < evs.length) {
      e.preventDefault()
      onEventClick(evs[idx])
    }
  }
}

// 日期格子 title 提示
function cellTitle(c: CalendarCell): string {
  if (c.count === 0) return `${c.date}`
  return `${c.date} · ${c.count} 项日程`
}
</script>

<template>
  <div
    class="cockpit-schedule-modal"
    tabindex="0"
    :style="store.scheduleAnchorLeft != null ? { '--schedule-left': store.scheduleAnchorLeft + 'px' } : {}"
    @keydown="onKeydown"
  >
    <!-- 头部 -->
    <div class="cockpit-schedule__head">
      <div class="cockpit-schedule__head-left">
        <span class="cockpit-schedule__title">📅 {{ t('cockpit.schedule') }}</span>
        <button
          v-if="!showAddForm"
          type="button"
          class="cockpit-schedule__add-trigger"
          :title="t('cockpit.scheduleAddTodo')"
          @click="openAddForm"
        >+ {{ t('cockpit.scheduleAddTodo') }}</button>
      </div>
      <button type="button" class="cockpit-schedule__close" @click="store.closeSchedule()">✕</button>
    </div>

    <!-- 添加待办表单（日期 + 时间 + 标题） -->
    <div v-if="showAddForm" class="cockpit-schedule__add-form">
      <input
        ref="todoInputEl"
        v-model="newTodoTitle"
        class="cockpit-schedule__input"
        :placeholder="t('cockpit.scheduleTodoPlaceholder')"
        @keyup.enter="saveTodo"
        @keyup.esc="showAddForm = false"
      />
      <div class="cockpit-schedule__add-row">
        <label class="cockpit-schedule__add-field">
          <span class="cockpit-schedule__add-label">📅</span>
          <input type="date" v-model="newTodoDate" class="cockpit-schedule__add-date" />
        </label>
        <label class="cockpit-schedule__add-field">
          <span class="cockpit-schedule__add-label">⏰</span>
          <input type="time" v-model="newTodoTime" class="cockpit-schedule__add-time" />
        </label>
        <span v-if="!newTodoTime" class="cockpit-schedule__add-hint">无时间=无提醒</span>
      </div>
      <div class="cockpit-schedule__add-actions">
        <button type="button" class="cockpit-schedule__add-save" :disabled="!newTodoTitle.trim()" @click="saveTodo">{{ t('common.save') }}</button>
        <button type="button" class="cockpit-schedule__add-cancel" @click="showAddForm = false">{{ t('common.cancel') }}</button>
      </div>
    </div>

    <!-- 双栏主体 -->
    <div class="cockpit-schedule__body">
      <!-- 左栏：月历 -->
      <div class="cockpit-schedule__cal">
        <div class="cockpit-schedule__nav">
          <button type="button" class="cockpit-schedule__nav-btn" :title="t('cockpit.schedulePrevMonth') || '上月'" @click="store.navigateScheduleMonth(-1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span class="cockpit-schedule__nav-label">{{ store.scheduleViewYear }}年{{ MONTHS[store.scheduleViewMonth] }}</span>
          <button type="button" class="cockpit-schedule__nav-btn" :title="t('cockpit.scheduleNextMonth') || '下月'" @click="store.navigateScheduleMonth(1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button type="button" class="cockpit-schedule__today-btn" @click="goToToday">{{ t('cockpit.today') }}</button>
        </div>
        <div class="cockpit-schedule__grid">
          <div v-for="(w, i) in WEEKDAYS" :key="w" class="cockpit-schedule__wk" :class="{ 'is-weekend': i === 0 || i === 6 }">{{ w }}</div>
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
            :title="cellTitle(c)"
            @click="store.setScheduleDate(c.date)"
          >
            <span class="cockpit-schedule__num">{{ c.day }}</span>
            <span
              v-if="c.count > 0"
              class="cockpit-schedule__count"
              :class="c.topPriority ? `is-${c.topPriority.toLowerCase()}` : 'is-todo'"
            >{{ c.count }}</span>
          </button>
        </div>
      </div>

      <!-- 右栏：当日时间流 -->
      <div class="cockpit-schedule__day">
        <div class="cockpit-schedule__day-head">
          <span class="cockpit-schedule__day-date">{{ selectedDateLabel }}</span>
          <span v-if="selectedCount > 0" class="cockpit-schedule__day-count">{{ selectedCount }} 项</span>
        </div>

        <div class="cockpit-schedule__list">
          <div v-if="sortedEvents.length === 0" class="cockpit-schedule__empty">
            <span class="cockpit-schedule__empty-icon">🗓</span>
            <span class="cockpit-schedule__empty-text">{{ t('cockpit.scheduleEmpty') }}</span>
          </div>
          <div
            v-for="(ev, i) in sortedEvents"
            :key="ev.id"
            class="cockpit-schedule__ev"
            :class="[eventPriClass(ev), { 'is-clickable': !!ev.taskId, 'is-focused': i === focusedIndex, 'is-archived': ev.archived }]"
            :tabindex="ev.taskId ? 0 : -1"
            @click="onEventClick(ev)"
          >
            <span class="cockpit-schedule__ev-bar" :style="{ background: eventBarColor(ev) }" />
            <span v-if="ev.time" class="cockpit-schedule__ev-time">{{ ev.time }}</span>
            <span class="cockpit-schedule__ev-icon">{{ KIND_ICON[ev.kind] ?? '📌' }}</span>
            <div class="cockpit-schedule__ev-body">
              <span class="cockpit-schedule__ev-title">{{ ev.title }}</span>
              <div v-if="ev.kind === 'task' || ev.kind === 'timeline'" class="cockpit-schedule__ev-meta">
                <span v-if="ev.priority" class="cockpit-schedule__ev-pri">{{ ev.priority }}</span>
                <span v-if="ev.status" class="cockpit-schedule__ev-stg" :class="statusClass(ev.status)">{{ statusLabel(ev.status) }}</span>
              </div>
              <span v-else-if="ev.kind === 'todo' && todoRemindLabel(ev)" class="cockpit-schedule__ev-alarm">
                ⏰ {{ todoRemindLabel(ev) }}
              </span>
            </div>
            <button
              v-if="ev.kind === 'todo'"
              type="button"
              class="cockpit-schedule__ev-del"
              :title="t('common.delete') || '删除'"
              @click.stop="store.removeUserTodo(ev.id)"
            >✕</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-schedule-modal {
  position: fixed; top: 48px;
  left: var(--schedule-left, 16px);
  z-index: 1001;
  display: flex; flex-direction: column;
  width: min(680px, calc(100vw - 32px)); max-height: 80vh;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.18); overflow: hidden;
  outline: none;
}

/* 头部 */
.cockpit-schedule__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.cockpit-schedule__head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cockpit-schedule__title { font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; }
.cockpit-schedule__add-trigger {
  font-size: 11px; padding: 3px 10px; border-radius: 6px;
  border: 1px dashed var(--border-color); background: none;
  color: var(--text-muted); cursor: pointer; font-family: inherit; white-space: nowrap;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
  &:hover { border-color: var(--text-muted); color: var(--text-primary); background: var(--bg-secondary); }
}
.cockpit-schedule__close {
  cursor: pointer; color: var(--text-muted); font-size: 16px;
  width: 24px; height: 24px; border: none; background: none;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
  font: inherit; flex-shrink: 0;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}

/* 添加待办表单（头部下方展开） */
.cockpit-schedule__add-form {
  flex-shrink: 0; padding: 12px 16px; border-bottom: 1px solid var(--border-color);
  display: flex; flex-direction: column; gap: 8px;
  background: var(--bg-secondary);
}
.cockpit-schedule__input {
  width: 100%; height: 32px; padding: 0 10px; border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-card); color: var(--text-primary);
  font-size: 13px; font-family: inherit; outline: none;
  &:focus { border-color: var(--accent-primary); }
  &::placeholder { color: var(--text-muted); }
}
.cockpit-schedule__add-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cockpit-schedule__add-field { display: flex; align-items: center; gap: 4px; }
.cockpit-schedule__add-label { font-size: 13px; }
.cockpit-schedule__add-date, .cockpit-schedule__add-time {
  height: 28px; padding: 0 6px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-card); color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none;
  &:focus { border-color: var(--accent-primary); }
}
.cockpit-schedule__add-hint { font-size: 10px; color: var(--text-muted); }
.cockpit-schedule__add-actions { display: flex; gap: 6px; justify-content: flex-end; }
.cockpit-schedule__add-save {
  font-size: 11px; padding: 5px 14px; border-radius: 6px; border: 1px solid var(--accent-primary);
  background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-family: inherit;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.cockpit-schedule__add-cancel {
  font-size: 11px; padding: 5px 14px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}

/* 双栏主体 */
.cockpit-schedule__body {
  flex: 1; display: flex; min-height: 0;
}
.cockpit-schedule__cal {
  flex: 1.1 1 0; min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--border-color);
}
.cockpit-schedule__day {
  flex: 1 1 0; min-width: 280px; display: flex; flex-direction: column;
}

/* 月份导航 */
.cockpit-schedule__nav {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-bottom: 1px solid var(--border-color);
}
.cockpit-schedule__nav-btn {
  width: 26px; height: 26px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-card); color: var(--text-secondary);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-schedule__nav-label {
  font-size: 13px; font-weight: 600; color: var(--text-primary); width: 104px; text-align: center;
}
.cockpit-schedule__today-btn {
  margin-left: auto; font-size: 11px; padding: 4px 12px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); border-color: var(--text-muted); }
}

/* 月历网格 */
.cockpit-schedule__grid {
  display: flex; flex-wrap: wrap; padding: 8px 10px; flex: 1; align-content: flex-start;
}
.cockpit-schedule__wk {
  width: calc(100% / 7); text-align: center; font-size: 10px; font-weight: 600;
  color: var(--text-muted); padding: 6px 0 8px;
  &.is-weekend { color: var(--accent-info); }
}
.cockpit-schedule__cell {
  position: relative; width: calc(100% / 7); aspect-ratio: 1; padding: 0; border: none;
  background: none; cursor: pointer; font-family: inherit;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border-radius: 8px; transition: background 0.12s;
  &:hover { background: var(--bg-secondary); }
  &.is-other .cockpit-schedule__num { color: var(--text-muted); opacity: 0.5; }
  &.is-other:hover { background: transparent; }
  &.is-today .cockpit-schedule__num {
    border: 1.5px solid var(--accent-primary); border-radius: 50%;
    width: 26px; height: 26px; line-height: 23px; display: inline-block; font-weight: 700;
  }
  &.is-selected {
    background: var(--bg-secondary);
    .cockpit-schedule__num {
      background: var(--accent-primary); color: var(--text-on-accent);
      border-radius: 50%; width: 26px; height: 26px; line-height: 26px;
      display: inline-block; font-weight: 700; border-color: var(--accent-primary);
    }
  }
}
.cockpit-schedule__num { font-size: 12px; color: var(--text-primary); transition: 0.1s; }
/* 每日计数徽标：按当日最高优先级着色 */
.cockpit-schedule__count {
  min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px;
  font-size: 9px; font-weight: 700; line-height: 15px; text-align: center;
  color: var(--text-on-accent); font-family: ui-monospace, monospace;
  &.is-p0 { background: var(--error); }
  &.is-p1 { background: var(--warning, #e6a23c); }
  &.is-p2 { background: var(--accent-primary); }
  &.is-p3 { background: var(--text-muted); }
  &.is-todo { background: var(--accent-info); }
}
.cockpit-schedule__cell.is-selected .cockpit-schedule__count {
  box-shadow: 0 0 0 1.5px var(--bg-secondary);
}

/* 右栏：当日时间流 */
.cockpit-schedule__day-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.cockpit-schedule__day-date { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-schedule__day-count {
  font-size: 10px; font-weight: 700; color: var(--accent-primary);
  background: rgba(var(--accent-primary-rgb), 0.1); padding: 1px 7px; border-radius: 8px;
}
.cockpit-schedule__list {
  flex: 1; overflow-y: auto; min-height: 120px; padding: 4px 0;
}
.cockpit-schedule__empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 36px 18px; color: var(--text-muted);
}
.cockpit-schedule__empty-icon { font-size: 28px; opacity: 0.5; }
.cockpit-schedule__empty-text { font-size: 11px; }

/* 事件项：左色带 + 时间 + 图标 + 标题 + 元信息 */
.cockpit-schedule__ev {
  position: relative; display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 18px; cursor: default;
  border-bottom: 1px solid var(--border-color); transition: background 0.1s, box-shadow 0.1s;
  &.is-clickable { cursor: pointer; }
  &.is-clickable:hover, &.is-focused {
    background: var(--bg-secondary); box-shadow: inset 3px 0 0 var(--accent-primary);
  }
  &.is-archived { opacity: 0.55; }
}
.cockpit-schedule__ev-bar {
  position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 0 2px 2px 0;
}
/* P0 色带加粗，强化最高优先级视觉 */
.cockpit-schedule__ev.is-p0 .cockpit-schedule__ev-bar { width: 4px; }
.cockpit-schedule__ev-time {
  flex-shrink: 0; width: 38px; font-size: 10px; color: var(--text-muted);
  font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums;
}
.cockpit-schedule__ev-icon { flex-shrink: 0; font-size: 14px; }
.cockpit-schedule__ev-body { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cockpit-schedule__ev-title {
  font-size: 12px; color: var(--text-primary); font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 优先级视觉权重（复用 Kanban 语言） */
.cockpit-schedule__ev.is-p0 .cockpit-schedule__ev-title { font-weight: 700; color: var(--text-primary); }
.cockpit-schedule__ev.is-p1 .cockpit-schedule__ev-title { font-weight: 600; }
.cockpit-schedule__ev.is-p3 .cockpit-schedule__ev-title { color: var(--text-secondary); }
.cockpit-schedule__ev-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.cockpit-schedule__ev-pri {
  font-size: 9px; font-weight: 700; padding: 0 5px; border-radius: 3px; line-height: 14px;
  font-family: ui-monospace, monospace;
}
.cockpit-schedule__ev.is-p0 .cockpit-schedule__ev-pri { background: var(--error); color: var(--text-on-accent); }
.cockpit-schedule__ev.is-p1 .cockpit-schedule__ev-pri { background: rgba(var(--warning-rgb, 230,162,60), 0.15); color: var(--warning, #e6a23c); }
.cockpit-schedule__ev.is-p2 .cockpit-schedule__ev-pri { background: rgba(var(--accent-primary-rgb), 0.1); color: var(--accent-primary); }
.cockpit-schedule__ev.is-p3 .cockpit-schedule__ev-pri { background: var(--bg-secondary); color: var(--text-muted); }
/* 状态标签：按语义着色 */
.cockpit-schedule__ev-stg {
  font-size: 9px; padding: 0 6px; border-radius: 3px; line-height: 15px;
  background: var(--bg-secondary); color: var(--text-secondary);
  &.st-blocked { color: var(--error); background: rgba(var(--error-rgb), 0.08); font-weight: 600; }
  &.st-running { color: var(--accent-info); background: rgba(var(--accent-info-rgb, 74,144,217), 0.1); font-weight: 600; }
  &.st-review { color: var(--warning, #e6a23c); background: rgba(var(--warning-rgb, 230,162,60), 0.1); font-weight: 600; }
  &.st-done { color: var(--text-muted); }
  &.st-normal { color: var(--text-secondary); }
}
.cockpit-schedule__ev-del {
  flex-shrink: 0; width: 20px; height: 20px; padding: 0; border: none;
  background: none; color: var(--text-muted); cursor: pointer; font-size: 12px;
  line-height: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--error); }
}

/* 待办闹钟时刻标签 */
.cockpit-schedule__ev-alarm {
  font-size: 10px; color: var(--accent-info); font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
</style>

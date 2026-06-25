<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const WEEKDAYS = ['日','一','二','三','四','五','六']

// 内联新建待办
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
  padding: 10px 18px; border-bottom: 1px solid var(--border-color);
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
  display: flex; flex-wrap: wrap; padding: 4px 12px; border-bottom: 1px solid var(--border-color);
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
  border-bottom: 1px solid var(--border-color); transition: .1s;
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

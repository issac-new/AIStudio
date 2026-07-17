<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { Solar } from 'lunar-typescript'
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

// ── 农历计算：公历日期串 → { 日名, 节日?, 节气? } ──
interface LunarInfo { label: string; festival?: string; jieqi?: string }
function getLunarInfo(dateStr: string): LunarInfo {
  const [y, m, d] = dateStr.split('-').map(Number)
  const lunar = Solar.fromYmd(y, m, d).getLunar()
  const festivals = lunar.getFestivals()        // 春节/端午/中秋…
  const jieqi = lunar.getJieQi()                 // 清明…
  const day = lunar.getDayInChinese()            // 初一/十五/廿一
  // 初一显示月名（正月/二月…），其余显示日名
  const label = day === '初一'
    ? `${lunar.getMonthInChinese()}月`
    : day
  return { label, festival: festivals.length ? festivals[0] : undefined, jieqi: jieqi || undefined }
}

// ── 年历：当前年的 12 个月，每格含农历/节日/事件计数，点击直达该日 ──
interface MiniCell {
  day: number
  date: string
  isToday: boolean
  isSelected: boolean
  count: number
  topPriority?: string
  lunar?: LunarInfo
  isFestival: boolean
}
interface MiniMonth { month: number; label: string; weeks: MiniCell[][]; isCurrentMonth: boolean }
const yearMonths = computed<MiniMonth[]>(() => {
  const year = store.scheduleViewYear
  const counts = store.scheduleCountsByDate
  const topPri = store.scheduleTopPriorityByDate
  const todayStr = dateToStr(new Date())
  const selDate = store.scheduleSelectedDate
  const curMonth = store.scheduleViewMonth
  return MONTHS.map((label, m) => {
    const firstDay = new Date(year, m, 1).getDay()
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    const prevDays = new Date(year, m, 0).getDate()
    const cells: MiniCell[] = []
    // 上月补齐（仅占位，不计算农历）
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i
      const pm = m === 0 ? 11 : m - 1
      const py = m === 0 ? year - 1 : year
      const date = `${py}-${pad(pm + 1)}-${pad(d)}`
      cells.push({ day: d, date, isToday: date === todayStr, isSelected: date === selDate, count: 0, isFestival: false })
    }
    // 本月（计算农历）
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${pad(m + 1)}-${pad(d)}`
      const lunar = getLunarInfo(date)
      cells.push({
        day: d, date, isToday: date === todayStr, isSelected: date === selDate,
        count: counts[date] ?? 0, topPriority: topPri[date],
        lunar, isFestival: !!(lunar.festival || lunar.jieqi),
      })
    }
    // 下月补齐至 7 的倍数
    let next = 1
    while (cells.length % 7 !== 0) {
      const nm = m === 11 ? 0 : m + 1
      const ny = m === 11 ? year + 1 : year
      const date = `${ny}-${pad(nm + 1)}-${pad(next)}`
      cells.push({ day: next, date, isToday: false, isSelected: date === selDate, count: 0, isFestival: false })
      next++
    }
    const weeks: MiniCell[][] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    return { month: m, label, weeks, isCurrentMonth: m === curMonth }
  })
})

// 年份导航
function navigateYear(delta: number) { store.scheduleViewYear += delta }

// mini 格子点击：直接选该日（同步年月，确保右栏切换）
function pickDay(date: string) {
  const [y, m] = date.split('-').map(Number)
  store.scheduleViewYear = y
  store.scheduleViewMonth = m - 1
  store.setScheduleDate(date)
}

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

// mini 格子 title 提示：日期 + 农历 + 事件数
function miniTitle(c: MiniCell): string {
  const parts = [c.date]
  if (c.lunar) {
    const extra = c.lunar.festival || c.lunar.jieqi || c.lunar.label
    if (extra) parts.push(extra)
  }
  if (c.count > 0) parts.push(`${c.count} 项日程`)
  return parts.join(' · ')
}
</script>

<template>
  <div
    class="cockpit-schedule-modal"
    tabindex="0"
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
        <span v-if="!newTodoTime" class="cockpit-schedule__add-hint">{{ t('cockpit.noReminder') }}</span>
      </div>
      <div class="cockpit-schedule__add-actions">
        <button type="button" class="cockpit-schedule__add-save" :disabled="!newTodoTitle.trim()" @click="saveTodo">{{ t('common.save') }}</button>
        <button type="button" class="cockpit-schedule__add-cancel" @click="showAddForm = false">{{ t('common.cancel') }}</button>
      </div>
    </div>

    <!-- 双栏主体 -->
    <div class="cockpit-schedule__body">
      <!-- 左栏：年历（12 个月，点击直达某日） -->
      <div class="cockpit-schedule__cal">
        <div class="cockpit-schedule__nav">
          <button type="button" class="cockpit-schedule__nav-btn" :title="t('cockpit.prevYear')" @click="navigateYear(-1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span class="cockpit-schedule__nav-label">{{ t('cockpit.yearLabel', { n: store.scheduleViewYear }) }}</span>
          <button type="button" class="cockpit-schedule__nav-btn" :title="t('cockpit.nextYear')" @click="navigateYear(1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button type="button" class="cockpit-schedule__today-btn" @click="goToToday">{{ t('cockpit.today') }}</button>
        </div>

        <div class="cockpit-schedule__year">
          <div class="cockpit-schedule__year-grid">
            <div
              v-for="mm in yearMonths"
              :key="mm.month"
              class="cockpit-schedule__mini"
              :class="{ 'is-cur': mm.isCurrentMonth }"
            >
              <div class="cockpit-schedule__mini-head">
                <span class="cockpit-schedule__mini-label">{{ mm.label }}</span>
              </div>
              <div class="cockpit-schedule__mini-weeks">
                <div v-for="(wk, wi) in mm.weeks" :key="wi" class="cockpit-schedule__mini-wk">
                  <button
                    v-for="(c, ci) in wk"
                    :key="ci"
                    type="button"
                    class="cockpit-schedule__mini-d"
                    :class="{
                      'is-today': c.isToday,
                      'is-selected': c.isSelected,
                      'is-festival': c.isFestival,
                      'has-count': c.count > 0,
                      [`is-${c.topPriority?.toLowerCase()}`]: c.count > 0 && c.topPriority,
                    }"
                    :title="miniTitle(c)"
                    @click="pickDay(c.date)"
                  >
                    <span class="cockpit-schedule__mini-num">{{ c.day }}</span>
                    <span v-if="c.lunar" class="cockpit-schedule__mini-lunar">
                      {{ c.lunar.festival || c.lunar.jieqi || c.lunar.label }}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：当日时间流 -->
      <div class="cockpit-schedule__day">
        <div class="cockpit-schedule__day-head">
          <span class="cockpit-schedule__day-date">{{ selectedDateLabel }}</span>
          <span v-if="selectedCount > 0" class="cockpit-schedule__day-count">{{ t('cockpit.itemCount', { n: selectedCount }) }}</span>
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
  position: fixed; inset: 24px;
  z-index: 1001;
  display: flex; flex-direction: column;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden;
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
  flex: 1.4 1 0; min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--border-color); overflow: hidden;
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

/* 年历：12 个月铺满左栏，不滚动 */
.cockpit-schedule__year {
  flex: 1; min-height: 0; padding: 10px 14px 14px; overflow: hidden;
}
.cockpit-schedule__year-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(3, 1fr);
  gap: 8px; height: 100%;
}
.cockpit-schedule__mini {
  display: flex; flex-direction: column; gap: 4px; padding: 6px 6px 4px;
  border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card);
  min-height: 0; transition: border-color 0.12s, background 0.12s;
  &.is-cur { border-color: var(--accent-primary); background: rgba(var(--accent-primary-rgb), 0.04); }
}
.cockpit-schedule__mini-head { text-align: center; flex-shrink: 0; }
.cockpit-schedule__mini-label {
  font-size: 11px; font-weight: 700; color: var(--text-primary);
}
.cockpit-schedule__mini.is-cur .cockpit-schedule__mini-label { color: var(--accent-primary); }
.cockpit-schedule__mini-weeks { display: flex; flex-direction: column; gap: 2px; flex: 1; min-height: 0; }
.cockpit-schedule__mini-wk { display: flex; gap: 2px; flex: 1; }
.cockpit-schedule__mini-d {
  flex: 1; min-width: 0; padding: 1px 0; border: none; background: none;
  cursor: pointer; font-family: inherit; border-radius: 4px; position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
  transition: background 0.1s;
  &:hover { background: var(--bg-secondary); }
  &.is-selected { background: var(--accent-primary); .cockpit-schedule__mini-num, .cockpit-schedule__mini-lunar { color: var(--text-on-accent); } }
  &.is-today .cockpit-schedule__mini-num { color: var(--accent-primary); font-weight: 700; }
  &.is-festival .cockpit-schedule__mini-lunar { color: var(--error); font-weight: 600; }
  &.has-count::after {
    content: ''; position: absolute; width: 4px; height: 4px; border-radius: 50%;
    background: var(--accent-primary); margin-top: 22px;
  }
  &.is-p0::after { background: var(--error); }
  &.is-p1::after { background: var(--warning, #e6a23c); }
  &.is-p2::after { background: var(--accent-primary); }
  &.is-p3::after { background: var(--text-muted); }
}
.cockpit-schedule__mini-num {
  font-size: 11px; line-height: 1.2; color: var(--text-primary);
}
.cockpit-schedule__mini-lunar {
  font-size: 8px; line-height: 1; color: var(--text-muted); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 100%;
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
  position: relative; display: flex; align-items: center; gap: 10px;
  padding: 8px 16px 8px 22px; cursor: default;
  border-bottom: 1px solid var(--border-color); transition: background 0.1s, box-shadow 0.1s;
  &.is-clickable { cursor: pointer; }
  &.is-clickable:hover, &.is-focused {
    background: var(--bg-secondary); box-shadow: inset 3px 0 0 var(--accent-primary);
  }
  &.is-archived { opacity: 0.55; }
}
/* 左侧色带：替代图标，按类型/优先级着色（P0 红/P1 橙/P2 蓝/P3 灰/todo 蓝/timeline 灰） */
.cockpit-schedule__ev-bar {
  position: absolute; left: 0; top: 0; bottom: 0; width: 5px; border-radius: 0 3px 3px 0;
}
/* P0 色带加粗，强化最高优先级视觉 */
.cockpit-schedule__ev.is-p0 .cockpit-schedule__ev-bar { width: 7px; }
.cockpit-schedule__ev-time {
  flex-shrink: 0; width: 38px; font-size: 10px; color: var(--text-muted);
  font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums;
}
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

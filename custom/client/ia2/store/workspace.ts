// overlay/custom/client/ia2/store/workspace.ts
// P3 Task 8 — store 拆分：ia2 消费面独立模块（extract-shared，非 copied）。
//
// cockpit store（1638 行）随 /hermes/cockpit 路由退役删除；其中仍被新 IA 消费的
// 三块能力拆到本 store，持久层与 adapter 原样复用（零复制）：
//   ① 跨 board 任务聚合 —— teamsApi.fetchKanbanOverview 优先（一次请求全 board），
//      失败回落 kanbanApi listBoards+listTasks（N+1，单 board 失败不阻塞）。
//      注意力条（AttentionStrip/mergeAttention）与介入中心 ②③⑤源的数据底座。
//   ② 用户待办 + T-15/T-5 闹钟调度 —— cockpit-kv 是单一事实源（extract-shared），
//      词表与持久化键与 cockpit 完全一致（cockpit.userTodos）。
//   ③ 日程弹窗状态 —— 总览复用 CockpitScheduleModal 的挂载状态与派生序列
//      （cockpit 原实现含 history/timeline 事件源；history 面板随退役删除，
//      本 store 只聚合 task(createdAt) + todo(date) 两源）。
//   ④ 看板聚合 WS 生命周期 —— connectOverviewStream（任一 board 事件 → 500ms
//      去抖 refreshAllBoards）。方法名沿用 Task 4 台账的 initFleetStream/
//      stopFleetStream；接管点：IaShell unmount（原 CockpitView unmount）。
//      fleet sessions WS（connectFleetStream）无新 IA 消费方，不再连接。
// 不含：workspaceMode/三栏布局/协作图/时序流/假终端/工作项草稿/团队过滤/MCP
// 健康轮询/通知面板（均随 cockpit UI 退役；等价能力见 task-8-report 处置表）。
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import * as kanbanApi from '@/api/hermes/kanban'
import { loadUserTodos, saveUserTodos, type UserTodo } from '@/custom/cockpit/store/cockpit-kv'
import * as taskAdapter from '@/custom/cockpit/adapters/task-adapter'
import type { CockpitTask, CockpitPriority } from '@/custom/cockpit/adapters/task-adapter'
import * as fleetAdapter from '@/custom/cockpit/adapters/fleet-adapter'
import * as teamsApi from '@/custom/cockpit/adapters/teams-adapter'

/** 日程事件（任务/待办两源；kind=timeline 随 cockpit 历史面板退役不再产出） */
export interface ScheduleEvent {
  id: string
  date: string            // YYYY-MM-DD
  title: string
  kind: 'task' | 'timeline' | 'todo'
  taskId?: string
  time?: string           // HH:mm（由 ts 派生）
  ts?: number             // 毫秒时间戳（右栏按时间排序）
  priority?: CockpitPriority   // task 类：优先级（右栏色带/视觉权重）
  status?: string              // task 类：状态（9 值之一）
  archived?: boolean
}

const PRIORITY_ORDER: Record<CockpitPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
const pad2 = (n: number) => String(n).padStart(2, '0')
const dateToStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const hhmm = (ts: number) => {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export const useWorkspaceStore = defineStore('ia2-workspace', () => {
  // ── ① 跨 board 任务聚合 ──
  const tasks = ref<CockpitTask[]>([])
  const boards = ref<{ slug: string; name: string; total: number }[]>([])

  let _lastRefreshTs = 0
  async function refreshAllBoards(force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && now - _lastRefreshTs < 2000) return true // 2s 防抖，视为成功
    _lastRefreshTs = now
    try {
      // 优先走服务端聚合端点（一次请求全 board；失败回落 N+1 旧路径）
      try {
        const overview = await teamsApi.fetchKanbanOverview()
        boards.value = overview.boards.length ? overview.boards : [{ slug: 'default', name: 'default', total: 0 }]
        tasks.value = overview.tasks
        return true
      } catch { /* 聚合端点不可用 → 回落 */ }
      const boardList = await kanbanApi.listBoards({ includeArchived: false })
      const active = (boardList || []).filter((b: any) => !b.archived)
      boards.value = active.map((b: any) => ({ slug: b.slug, name: b.name, total: (b as any).total ?? 0 }))
      const results = await Promise.allSettled(
        active.map((b: any) =>
          kanbanApi.listTasks({ board: b.slug, includeArchived: true }).then(
            list => list.map(t => taskAdapter.toCockpitTask(t, b.slug)),
          ),
        ),
      )
      const all: CockpitTask[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value)
      }
      tasks.value = all
      return true
    } catch {
      return false
    }
  }

  // ── ② 用户待办 + 闹钟调度 ──
  const userTodos = ref<UserTodo[]>([])
  let _reminderTimer: ReturnType<typeof setInterval> | undefined

  function loadTodos(): void {
    userTodos.value = loadUserTodos()
  }

  function addUserTodo(date: string, title: string, note?: string, remindAt?: number): void {
    const todo: UserTodo = {
      id: 'todo-' + Date.now(), date, title, note,
      createdAt: Date.now(),
      remindAt: remindAt && remindAt > Date.now() ? remindAt : undefined,
    }
    userTodos.value.push(todo)
    saveUserTodos(userTodos.value)
    // 立即检查一次，应对临近提醒
    checkReminders()
  }

  function removeUserTodo(id: string): void {
    userTodos.value = userTodos.value.filter(t => t.id !== id)
    saveUserTodos(userTodos.value)
  }

  const MIN15 = 15 * 60 * 1000
  const MIN5 = 5 * 60 * 1000

  /** 触发一次提醒：浏览器系统通知（应用内提醒面板随 cockpit 退役，Task 8 fix 一并清除只写态） */
  function fireReminder(todo: UserTodo, stage: 15 | 5): void {
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(`⏰ ${todo.title}`, {
            body: stage === 15 ? '15 分钟后开始' : '5 分钟后开始',
            tag: `reminder:${todo.id}:${stage}`,
          })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') {
              new Notification(`⏰ ${todo.title}`, {
                body: stage === 15 ? '15 分钟后开始' : '5 分钟后开始',
                tag: `reminder:${todo.id}:${stage}`,
              })
            }
          })
        }
      }
    } catch { /* SSR/无权限环境静默 */ }
  }

  /** 检查所有待办的提醒窗口，按需触发并持久化触发标记 */
  function checkReminders(): void {
    let changed = false
    for (const todo of userTodos.value) {
      if (!todo.remindAt) continue
      const now = Date.now()
      const t = todo.remindAt
      if (!todo.reminded15 && now >= t - MIN15 && now < t - MIN5) {
        fireReminder(todo, 15)
        todo.reminded15 = true
        changed = true
      } else if (!todo.reminded5 && now >= t - MIN5 && now < t) {
        fireReminder(todo, 5)
        todo.reminded5 = true
        changed = true
      } else if (now >= t) {
        // 重载恢复：已过 remindAt 但标记仍缺 → 补触发（标记防重复）
        if (!todo.reminded15) { fireReminder(todo, 15); todo.reminded15 = true; changed = true }
        if (!todo.reminded5) { fireReminder(todo, 5); todo.reminded5 = true; changed = true }
      }
    }
    if (changed) saveUserTodos(userTodos.value)
  }

  /** 启动每分钟调度器（幂等；cockpit 同款"启动即生效"） */
  function startReminderScheduler(): void {
    if (_reminderTimer) return
    checkReminders()
    _reminderTimer = setInterval(checkReminders, 60_000)
  }

  function stopReminderScheduler(): void {
    if (_reminderTimer) { clearInterval(_reminderTimer); _reminderTimer = undefined }
  }

  // ── ③ 日程弹窗状态 ──
  const scheduleOpen = ref(false)
  const scheduleSelectedDate = ref('')
  const scheduleViewYear = ref(2026)
  const scheduleViewMonth = ref(5)   // 0-indexed

  function openSchedule(): void {
    scheduleOpen.value = true
    const now = new Date()
    scheduleViewYear.value = now.getFullYear()
    scheduleViewMonth.value = now.getMonth()
    scheduleSelectedDate.value = dateToStr(now)
    loadTodos()
    startReminderScheduler()
  }

  function closeSchedule(): void {
    scheduleOpen.value = false
  }

  function setScheduleDate(d: string): void {
    scheduleSelectedDate.value = d
  }

  // 任务按 createdAt 归日 + 待办按 date 归日（timeline 源已随历史面板退役）
  const scheduleEvents = computed<Record<string, ScheduleEvent[]>>(() => {
    const map: Record<string, ScheduleEvent[]> = {}
    for (const t of tasks.value) {
      const ts = t.createdAt
      if (!ts) continue
      const d = dateToStr(new Date(ts))
      if (!map[d]) map[d] = []
      map[d].push({
        id: t.id, date: d, title: t.title, kind: 'task', taskId: t.id,
        ts, time: hhmm(ts), priority: t.priority, status: t.status,
      })
    }
    for (const t of userTodos.value) {
      if (!map[t.date]) map[t.date] = []
      map[t.date].push({ id: t.id, date: t.date, title: t.title, kind: 'todo', ts: t.createdAt })
    }
    return map
  })

  const scheduleEventsForSelected = computed<ScheduleEvent[]>(() =>
    scheduleEvents.value[scheduleSelectedDate.value] ?? [])

  /** 右栏按时间升序排列（无 ts 的归末位） */
  const scheduleEventsForSelectedSorted = computed<ScheduleEvent[]>(() =>
    [...scheduleEventsForSelected.value].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)))

  const scheduleCountsByDate = computed<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const [d, evs] of Object.entries(scheduleEvents.value)) m[d] = evs.length
    return m
  })

  /** 每日最高优先级（左栏徽标着色：P0>P1>P2>P3，仅当当日含 task 类事件） */
  const scheduleTopPriorityByDate = computed<Record<string, CockpitPriority>>(() => {
    const m: Record<string, CockpitPriority> = {}
    for (const [d, evs] of Object.entries(scheduleEvents.value)) {
      const prios = evs.filter(e => e.priority).map(e => e.priority!)
      if (prios.length) m[d] = prios.sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])[0]
    }
    return m
  })

  // ── ④ 看板聚合 WS 生命周期（Task 4 台账接管点：IaShell unmount）──
  let _overviewStream: fleetAdapter.FleetStreamHandle | null = null
  let _overviewDebounce: ReturnType<typeof setTimeout> | undefined

  /** 连接看板聚合 WS（幂等）。名字沿用台账；fleet sessions WS 无消费方不再连。 */
  function initFleetStream(): void {
    if (_overviewStream) return
    _overviewStream = fleetAdapter.connectOverviewStream({
      onBoardEvent: () => {
        if (_overviewDebounce) clearTimeout(_overviewDebounce)
        _overviewDebounce = setTimeout(() => { void refreshAllBoards(true) }, 500)
      },
    })
  }

  /** 关闭聚合 WS（IaShell unmount 接管；幂等）。stop 后可重新 init。 */
  function stopFleetStream(): void {
    _overviewStream?.close()
    _overviewStream = null
    if (_overviewDebounce) {
      clearTimeout(_overviewDebounce)
      _overviewDebounce = undefined
    }
  }

  // kanban store 内任务变化（看板页编辑）→ 轻量去抖同步聚合视图（2s 防抖由
  // refreshAllBoards 兜底；观察 kanban.tasks 需运行期 import，避免重图依赖进测试）
  let _kanbanWatchInstalled = false
  let _kanbanWatchStop: (() => void) | null = null
  function watchKanbanTasks(): void {
    if (_kanbanWatchInstalled) return
    _kanbanWatchInstalled = true
    void import('@/stores/hermes/kanban').then(({ useKanbanStore }) => {
      // 2026-09-12 审查：动态 import 未决期间可能已 unwatch（快速进出视图）——
      // 此时标志位已复位，不得再安装 watch（否则泄漏 + 下次进入重复安装）
      if (!_kanbanWatchInstalled) return
      const kanban = useKanbanStore()
      // 台账 T8（模块级 watch 永不卸）：stop 句柄存 store，消费方卸载时 unwatchKanbanTasks
      const stop = watch(() => kanban.tasks, () => {
        if (_overviewDebounce) clearTimeout(_overviewDebounce)
        _overviewDebounce = setTimeout(() => { void refreshAllBoards() }, 500)
      }, { deep: false })
      _kanbanWatchStop = stop
    }).catch(() => { /* kanban store 不可用（纯单测）时静默 */ })
  }
  /** 解除 kanban.tasks watch（消费方视图卸载时调用；未装/已卸为 no-op） */
  function unwatchKanbanTasks(): void {
    _kanbanWatchStop?.()
    _kanbanWatchStop = null
    _kanbanWatchInstalled = false
  }

  return {
    // ① 聚合
    tasks, boards, refreshAllBoards,
    // ② 待办/提醒
    userTodos, loadTodos, addUserTodo, removeUserTodo,
    startReminderScheduler, stopReminderScheduler,
    // ③ 日程
    scheduleOpen, scheduleSelectedDate, scheduleViewYear, scheduleViewMonth,
    openSchedule, closeSchedule, setScheduleDate,
    scheduleEvents, scheduleEventsForSelectedSorted, scheduleCountsByDate, scheduleTopPriorityByDate,
    // ④ WS 生命周期
    initFleetStream, stopFleetStream, watchKanbanTasks, unwatchKanbanTasks,
  }
})

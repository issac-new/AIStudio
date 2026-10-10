// overlay/custom/client/ia2/composables/useTaskProgress.ts
// 按任务卡的研发进度（进度可感知链·消费面）：轮询 /api/progress/tasks（派发台账
// taskId × 引擎会话投影聚合），供看板卡阶段徽章/任务简报里程碑时间线消费。
// useAgentActivity 同款：模块级单例+引用计数+effect scope 自动释放（24h 审查
// 轮询泄漏教训沿用）；fail-soft 保留上次值。
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'

export interface TaskPhaseItem {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
}

export interface TaskProgressInfo {
  taskId: string
  target: string
  currentPhase?: string
  phases: TaskPhaseItem[]
  sessionPhase?: string
  goalStatus?: string
  active: boolean
  sessionKnown: boolean
  lastActivityAt?: number
  dispatchCount: number
  dispatchOkCount: number
  /** 技能侧里程碑（无引擎站点面时的进度回退源） */
  milestones?: Array<{ ts: string; milestone: string; status?: string; note?: string }>
}

const byTask = ref<Record<string, TaskProgressInfo>>({})
const activeTaskIds = ref<string[]>([])
let timer: ReturnType<typeof setInterval> | null = null
let consumers = 0

async function refresh(): Promise<void> {
  try {
    const { authFetch } = await import('@/custom/ide/utils/auth-fetch')
    const res = await authFetch('/api/progress/tasks?limit=200')
    if (!res.ok) return
    const data = (await res.json()) as { ok?: boolean; tasks?: TaskProgressInfo[] }
    if (!data.ok || !Array.isArray(data.tasks)) return
    const next: Record<string, TaskProgressInfo> = {}
    for (const t of data.tasks) {
      if (t && typeof t.taskId === 'string' && t.taskId) next[t.taskId] = t
    }
    byTask.value = next
    activeTaskIds.value = data.tasks.filter((t) => t.active).map((t) => t.taskId)
  } catch {
    // fail-soft：保留上次值（徽章短暂陈旧好过整板报错）
  }
}

function start(): void {
  if (timer) return
  void refresh()
  timer = setInterval(() => void refresh(), 20_000)
}

function stop(): void {
  if (timer && consumers <= 0) {
    clearInterval(timer)
    timer = null
  }
}

/** 看板卡/任务简报共用：taskProgressOf(taskId) → 进度；activeTaskProgress=在跑任务列表 */
export function useTaskProgress() {
  consumers += 1
  start()
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    consumers -= 1
    stop()
  }
  if (getCurrentScope()) onScopeDispose(release)
  return {
    progressMap: readonly(byTask),
    activeTaskIds: readonly(activeTaskIds),
    releaseTaskProgress: release,
  }
}

/** 卡片/简报侧便捷取值（非响应式上下文用） */
export function taskProgressOf(map: Record<string, TaskProgressInfo> | undefined, taskId: string | null | undefined): TaskProgressInfo | null {
  if (!taskId || !map) return null
  return map[String(taskId)] ?? null
}

/** 阶段进度文案：x/y 站完成（无站点面返回 null，调用方不渲染） */
export function phaseProgressText(t: TaskProgressInfo | null): string | null {
  if (!t || t.phases.length === 0) return null
  const done = t.phases.filter((p) => p.status === 'done').length
  return `${done}/${t.phases.length}`
}

// overlay/custom/client/ia2/composables/useAgentActivity.ts
// 后台 agent 执行态聚合（2026-10-04 三件套数据源）：轮询既有 /api/hermes/fleet/sessions
// （FleetSession：profile/status:working|idle/lastActiveAt），按 profile 聚合
// 「working 会话数 + 最近活动时间」。模块级单例——卡片/顶栏多处消费共用一份
// 轮询（引用计数，最后一个消费者卸载才停表）。
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'

export interface AgentActivity {
  working: number
  sessions: number
  lastActiveAt: number
}

const activity = ref<Record<string, AgentActivity>>({})
const activeProfiles = ref<string[]>([])
const ready = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let consumers = 0

async function refresh(): Promise<void> {
  try {
    const { authFetch } = await import('@/custom/ide/utils/auth-fetch')
    const res = await authFetch('/api/hermes/fleet/sessions')
    if (!res.ok) return
    const data = (await res.json()) as { sessions?: Array<{ profile?: string; status?: string; lastActiveAt?: number }> }
    const next: Record<string, AgentActivity> = {}
    for (const s of data.sessions ?? []) {
      const p = String(s.profile || '').trim()
      if (!p || p === 'default') continue
      const cur = next[p] ?? { working: 0, sessions: 0, lastActiveAt: 0 }
      cur.sessions += 1
      if (s.status === 'working') cur.working += 1
      if ((s.lastActiveAt ?? 0) > cur.lastActiveAt) cur.lastActiveAt = s.lastActiveAt ?? 0
      next[p] = cur
    }
    activity.value = next
    activeProfiles.value = Object.entries(next)
      .filter(([, v]) => v.working > 0)
      .map(([k]) => k)
    ready.value = true
  } catch {
    // fail-soft：网络/鉴权抖动时保留上次值（badge 短暂陈旧好过整板报错）
  }
}

function start(): void {
  if (timer) return
  void refresh()
  timer = setInterval(() => void refresh(), 15_000)
}

function stop(): void {
  if (timer && consumers <= 0) {
    clearInterval(timer)
    timer = null
  }
}

/** 看板卡/顶栏共用：activityMap[profile] → 执行态；activeProfileCount=working>0 的 profile 数 */
export function useAgentActivity() {
  consumers += 1
  start()
  // 消费方失活即减引用。2026-10-04 24h 审查：KanbanTaskCard（全站最高频挂载组件）
  // 只取值从不释放，consumers 只增不减，15s 轮询离开看板后仍进程级常驻——改为
  // effect scope 销毁时自动释放（卡片/顶栏统一覆盖），releaseAgentActivity 保留
  // 手动通道且幂等（双通道不会二次减计）。
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    consumers -= 1
    stop()
  }
  if (getCurrentScope()) onScopeDispose(release)
  return {
    activity: readonly(activity),
    activeProfiles: readonly(activeProfiles),
    ready: readonly(ready),
    releaseAgentActivity: release,
  }
}

/** 卡片侧便捷判定（非响应式上下文用，模板内请用 activityMap） */
export function agentActivityOf(map: Record<string, AgentActivity> | undefined, profile: string | null | undefined): AgentActivity | null {
  if (!profile || !map) return null
  return map[String(profile)] ?? null
}

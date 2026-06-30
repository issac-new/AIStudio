// overlay/custom/client/cockpit/composables/useRunTraceOverview.ts
// 全局聚合视图：跨所有 profile 加载全部会话，重建 trace 并合并为单一聚合 state。
// 供 RunTraceOverview 组件使用——点击 Run Observatory 后直接展示所有跨任务会话聚合图。
import { ref } from 'vue'
import { fetchHermesSessions, fetchSessionMessagesPage, type SessionSummary } from '@/api/hermes/sessions'
import {
  applyRunEvent,
  createTraceState,
  fetchLayer2Trace,
  mergeLayer2Data,
  mergeTraceStates,
  replayMessagesIntoState,
  type TraceNode,
  type TraceState,
} from '../adapters/run-trace-adapter'
import { extractKanbanTaskId, matchSessionTaskId } from './sessionTaskId'
import type { RunEvent } from '@/api/hermes/chat'

export interface OverviewSessionMeta {
  sessionId: string
  cluster: string
  taskId: string | null
  title: string
  profile?: string
  startedAt: number // ms
  endedAt: number | null // ms
  messageCount: number
  isRunning: boolean
  isEmpty: boolean
}

const FALLBACK_PROFILES = ['default', 'orchestrator', 'worker-coder', 'worker-researcher']

export function useRunTraceOverview() {
  const nodes = ref<TraceNode[]>([])
  const edges = ref<TraceState['edges']>([])
  const sessions = ref<OverviewSessionMeta[]>([])
  const loading = ref(false)
  const progress = ref(0) // 0-100
  const error = ref<string | null>(null)

  /** cluster(taskId) → 元信息（最早 startedAt / 标题 / profile / 会话数） */
  const clusterMeta = ref<Map<string, { startedAt: number; title: string; profile?: string; sessionCount: number }>>(new Map())

  /** 会话 → cluster 映射（节点回填 cluster 用） */
  let sessionClusterMap = new Map<string, string>()
  let sessionProfileMap = new Map<string, string | undefined>()

  /** 跨所有 profile 加载全量会话列表 */
  async function loadAllSessions(): Promise<Array<SessionSummary & { profile?: string }>> {
    let profileNames: string[] = []
    try {
      const mod: any = await import('@/stores/hermes/profiles')
      const store = mod.useProfilesStore?.()
      const profiles = store?.profiles
      if (Array.isArray(profiles) && profiles.length > 0) {
        profileNames = profiles.map((p: any) => p?.name).filter(Boolean)
      }
    } catch { /* profilesStore 未初始化 */ }
    if (profileNames.length === 0) profileNames = [...FALLBACK_PROFILES]

    const results = await Promise.allSettled(
      profileNames.map((name: string) =>
        fetchHermesSessions(undefined, 500, name).then(ss => ss.map(s => ({ ...s, profile: name }))),
      ),
    )
    const merged: Array<SessionSummary & { profile?: string }> = []
    for (const r of results) {
      if (r.status === 'fulfilled') merged.push(...r.value)
    }
    return merged
  }

  /** 为单个会话构建 trace state（含 ingress + run + 消息回放） */
  async function buildSessionState(meta: OverviewSessionMeta): Promise<TraceState | null> {
    const sid = meta.sessionId
    let s = createTraceState(sid, new Set([sid]))

    // 先发 run.started 建立 ingress + run 节点
    const startedAt = meta.startedAt || Date.now()
    const startedEvent: RunEvent = {
      event: 'run.started',
      session_id: sid,
      run_id: `replay-${sid}`,
      timestamp: startedAt,
    } as any
    s = applyRunEvent(s, startedEvent)

    if (meta.isEmpty) {
      // 空壳会话：将 run 节点降级为 cancelled，仅保留 ingress+run 骨架
      const runNodeId = `run:${sid}:replay-${sid}`
      s = {
        ...s,
        nodes: s.nodes.map(n => (n.id === runNodeId ? { ...n, status: 'cancelled' as const } : n)),
      }
      return s
    }

    try {
      const page = await fetchSessionMessagesPage(sid, 0, 500, meta.profile)
      if (page && page.messages && page.messages.length > 0) {
        s = replayMessagesIntoState(s, page.messages, sid)
      }
    } catch (e) {
      console.warn(`[overview] 会话 ${sid} 消息拉取失败:`, e)
    }

    // 可选 L2 数据合并
    try {
      const l2 = await fetchLayer2Trace(sid, meta.profile)
      if (l2) s = mergeLayer2Data(s, l2)
    } catch { /* L2 不可用，忽略 */ }

    return s
  }

  /**
   * 加载全部会话并构建聚合 state。
   * 顺序处理（避免并发拉取压垮后端），逐会话更新 progress。
   */
  async function load() {
    loading.value = true
    progress.value = 0
    error.value = null
    nodes.value = []
    edges.value = []
    sessions.value = []
    clusterMeta.value = new Map()
    sessionClusterMap = new Map()
    sessionProfileMap = new Map()

    try {
      const all = await loadAllSessions()
      console.debug(`[overview] 加载到 ${all.length} 个会话`)

      // 构建会话元信息 + cluster 映射
      const metas: OverviewSessionMeta[] = all.map(s => {
        const title = s.title || '(未命名会话)'
        const taskId = matchSessionTaskId(title) ?? extractKanbanTaskId(title)
        const cluster = taskId ?? s.id // 无 taskId 则自成一类
        const startedAt = (s.started_at ?? 0) * 1000
        const endedAt = s.ended_at != null ? s.ended_at * 1000 : null
        const messageCount = s.message_count ?? 0
        const meta: OverviewSessionMeta = {
          sessionId: s.id,
          cluster,
          taskId,
          title,
          profile: (s as any).profile,
          startedAt,
          endedAt,
          messageCount,
          isRunning: s.ended_at == null,
          isEmpty: messageCount <= 1,
        }
        sessionClusterMap.set(s.id, cluster)
        sessionProfileMap.set(s.id, (s as any).profile)
        return meta
      })
      sessions.value = metas

      // 聚合 clusterMeta：每个 cluster 取最早 startedAt、标题（优先 taskId，否则最早会话标题）、profile、会话数
      const cm = new Map<string, { startedAt: number; title: string; profile?: string; sessionCount: number }>()
      for (const m of metas) {
        const existing = cm.get(m.cluster)
        if (!existing) {
          cm.set(m.cluster, {
            startedAt: m.startedAt || Date.now(),
            title: m.taskId ?? m.title,
            profile: m.profile,
            sessionCount: 1,
          })
        } else {
          if (m.startedAt && m.startedAt < existing.startedAt) existing.startedAt = m.startedAt
          if (!existing.profile && m.profile) existing.profile = m.profile
          existing.sessionCount += 1
        }
      }
      clusterMeta.value = cm

      // 逐会话构建 trace 并合并
      let merged: TraceState | null = null
      const others: TraceState[] = []
      for (let i = 0; i < metas.length; i++) {
        const m = metas[i]
        try {
          const s = await buildSessionState(m)
          if (!s) continue
          if (merged == null) {
            merged = s
          } else {
            others.push(s)
          }
        } catch (e) {
          console.warn(`[overview] 会话 ${m.sessionId} trace 构建失败:`, e)
        }
        progress.value = Math.round(((i + 1) / metas.length) * 100)
        // 让出 UI 线程
        await new Promise(r => setTimeout(r, 0))
      }

      if (merged) {
        const final = others.length > 0 ? mergeTraceStates(merged, others) : merged
        // 回填 cluster 与 profile
        const annotated = final.nodes.map(n => {
          const sid = n.ref?.sessionId
          const cluster = sid ? sessionClusterMap.get(sid) ?? n.cluster : n.cluster
          const profile = sid ? sessionProfileMap.get(sid) ?? n.profile : n.profile
          return { ...n, cluster: cluster ?? n.cluster, profile: profile ?? n.profile }
        })
        nodes.value = annotated
        edges.value = final.edges
      }
    } catch (e: any) {
      console.error('[overview] 加载失败:', e)
      error.value = e?.message ?? '加载失败'
    } finally {
      loading.value = false
    }
  }

  return { nodes, edges, sessions, clusterMeta, loading, progress, error, load }
}

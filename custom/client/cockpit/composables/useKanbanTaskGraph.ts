// overlay/custom/client/cockpit/composables/useKanbanTaskGraph.ts
// 以 kanban 任务为主轴构建全局聚合图数据。
// 流程：拉所有 board 全量任务 → BFS 任务树（parents/children）→ 发现关联会话
//       → 按时间窗（活动时间）过滤 → 为关联会话重建 trace 并合并 → 节点注入 [board] taskId 追踪信息。
// 点击某任务 → focusTaskTree 返回该任务全树子集，供页内详细视图渲染。
import { ref } from 'vue'
import * as kanbanApi from '@/api/hermes/kanban'
import type { KanbanTask, KanbanTaskDetail, KanbanRun } from '@/api/hermes/kanban'
import { fetchHermesSessions, fetchSessionMessagesPage, type SessionSummary } from '@/api/studio/sessions'
import {
  applyRunEvent,
  buildCrossSessionEdges,
  createTraceState,
  fetchLayer2Trace,
  mergeLayer2Data,
  mergeTraceStates,
  replayMessagesIntoState,
  type TraceNode,
  type TraceState,
} from '../adapters/run-trace-adapter'
import { matchSessionTaskId, extractKanbanTaskId } from './sessionTaskId'
import type { RunEvent } from '@/api/studio/chat'

export interface TaskMeta {
  taskId: string
  board: string
  title: string
  status: string
  createdAt: number // ms
  startedAt: number | null // ms
  completedAt: number | null // ms
  /** 任务活动时间戳集合（含会话/run），用于时间窗过滤 */
  activityTimes: number[]
  /** 关联会话 id 列表 */
  sessionIds: string[]
}

export interface TimeWindow {
  start: number // ms
  end: number // ms
}

/** 加载选项：控制是否纳入已完成/已归档任务（默认均不纳入） */
export interface LoadOptions {
  win?: TimeWindow | null
  includeDone?: boolean
  includeArchived?: boolean
}

const FALLBACK_PROFILES = ['default', 'orchestrator', 'worker-coder', 'worker-researcher']

/** 秒/毫秒兼容 → 毫秒 */
function toMs(ts: number | null | undefined): number {
  if (ts == null) return 0
  return ts < 1e12 ? ts * 1000 : ts
}

export function useKanbanTaskGraph() {
  const tasks = ref<TaskMeta[]>([])
  const nodes = ref<TraceNode[]>([])
  const edges = ref<TraceState['edges']>([])
  const loading = ref(false)
  const progress = ref(0)
  const error = ref<string | null>(null)
  /** cluster(taskId) → 元信息 */
  const clusterMeta = ref<Map<string, { startedAt: number; title: string; summary?: string; profile?: string; sessionCount: number; board?: string }>>(new Map())

  // 内部缓存
  const taskDetailCache = new Map<string, KanbanTaskDetail>()
  /** 任务 → board 映射（listTasks 结果） */
  let taskBoardMap = new Map<string, string>()
  /** 会话 → taskId/profile 映射 */
  let sessionTaskMap = new Map<string, { taskId: string; profile?: string; role: 'creator' | 'worker' }>()
  /** 全量会话列表 */
  let allSessions: Array<SessionSummary & { profile?: string }> = []
  /** 任务树父子关系（BFS 收集，供 buildCrossSessionEdges 构建跨任务拓扑边） */
  let taskRelations: Array<{ parent: string; child: string }> = []

  /** 跨所有 profile 拉全量会话 */
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

  /** 拉所有 active board 的全量任务（含 archived） */
  async function loadAllTasks(): Promise<Array<KanbanTask & { board: string }>> {
    const boardList = await kanbanApi.listBoards({ includeArchived: false })
    const active = (boardList || []).filter((b: any) => !b.archived)
    const results = await Promise.allSettled(
      active.map((b: any) =>
        kanbanApi.listTasks({ board: b.slug, includeArchived: true }).then(
          ts => ts.map(t => ({ ...t, board: b.slug })),
        ),
      ),
    )
    const all: Array<KanbanTask & { board: string }> = []
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value)
    }
    return all
  }

  /** 取任务 detail（带 board，缓存） */
  async function getDetail(taskId: string): Promise<KanbanTaskDetail | null> {
    const cached = taskDetailCache.get(taskId)
    if (cached) return cached
    const board = taskBoardMap.get(taskId)
    try {
      const detail = await kanbanApi.getTask(taskId, board ? { board } : undefined)
      taskDetailCache.set(taskId, detail)
      return detail
    } catch (e) {
      console.warn(`[taskGraph] getTask ${taskId} 失败:`, e)
      return null
    }
  }

  /** 列表态任务索引（性能轮 2026-10-01：listTasks 响应已含 parents/children/
   *  session_id/status/时间戳——树构建与会话发现免 detail 请求；
   *  detail（runs/latest_summary 精化）只对时间窗入选任务补拉） */
  let listTaskMap = new Map<string, KanbanTask>()

  /** BFS 任务树：从 seedTaskIds 出发，上溯 parents + 下探 children。
   *  返回全树 taskId 集合 + 父子关系列表（供 buildCrossSessionEdges 构建跨任务边）。
   *  性能轮改：关系读列表数据（零 detail 请求——793 任务×秒级 detail≈5 分钟是
   *  首载卡顿主因）；列表外悬空引用跳过并记 debug。 */
  function buildTaskTree(seedTaskIds: string[]): { tree: Set<string>; relations: Array<{ parent: string; child: string }> } {
    const tree = new Set<string>()
    const relations: Array<{ parent: string; child: string }> = []
    const queue = [...seedTaskIds]
    let depth = 0
    while (queue.length > 0 && depth < 30) {
      const batch = queue.splice(0, queue.length)
      for (const id of batch) {
        if (tree.has(id)) continue
        const t = listTaskMap.get(id)
        if (!t) {
          if (depth === 0) tree.add(id) // seed 缺列表数据（异常）仍入树保底
          continue
        }
        tree.add(id)
        for (const p of (t as KanbanTask & { parents?: string[] }).parents ?? []) {
          relations.push({ parent: p, child: id })
          if (!tree.has(p) && listTaskMap.has(p)) queue.push(p)
        }
        for (const c of (t as KanbanTask & { children?: string[] }).children ?? []) {
          relations.push({ parent: id, child: c })
          if (!tree.has(c) && listTaskMap.has(c)) queue.push(c)
        }
      }
      depth++
    }
    return { tree, relations }
  }

  /** 发现关联会话：建立 sessionTaskMap（创建者会话 + worker 会话标题匹配）。
   *  性能轮：session_id 读列表数据（detail 未全量拉取）。 */
  function discoverSessions(treeTaskIds: Set<string>) {
    sessionTaskMap = new Map()
    // 创建者会话：列表项 session_id
    for (const tid of treeTaskIds) {
      const sid = listTaskMap.get(tid)?.session_id ?? undefined
      if (sid) sessionTaskMap.set(sid, { taskId: tid, profile: undefined, role: 'creator' })
    }
    // worker 会话：标题 matchSessionTaskId 命中树内 taskId
    for (const s of allSessions) {
      if (sessionTaskMap.has(s.id)) continue
      const tid = matchSessionTaskId(s.title || '')
      if (tid && treeTaskIds.has(tid)) {
        sessionTaskMap.set(s.id, { taskId: tid, profile: (s as any).profile, role: 'worker' })
      }
    }
  }

  /** 计算任务活动时间戳集合（任务时间 + 会话时间 + runs 时间）。
   *  性能轮：detail 缺席（未入选未补拉）时回落列表数据。 */
  function collectActivityTimes(taskId: string): number[] {
    const times: number[] = []
    const d = taskDetailCache.get(taskId)
    const t = d?.task ?? listTaskMap.get(taskId)
    if (t) {
      times.push(toMs(t.created_at))
      if (t.started_at) times.push(toMs(t.started_at))
      if (t.completed_at) times.push(toMs(t.completed_at))
      for (const r of d?.runs ?? []) {
        times.push(toMs(r.started_at))
        if (r.ended_at) times.push(toMs(r.ended_at))
      }
    }
    for (const [sid, info] of sessionTaskMap) {
      if (info.taskId !== taskId) continue
      const s = allSessions.find(x => x.id === sid)
      if (!s) continue
      times.push(toMs(s.started_at))
      if (s.ended_at) times.push(toMs(s.ended_at))
      if (s.last_active) times.push(toMs(s.last_active))
    }
    return times.filter(Boolean)
  }

  /** 时间窗过滤：任务有任何活动落在窗口内则纳入 */
  function taskInWindow(taskId: string, win: TimeWindow | null): boolean {
    if (!win) return true
    const times = collectActivityTimes(taskId)
    return times.some(t => t >= win.start && t <= win.end)
  }

  /** 为单个会话构建 trace state。
   *  除消息回放外，额外从 profile 推导 agent 节点、从 tool 聚合 skill 节点，
   *  确保 agent/skill 层级有值（L2 数据优先合并）。 */
  async function buildSessionState(sid: string, startedAt: number, isEmpty: boolean, profile?: string): Promise<TraceState | null> {
    let s = createTraceState(sid, new Set([sid]))
    const startedEvent: RunEvent = {
      event: 'run.started',
      session_id: sid,
      run_id: `replay-${sid}`,
      timestamp: startedAt || Date.now(),
    } as any
    s = applyRunEvent(s, startedEvent)

    if (isEmpty) {
      const runNodeId = `run:${sid}:replay-${sid}`
      s = { ...s, nodes: s.nodes.map(n => (n.id === runNodeId ? { ...n, status: 'cancelled' as const } : n)) }
    } else {
      try {
        const page = await fetchSessionMessagesPage(sid, 0, 500, profile)
        if (page && page.messages && page.messages.length > 0) {
          s = replayMessagesIntoState(s, page.messages, sid)
        }
      } catch (e) {
        console.warn(`[taskGraph] 会话 ${sid} 消息拉取失败:`, e)
      }
      try {
        const l2 = await fetchLayer2Trace(sid, profile)
        if (l2) s = mergeLayer2Data(s, l2)
      } catch { /* L2 不可用 */ }
    }

    // 补充 agent 节点（profile 推导）：每个关联会话生成一个 agent 节点连到 run。
    // 若 L2 已提供 agent 节点则跳过。
    const runNodeId = `run:${sid}:replay-${sid}`
    const runNode = s.nodes.find(n => n.id === runNodeId)
    const hasAgent = s.nodes.some(n => n.kind === 'agent' && n.ref?.sessionId === sid)
    if (!hasAgent && profile) {
      const agentId = `agent:${sid}:${profile}`
      const agentNode: TraceNode = {
        id: agentId,
        kind: 'agent',
        label: profile,
        detail: 'agent',
        status: runNode?.status ?? 'ok',
        // 时间取自该会话 run 节点（准确反映 run 的开始/结束）
        startedAt: runNode?.startedAt ?? startedAt,
        endedAt: runNode?.endedAt,
        durationMs: runNode?.durationMs,
        evidence: 'L1',
        children: [],
        ref: { sessionId: sid, runId: `replay-${sid}` },
        profile,
      }
      s = {
        ...s,
        nodes: [...s.nodes, agentNode],
        edges: [...s.edges, { id: `edge:${runNodeId}->${agentId}:call`, from: runNodeId, to: agentId, kind: 'call', evidence: 'L1' }],
      }
    }

    // 补充 skill 节点：若该会话有 tool 节点但无 skill 节点，聚合为一个 skill 节点，
    // 并把该会话所有 tool 的入边重定向到该 skill（折叠 skill 即可隐藏其下 tool）。
    const hasSkill = s.nodes.some(n => n.kind === 'skill' && n.ref?.sessionId === sid)
    const toolNodes = s.nodes.filter(n => n.kind === 'tool' && n.ref?.sessionId === sid)
    if (!hasSkill && toolNodes.length > 0) {
      const skillLabel = toolNodes[0].label || '技能执行'
      const skillId = `skill:${sid}:${skillLabel}:${Date.now()}`
      const parentId = s.nodes.find(n => n.kind === 'agent' && n.ref?.sessionId === sid)?.id ?? runNodeId
      const skillNode: TraceNode = {
        id: skillId,
        kind: 'skill',
        label: skillLabel,
        detail: `${toolNodes.length} 个工具调用`,
        status: 'ok',
        startedAt: toolNodes[0].startedAt,
        endedAt: toolNodes[toolNodes.length - 1].endedAt,
        evidence: 'L1',
        children: [],
        ref: { sessionId: sid, runId: `replay-${sid}` },
        profile,
      }
      // 重定向 tool 入边：移除原父→tool 边，改为 skill→tool
      const toolIds = new Set(toolNodes.map(t => t.id))
      const keptEdges = s.edges.filter(e => !(toolIds.has(e.to) && e.from !== skillId))
      const newEdges = toolNodes.map(t => ({
        id: `edge:${skillId}->${t.id}:call`,
        from: skillId,
        to: t.id,
        kind: 'call' as const,
        evidence: 'L1' as const,
      }))
      s = {
        ...s,
        nodes: [...s.nodes, skillNode],
        edges: [...keptEdges, { id: `edge:${parentId}->${skillId}:call`, from: parentId, to: skillId, kind: 'call', evidence: 'L1' }, ...newEdges],
      }
    }

    return s
  }

  /**
   * 加载并构建聚合数据。
   * @param win 时间窗（按活动时间过滤）；null=全量
   */
  async function load(opts: LoadOptions | TimeWindow | null = null) {
    // 兼容旧签名 load(win)
    const win: TimeWindow | null = opts && 'win' in opts ? opts.win : (opts as TimeWindow | null)
    const includeDone = opts && 'includeDone' in opts ? !!opts.includeDone : true
    const includeArchived = opts && 'includeArchived' in opts ? !!opts.includeArchived : true
    loading.value = true
    progress.value = 0
    error.value = null
    tasks.value = []
    nodes.value = []
    edges.value = []
    clusterMeta.value = new Map()

    try {
      // 1. 拉全量任务
      const allTasks = await loadAllTasks()
      taskBoardMap = new Map(allTasks.map(t => [t.id, t.board]))
      listTaskMap = new Map(allTasks.map(t => [t.id, t]))
      console.debug(`[taskGraph] 加载到 ${allTasks.length} 个任务`)

      // 2. 全树 BFS（列表数据构建关系，零 detail 请求——性能轮根治 793×秒级首载）
      const { tree, relations } = buildTaskTree(allTasks.map(t => t.id))
      taskRelations = relations
      progress.value = 20

      // 3. 拉全量会话 + 发现关联
      allSessions = await loadAllSessions()
      discoverSessions(tree)
      progress.value = 40

      // 4. 时间窗过滤 + 状态过滤（默认排除 done/archived）——粗判用列表数据，
      //    runs/摘要仅 detail 有：入选集先粗判，再对入选集并发补拉 detail
      //    （量级=窗内任务数而非全库），拉完用 runs 时间复核补录边缘任务
      const statusOf = (id: string) => listTaskMap.get(id)?.status
      const included = new Set([...tree].filter(id => {
        if (!taskInWindow(id, win)) return false
        const st = statusOf(id)
        if (st === 'done' && !includeDone) return false
        if (st === 'archived' && !includeArchived) return false
        return true
      }))
      await Promise.all([...included].map(id => getDetail(id)))
      // 边缘复核（限量并发）：running 态任务的列表时间戳可能在窗外但今天的 run 在窗内
      // ——只复核 running（在跑才可能有新 run；done/todo 无近期 run 可言），
      // 并发拉取避免串行秒级×N 回潮（性能轮教训：793×2s 串行=26 分钟）
      const recheck = [...tree].filter(id =>
        !included.has(id) && !taskDetailCache.has(id) && statusOf(id) === 'running')
      for (let i = 0; i < recheck.length; i += 30) {
        await Promise.all(recheck.slice(i, i + 30).map(id => getDetail(id)))
      }
      for (const id of recheck) {
        const d = taskDetailCache.get(id)
        if (d && (d.runs ?? []).some(r => {
          const s0 = toMs(r.started_at); const s1 = r.ended_at ? toMs(r.ended_at) : s0
          return win ? (s0 >= win.start && s0 <= win.end) || (s1 >= win.start && s1 <= win.end) : true
        })) included.add(id)
      }
      console.debug(`[taskGraph] 树内 ${tree.size} 任务，过滤后 ${included.size}（done=${includeDone}, archived=${includeArchived}，复核 running ${recheck.length}）`)

      // 5. 构建 tasks 元信息
      const metas: TaskMeta[] = [...included].map(id => {
        const d = taskDetailCache.get(id)
        const t = d?.task ?? listTaskMap.get(id)
        const board = taskBoardMap.get(id) ?? 'default'
        const sessionIds = [...sessionTaskMap].filter(([, info]) => info.taskId === id).map(([sid]) => sid)
        return {
          taskId: id,
          board,
          title: t?.title ?? id,
          status: t?.status ?? '',
          createdAt: toMs(t?.created_at),
          startedAt: t?.started_at ? toMs(t.started_at) : null,
          completedAt: t?.completed_at ? toMs(t.completed_at) : null,
          activityTimes: collectActivityTimes(id),
          sessionIds,
        }
      })
      tasks.value = metas

      // 6. 构建 trace（性能轮：并发分批——原串行×每会话秒级（消息分页+L2）是
      //    首载第二瓶颈；traceStates 收集序与 merge 无序依赖，语义不变）
      const traceStates: TraceState[] = []
      const sessionSet = new Set<string>()
      for (const m of metas) sessionSet.add(...m.sessionIds)

      const sessionIds = [...sessionSet].filter(sid => sessionTaskMap.has(sid))
      const BATCH = 10
      let i = 0
      for (let b = 0; b < sessionIds.length; b += BATCH) {
        const results = await Promise.allSettled(
          sessionIds.slice(b, b + BATCH).map(sid => {
            const info = sessionTaskMap.get(sid)!
            const s = allSessions.find(x => x.id === sid)
            const startedAt = s ? toMs(s.started_at) : Date.now()
            const isEmpty = (s?.message_count ?? 0) <= 1
            return buildSessionState(sid, startedAt, isEmpty, info.profile ?? (s as any)?.profile)
          }),
        )
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) traceStates.push(r.value)
          else if (r.status === 'rejected') console.warn('[taskGraph] 会话 trace 构建失败:', r.reason)
        }
        i = Math.min(b + BATCH, sessionIds.length)
        progress.value = 40 + Math.round((i / Math.max(1, sessionIds.length)) * 55)
      }

      // 7. 合并 + 回填 cluster/profile + 注入 title/摘要 + 构建跨任务拓扑边
      if (traceStates.length > 0) {
        const merged = traceStates.length > 1
          ? mergeTraceStates(traceStates[0], traceStates.slice(1))
          : traceStates[0]
        const annotated = merged.nodes.map(n => {
          const sid = n.ref?.sessionId
          const info = sid ? sessionTaskMap.get(sid) : undefined
          const taskId = info?.taskId ?? n.cluster
          const board = taskId ? taskBoardMap.get(taskId) : undefined
          const profile = sid ? (info?.profile ?? allSessions.find(x => x.id === sid)?.profile as string | undefined) : n.profile
          // 给 ingress/run 节点注入任务标题 + [board] taskId 追踪信息
          let label = n.label
          let detail = n.detail
          if (taskId && (n.kind === 'ingress' || n.kind === 'workflow')) {
            const t = taskDetailCache.get(taskId)
            const tag = board ? `[${board}] ${taskId}` : taskId
            const title = t?.task?.title ?? listTaskMap.get(taskId)?.title
            const summary = t?.latest_summary
            const taskStatus = t?.task?.status // kanban 任务状态（running/done/blocked…）
            // label 显示任务标题 + taskId 追踪信息（状态用独立徽标显示，避免长文本被截断）
            label = title ? `${title} · ${tag}` : (label?.includes(taskId) ? label : `${label} · ${tag}`)
            // detail: 摘要 + tag（确保 taskId 可检索）
            const parts: string[] = []
            if (summary) parts.push(summary)
            parts.push(tag)
            detail = parts.join(' · ')
            return { ...n, cluster: taskId ?? n.cluster, profile: profile ?? n.profile, label, detail, taskStatus, taskBoard: board }
          }
          const tBoard = taskId ? (taskBoardMap.get(taskId) ?? undefined) : undefined
          return { ...n, cluster: taskId ?? n.cluster, profile: profile ?? n.profile, label, detail, taskBoard: tBoard }
        })
        // 构建跨任务 delegate/spawn 边（基于 taskRelations + sessionTaskMap）
        const crossEdges = buildCrossSessionEdges(
          { ...merged, nodes: annotated },
          taskRelations,
          new Map([...sessionTaskMap].map(([sid, info]) => [sid, { taskId: info.taskId, role: info.role }])),
        )
        const existingEdgeIds = new Set(merged.edges.map(e => e.id))
        const newEdges = crossEdges.filter(e => !existingEdgeIds.has(e.id))
        nodes.value = annotated
        edges.value = [...merged.edges, ...newEdges]
        console.debug(`[taskGraph] 节点 ${annotated.length}，边 ${edges.value.length}（跨任务 ${newEdges.length}）`)
      }

      // 8. clusterMeta（含 title/summary）
      const cm = new Map<string, { startedAt: number; title: string; summary?: string; profile?: string; sessionCount: number; board?: string }>()
      for (const m of metas) {
        const d = taskDetailCache.get(m.taskId)
        const start = m.activityTimes.length > 0 ? Math.min(...m.activityTimes) : m.createdAt
        cm.set(m.taskId, {
          startedAt: start || Date.now(),
          title: m.title,
          summary: d?.latest_summary ?? undefined,
          profile: sessionTaskMap.get(m.sessionIds[0])?.profile,
          sessionCount: m.sessionIds.length,
          board: m.board,
        })
      }
      clusterMeta.value = cm
      progress.value = 100
    } catch (e: any) {
      console.error('[taskGraph] 加载失败:', e)
      error.value = e?.message ?? '加载失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 聚焦某任务的全树：返回该任务全树子集的 nodes/edges/任务列表/clusterMeta。
   * 供页内详细视图渲染。
   */
  async function focusTaskTree(taskId: string): Promise<{
    nodes: TraceNode[]
    edges: TraceState['edges']
    tasks: TaskMeta[]
    clusterMeta: Map<string, { startedAt: number; title: string; summary?: string; profile?: string; sessionCount: number; board?: string }>
  } | null> {
    const { tree } = buildTaskTree([taskId])
    const treeSet = tree
    const subNodes = nodes.value.filter(n => {
      const sid = n.ref?.sessionId
      const info = sid ? sessionTaskMap.get(sid) : undefined
      const tid = info?.taskId ?? n.cluster
      return tid && treeSet.has(tid)
    })
    const subEdges = edges.value.filter(e => {
      const from = subNodes.find(n => n.id === e.from)
      const to = subNodes.find(n => n.id === e.to)
      return from && to
    })
    const subTasks = tasks.value.filter(t => treeSet.has(t.taskId))
    const cm = new Map<string, { startedAt: number; title: string; summary?: string; profile?: string; sessionCount: number; board?: string }>()
    for (const t of subTasks) {
      const d = taskDetailCache.get(t.taskId)
      const start = t.activityTimes.length > 0 ? Math.min(...t.activityTimes) : t.createdAt
      cm.set(t.taskId, {
        startedAt: start || Date.now(),
        title: t.title,
        summary: d?.latest_summary ?? undefined,
        profile: sessionTaskMap.get(t.sessionIds[0])?.profile,
        sessionCount: t.sessionIds.length,
        board: t.board,
      })
    }
    return { nodes: subNodes, edges: subEdges, tasks: subTasks, clusterMeta: cm }
  }

  return {
    tasks, nodes, edges, clusterMeta, loading, progress, error,
    load, focusTaskTree,
  }
}

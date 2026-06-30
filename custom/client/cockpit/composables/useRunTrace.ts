import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { connectChatRun, resumeSession, type RunEvent, type ResumeSessionPayload } from '@/api/hermes/chat'
import { fetchSessionMessagesPage, fetchHermesSessions, type SessionSummary } from '@/api/hermes/sessions'
import * as kanbanApi from '@/api/hermes/kanban'
import {
  applyRunEvent,
  buildCrossSessionEdges,
  createTraceState,
  fetchLayer2Trace,
  mergeLayer2Data,
  type TraceState,
} from '../adapters/run-trace-adapter'

/** 关联会话信息（供 UI 展示） */
export type RelatedSessionRole = 'primary' | 'worker' | 'creator'

export interface RelatedSessionInfo {
  sessionId: string
  taskId: string | null
  title: string
  profile?: string
  isPrimary: boolean
  ended: boolean
  /** 会话在聚合视图中的角色：primary 主会话 / worker 任务执行会话 / creator 任务创建者会话 */
  role: RelatedSessionRole
  /** 空壳会话（仅含 work kanban task 提示，无实际 tool/reasoning 事件） */
  isEmpty: boolean
}

/**
 * 从会话标题提取 kanban 任务 ID（支持多种格式，含宽泛 fallback）。
 * 仅用于 UI 显示等容忍误匹配的场景；聚合匹配请用 matchSessionTaskId。
 */
export function extractKanbanTaskId(title: string): string | null {
  // 格式 1: "work kanban task t_xxx" (原有格式)
  let m = title.match(/work kanban task (t_\w+)/i)
  if (m) return m[1]
  // 格式 2: "task t_xxx" 或 "Task: t_xxx"
  m = title.match(/(?:^|\s)task[:\s]+(t_\w+)/i)
  if (m) return m[1]
  // 格式 3: 直接包含 "t_xxx" (任务 ID 在标题任意位置) —— 低置信度，仅 fallback
  m = title.match(/(t_[a-zA-Z0-9_]+)/i)
  if (m) return m[1]
  return null
}

/**
 * 精确匹配 worker 会话标题 → 任务 ID。
 * 仅匹配标题 === "work kanban task <task_id>"（trim + 大小写不敏感）。
 * 置信度 100%：_default_spawn 用 f"work kanban task {task.id}" 固定生成标题。
 */
export function matchSessionTaskId(title: string): string | null {
  if (!title) return null
  const m = title.trim().match(/^work kanban task (t_\w+)$/i)
  return m ? m[1] : null
}

type SocketLike = ReturnType<typeof connectChatRun>
type EventHandler = (event: RunEvent) => void
type TraceMode = 'live' | 'replay'

const TRACE_EVENTS = [
  'message.delta',
  'reasoning.delta',
  'thinking.delta',
  'reasoning.available',
  'tool.started',
  'tool.completed',
  'subagent.start',
  'subagent.tool',
  'subagent.progress',
  'subagent.complete',
  'run.started',
  'run.completed',
  'run.failed',
  'usage.updated',
] as const

function removeSocketListener(socket: SocketLike, event: string, handler: EventHandler): void {
  const candidate = socket as SocketLike & {
    off?: (event: string, handler: EventHandler) => SocketLike
    removeListener?: (event: string, handler: EventHandler) => SocketLike
  }
  if (typeof candidate.off === 'function') {
    candidate.off(event, handler)
    return
  }
  candidate.removeListener?.(event, handler)
}

export function useRunTrace(sessionId: Ref<string | null>) {
  const state = ref<TraceState | null>(sessionId.value ? createTraceState(sessionId.value) : null)
  const nodes = ref<TraceState['nodes']>(state.value?.nodes ?? [])
  const edges = ref<TraceState['edges']>(state.value?.edges ?? [])
  const focusedNodeId = ref<string | null>(state.value?.focusedNodeId ?? null)
  const l2Available = ref(false)  // Whether L2 trace data was fetched successfully

  // Live/Replay mode state
  const mode = ref<TraceMode>('live')
  const scrubberTime = ref<number>(Date.now()) // scrubber 当前时间点 (ms)
  const replayProgress = ref<number>(0) // 回放进度 0-100%
  const sessionStartedAt = ref<number>(0) // session 开始时间，用于时间轴范围

  // 关联会话聚合：跨任务树的会话合并到同一 trace 视图
  const relatedSessionIds = ref<Set<string>>(new Set())
  const relatedSessions = ref<RelatedSessionInfo[]>([])
  /** 聚合模式开关（默认开启；关闭时仅加载当前会话） */
  const aggregateMode = ref(true)
  /** 外部注入的会话列表（由 modal 提供，用于关联会话发现） */
  let allSessionsRef: Ref<Array<SessionSummary & { profile?: string }>> | null = null

  // 任务树关系（匹配A，100%确定）与 会话↔任务映射（匹配B+C，100%确定）。
  // loadRelatedSessions 填充，loadRelatedTraces 据此构建跨会话 delegate/spawn 边（匹配E）。
  let taskRelations: Array<{ parent: string; child: string }> = []
  let sessionTaskMap: Map<string, { taskId: string; role: RelatedSessionRole }> = new Map()

  let cleanup: (() => void) | null = null
  let replayAbort: (() => void) | null = null

  function sync(next: TraceState | null) {
    state.value = next
    nodes.value = next?.nodes ?? []
    edges.value = next?.edges ?? []
    focusedNodeId.value = next?.focusedNodeId ?? null
  }

  function route(event: RunEvent) {
    const sid = sessionId.value
    if (!sid || !state.value) return
    // 原硬过滤：event.session_id !== sid → 丢弃
    // 新：如果聚合模式开启且事件来自关联会话，也放行
    const isPrimary = event.session_id === sid
    const isRelated = aggregateMode.value && event.session_id && relatedSessionIds.value.has(event.session_id)
    if (!isPrimary && !isRelated) return
    // 保持 state.relatedSessionIds 与 ref 同步：ref 可能在 loadRelatedSessions 完成后被更新，
    // 而 state 可能在更早的 createTraceState 时持有旧 Set 引用。同步后 applyRunEvent 的会话过滤
    // 才能基于最新关联会话集合判断，避免误过滤已放行的关联会话事件。
    const current = state.value
    if (current.relatedSessionIds !== relatedSessionIds.value) {
      state.value = { ...current, relatedSessionIds: relatedSessionIds.value }
    }
    const next = applyRunEvent(state.value, event)
    sync(next)
    // Update scrubber time to latest event timestamp
    const eventTs = event.timestamp ?? Date.now()
    if (eventTs > scrubberTime.value) scrubberTime.value = eventTs
    // When run completes, try to fetch L2 data
    if ((event.event === 'run.completed' || event.event === 'run.failed') && event.session_id) {
      fetchL2Data(event.session_id)
    }
  }

  /** Fetch Layer 2 trace data from backend API and merge into current state */
  async function fetchL2Data(sid: string, profile?: string | null) {
    const l2Data = await fetchLayer2Trace(sid, profile)
    if (!l2Data || !state.value) return
    const merged = mergeLayer2Data(state.value, l2Data)
    sync(merged)
    l2Available.value = true
    // Update session startedAt from L2 meta if available
    if (l2Data.meta?.started_at) sessionStartedAt.value = l2Data.meta.started_at * 1000
  }

  function detach() {
    cleanup?.()
    cleanup = null
    replayAbort?.()
    replayAbort = null
  }

  /**
   * 注入外部会话列表引用（由 CockpitRunTraceModal 提供）。
   * loadRelatedSessions 从中查找关联会话。
   */
  function setAllSessionsRef(ref: Ref<Array<SessionSummary & { profile?: string }>>) {
    allSessionsRef = ref
  }

  /**
   * 跨所有 profile 加载全量会话列表（orchestrator + workers）。
   * 与 CockpitRunTraceModal 的选择器加载逻辑一致，确保即使从 openRunTraceGlobal
   * 单 session 直进（跳过选择模式）时，loadRelatedSessions 也能拿到全量会话。
   * 结果回填到 allSessionsRef（若存在），供 modal 选择器复用，避免重复请求。
   */
  async function ensureAllSessions(): Promise<Array<SessionSummary & { profile?: string }>> {
    // 1. 优先复用 modal 已加载的 allSessions
    if (allSessionsRef && allSessionsRef.value && allSessionsRef.value.length > 0) {
      return allSessionsRef.value
    }

    // 2. 自加载：跨 profile 查询。
    // profile 列表来源优先级：allSessionsRef 中已出现的 profile > 硬编码 fallback。
    // 不动态导入 profilesStore（会触发 router/client 模块链，在测试与 SSR 环境不稳定）；
    // fallback 覆盖实际部署的 profile，modal 选择器也是同样的 fallback 逻辑。
    let profileNames: string[] = []
    if (allSessionsRef && allSessionsRef.value && allSessionsRef.value.length > 0) {
      const set = new Set<string>()
      for (const s of allSessionsRef.value) { if (s.profile) set.add(s.profile) }
      profileNames = [...set]
    }
    if (profileNames.length === 0) {
      profileNames = ['default', 'orchestrator', 'worker-coder', 'worker-researcher']
    }

    const results = await Promise.allSettled(
      profileNames.map((name: string) =>
        fetchHermesSessions(undefined, 500, name).then(sessions =>
          sessions.map(s => ({ ...s, profile: name }))
        )
      )
    )
    const merged: Array<SessionSummary & { profile?: string }> = []
    for (const result of results) {
      if (result.status === 'fulfilled') merged.push(...result.value)
    }
    console.debug(`[loadRelatedSessions] ensureAllSessions: loaded ${merged.length} sessions across ${profileNames.length} profiles`)

    // 3. 回填到 allSessionsRef（供 modal 复用）
    if (allSessionsRef) {
      allSessionsRef.value = merged
    }
    return merged
  }

  /**
   * 发现关联会话：
   * 方法 1: 通过 parent_session_id 发现子会话（orchestrator → workers）
   * 方法 2: 从主会话标题提取 taskId，通过 kanbanApi.getTask 获取任务的 parents/children
   * 方法 3: 在 allSessions 中匹配标题含这些 taskId 的会话
   * 构建 relatedSessionIds 和 relatedSessions
   *
   * 返回关联会话 ID 列表（不含主会话），供 attachLive/startReplay 聚合加载。
   */
  async function loadRelatedSessions(primarySid: string): Promise<string[]> {
    relatedSessionIds.value = new Set([primarySid])
    relatedSessions.value = []

    if (!aggregateMode.value) {
      return []
    }

    // 确保有全量会话列表（allSessionsRef 为空时自加载，修复单 session 直进时聚合失效）
    let allSessions: Array<SessionSummary & { profile?: string }> = []
    try {
      allSessions = await ensureAllSessions()
    } catch (e) {
      console.warn('[loadRelatedSessions] ensureAllSessions failed:', e)
      return []
    }
    if (allSessions.length === 0) return []

    // 从主会话标题提取 taskId
    const primarySession = allSessions.find(s => s.id === primarySid)
    if (!primarySession) return []

    // 方法 1: 通过 parent_session_id 发现子会话
    const childSessionsByParent = allSessions.filter(s => (s as any).parent_session_id === primarySid)

    // 同时检查主会话是否是子会话（有 parent_session_id），发现其父会话和兄弟会话
    const primaryParentId = (primarySession as any).parent_session_id
    const siblingSessions: typeof allSessions = []
    let parentSession: typeof allSessions[0] | undefined
    if (primaryParentId) {
      parentSession = allSessions.find(s => s.id === primaryParentId)
      if (parentSession) {
        siblingSessions.push(...allSessions.filter(s => (s as any).parent_session_id === primaryParentId && s.id !== primarySid))
      }
    }

    // 方法 2 & 3: 通过 kanban 任务树发现关联会话
    // 主会话标题 → taskId：优先用精确匹配 matchSessionTaskId（100%确定），
    // fallback 用 extractKanbanTaskId（含低置信度格式3）。
    const primaryTaskId = matchSessionTaskId(primarySession.title || '')
      ?? extractKanbanTaskId(primarySession.title || '')
    const taskIds = new Set<string>(primaryTaskId ? [primaryTaskId] : [])
    // 重置任务树关系与 会话↔任务映射（供 loadRelatedTraces 构建跨会话边）
    taskRelations = []
    sessionTaskMap = new Map()

    if (primaryTaskId) {
      // 解析 board：通过 cockpit store 的 boardSlugOf 查询（100%确定）。
      // 任务可能在 kanban001 等非默认 board，getTask 必须传 board 否则 500。
      let boardResolver: ((id: string) => string | undefined) | null = null
      try {
        const { useCockpitStore } = await import('../store/cockpit')
        const cockpitStore = (useCockpitStore as any)() as { boardSlugOf?: (id: string) => string | undefined }
        if (typeof cockpitStore.boardSlugOf === 'function') boardResolver = cockpitStore.boardSlugOf.bind(cockpitStore)
      } catch { /* cockpit store 未初始化 */ }

      try {
        // BFS 遍历任务树：上溯 parents + 下探 children，visited 防环，深度限制 20。
        const queue = [primaryTaskId]
        const visited = new Set<string>()
        while (queue.length > 0) {
          const tid = queue.shift()!
          if (visited.has(tid)) continue
          visited.add(tid)
          if (visited.size > 20) break  // 防止无限遍历
          try {
            // 传 board 参数：优先用 boardResolver 解析，否则 undefined（fallback 默认 board）
            const board = boardResolver ? boardResolver(tid) : undefined
            const detail = await kanbanApi.getTask(tid, board ? { board } : undefined)
            console.debug(`[loadRelatedSessions] kanban task ${tid} (board=${board || 'default'}): parents=${detail.parents?.length || 0}, children=${detail.children?.length || 0}`)
            // 匹配A（100%确定）：记录任务树父子关系
            if (detail.parents) for (const p of detail.parents) {
              taskIds.add(p); queue.push(p)
              taskRelations.push({ parent: p, child: tid })
            }
            if (detail.children) for (const c of detail.children) {
              taskIds.add(c); queue.push(c)
              taskRelations.push({ parent: tid, child: c })
            }
            // 匹配B（100%确定）：task.session_id 是创建该任务的 agent 会话
            const creatorSid = detail.task?.session_id
            if (creatorSid && creatorSid !== primarySid) {
              relatedSessionIds.value.add(creatorSid)
              sessionTaskMap.set(creatorSid, { taskId: tid, role: 'creator' })
            }
          } catch (e) { console.warn(`[loadRelatedSessions] kanban task ${tid} fetch failed:`, e) }
        }
      } catch (e) { console.warn('[loadRelatedSessions] kanban API unavailable:', e) }
    } else {
      console.debug(`[loadRelatedSessions] 主会话标题 "${primarySession.title}" 未匹配任务 ID 格式`)
    }

    // 在 allSessions 中匹配标题含这些 taskId 的会话
    const matchedSessions: RelatedSessionInfo[] = []
    const addedSessionIds = new Set<string>([primarySid])

    // 主会话信息（先加入）
    matchedSessions.push({
      sessionId: primarySid,
      taskId: primaryTaskId,
      title: primarySession.title || '',
      profile: (primarySession as any).profile,
      isPrimary: true,
      ended: !!primarySession.ended_at,
      role: 'primary',
      isEmpty: (primarySession.message_count ?? 0) <= 1,
    })
    if (primaryTaskId) sessionTaskMap.set(primarySid, { taskId: primaryTaskId, role: primarySession.title && matchSessionTaskId(primarySession.title) ? 'worker' : 'primary' })

    for (const s of allSessions) {
      if (addedSessionIds.has(s.id)) continue

      const title = s.title || ''
      // 匹配C（100%确定）：精确匹配 "work kanban task <task_id>"
      const sTaskId = matchSessionTaskId(title)
      const matchedByKanban = sTaskId && taskIds.has(sTaskId)
      // 匹配B（100%确定）：会话是某任务的创建者会话（sessionTaskMap 已记录）
      const isCreator = sessionTaskMap.has(s.id) && sessionTaskMap.get(s.id)!.role === 'creator'
      // 旧 fallback：parent_session_id（架构性为空，保留兼容）
      const isChild = (s as any).parent_session_id === primarySid
      const isParent = primaryParentId && s.id === primaryParentId
      const isSibling = primaryParentId && (s as any).parent_session_id === primaryParentId

      if (matchedByKanban || isCreator || isChild || isParent || isSibling) {
        relatedSessionIds.value.add(s.id)
        addedSessionIds.add(s.id)
        const role: RelatedSessionRole = isCreator ? 'creator' : 'worker'
        const isEmpty = (s.message_count ?? 0) <= 1
        matchedSessions.push({
          sessionId: s.id,
          taskId: sTaskId ?? (isCreator ? sessionTaskMap.get(s.id)?.taskId ?? null : null),
          title: title,
          profile: (s as any).profile,
          isPrimary: false,
          ended: !!s.ended_at,
          role,
          isEmpty,
        })
        if (sTaskId) sessionTaskMap.set(s.id, { taskId: sTaskId, role })
      }
    }

    relatedSessions.value = matchedSessions

    console.debug(`[loadRelatedSessions] 发现 ${matchedSessions.length - 1} 个关联会话: taskTree=${taskIds.size}任务, relations=${taskRelations.length}条, creators=${[...sessionTaskMap.values()].filter(v => v.role === 'creator').length}个`)

    return matchedSessions.filter(s => !s.isPrimary).map(s => s.sessionId)
  }

  /**
   * 聚合加载关联会话的 trace 数据。
   * 复用主会话的 processMessages 重建逻辑，确保 skill/subagent 等结构与主会话一致。
   * 关联会话事件 session_id=rsid 在 relatedSessionIds 中，会被 applyRunEvent 放行，
   * 并经 effectiveSid 用各自 sessionId 生成节点 ID，避免与主会话节点碰撞。
   */
  async function loadRelatedTraces(relatedSids: string[]) {
    if (relatedSids.length === 0 || !state.value) return

    for (const rsid of relatedSids) {
      try {
        // 从 relatedSessions 获取该会话的 profile 与空壳标记
        const sessionInfo = relatedSessions.value.find(s => s.sessionId === rsid)
        const profile = sessionInfo?.profile
        const isEmpty = sessionInfo?.isEmpty ?? false
        const page = await fetchSessionMessagesPage(rsid, 0, 500, profile)
        if (!page || !page.messages || page.messages.length === 0) continue

        // 先发 run.started 建立该关联会话的 run 节点（rsid 在 relatedSessionIds 中，会被放行）
        const startedEvent: RunEvent = {
          event: 'run.started',
          session_id: rsid,
          run_id: `replay-${rsid}`,
          timestamp: page.messages[0]?.timestamp ? page.messages[0].timestamp * 1000 : Date.now(),
        } as any
        sync(applyRunEvent(state.value!, startedEvent))

        // 空壳会话（仅含 work kanban task 提示，无 tool/reasoning）：跳过 processMessages，
        // 仅保留 ingress+run 节点（保持图完整性，便于构建跨会话边）。run 节点标 cancelled 视觉降级。
        if (!isEmpty) {
          // 复用 processMessages 重建该关联会话的 trace（与主会话重建逻辑一致）
          await processMessages(page.messages, rsid)
          // 尝试获取 L2 数据并合并到主 state
          const l2 = await fetchLayer2Trace(rsid, profile)
          if (l2 && state.value) {
            sync(mergeLayer2Data(state.value, l2))
          }
        } else if (state.value) {
          // 空壳会话：将 run 节点状态降级为 cancelled（复用现有视觉淡化）
          const runNodeId = `run:${rsid}:replay-${rsid}`
          const updatedNodes = state.value.nodes.map(n =>
            n.id === runNodeId ? { ...n, status: 'cancelled' as const } : n,
          )
          sync({ ...state.value, nodes: updatedNodes })
        }
      } catch (e) {
        console.warn(`[loadRelatedTraces] 关联会话 ${rsid} 加载失败:`, e)
      }
    }

    // 匹配E（高置信度）：基于任务树父子关系构建跨会话 delegate/spawn 边。
    // 在所有会话 trace 聚合完成后构建，确保两端节点已存在。
    if (state.value && (taskRelations.length > 0 || sessionTaskMap.size > 0)) {
      const crossEdges = buildCrossSessionEdges(state.value, taskRelations, sessionTaskMap)
      if (crossEdges.length > 0 && state.value) {
        const existingIds = new Set(state.value.edges.map(e => e.id))
        const newEdges = crossEdges.filter(e => !existingIds.has(e.id))
        if (newEdges.length > 0) {
          sync({ ...state.value, edges: [...state.value.edges, ...newEdges] })
        }
      }
      console.debug(`[loadRelatedTraces] 跨会话边构建: ${crossEdges.length} 条 (delegate+spawn)`)
    }

    // 后处理：为每个节点标注 cluster（所属任务 taskId）与 profile（agent）。
    // 通过 node.ref.sessionId 反查 sessionTaskMap 得 taskId；profile 从 relatedSessions 取。
    // 力导向图谱按 cluster 聚类，节点按 profile 着色。
    if (state.value && state.value.nodes.length > 0) {
      const sessionProfileMap = new Map<string, string | undefined>()
      for (const rs of relatedSessions.value) {
        if (rs.profile) sessionProfileMap.set(rs.sessionId, rs.profile)
      }
      let changed = false
      const annotatedNodes = state.value.nodes.map(n => {
        const sid = n.ref?.sessionId
        const taskId = sid ? sessionTaskMap.get(sid)?.taskId : undefined
        const profile = sid ? sessionProfileMap.get(sid) : undefined
        if ((taskId && n.cluster !== taskId) || (profile && n.profile !== profile)) {
          changed = true
          return { ...n, cluster: taskId ?? n.cluster, profile: profile ?? n.profile }
        }
        return n
      })
      if (changed) sync({ ...state.value, nodes: annotatedNodes })
    }
  }

  /** Live mode: attach to real-time socket. If session is ended, fallback to replay. */
  async function attachLive(sid: string) {
    mode.value = 'live'
    scrubberTime.value = Date.now()
    replayProgress.value = 0
    // 先发现关联会话，再用 relatedSessionIds 创建 trace state
    const relatedSids = await loadRelatedSessions(sid)
    const primaryProfile = relatedSessions.value.find(s => s.isPrimary)?.profile
    sync(createTraceState(sid, relatedSessionIds.value))
    const socket = connectChatRun()
    const handlers = TRACE_EVENTS.map((eventName) => {
      const handler: EventHandler = (event) => route({ ...event, event: event.event || eventName })
      socket.on(eventName, handler)
      return { eventName, handler }
    })
    cleanup = () => {
      handlers.forEach(({ eventName, handler }) => removeSocketListener(socket, eventName, handler))
    }
    // Try to fetch L2 data + historical messages for context
    fetchL2Data(sid, primaryProfile)
    // Also fetch historical messages as fallback (in case session is ended)
    fetchSessionMessagesPage(sid, 0, 500, primaryProfile).then(page => {
      if (page && page.messages && page.messages.length > 0 && state.value && state.value.nodes.length === 0) {
        // No live events received; rebuild from history
        processMessages(page.messages, sid)
      }
    }).catch(() => {})
    // 聚合加载关联会话的 trace（异步，不阻塞主会话实时事件）
    loadRelatedTraces(relatedSids).catch(e => console.warn('[attachLive] loadRelatedTraces failed:', e))
  }

  /** Replay mode: fetch historical messages via REST API and rebuild trace */
  async function startReplay(sid: string, fromTime: number) {
    mode.value = 'replay'
    scrubberTime.value = fromTime
    replayProgress.value = 0

    // 先发现关联会话
    const relatedSids = await loadRelatedSessions(sid)
    const primaryProfile = relatedSessions.value.find(s => s.isPrimary)?.profile

    // Initialize state with a synthetic run.started so tool/thinking events are accepted
    let s = createTraceState(sid, relatedSessionIds.value)
    const startedEvent: RunEvent = {
      event: 'run.started',
      session_id: sid,
      run_id: `replay-${sid}`,
      timestamp: fromTime,
    } as any
    s = applyRunEvent(s, startedEvent)
    sync(s)

    try {
      // Fetch messages via REST API (reliable for ended sessions)
      const page = await fetchSessionMessagesPage(sid, 0, 500, primaryProfile)
      if (page && page.messages && page.messages.length > 0) {
        // Set session start time from first message
        const firstMsg = page.messages[0]
        if (firstMsg?.timestamp) {
          sessionStartedAt.value = firstMsg.timestamp * 1000
        }
        await processMessages(page.messages, sid)
      }
      // Also try resumeSession for live events (if session is still active)
      try {
        const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
          processResumeData(data, sid)
        })
        replayAbort = () => {
          removeSocketListener(socket, 'resumed', () => {})
          socket.disconnect()
        }
      } catch {
        // Session may be ended; REST messages are sufficient
      }
      // Fetch L2 data for accurate tool durations
      await fetchL2Data(sid, primaryProfile)
      // 聚合加载关联会话的 trace
      await loadRelatedTraces(relatedSids)
    } catch {
      // Fallback: try resumeSession only
      const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
        processResumeData(data, sid)
      })
      replayAbort = () => {
        removeSocketListener(socket, 'resumed', () => {})
        socket.disconnect()
      }
    }
  }

  /** Process historical messages to rebuild trace */
  async function processMessages(messages: any[], sid: string) {
    const total = messages.length
    let processed = 0

    for (const msg of messages) {
      const ts = msg.timestamp * 1000 // messages use seconds
      const role = msg.role || msg.display_role

      // Synthesize run.started for the first user message
      if (role === 'user' && processed === 0) {
        const startEvent: RunEvent = {
          event: 'run.started',
          session_id: sid,
          run_id: `replay-${sid}`,
          timestamp: ts,
        } as any
        sync(applyRunEvent(state.value!, startEvent))
      }

      // Tool messages → tool.completed events
      if (role === 'tool' || msg.tool_name) {
        const toolEvent: RunEvent = {
          event: 'tool.completed',
          session_id: sid,
          run_id: `replay-${sid}`,
          tool: msg.tool_name || 'tool',
          name: msg.tool_name,
          output: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '',
          timestamp: ts,
        } as any
        // First emit tool.started for node creation
        const startEvent: RunEvent = {
          event: 'tool.started',
          session_id: sid,
          run_id: `replay-${sid}`,
          tool: msg.tool_name || 'tool',
          name: msg.tool_name,
          preview: '',
          timestamp: ts - 1,
        } as any
        sync(applyRunEvent(state.value!, startEvent))
        sync(applyRunEvent(state.value!, toolEvent))
      }

      // Reasoning content → reasoning.delta events
      const reasoning = msg.reasoning || msg.reasoning_content
      if (reasoning && typeof reasoning === 'string' && reasoning.trim()) {
        const reasoningEvent: RunEvent = {
          event: 'reasoning.delta',
          session_id: sid,
          run_id: `replay-${sid}`,
          text: reasoning,
          timestamp: ts,
        } as any
        sync(applyRunEvent(state.value!, reasoningEvent))
      }

      // Assistant text → message.delta
      if (role === 'assistant' && msg.content) {
        const msgEvent: RunEvent = {
          event: 'message.delta',
          session_id: sid,
          run_id: `replay-${sid}`,
          delta: msg.content,
          timestamp: ts,
        } as any
        sync(applyRunEvent(state.value!, msgEvent))
      }

      processed++
      replayProgress.value = Math.round((processed / total) * 100)
      // Yield to UI every 20 messages
      if (processed % 20 === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
    }

    // Emit run.completed to close the workflow node
    const endEvent: RunEvent = {
      event: 'run.completed',
      session_id: sid,
      run_id: `replay-${sid}`,
      timestamp: messages.length > 0 ? messages[messages.length - 1].timestamp * 1000 : Date.now(),
    } as any
    sync(applyRunEvent(state.value!, endEvent))
  }

  /** Process ResumeSessionPayload events (if session is still active) */
  function processResumeData(data: ResumeSessionPayload, sid: string) {
    // If data has events array (live RunEvent stream), process directly
    if (data.events && Array.isArray(data.events) && data.events.length > 0) {
      const total = data.events.length
      let processed = 0
      for (const { event, data: eventData } of data.events) {
        const runEvent = { ...eventData, event, session_id: sid } as RunEvent
        sync(applyRunEvent(state.value!, runEvent))
        processed++
        replayProgress.value = Math.round((processed / total) * 100)
      }
    }
    // Process messages if events not available
    else if (data.messages && Array.isArray(data.messages) && data.messages.length > 0 && state.value!.nodes.length <= 1) {
      processMessages(data.messages, sid)
    }
  }

  /** Switch to live mode */
  function switchToLive() {
    const sid = sessionId.value
    if (!sid) return
    detach()
    attachLive(sid)
  }

  /** Switch to replay mode at specific time */
  function switchToReplay(time: number) {
    const sid = sessionId.value
    if (!sid) return
    detach()
    startReplay(sid, time)
  }

  /** Update scrubber position (drag) — Live 模式下拖动自动切换到 Replay */
  function scrubTo(time: number) {
    if (mode.value === 'live') {
      // Live 模式下拖动 → 自动切换到 replay 模式标记
      mode.value = 'replay'
      scrubberTime.value = time
      return
    }
    scrubberTime.value = time
  }

  /** 拖动结束后从当前位置重建 trace（由 Scrubber onPointerUp 触发） */
  function scrubEnd() {
    if (mode.value === 'replay') {
      const sid = sessionId.value
      if (sid) {
        detach()
        startReplay(sid, scrubberTime.value)
      }
    }
  }

  // 外部可设置会话是否已结束，用于自动选择模式
  const sessionEnded = ref(false)

  watch(sessionId, (sid) => {
    detach()
    if (!sid) { sync(null); return }
    // 根据会话是否结束自动选择模式
    if (sessionEnded.value) {
      startReplay(sid, Date.now())
    } else {
      attachLive(sid)
    }
  }, { immediate: true })

  onScopeDispose(detach)

  return {
    state, nodes, edges, focusedNodeId, l2Available,
    mode, scrubberTime, replayProgress, sessionStartedAt, sessionEnded,
    relatedSessions, relatedSessionIds, aggregateMode,
    route, fetchL2Data, switchToLive, switchToReplay, scrubTo, scrubEnd,
    setAllSessionsRef, loadRelatedSessions,
  }
}

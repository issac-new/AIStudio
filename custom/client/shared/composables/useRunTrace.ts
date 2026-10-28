import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { connectChatRun, resumeSession, type RunEvent, type ResumeSessionPayload } from '@/api/studio/chat'
import { fetchSessionMessagesPage, fetchHermesSessions, type SessionSummary } from '@/api/studio/sessions'
import * as kanbanApi from '@/api/hermes/kanban'
import {
  applyRunEvent,
  buildCrossSessionEdges,
  createTraceState,
  fetchLayer2Trace,
  mergeLayer2Data,
  mergeTraceStates,
  replayMessageEvents,
  replayMessagesIntoState,
  type TraceState,
} from '@/custom/shared/adapters/run-trace-adapter'

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
 *
 * 实现已抽取到 ./sessionTaskId.ts；此处 re-export 以保持对既有导入方兼容。
 */
export { extractKanbanTaskId, matchSessionTaskId } from '@/custom/shared/composables/sessionTaskId'
import { matchSessionTaskId, extractKanbanTaskId } from '@/custom/shared/composables/sessionTaskId'

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
  let primaryState: TraceState | null = sessionId.value ? createTraceState(sessionId.value) : null
  const state = ref<TraceState | null>(primaryState)
  const nodes = ref<TraceState['nodes']>(state.value?.nodes ?? [])
  const edges = ref<TraceState['edges']>(state.value?.edges ?? [])
  const focusedNodeId = ref<string | null>(state.value?.focusedNodeId ?? null)
  const l2Available = ref(false)  // Whether L2 trace data was fetched successfully
  /** L2 llm_span 用量汇总（Σ in/out tokens + API 调用数；usage anchor 跨运行累计） */
  const l2Usage = ref<{ input_tokens: number; output_tokens: number; api_calls: number } | null>(null)

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
  // loadRelatedSessions 填充，展示投影据此构建跨会话 delegate/spawn 边（匹配E）。
  let taskRelations: Array<{ parent: string; child: string }> = []
  let sessionTaskMap: Map<string, { taskId: string; role: RelatedSessionRole }> = new Map()

  let cleanup: (() => void) | null = null
  let replayAbort: (() => void) | null = null
  // 每个 session 独立的 reducer 上下文；state 仅是展示投影，不能作为关联事件的输入。
  const relatedTraceStates = new Map<string, TraceState>()
  const relatedHistoryPending = new Set<string>()
  const pendingRelatedEvents = new Map<string, RunEvent[]>()
  let generation = 0

  function publish() {
    const ordered = [...relatedSessionIds.value]
      .map(sid => relatedTraceStates.get(sid))
      .filter((s): s is TraceState => !!s)
    let merged = primaryState ? mergeTraceStates(primaryState, ordered) : null
    if (merged && (taskRelations.length > 0 || sessionTaskMap.size > 0)) {
      const crossEdges = buildCrossSessionEdges(merged, taskRelations, sessionTaskMap)
      if (crossEdges.length > 0) {
        const existingIds = new Set(merged.edges.map(e => e.id))
        merged = { ...merged, edges: [...merged.edges, ...crossEdges.filter(e => !existingIds.has(e.id))] }
      }
    }
    if (merged) {
      const profiles = new Map(relatedSessions.value.map(s => [s.sessionId, s.profile]))
      merged = {
        ...merged,
        nodes: merged.nodes.map(n => {
          const sid = n.ref?.sessionId
          const taskId = sid ? sessionTaskMap.get(sid)?.taskId : undefined
          const profile = sid ? profiles.get(sid) : undefined
          if ((taskId && n.cluster !== taskId) || (profile && n.profile !== profile)) {
            return { ...n, cluster: taskId ?? n.cluster, profile: profile ?? n.profile }
          }
          return n
        }),
      }
    }
    state.value = merged
    nodes.value = merged?.nodes ?? []
    edges.value = merged?.edges ?? []
    focusedNodeId.value = merged?.focusedNodeId ?? null
  }

  function sync(next: TraceState | null) {
    primaryState = next
    publish()
  }

  function syncRelated(sid: string, next: TraceState) {
    relatedTraceStates.set(sid, next)
    publish()
  }

  function route(event: RunEvent) {
    const sid = sessionId.value
    const eventSid = event.session_id
    if (!sid || !primaryState || !eventSid) return
    const isPrimary = eventSid === sid
    const isRelated = aggregateMode.value && relatedSessionIds.value.has(eventSid)
    if (!isPrimary && !isRelated) return
    if (isPrimary) {
      if (primaryState.relatedSessionIds !== relatedSessionIds.value) {
        primaryState = { ...primaryState, relatedSessionIds: relatedSessionIds.value }
      }
      sync(applyRunEvent(primaryState, event))
    } else if (!relatedTraceStates.has(eventSid) && relatedHistoryPending.has(eventSid)) {
      const pending = pendingRelatedEvents.get(eventSid) ?? []
      pendingRelatedEvents.set(eventSid, [...pending, event])
    } else {
      const current = relatedTraceStates.get(eventSid) ?? createTraceState(eventSid, new Set([eventSid]))
      syncRelated(eventSid, applyRunEvent(current, event))
    }
    const eventTs = event.timestamp ?? Date.now()
    if (eventTs > scrubberTime.value) scrubberTime.value = eventTs
    if ((event.event === 'run.completed' || event.event === 'run.failed') &&
      (isPrimary || relatedTraceStates.has(eventSid))) {
      void fetchL2Data(eventSid)
    }
  }

  /** Fetch Layer 2 trace data and merge only into the owning session state. */
  async function fetchL2Data(sid: string, profile?: string | null, ticket = generation) {
    const l2Data = await fetchLayer2Trace(sid, profile)
    if (!l2Data || ticket !== generation) return
    if (primaryState?.sessionId === sid) {
      sync(mergeLayer2Data(primaryState, l2Data))
      l2Available.value = true
      if (l2Data.meta?.usage) l2Usage.value = l2Data.meta.usage
      if (l2Data.meta?.started_at) sessionStartedAt.value = l2Data.meta.started_at * 1000
    } else {
      const related = relatedTraceStates.get(sid)
      if (related) syncRelated(sid, mergeLayer2Data(related, l2Data))
    }
  }

  function detach() {
    generation += 1
    cleanup?.()
    cleanup = null
    replayAbort?.()
    replayAbort = null
    relatedTraceStates.clear()
    relatedHistoryPending.clear()
    pendingRelatedEvents.clear()
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
  async function ensureAllSessions(ticket = generation): Promise<Array<SessionSummary & { profile?: string }>> {
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
    if (allSessionsRef && ticket === generation) {
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
  async function loadRelatedSessions(primarySid: string, ticket = generation): Promise<string[]> {
    relatedSessionIds.value = new Set([primarySid])
    relatedSessions.value = []
    taskRelations = []
    sessionTaskMap = new Map()
    const nextRelatedSessionIds = new Set([primarySid])
    const nextTaskRelations: Array<{ parent: string; child: string }> = []
    const nextSessionTaskMap: Map<string, { taskId: string; role: RelatedSessionRole }> = new Map()

    if (!aggregateMode.value) {
      return []
    }

    // 确保有全量会话列表（allSessionsRef 为空时自加载，修复单 session 直进时聚合失效）
    let allSessions: Array<SessionSummary & { profile?: string }> = []
    try {
      allSessions = await ensureAllSessions(ticket)
    } catch (e) {
      console.warn('[loadRelatedSessions] ensureAllSessions failed:', e)
      return []
    }
    if (allSessions.length === 0) return []

    // 从主会话标题提取 taskId
    const primarySession = allSessions.find(s => s.id === primarySid)
    if (!primarySession) return []

    // 同时检查主会话是否是子会话（有 parent_session_id），发现其父会话和兄弟会话
    // （子会话发现在下方循环内经 parent_session_id 内联判定）
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

    if (primaryTaskId) {
      // 解析 board：cockpit store（boardSlugOf）已随 P3 Task 8 退役删除，
      // boardResolver 置空走默认 board fallback；P4 回放引擎重建时改接
      // ia2 workspace store 的跨 board 任务索引。
      const boardResolver: ((id: string) => string | undefined) | null = null

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
              nextTaskRelations.push({ parent: p, child: tid })
            }
            if (detail.children) for (const c of detail.children) {
              taskIds.add(c); queue.push(c)
              nextTaskRelations.push({ parent: tid, child: c })
            }
            // 匹配B（100%确定）：task.session_id 是创建该任务的 agent 会话
            const creatorSid = detail.task?.session_id
            if (creatorSid && creatorSid !== primarySid) {
              nextRelatedSessionIds.add(creatorSid)
              nextSessionTaskMap.set(creatorSid, { taskId: tid, role: 'creator' })
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
    if (primaryTaskId) nextSessionTaskMap.set(primarySid, { taskId: primaryTaskId, role: primarySession.title && matchSessionTaskId(primarySession.title) ? 'worker' : 'primary' })

    for (const s of allSessions) {
      if (addedSessionIds.has(s.id)) continue

      const title = s.title || ''
      // 匹配C（100%确定）：精确匹配 "work kanban task <task_id>"
      const sTaskId = matchSessionTaskId(title)
      const matchedByKanban = sTaskId && taskIds.has(sTaskId)
      // 匹配B（100%确定）：会话是某任务的创建者会话（sessionTaskMap 已记录）
      const isCreator = nextSessionTaskMap.has(s.id) && nextSessionTaskMap.get(s.id)!.role === 'creator'
      // 旧 fallback：parent_session_id（架构性为空，保留兼容）
      const isChild = (s as any).parent_session_id === primarySid
      const isParent = primaryParentId && s.id === primaryParentId
      const isSibling = primaryParentId && (s as any).parent_session_id === primaryParentId

      if (matchedByKanban || isCreator || isChild || isParent || isSibling) {
        nextRelatedSessionIds.add(s.id)
        addedSessionIds.add(s.id)
        const role: RelatedSessionRole = isCreator ? 'creator' : 'worker'
        const isEmpty = (s.message_count ?? 0) <= 1
        matchedSessions.push({
          sessionId: s.id,
          taskId: sTaskId ?? (isCreator ? nextSessionTaskMap.get(s.id)?.taskId ?? null : null),
          title: title,
          profile: (s as any).profile,
          isPrimary: false,
          ended: !!s.ended_at,
          role,
          isEmpty,
        })
        if (sTaskId) nextSessionTaskMap.set(s.id, { taskId: sTaskId, role })
      }
    }

    if (ticket !== generation) return []
    taskRelations = nextTaskRelations
    sessionTaskMap = nextSessionTaskMap
    relatedSessionIds.value = nextRelatedSessionIds
    relatedSessions.value = matchedSessions

    console.debug(`[loadRelatedSessions] 发现 ${matchedSessions.length - 1} 个关联会话: taskTree=${taskIds.size}任务, relations=${nextTaskRelations.length}条, creators=${[...nextSessionTaskMap.values()].filter(v => v.role === 'creator').length}个`)

    return matchedSessions.filter(s => !s.isPrimary).map(s => s.sessionId)
  }

  /** 关联会话各自回放，历史加载期间的实时事件先缓冲再按序应用。 */
  async function loadRelatedTraces(relatedSids: string[], ticket = generation) {
    if (relatedSids.length === 0 || !primaryState) return
    for (const rsid of relatedSids) relatedHistoryPending.add(rsid)

    for (const rsid of relatedSids) {
      let related: TraceState | null = null
      try {
        const sessionInfo = relatedSessions.value.find(s => s.sessionId === rsid)
        const profile = sessionInfo?.profile
        const isEmpty = sessionInfo?.isEmpty ?? false
        const page = await fetchSessionMessagesPage(rsid, 0, 500, profile)
        if (ticket !== generation) return
        const messages = page?.messages ?? []
        if (messages.length > 0) {
          const startedEvent: RunEvent = {
            event: 'run.started',
            session_id: rsid,
            run_id: `replay-${rsid}`,
            timestamp: messages[0]?.timestamp ? messages[0].timestamp * 1000 : Date.now(),
          } as any
          related = applyRunEvent(createTraceState(rsid, new Set([rsid])), startedEvent)
          if (!isEmpty) {
            related = replayMessagesIntoState(related, messages, rsid)
            const l2 = await fetchLayer2Trace(rsid, profile)
            if (ticket !== generation) return
            if (l2) related = mergeLayer2Data(related, l2)
          } else {
            const runNodeId = `run:${rsid}:replay-${rsid}`
            related = {
              ...related,
              nodes: related.nodes.map(n => n.id === runNodeId ? { ...n, status: 'cancelled' as const } : n),
            }
          }
        }
      } catch (e) {
        console.warn(`[loadRelatedTraces] 关联会话 ${rsid} 加载失败:`, e)
      }
      if (ticket !== generation) return
      relatedHistoryPending.delete(rsid)
      const pending = pendingRelatedEvents.get(rsid) ?? []
      if (!related && pending.length > 0) related = createTraceState(rsid, new Set([rsid]))
      for (const event of pending) related = applyRunEvent(related!, event)
      pendingRelatedEvents.delete(rsid)
      if (related) syncRelated(rsid, related)
    }
  }

  /** Live mode: attach to real-time socket. If session is ended, fallback to replay. */
  async function attachLive(sid: string) {
    mode.value = 'live'
    scrubberTime.value = Date.now()
    replayProgress.value = 0
    // 先发现关联会话，再用 relatedSessionIds 创建 trace state
    const ticket = generation
    const relatedSids = await loadRelatedSessions(sid, ticket)
    if (ticket !== generation) return
    const primaryProfile = relatedSessions.value.find(s => s.isPrimary)?.profile
    sync(createTraceState(sid, relatedSessionIds.value))
    const socket = connectChatRun()
    const handlers = TRACE_EVENTS.map((eventName) => {
      const handler: EventHandler = (event) => {
        if (ticket === generation) route({ ...event, event: event.event || eventName })
      }
      socket.on(eventName, handler)
      return { eventName, handler }
    })
    cleanup = () => {
      handlers.forEach(({ eventName, handler }) => removeSocketListener(socket, eventName, handler))
    }
    // Try to fetch L2 data + historical messages for context
    void fetchL2Data(sid, primaryProfile, ticket)
    // Also fetch historical messages as fallback (in case session is ended)
    fetchSessionMessagesPage(sid, 0, 500, primaryProfile).then(page => {
      if (ticket !== generation) return
      if (page && page.messages && page.messages.length > 0 && primaryState && primaryState.nodes.length === 0) {
        // No live events received; rebuild from history
        void processMessages(page.messages, sid, ticket)
      }
    }).catch(() => {})
    // 聚合加载关联会话的 trace（异步，不阻塞主会话实时事件）
    void loadRelatedTraces(relatedSids, ticket).catch(e => console.warn('[attachLive] loadRelatedTraces failed:', e))
  }

  /** Replay mode: fetch historical messages via REST API and rebuild trace */
  async function startReplay(sid: string, fromTime: number) {
    mode.value = 'replay'
    scrubberTime.value = fromTime
    replayProgress.value = 0

    // 先发现关联会话
    const ticket = generation
    const relatedSids = await loadRelatedSessions(sid, ticket)
    if (ticket !== generation) return
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
        await processMessages(page.messages, sid, ticket)
      }
      // Also try resumeSession for live events (if session is still active)
      try {
        const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
          processResumeData(data, sid, ticket)
        })
        replayAbort = () => {
          removeSocketListener(socket, 'resumed', () => {})
          socket.disconnect()
        }
      } catch {
        // Session may be ended; REST messages are sufficient
      }
      // Fetch L2 data for accurate tool durations
      await fetchL2Data(sid, primaryProfile, ticket)
      // 聚合加载关联会话的 trace
      await loadRelatedTraces(relatedSids, ticket)
    } catch {
      if (ticket !== generation) return
      // Fallback: try resumeSession only
      const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
        processResumeData(data, sid, ticket)
      })
      replayAbort = () => {
        removeSocketListener(socket, 'resumed', () => {})
        socket.disconnect()
      }
    }
  }

  /** 主回放复用统一事件转换，只保留进度与异步让出。 */
  async function processMessages(messages: any[], sid: string, ticket = generation) {
    const events = replayMessageEvents(messages, sid)
    for (let i = 0; i < events.length; i++) {
      if (ticket !== generation || !primaryState) return
      sync(applyRunEvent(primaryState, events[i]))
      replayProgress.value = Math.round(((i + 1) / events.length) * 100)
      if ((i + 1) % 20 === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
    }
  }

  /** Process ResumeSessionPayload events (if session is still active) */
  function processResumeData(data: ResumeSessionPayload, sid: string, ticket = generation) {
    if (ticket !== generation || !primaryState) return
    // If data has events array (live RunEvent stream), process directly
    if (data.events && Array.isArray(data.events) && data.events.length > 0) {
      const total = data.events.length
      let processed = 0
      for (const { event, data: eventData } of data.events) {
        const runEvent = { ...eventData, event, session_id: sid } as RunEvent
        sync(applyRunEvent(primaryState!, runEvent))
        processed++
        replayProgress.value = Math.round((processed / total) * 100)
      }
    }
    // Process messages if events not available
    else if (data.messages && Array.isArray(data.messages) && data.messages.length > 0 && primaryState.nodes.length <= 1) {
      void processMessages(data.messages, sid, ticket)
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
    state, nodes, edges, focusedNodeId, l2Available, l2Usage,
    mode, scrubberTime, replayProgress, sessionStartedAt, sessionEnded,
    relatedSessions, relatedSessionIds, aggregateMode,
    route, fetchL2Data, switchToLive, switchToReplay, scrubTo, scrubEnd,
    setAllSessionsRef, loadRelatedSessions,
  }
}

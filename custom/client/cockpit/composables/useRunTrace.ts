import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { connectChatRun, resumeSession, type RunEvent, type ResumeSessionPayload } from '@/api/hermes/chat'
import { fetchSessionMessagesPage, type SessionSummary } from '@/api/hermes/sessions'
import * as kanbanApi from '@/api/hermes/kanban'
import {
  applyRunEvent,
  createTraceState,
  fetchLayer2Trace,
  mergeLayer2Data,
  mergeTraceStates,
  type TraceState,
} from '../adapters/run-trace-adapter'

/** 关联会话信息（供 UI 展示） */
export interface RelatedSessionInfo {
  sessionId: string
  taskId: string | null
  title: string
  profile?: string
  isPrimary: boolean
  ended: boolean
}

/** 从会话标题提取 kanban 任务 ID */
function extractKanbanTaskId(title: string): string | null {
  const m = title.match(/work kanban task (t_\w+)/i)
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
  async function fetchL2Data(sid: string) {
    const l2Data = await fetchLayer2Trace(sid)
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
   * 发现关联会话：
   * 1. 从主会话标题提取 taskId
   * 2. 通过 kanbanApi.getTask 获取任务的 parents/children
   * 3. 在 allSessions 中匹配标题含这些 taskId 的会话
   * 4. 构建 relatedSessionIds 和 relatedSessions
   *
   * 返回关联会话 ID 列表（不含主会话），供 attachLive/startReplay 聚合加载。
   */
  async function loadRelatedSessions(primarySid: string): Promise<string[]> {
    relatedSessionIds.value = new Set([primarySid])
    relatedSessions.value = []

    if (!aggregateMode.value || !allSessionsRef) {
      return []
    }

    const allSessions = allSessionsRef.value
    if (!allSessions || allSessions.length === 0) return []

    // 从主会话标题提取 taskId
    const primarySession = allSessions.find(s => s.id === primarySid)
    if (!primarySession) return []

    const primaryTaskId = extractKanbanTaskId(primarySession.title || '')
    if (!primaryTaskId) return []  // 非 kanban 任务会话，退化为单会话模式

    // 收集任务树中的所有 taskId（含主任务、父任务、子任务）
    const taskIds = new Set<string>([primaryTaskId])
    try {
      // BFS 遍历任务树（深度 2 层足够覆盖父子）
      const queue = [primaryTaskId]
      const visited = new Set<string>()
      while (queue.length > 0) {
        const tid = queue.shift()!
        if (visited.has(tid)) continue
        visited.add(tid)
        if (visited.size > 20) break  // 防止无限遍历
        try {
          const detail = await kanbanApi.getTask(tid)
          if (detail.parents) for (const p of detail.parents) { taskIds.add(p); queue.push(p) }
          if (detail.children) for (const c of detail.children) { taskIds.add(c); queue.push(c) }
        } catch { /* 任务可能不存在 */ }
      }
    } catch { /* kanban API 不可用 */ }

    // 在 allSessions 中匹配标题含这些 taskId 的会话
    const matchedSessions: RelatedSessionInfo[] = []
    for (const s of allSessions) {
      const title = s.title || ''
      const sTaskId = extractKanbanTaskId(title)
      // 匹配方式 1：标题含 "work kanban task t_xxx" 且 taskId 在任务树中
      // 匹配方式 2：标题直接含 taskId 字符串（某些 agent 可能格式略有不同）
      const matched = sTaskId && taskIds.has(sTaskId)
      if (matched && s.id !== primarySid) {
        relatedSessionIds.value.add(s.id)
        matchedSessions.push({
          sessionId: s.id,
          taskId: sTaskId,
          title: title,
          profile: (s as any).profile,
          isPrimary: false,
          ended: !!s.ended_at,
        })
      }
    }

    // 主会话信息
    matchedSessions.unshift({
      sessionId: primarySid,
      taskId: primaryTaskId,
      title: primarySession.title || '',
      profile: (primarySession as any).profile,
      isPrimary: true,
      ended: !!primarySession.ended_at,
    })

    relatedSessions.value = matchedSessions
    return matchedSessions.filter(s => !s.isPrimary).map(s => s.sessionId)
  }

  /**
   * 聚合加载关联会话的 trace 数据（replay 模式）。
   * 为每个关联会话获取历史消息并用 processMessages 合并到当前 state。
   */
  async function loadRelatedTraces(relatedSids: string[]) {
    if (relatedSids.length === 0 || !state.value) return

    // 为每个关联会话获取消息并合并
    const otherStates: TraceState[] = []
    for (const rsid of relatedSids) {
      try {
        const page = await fetchSessionMessagesPage(rsid, 0, 500)
        if (!page || !page.messages || page.messages.length === 0) continue
        // 为关联会话创建独立的 trace state，用其自身 sessionId
        let otherState = createTraceState(rsid, relatedSessionIds.value)
        const startedEvent: RunEvent = {
          event: 'run.started',
          session_id: rsid,
          run_id: `replay-${rsid}`,
          timestamp: page.messages[0]?.timestamp ? page.messages[0].timestamp * 1000 : Date.now(),
        } as any
        otherState = applyRunEvent(otherState, startedEvent)
        // 处理关联会话的消息
        for (const msg of page.messages) {
          const ts = msg.timestamp * 1000
          const role = msg.role || msg.display_role
          if (role === 'tool' || msg.tool_name) {
            const startEvt: RunEvent = { event: 'tool.started', session_id: rsid, run_id: `replay-${rsid}`, tool: msg.tool_name || 'tool', name: msg.tool_name, preview: '', timestamp: ts - 1 } as any
            const completeEvt: RunEvent = { event: 'tool.completed', session_id: rsid, run_id: `replay-${rsid}`, tool: msg.tool_name || 'tool', name: msg.tool_name, output: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '', timestamp: ts } as any
            otherState = applyRunEvent(otherState, startEvt)
            otherState = applyRunEvent(otherState, completeEvt)
          }
          const reasoning = msg.reasoning || msg.reasoning_content
          if (reasoning && typeof reasoning === 'string' && reasoning.trim()) {
            otherState = applyRunEvent(otherState, { event: 'reasoning.delta', session_id: rsid, run_id: `replay-${rsid}`, text: reasoning, timestamp: ts } as any)
          }
          if (role === 'assistant' && msg.content) {
            otherState = applyRunEvent(otherState, { event: 'message.delta', session_id: rsid, run_id: `replay-${rsid}`, delta: msg.content, timestamp: ts } as any)
          }
        }
        const endEvt: RunEvent = { event: 'run.completed', session_id: rsid, run_id: `replay-${rsid}`, timestamp: page.messages[page.messages.length - 1]?.timestamp ? page.messages[page.messages.length - 1].timestamp * 1000 : Date.now() } as any
        otherState = applyRunEvent(otherState, endEvt)
        otherStates.push(otherState)
        // 也尝试获取 L2 数据
        const l2 = await fetchLayer2Trace(rsid)
        if (l2) {
          const idx = otherStates.length - 1
          otherStates[idx] = mergeLayer2Data(otherStates[idx], l2)
        }
      } catch { /* 关联会话加载失败，跳过 */ }
    }

    // 合并所有关联会话的 state 到主 state
    if (otherStates.length > 0 && state.value) {
      sync(mergeTraceStates(state.value, otherStates))
    }
  }

  /** Live mode: attach to real-time socket. If session is ended, fallback to replay. */
  async function attachLive(sid: string) {
    mode.value = 'live'
    scrubberTime.value = Date.now()
    replayProgress.value = 0
    // 先发现关联会话，再用 relatedSessionIds 创建 trace state
    const relatedSids = await loadRelatedSessions(sid)
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
    fetchL2Data(sid)
    // Also fetch historical messages as fallback (in case session is ended)
    fetchSessionMessagesPage(sid, 0, 500).then(page => {
      if (page && page.messages && page.messages.length > 0 && state.value && state.value.nodes.length === 0) {
        // No live events received; rebuild from history
        processMessages(page.messages, sid)
      }
    }).catch(() => {})
    // 聚合加载关联会话的 trace（异步，不阻塞主会话实时事件）
    loadRelatedTraces(relatedSids).catch(() => {})
  }

  /** Replay mode: fetch historical messages via REST API and rebuild trace */
  async function startReplay(sid: string, fromTime: number) {
    mode.value = 'replay'
    scrubberTime.value = fromTime
    replayProgress.value = 0

    // 先发现关联会话
    const relatedSids = await loadRelatedSessions(sid)

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
      const page = await fetchSessionMessagesPage(sid, 0, 500)
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
      await fetchL2Data(sid)
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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, effectScope } from 'vue'
import { useRunTrace } from '../composables/useRunTrace'

const mocks = vi.hoisted(() => {
  const socket = {
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
  }
  return {
    connectChatRun: vi.fn(() => socket),
    socket,
  }
})

vi.mock('@/api/hermes/chat', () => ({
  connectChatRun: mocks.connectChatRun,
  resumeSession: vi.fn((_sid: string, onResumed: (data: any) => void) => mocks.socket),
}))

vi.mock('@/api/hermes/sessions', () => ({
  fetchSessionMessagesPage: vi.fn(async () => ({ messages: [], total: 0, offset: 0, limit: 500, hasMore: false, session: {} })),
  fetchHermesSessions: vi.fn(async () => []),
  // also mock SessionSummary type for re-export compatibility
}))

vi.mock('@/api/hermes/kanban', () => ({
  getTask: vi.fn(async () => ({ task: { session_id: null }, parents: [], children: [] })),
}))

// run-trace-adapter 静态导入 @/api/client 的 request helper（→ router → location），
// 在 jsdom 外的环境不稳定，mock 掉避免模块链加载。
vi.mock('@/api/client', () => ({
  request: vi.fn(async () => null),
  getApiKey: () => '',
  getBaseUrlValue: () => '/api',
}))

// useRunTrace 动态 import cockpit store 获取 boardSlugOf；mock 避免真实 store 初始化。
vi.mock('../store/cockpit', () => ({
  useCockpitStore: () => ({ boardSlugOf: (id: string) => 'kanban001' }),
}))

/** flush all pending microtasks (await loadRelatedSessions etc.) */
function flush() { return new Promise(r => setTimeout(r, 0)) }

describe('useRunTrace', () => {
  beforeEach(() => {
    mocks.connectChatRun.mockClear()
    mocks.socket.on.mockClear()
    mocks.socket.off.mockClear()
    mocks.socket.removeListener.mockClear()
  })

  it('attaches socket listeners without touching singleton session handlers and cleans up on session change', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    const sessionId = ref<string | null>('s1')

    scope.run(() => {
      trace = useRunTrace(sessionId)
    })

    // attachLive is async (awaits loadRelatedSessions); flush before checking
    await flush()
    expect(mocks.connectChatRun).toHaveBeenCalledTimes(1)
    const events = mocks.socket.on.mock.calls.map(([event]) => event).sort()
    expect(events).toEqual([
      'message.delta', 'reasoning.available', 'reasoning.delta', 'run.completed', 'run.failed',
      'run.started', 'subagent.complete', 'subagent.progress', 'subagent.start', 'subagent.tool',
      'thinking.delta', 'tool.completed', 'tool.started', 'usage.updated',
    ].sort())

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    runStarted({ event: 'run.started', run_id: 'r1', session_id: 's1', timestamp: 1 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(true)

    sessionId.value = 's2'
    await nextTick()
    await flush()
    expect(mocks.socket.off).toHaveBeenCalledTimes(events.length)
    expect(mocks.connectChatRun).toHaveBeenCalledTimes(2)
    expect(trace.state.value?.sessionId).toBe('s2')

    scope.stop()
    expect(mocks.socket.off).toHaveBeenCalledTimes(events.length * 2)
  })

  it('filters events from other sessions', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>('s1'))
    })

    await flush()
    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    runStarted({ event: 'run.started', run_id: 'r2', session_id: 'other', timestamp: 1 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(false)
    scope.stop()
  })

  it('accepts events from related sessions when aggregate mode is on and session is in relatedSessionIds', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    const sessionId = ref<string | null>('s1')
    scope.run(() => {
      trace = useRunTrace(sessionId)
    })

    await flush()
    // 手动设置 relatedSessionIds
    trace.relatedSessionIds.value = new Set(['s1', 's2'])
    trace.aggregateMode.value = true

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    // s2 的 run.started 应被接受（因在 relatedSessionIds 中且 aggregateMode=true）
    runStarted({ event: 'run.started', run_id: 'r2', session_id: 's2', timestamp: 2 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(true)

    scope.stop()
  })

  it('filters events from unrelated sessions even when aggregate mode is on', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>('s1'))
    })

    await flush()
    trace.relatedSessionIds.value = new Set(['s1', 's2'])
    trace.aggregateMode.value = true

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    // s3 不在 relatedSessionIds → 应被过滤
    runStarted({ event: 'run.started', run_id: 'r3', session_id: 's3', timestamp: 3 })
    expect(trace.nodes.value.some(n => n.id === 'run:s3:r3')).toBe(false)

    scope.stop()
  })

  it('does not connect when session id is null', () => {
    const scope = effectScope()
    scope.run(() => {
      useRunTrace(ref<string | null>(null))
    })
    expect(mocks.connectChatRun).not.toHaveBeenCalled()
    scope.stop()
  })

  it('loadRelatedSessions auto-loads sessions via fetchHermesSessions when allSessionsRef is empty', async () => {
    // 模拟 openRunTraceGlobal 单 session 直进：modal 未注入 allSessionsRef
    // loadRelatedSessions 应自调用 fetchHermesSessions 跨 profile 加载并发现关联会话
    const { fetchHermesSessions } = await import('@/api/hermes/sessions')
    const { getTask } = await import('@/api/hermes/kanban')
    ;(fetchHermesSessions as any).mockImplementation(async (_src: any, _limit: any, profile: string) => {
      if (profile === 'orchestrator') {
        return [{ id: 's1', title: 'work kanban task t_abc', profile: 'orchestrator', ended_at: null }]
      }
      if (profile === 'worker-coder') {
        return [{ id: 's2', title: 'work kanban task t_def', profile: 'worker-coder', ended_at: null }]
      }
      return []
    })
    // t_abc 的子任务是 t_def → s2 应被发现为关联会话
    ;(getTask as any).mockImplementation(async (tid: string) => {
      if (tid === 't_abc') return { task: { session_id: null }, parents: [], children: ['t_def'] }
      if (tid === 't_def') return { task: { session_id: null }, parents: ['t_abc'], children: [] }
      return { task: { session_id: null }, parents: [], children: [] }
    })

    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>(null))
    })

    // aggregateMode 默认 true；不调用 setAllSessionsRef，模拟单 session 直进
    const related = await trace.loadRelatedSessions('s1')
    expect(related).toContain('s2')
    expect(trace.relatedSessionIds.value.has('s1')).toBe(true)
    expect(trace.relatedSessionIds.value.has('s2')).toBe(true)
    // relatedSessions 含主会话和关联会话
    expect(trace.relatedSessions.value.length).toBe(2)
    expect(trace.relatedSessions.value.find(s => s.sessionId === 's2')?.isPrimary).toBe(false)
    // 匹配A：任务树关系被记录
    expect(trace.relatedSessions.value.find(s => s.sessionId === 's2')?.role).toBe('worker')

    scope.stop()
  })

  it('loadRelatedTraces rebuilds related session trace via processMessages (merged into main state)', async () => {
    // 通过 attachLive 触发完整聚合链路：
    // loadRelatedSessions 发现 s2 → loadRelatedTraces 用 processMessages 处理 s2 消息 → 主 state 含 s2 节点
    const { fetchHermesSessions, fetchSessionMessagesPage } = await import('@/api/hermes/sessions')
    const { getTask } = await import('@/api/hermes/kanban')
    ;(fetchHermesSessions as any).mockImplementation(async (_s: any, _l: any, profile: string) => {
      if (profile === 'orchestrator') return [{ id: 's1', title: 'work kanban task t_abc', profile: 'orchestrator', ended_at: null }]
      if (profile === 'worker-coder') return [{ id: 's2', title: 'work kanban task t_def', profile: 'worker-coder', ended_at: null }]
      return []
    })
    ;(getTask as any).mockImplementation(async (tid: string) => {
      if (tid === 't_abc') return { task: { session_id: null }, parents: [], children: ['t_def'] }
      if (tid === 't_def') return { task: { session_id: null }, parents: ['t_abc'], children: [] }
      return { task: { session_id: null }, parents: [], children: [] }
    })
    ;(fetchSessionMessagesPage as any).mockImplementation(async (sid: string) => {
      if (sid === 's2') {
        return {
          messages: [
            { role: 'user', content: 'do work', timestamp: 1000 },
            { role: 'assistant', content: 'done', timestamp: 1001 },
          ],
          total: 2, offset: 0, limit: 500, hasMore: false, session: {},
        }
      }
      return { messages: [], total: 0, offset: 0, limit: 500, hasMore: false, session: {} }
    })

    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>('s1'))
    })

    // attachLive 异步：loadRelatedSessions → connectChatRun → loadRelatedTraces
    await flush()
    await flush()
    await flush()

    // s2 的 run 节点应存在于主 state（节点 id 含 :s2:）
    const hasS2Run = trace.nodes.value.some(n => n.id.includes(':s2:'))
    expect(hasS2Run).toBe(true)

    scope.stop()
  })

  it('(匹配B) task.session_id 创建者会话被聚合为 creator 角色', async () => {
    const { fetchHermesSessions } = await import('@/api/hermes/sessions')
    const { getTask } = await import('@/api/hermes/kanban')
    // orchestrator 创建者会话 s_creator，worker 会话 s_worker
    ;(fetchHermesSessions as any).mockImplementation(async (_s: any, _l: any, profile: string) => {
      if (profile === 'orchestrator') return [{ id: 's_creator', title: '创建多agents团队', profile: 'orchestrator', ended_at: null, message_count: 5 }]
      if (profile === 'worker-coder') return [{ id: 's_worker', title: 'work kanban task t_x', profile: 'worker-coder', ended_at: null, message_count: 10 }]
      return []
    })
    // t_x 的 session_id 是创建者会话 s_creator（匹配B，100%确定）
    ;(getTask as any).mockImplementation(async (tid: string) => {
      if (tid === 't_x') return { task: { session_id: 's_creator' }, parents: [], children: [] }
      return { task: { session_id: null }, parents: [], children: [] }
    })

    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => { trace = useRunTrace(ref<string | null>(null)) })

    await trace.loadRelatedSessions('s_worker')
    // s_creator 应作为 creator 角色被聚合
    const creator = trace.relatedSessions.value.find(s => s.sessionId === 's_creator')
    expect(creator).toBeTruthy()
    expect(creator?.role).toBe('creator')
    expect(trace.relatedSessionIds.value.has('s_creator')).toBe(true)
    scope.stop()
  })

  it('(匹配C) 精确标题匹配，宽泛标题不误匹配', async () => {
    const { matchSessionTaskId, extractKanbanTaskId } = await import('../composables/useRunTrace')
    // 精确匹配
    expect(matchSessionTaskId('work kanban task t_342327f6')).toBe('t_342327f6')
    expect(matchSessionTaskId('  Work Kanban Task t_abc  ')).toBe('t_abc')
    // 宽泛标题不匹配（精确匹配返回 null）
    expect(matchSessionTaskId('创建多agents协作研发交付团队')).toBeNull()
    expect(matchSessionTaskId('讨论 t_342327f6 的实现')).toBeNull()
    // extractKanbanTaskId 仍可提取（低置信度 fallback，用于 UI 显示）
    expect(extractKanbanTaskId('讨论 t_342327f6 的实现')).toBe('t_342327f6')
  })

  it('(匹配E) 跨会话 delegate 边基于任务树构建', async () => {
    const { fetchHermesSessions, fetchSessionMessagesPage } = await import('@/api/hermes/sessions')
    const { getTask } = await import('@/api/hermes/kanban')
    ;(fetchHermesSessions as any).mockImplementation(async (_s: any, _l: any, profile: string) => {
      if (profile === 'worker-coder') return [
        { id: 's_child', title: 'work kanban task t_child', profile: 'worker-coder', ended_at: null, message_count: 5 },
        { id: 's_parent', title: 'work kanban task t_parent', profile: 'worker-coder', ended_at: null, message_count: 8 },
      ]
      return []
    })
    // t_parent → t_child 任务树关系
    ;(getTask as any).mockImplementation(async (tid: string) => {
      if (tid === 't_parent') return { task: { session_id: null }, parents: [], children: ['t_child'] }
      if (tid === 't_child') return { task: { session_id: null }, parents: ['t_parent'], children: [] }
      return { task: { session_id: null }, parents: [], children: [] }
    })
    ;(fetchSessionMessagesPage as any).mockImplementation(async () => ({
      messages: [{ role: 'user', content: 'work', timestamp: 1000 }, { role: 'assistant', content: 'done', timestamp: 1001 }],
      total: 2, offset: 0, limit: 500, hasMore: false, session: {},
    }))

    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => { trace = useRunTrace(ref<string | null>('s_child')) })
    await flush(); await flush(); await flush(); await flush()

    // 应有 delegate 边：s_parent ingress → s_child ingress（父→子，体现派生流转时序）
    const delegateEdge = trace.edges.value.find(e => e.from === 'ingress:s_parent' && e.to === 'ingress:s_child' && e.kind === 'delegate')
    expect(delegateEdge).toBeTruthy()
    scope.stop()
  })

  it('空壳会话标记 isEmpty 并降级', async () => {
    const { fetchHermesSessions, fetchSessionMessagesPage } = await import('@/api/hermes/sessions')
    const { getTask } = await import('@/api/hermes/kanban')
    ;(fetchHermesSessions as any).mockImplementation(async (_s: any, _l: any, profile: string) => {
      if (profile === 'worker-coder') return [
        { id: 's_real', title: 'work kanban task t_x', profile: 'worker-coder', ended_at: null, message_count: 10 },
        { id: 's_empty', title: 'work kanban task t_x', profile: 'worker-coder', ended_at: null, message_count: 1 },
      ]
      return []
    })
    ;(getTask as any).mockImplementation(async () => ({ task: { session_id: null }, parents: [], children: [] }))
    ;(fetchSessionMessagesPage as any).mockImplementation(async (sid: string) => {
      if (sid === 's_empty') return { messages: [{ role: 'user', content: 'work kanban task t_x', timestamp: 1000 }], total: 1, offset: 0, limit: 500, hasMore: false, session: {} }
      return { messages: [{ role: 'user', content: 'work', timestamp: 1000 }, { role: 'assistant', content: 'done', timestamp: 1001 }], total: 2, offset: 0, limit: 500, hasMore: false, session: {} }
    })

    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => { trace = useRunTrace(ref<string | null>('s_real')) })
    await flush(); await flush(); await flush()

    const emptyInfo = trace.relatedSessions.value.find(s => s.sessionId === 's_empty')
    expect(emptyInfo?.isEmpty).toBe(true)
    // 空壳会话 run 节点状态降级为 cancelled
    const emptyRun = trace.nodes.value.find(n => n.id === 'run:s_empty:replay-s_empty')
    expect(emptyRun?.status).toBe('cancelled')
    scope.stop()
  })
})

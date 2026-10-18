// @vitest-environment jsdom
// 启动编排守门：并发 ensureSessions 只装载一次；深链命中按目标落位；未知 id 保留容错切换。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  sessionsLoaded: false,
  sessions: [] as Array<{ id: string }>,
  activeSessionId: null as string | null,
  sessionProfileFilter: null as string | null,
}
const loadSessions = vi.fn(async () => { state.sessionsLoaded = true })
const switchSession = vi.fn(async (_id: string) => {})

vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    get sessionsLoaded() { return state.sessionsLoaded },
    get sessions() { return state.sessions },
    get activeSessionId() { return state.activeSessionId },
    get sessionProfileFilter() { return state.sessionProfileFilter },
    loadSessions,
    switchSession,
  }),
}))

import { useIdeBoot } from '../composables/useIdeBoot'

describe('useIdeBoot', () => {
  beforeEach(() => {
    state.sessionsLoaded = false
    state.sessions = []
    state.activeSessionId = null
    loadSessions.mockClear()
    switchSession.mockClear()
  })

  it('并发 ensureSessions（两个实例）只装载一次', async () => {
    const a = useIdeBoot()
    const b = useIdeBoot()
    await Promise.all([a.ensureSessions(), b.ensureSessions()])
    expect(loadSessions).toHaveBeenCalledTimes(1)
    expect(state.sessionsLoaded).toBe(true)
  })

  it('已装载则不再请求', async () => {
    state.sessionsLoaded = true
    await useIdeBoot().ensureSessions()
    expect(loadSessions).not.toHaveBeenCalled()
  })

  it('?session= 命中：切到目标，不重复切换已激活会话', async () => {
    state.sessionsLoaded = true
    state.sessions = [{ id: 's1' }, { id: 's2' }]
    state.activeSessionId = 's2'
    const res = await useIdeBoot().resolveSessionQuery('s1')
    expect(res).toEqual({ matched: true, switchTo: 's1' })
    expect(switchSession).toHaveBeenCalledWith('s1')
  })

  it('?session= 已激活：matched 但不重复切换', async () => {
    state.sessionsLoaded = true
    state.sessions = [{ id: 's1' }]
    state.activeSessionId = 's1'
    const res = await useIdeBoot().resolveSessionQuery('s1')
    expect(res).toEqual({ matched: true, switchTo: null })
    expect(switchSession).not.toHaveBeenCalled()
  })

  it('未知/空白会话：未知仍交 store 容错，空白不动作', async () => {
    state.sessionsLoaded = true
    state.sessions = []
    const unknown = await useIdeBoot().resolveSessionQuery('ghost')
    expect(unknown.matched).toBe(false)
    expect(switchSession).toHaveBeenCalledWith('ghost')

    switchSession.mockClear()
    await useIdeBoot().resolveSessionQuery('   ')
    expect(switchSession).not.toHaveBeenCalled()
  })
})

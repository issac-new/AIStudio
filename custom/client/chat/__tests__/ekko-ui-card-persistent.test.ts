// @vitest-environment jsdom
// overlay/custom/client/chat/__tests__/ekko-ui-card-persistent.test.ts
// 批二持久式卡片守门：挂载时向服务端取最新版本、状态变化后合并回存、收到更新事件后重渲染且保留已填的值、
// 提交后记录并发起一轮新对话、用户关闭、服务端说没有时的降级。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const requestMock = vi.fn()
vi.mock('@/api/client', () => ({ request: (...args: unknown[]) => requestMock(...args) }))
const socketMock = { on: vi.fn(), off: vi.fn() }
vi.mock('@/api/studio/chat', () => ({ getChatRunSocket: () => socketMock }))
const sendMessage = vi.fn()
const chatStore = { activeSessionId: 's1', activeSession: { profile: 'default' }, sendMessage: (...args: unknown[]) => sendMessage(...args) }
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatStore }))

import EkkoUISurfacePersistentCard from '../components/EkkoUISurfacePersistentCard.vue'
import { _resetSurfaceSyncForTests } from '../ekko-ui/surface-sync'
import { EKKO_UI_PROTOCOL_V2, type EkkoUISpec } from '../ekko-ui/protocol'

function spec(max = 50, extra: Array<Record<string, unknown>> = []): EkkoUISpec {
  return {
    protocol: EKKO_UI_PROTOCOL_V2,
    surfaceId: 'estimator',
    title: '估算器',
    fallbackText: '估算卡片',
    state: { seats: 8 },
    root: {
      id: 'root', type: 'stack',
      children: [
        { id: 'seats', type: 'range', bind: 'seats', props: { min: 1, max } },
        ...extra,
        { id: 'go', type: 'button', props: { text: '提交', variant: 'primary' }, events: { click: { type: 'surface.submit', actionId: 'submit', payload: { kind: 'state', path: '' } } } },
      ],
    },
  }
}

function createArgs() {
  // surface_create 的工具参数里是第 1 版规格；工具结果是回执
  return { context_id: 'ctx-1', spec: spec() }
}

function surfacePayload(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    surface: {
      surface_id: 'srf:s1:estimator', session_id: 's1', revision: 1, status: 'active', title: '估算器', digest: 'abcd1234',
      spec: spec(), state: {}, state_revision: 1, last_submission: null, created_at: 1, updated_at: 1, submitted_at: null,
      ...overrides,
    },
  }
}

function message() {
  return {
    id: 'tool-1', role: 'tool',
    toolName: 'mcp__ekko-studio-interaction__ekko_studio_surface_create',
    toolArgs: createArgs(),
    toolResult: JSON.stringify({ ok: true, surface_id: 'srf:s1:estimator', revision: 1, status: 'active', digest: 'abcd1234', title: '估算器' }),
    toolStatus: 'done',
  }
}

function mountCard(msg = message()) {
  return mount(EkkoUISurfacePersistentCard, { props: { message: msg, sessionId: 's1' } })
}

function reads(): unknown[][] {
  return requestMock.mock.calls.filter(call => String(call[0]).includes('/srf:s1:estimator?'))
}
/** 写请求：路径（去掉查询串）以 /state 或 /actions 结尾。 */
function writes(): Array<{ path: string; body: Record<string, unknown> }> {
  return requestMock.mock.calls
    .map(call => ({ path: String(call[0]).split('?')[0], init: call[1] as { body?: string } }))
    .filter(call => call.path.endsWith('/state') || call.path.endsWith('/actions'))
    .map(call => ({ path: call.path, body: JSON.parse(String(call.init.body)) }))
}

beforeEach(() => {
  _resetSurfaceSyncForTests()
  requestMock.mockReset()
  requestMock.mockResolvedValue({ ok: true })
  socketMock.on.mockClear()
  sendMessage.mockReset()
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('EkkoUISurfacePersistentCard', () => {
  it('挂载时按工具参数里的编号向服务端取最新版本，用取回的规格渲染', async () => {
    const latest = spec(100)
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload({ revision: 3, spec: latest, state: { seats: 11 }, state_revision: 3 })
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    expect(reads()).toHaveLength(1)
    expect(String(reads()[0][0])).toBe('/api/studio/surfaces/srf:s1:estimator?profile=default')
    // 取回的是第 3 版（滑杆上限 100），不是工具参数里的第 1 版（上限 50）
    expect(w.find('input[type="range"]').attributes('max')).toBe('100')
    expect((w.find('input[type="range"]').element as HTMLInputElement).value).toBe('11')
    expect(w.text()).toContain('v3')
    w.unmount()
  })

  it('取回的用户状态直接可用，不必重新请求', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload({ state: { seats: 42 }, state_revision: 1 })
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    expect((w.find('input[type="range"]').element as HTMLInputElement).value).toBe('42')
    expect(reads()).toHaveLength(1)
    w.unmount()
  })

  it('用户改值后 500ms 合并回存一次，带当前版本号', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload({ revision: 2, spec: spec(80) })
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    await w.find('input[type="range"]').setValue('15')
    await w.find('input[type="range"]').setValue('20')
    expect(writes()).toEqual([])
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(writes()).toHaveLength(1)
    expect(writes()[0]).toEqual({ path: '/api/studio/surfaces/srf:s1:estimator/state', body: { revision: 2, state: { seats: 20 } } })
    w.unmount()
  })

  it('卸载时把还没写出的状态立即落盘', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload()
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    await w.find('input[type="range"]').setValue('17')
    w.unmount()
    await flushPromises()
    expect(writes()).toHaveLength(1)
    expect(writes()[0].body.state).toEqual({ seats: 17 })
  })

  it('收到 ui.surface.updated 后重渲染，并保留用户已填的值', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload()
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    await w.find('input[type="range"]').setValue('23')

    const handler = socketMock.on.mock.calls.find(call => call[0] === 'ui.surface.updated')![1] as (payload: unknown) => void
    handler({
      event: 'ui.surface.updated', session_id: 's1', surface_id: 'srf:s1:estimator', revision: 2, base_revision: 1, changed: ['seats'],
      spec: spec(100, [{ id: 'note', type: 'text', props: { text: '上限已调' } }]),
    })
    await flushPromises()
    expect(w.find('input[type="range"]').attributes('max')).toBe('100')
    expect((w.find('input[type="range"]').element as HTMLInputElement).value).toBe('23')
    expect(w.text()).toContain('上限已调')
    expect(w.text()).toContain('v2')
    // 续改不新增读取
    expect(reads()).toHaveLength(1)
    w.unmount()
  })

  it('提交：先记录到服务端，再用既有的发消息通道发起一轮，文本含编号、版本、动作与内容', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload({ revision: 4 })
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    await w.find('input[type="range"]').setValue('30')
    await w.findAll('.ekko-button')[0].trigger('click')
    await flushPromises()

    const actions = writes().filter(item => item.path.endsWith('/actions'))
    expect(actions).toHaveLength(1)
    expect(actions[0].body).toEqual({ revision: 4, action_id: 'submit', payload: { seats: 30 } })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const text = String(sendMessage.mock.calls[0][0])
    expect(text).toContain('「估算器」')
    expect(text).toContain('surface_id=srf:s1:estimator')
    expect(text).toContain('revision=4')
    expect(text).toContain('action=submit')
    expect(text).toContain('"seats": 30')
    // 提交后界面仍可用（spec D6）
    expect(w.find('input[type="range"]').attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('取消类动作只记录、不起轮', async () => {
    const msg = message()
    const args = msg.toolArgs as { spec: EkkoUISpec }
    args.spec = { ...spec(), root: { ...spec().root, children: [
      { id: 'seats', type: 'range', bind: 'seats', props: { min: 1, max: 50 } },
      { id: 'skip', type: 'button', props: { text: '跳过' }, events: { click: { type: 'surface.cancel', actionId: 'skip' } } },
    ] } }
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload({ spec: args.spec })
      : { ok: true })
    const w = mountCard(msg)
    await flushPromises()
    await w.find('.ekko-button').trigger('click')
    await flushPromises()
    expect(writes().filter(item => item.path.endsWith('/actions'))[0].body).toEqual({ revision: 1, action_id: 'skip', payload: undefined })
    expect(sendMessage).not.toHaveBeenCalled()
    w.unmount()
  })

  it('用户点关闭：通知服务端，卡片变为只读', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload()
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    await w.find('.ekko-surface-card-close').trigger('click')
    await flushPromises()
    expect(writes().filter(item => item.path.endsWith('/actions'))[0].body).toEqual({ action_id: 'close' })
    expect(w.find('input[type="range"]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('已关闭')
    w.unmount()
  })

  it('智能体关闭（收到 closed 事件）：卡片变为只读', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload()
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    const handler = socketMock.on.mock.calls.find(call => call[0] === 'ui.surface.closed')![1] as (payload: unknown) => void
    handler({ event: 'ui.surface.closed', session_id: 's1', surface_id: 'srf:s1:estimator', status: 'closed', reason: 'agent' })
    await flushPromises()
    expect(w.find('input[type="range"]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('已关闭')
    w.unmount()
  })

  it('服务端说没有（或无权访问）：显示工具参数里那版的兜底文本与可读原因，不渲染交互控件', async () => {
    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? { available: false }
      : { ok: true })
    const w = mountCard()
    await flushPromises()
    expect(w.text()).toContain('估算卡片')
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('.ekko-button').exists()).toBe(false)
    w.unmount()
  })

  it('读取失败（网络）：显示兜底文本与错误原因，提供重试', async () => {
    requestMock.mockImplementation(async (path: unknown) => {
      if (!String(path).includes('/srf:s1:estimator?')) return { ok: true }
      throw new Error('网络断了')
    })
    const w = mountCard()
    await flushPromises()
    expect(w.text()).toContain('估算卡片')
    expect(w.text()).toContain('网络断了')
    expect(w.find('.ekko-surface-card-retry').exists()).toBe(true)

    requestMock.mockImplementation(async (path: unknown) => String(path).includes('/srf:s1:estimator?')
      ? surfacePayload()
      : { ok: true })
    await w.find('.ekko-surface-card-retry').trigger('click')
    await flushPromises()
    expect(w.find('input[type="range"]').exists()).toBe(true)
    w.unmount()
  })

  it('工具参数里的规格不合法：不请求服务端，显示渲染问题', async () => {
    const msg = message()
    msg.toolArgs = { context_id: 'ctx-1', spec: { ...spec(), root: { id: 'r', type: 'sparkline', props: {} } } }
    const w = mountCard(msg)
    await flushPromises()
    expect(reads()).toHaveLength(0)
    expect(w.text()).toContain('渲染问题')
    expect(w.find('input').exists()).toBe(false)
    w.unmount()
  })

  it('工具还在运行（尚未返回回执）时也先按编号取数；取不到就等', async () => {
    const msg = message()
    msg.toolStatus = 'running'
    delete msg.toolResult
    requestMock.mockResolvedValue({ available: false })
    const w = mountCard(msg)
    await flushPromises()
    expect(reads()).toHaveLength(1)
    expect(w.text()).toContain('估算卡片')
    w.unmount()
  })
})

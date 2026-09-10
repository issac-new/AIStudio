// @vitest-environment jsdom
// overlay/custom/client/loop/runcenter/__tests__/runcenter-components.test.ts
// 组件 jsdom 冒烟：RunStageBadge 徽标语义 / RunListTable 操作映射与事件 /
// RunCenterView 工具条 + 空态引导 + 分页。i18n 用全局 setup 的 key 直返 mock。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// ── socket/REST mock（与 runs-store.test.ts 同一形状）──
/** FakeGraphSocket 的结构类型（类本体定义在 vi.hoisted 内，外层只引用结构） */
interface FakeGraphSocket {
  connected: boolean
  on(event: string, cb: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
  disconnect(): void
  /** 测试辅助：模拟服务端推送 */
  serverEmit(event: string, payload?: unknown): void
}

const { FakeGraphSocket, fakeSocket, rest } = vi.hoisted(() => {
  class FakeGraphSocketImpl implements FakeGraphSocket {
    connected = true
    handlers = new Map<string, Array<(...args: unknown[]) => void>>()
    emitted: Array<{ event: string; payload: unknown }> = []
    on(event: string, cb: (...args: unknown[]) => void): void {
      const list = this.handlers.get(event) ?? []
      list.push(cb)
      this.handlers.set(event, list)
    }
    emit(event: string, ...args: unknown[]): void {
      this.emitted.push({ event, payload: args[0] })
    }
    disconnect(): void { this.connected = false }
    serverEmit(event: string, payload?: unknown): void {
      for (const cb of this.handlers.get(event) ?? []) cb(payload)
    }
  }
  const state: { current: FakeGraphSocket | null } = { current: null }
  return {
    FakeGraphSocket: FakeGraphSocketImpl as new () => FakeGraphSocket,
    fakeSocket: state,
    rest: {
      listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
      getRun: vi.fn(async () => { throw new Error('not implemented') }),
      resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
      forkRun: vi.fn(async () => ({ runId: 'fork-1', forkedFrom: 'x', superStep: 0 })),
      startRun: vi.fn(async () => ({ runId: 'fork-1', instance: {} })),
      replay: vi.fn(async () => [] as Array<{ type: string; ts: string; [key: string]: unknown }>),
    },
  }
})

vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest: rest,
  connectGraph: () => {
    if (!fakeSocket.current) fakeSocket.current = new FakeGraphSocket()
    return fakeSocket.current
  },
  disconnectGraph: () => {
    fakeSocket.current?.disconnect()
    fakeSocket.current = null
  },
}))

// ── 上游 auth mock（P3 台账 #6）：审批面板经 getStoredUsername 取审批人身份；
// mock 掉 '@/api/client'（其 @/router import 会在下方 vue-router mock 下炸）──
const { authMock } = vi.hoisted(() => ({ authMock: { username: 'alice' as string | null } }))
vi.mock('@/api/client', () => ({
  getStoredUsername: () => authMock.username,
}))

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn(async () => {}) }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import RunStageBadge from '@/custom/loop/runcenter/components/RunStageBadge.vue'
import RunListTable from '@/custom/loop/runcenter/components/RunListTable.vue'
import RunCenterView from '@/custom/loop/runcenter/views/RunCenterView.vue'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import type { RunSummary } from '@/custom/loop/runcenter/types'

const run = (over: Partial<RunSummary> & { runId: string }): RunSummary => ({
  graphId: 'loop-loop1',
  status: 'running',
  updatedAt: '2026-09-10T00:00:00Z',
  stage: 'discovery',
  iteration: 2,
  lastActivityAt: '2026-09-10T00:01:00Z',
  cost: 1.25,
  events: [],
  pendingInterruptId: null,
  ...over,
})

describe('RunStageBadge (jsdom)', () => {
  it('running → ok 徽标 + 呼吸动画类', () => {
    const w = mount(RunStageBadge, { props: { status: 'running' } })
    expect(w.find('.rc-badge').classes()).toContain('rc-badge--ok')
    expect(w.find('.rc-badge__label').text()).toBe('runcenter.status.running')
  })

  it('awaiting-input → warning；failed → error；completed → muted', () => {
    expect(mount(RunStageBadge, { props: { status: 'awaiting-input' } }).find('.rc-badge').classes()).toContain('rc-badge--warning')
    expect(mount(RunStageBadge, { props: { status: 'failed' } }).find('.rc-badge').classes()).toContain('rc-badge--error')
    expect(mount(RunStageBadge, { props: { status: 'completed' } }).find('.rc-badge').classes()).toContain('rc-badge--muted')
  })

  it('未知状态不抛错，落 muted', () => {
    const w = mount(RunStageBadge, { props: { status: 'unknown' } })
    expect(w.find('.rc-badge').classes()).toContain('rc-badge--muted')
  })
})

describe('RunListTable (jsdom)', () => {
  it('渲染行：列投影（阶段/迭代/成本）与合法操作按钮随 status 显隐', () => {
    const w = mount(RunListTable, {
      props: {
        runs: [
          run({ runId: 'r-await', status: 'awaiting-input' }),
          run({ runId: 'r-run', status: 'running' }),
          run({ runId: 'r-done', status: 'completed' }),
        ],
      },
    })
    const rows = w.findAll('.rc-table__row')
    expect(rows).toHaveLength(3)

    // awaiting-input 行置顶（父层 store 已排序，这里按入参渲染）+ 高亮类
    expect(rows[0].classes()).toContain('rc-table__row--awaiting')
    // 操作集：approve+detail / peek+detail / replay+fork+detail
    const actionKeys = (row: number) =>
      rows[row].findAll('.rc-table__action').map(b => b.attributes('title'))
    expect(actionKeys(0)).toEqual(['runcenter.actions.approve', 'runcenter.actions.detail'])
    expect(actionKeys(1)).toEqual(['runcenter.actions.peek', 'runcenter.actions.detail'])
    expect(actionKeys(2)).toEqual(['runcenter.actions.replay', 'runcenter.actions.fork', 'runcenter.actions.detail'])

    // 投影值（i18n mock 直返 key/入参，成本为字面量）
    expect(rows[0].text()).toContain('runcenter.stage.discovery')
    expect(rows[0].text()).toContain('$1.25')
  })

  it('点击行发 select；点击操作按钮只发 action 不触发 select', async () => {
    const w = mount(RunListTable, { props: { runs: [run({ runId: 'r-1' })] } })
    await w.find('.rc-table__row').trigger('click')
    expect(w.emitted('select')).toHaveLength(1)

    await w.find('.rc-table__action').trigger('click')
    const actions = w.emitted('action')
    expect(actions).toHaveLength(1)
    expect((actions![0][0] as { kind: string }).kind).toBe('peek') // running 首个合法操作
    expect(w.emitted('select')).toHaveLength(1) // 未叠加
  })

  it('空列表显示空占位', () => {
    const w = mount(RunListTable, { props: { runs: [] } })
    expect(w.find('.rc-table__empty').exists()).toBe(true)
  })
})

describe('RunCenterView (jsdom)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
    pushMock.mockClear()
    authMock.username = 'alice' // 审批人身份（P3 台账 #6）
    try { localStorage.clear() } catch { /* ignore */ }
  })

  it('挂载即拉取列表并渲染行；连接态徽标存在', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-1', graphId: 'loop-loop1', status: 'running', updatedAt: '2026-09-10T00:00:00Z' },
      { runId: 'run-2', graphId: 'loop-loop1', status: 'awaiting-input', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))
    expect(w.findAll('.rc-table__row')).toHaveLength(2)
    expect(w.find('.rc-view__connection').classes()).toContain('rc-view__connection--disconnected')

    // awaiting-input 置顶（store 排序生效）
    expect(w.find('.rc-table__row').classes()).toContain('rc-table__row--awaiting')
  })

  it('空态渲染三步引导 + CTA 跳转循环工程', async () => {
    rest.listRuns.mockResolvedValue([])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))
    expect(w.find('.rc-view__onboarding').exists()).toBe(true)
    expect(w.findAll('.rc-view__step')).toHaveLength(3)
    await w.find('.rc-view__cta').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loop' })
  })

  it('状态筛选按钮过滤行；approve 动作行内展开审批面板（不进 loop 详情页，task-7）', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-1', graphId: 'loop-loop1', status: 'running', updatedAt: '2026-09-10T00:00:00Z' },
      { runId: 'run-2', graphId: 'loop-loop2', status: 'awaiting-input', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    // 点击"等待输入"筛选（第 3 个按钮：全部/运行中/等待输入/已完成/已失败）
    await w.findAll('.rc-view__filter')[2].trigger('click')
    let rows = w.findAll('.rc-table__row')
    expect(rows).toHaveLength(1)
    expect(rows[0].classes()).toContain('rc-table__row--awaiting')

    // awaiting-input 行未决审批 interrupt（socket 事件投影）
    fakeSocket.current!.serverEmit('graph:event', {
      type: 'graph.interrupt', graphId: 'loop-loop2', threadId: 'run-2',
      interruptId: 'approval:c1@1', value: { kind: 'approval', prompt: 'approve me' },
      ts: '2026-09-10T00:01:00Z',
    })
    await new Promise(r => setTimeout(r, 0))

    // approve 按钮 → 行内展开（peek 行出现 + 审批面板），无路由跳转
    rows = w.findAll('.rc-table__row')
    await rows[0].find('.rc-table__action').trigger('click')
    expect(w.find('.rc-table__peek').exists()).toBe(true)
    expect(w.find('[data-approval-panel]').exists()).toBe(true)
    expect(pushMock).not.toHaveBeenCalled()

    // 内联审批：approve → 乐观投影（行不再 awaiting）+ REST 携带结构化值
    await w.find('.ap-panel__decision--approve').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(rest.resumeRun).toHaveBeenCalledWith('run-2', 'approval:c1@1', { decision: 'approved', approver: 'alice' })
    expect(w.findAll('.rc-table__row--awaiting')).toHaveLength(0)
  })

  it('行首箭头同一切换路径：展开显示最新 3 条事件摘要，再点收起', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-1', graphId: 'loop-loop1', status: 'completed', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))
    // 实时事件缓冲（4 条 → 只显示最新 3 条）
    for (let i = 1; i <= 4; i++) {
      fakeSocket.current!.serverEmit('graph:event', {
        type: 'graph.node-complete', graphId: 'loop-loop1', threadId: 'run-1',
        nodeId: 'discovery', step: i, ts: `2026-09-10T00:0${i}:00Z`,
      })
    }
    await new Promise(r => setTimeout(r, 0))

    await w.find('.rc-table__peek-toggle').trigger('click')
    expect(w.find('.rc-table__peek').exists()).toBe(true)
    const lines = w.findAll('.rc-table__peek-line')
    expect(lines).toHaveLength(3)
    expect(lines[0].text()).toContain('@2') // 最新 3 条（丢最旧 @1）
    expect(lines[2].text()).toContain('@4')

    await w.find('.rc-table__peek-toggle').trigger('click')
    expect(w.find('.rc-table__peek').exists()).toBe(false)
  })

  it('收件箱 tab：切换渲染 InboxPanel；归档仅本地标记且从待处理消失', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-2', graphId: 'loop-loop2', status: 'awaiting-input', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    await w.findAll('.rc-view__tab')[1].trigger('click') // 介入收件箱
    expect(w.find('[data-inbox-panel]').exists()).toBe(true)
    expect(w.findAll('.ib-row')).toHaveLength(1)
    expect(w.findAll('.rc-table__row')).toHaveLength(0) // 列表已切走

    await w.find('.ib-row__archive').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    // 本地 kv 标记（run 状态不动）+ 待处理清空
    expect(JSON.parse(localStorage.getItem('runcenter:inbox:archived')!)).toHaveProperty('run-2')
    expect(w.findAll('.ib-row')).toHaveLength(0)
    expect(w.find('.ib-panel__empty').text()).toContain('runcenter.inbox.empty')
  })

  it('fork 操作调用 REST 并刷新；回放操作打开回放面板', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-1', graphId: 'loop-loop1', status: 'completed', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    // completed → [replay, fork, detail]；点 fork
    const row = w.find('.rc-table__row')
    const buttons = row.findAll('.rc-table__action')
    rest.forkRun.mockClear()
    rest.listRuns.mockResolvedValue([
      { runId: 'run-1', graphId: 'loop-loop1', status: 'completed', updatedAt: '2026-09-10T00:00:00Z' },
      { runId: 'run-1-fork-1', graphId: 'loop-loop1', status: 'paused', updatedAt: '2026-09-10T00:01:00Z' },
    ])
    await buttons[1].trigger('click') // fork
    await new Promise(r => setTimeout(r, 0))
    expect(rest.forkRun).toHaveBeenCalledWith('run-1', undefined) // superStep 缺省 → 最新 checkpoint
    expect(w.findAll('.rc-table__row')).toHaveLength(2)

    // 点 replay → 面板打开且拉取回放（fork 行最后活动更新会排在前面，须定位 run-1 行）
    // 双词汇：socket 词汇（type + ISO ts）与 replay 端点日志词汇（kind + epoch ms）都要可见
    rest.replay.mockResolvedValue([
      { type: 'graph.started', graphId: 'loop-loop1', threadId: 'run-1', ts: '2026-09-10T00:00:00Z' },
      { kind: 'run.completed', runId: 'run-1', ts: 1760102400000, superStep: 6 },
    ])
    const targetRow = w.findAll('.rc-table__row')
      .find(r => r.find('.rc-table__run-id').text() === 'run-1')
    expect(targetRow).toBeTruthy()
    await targetRow!.findAll('.rc-table__action')[0].trigger('click') // replay
    await new Promise(r => setTimeout(r, 0))
    expect(rest.replay).toHaveBeenCalledWith('run-1')
    expect(w.find('.rc-view__replay').exists()).toBe(true)
    const replayBody = w.find('.rc-view__replay-body').text()
    expect(replayBody).toContain('graph.started') // socket 词汇 type 通道
    expect(replayBody).toContain('run.completed @6') // 日志词汇 kind + superStep 通道
  })

  it('行点击 / detail 动作 → 运行详情页；peek 动作行内展开', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-9', graphId: 'loop-loop1', status: 'running', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    // 行点击 → 运行详情（task-6）
    await w.find('.rc-table__row').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loopRunDetail', params: { runId: 'run-9' } })

    // running 行操作集 [peek, detail]：peek → 行内展开（task-7）；detail → 运行详情
    const buttons = w.findAll('.rc-table__row')[0].findAll('.rc-table__action')
    await buttons[0].trigger('click')
    expect(w.find('.rc-table__peek').exists()).toBe(true)
    expect(pushMock).toHaveBeenCalledTimes(1) // peek 不路由
    await buttons[1].trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loopRunDetail', params: { runId: 'run-9' } })
  })

  it('分页：超过页大小截断 + 翻页', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      runId: `run-${i}`,
      graphId: 'loop-loop1',
      status: 'completed',
      updatedAt: '2026-09-10T00:00:00Z',
    }))
    rest.listRuns.mockResolvedValue(many)
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))
    expect(w.findAll('.rc-table__row')).toHaveLength(20) // PAGE_SIZE
    expect(w.find('.rc-view__pager').exists()).toBe(true)

    await w.findAll('.rc-view__pager button')[1].trigger('click') // 下一页
    expect(w.findAll('.rc-table__row')).toHaveLength(5)
  })
})

describe('RunListTable 虚拟滚动与键盘可达（P3 台账）', () => {
  const row = (over: Partial<RunSummary> & { runId: string }): RunSummary => ({
    graphId: 'loop-loop1',
    status: 'running',
    updatedAt: '2026-09-10T00:00:00Z',
    stage: 'discovery',
    iteration: 1,
    lastActivityAt: '2026-09-10T00:01:00Z',
    cost: 0,
    events: [],
    pendingInterruptId: null,
    ...over,
  })

  it('虚拟滚动：1000 行只渲染窗口（≤ 兜底容量 + overscan），画布承载全量行高', () => {
    const many = Array.from({ length: 1000 }, (_, i) => row({ runId: `run-${i}` }))
    const w = mount(RunListTable, { props: { runs: many } })
    // jsdom 视口不可量测 → 兜底容量 24 + overscan 8
    const rendered = w.findAll('.rc-table__row').length
    expect(rendered).toBeLessThanOrEqual(32)
    expect(rendered).toBeGreaterThan(0)
    expect(w.find('.rc-table__canvas').attributes('style')).toContain('48000px') // 1000 × 48
  })

  it('小列表全渲染；首行 translateY(0)（虚拟定位）', () => {
    const w = mount(RunListTable, { props: { runs: [row({ runId: 'r-1' }), row({ runId: 'r-2' })] } })
    expect(w.findAll('.rc-table__row')).toHaveLength(2)
    expect(w.findAll('.rc-table__row')[0].attributes('style')).toContain('translateY(0px)')
    expect(w.findAll('.rc-table__row')[1].attributes('style')).toContain('translateY(48px)')
  })

  it('键盘：j/k 移动焦点行、Enter 发 select、r 发 replay、a 发 peek', async () => {
    const runs = [row({ runId: 'r-1' }), row({ runId: 'r-2' }), row({ runId: 'r-3', status: 'completed' })]
    const w = mount(RunListTable, { props: { runs } })
    const body = w.find('.rc-table__body')

    await body.trigger('keydown', { key: 'j' })
    const focused = w.findAll('.rc-table__row--focused')
    expect(focused).toHaveLength(1)
    expect(focused[0].text()).toContain('r-2')

    await body.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('select')![0][0]).toMatchObject({ runId: 'r-2' })

    await body.trigger('keydown', { key: 'k' })
    await body.trigger('keydown', { key: 'r' })
    expect(w.emitted('action')![0][0]).toMatchObject({ kind: 'replay', run: { runId: 'r-1' } })

    await body.trigger('keydown', { key: 'a' })
    expect(w.emitted('action')![1][0]).toMatchObject({ kind: 'peek', run: { runId: 'r-1' } })
  })

  it('键盘 a 键：awaiting-input 行发 approve（同一 peek 展开路径）；k 在首行不越界', async () => {
    const runs = [row({ runId: 'r-a', status: 'awaiting-input', pendingInterruptId: 'x' })]
    const w = mount(RunListTable, { props: { runs } })
    const body = w.find('.rc-table__body')

    await body.trigger('keydown', { key: 'k' }) // 首行上移 → 夹在 0
    expect(w.findAll('.rc-table__row--focused')).toHaveLength(1)

    await body.trigger('keydown', { key: 'a' })
    expect(w.emitted('action')![0][0]).toMatchObject({ kind: 'approve', run: { runId: 'r-a' } })
  })
})

describe('RunCenterView 批量订阅（P3 台账 #2：订阅域 = 可见页）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
    pushMock.mockClear()
    try { localStorage.clear() } catch { /* ignore */ }
  })

  it('首屏只订阅可见页；翻页 unsubscribe 旧页 + subscribe 新页', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      runId: `run-${i + 1}`,
      graphId: 'loop-loop1',
      status: 'running',
      updatedAt: '2026-09-10T00:00:00Z',
    }))
    rest.listRuns.mockResolvedValue(many)
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    const emits = () => fakeSocket.current!.emitted
    const subs = () => emits().filter(e => e.event === 'subscribe').map(e => String(e.payload))
    const unsubs = () => emits().filter(e => e.event === 'unsubscribe').map(e => String(e.payload))

    // 页 1：run-1..run-20（PAGE_SIZE）
    expect(subs()).toHaveLength(20)
    expect(subs()[0]).toBe('run-1')
    expect(subs()[19]).toBe('run-20')

    await w.findAll('.rc-view__pager button')[1].trigger('click') // 下一页
    await new Promise(r => setTimeout(r, 0))

    // 旧页 20 个全部 unsubscribe；新页只订阅 run-21..run-25
    expect(unsubs()).toHaveLength(20)
    expect(subs().slice(20)).toEqual(['run-21', 'run-22', 'run-23', 'run-24', 'run-25'])
  })
})

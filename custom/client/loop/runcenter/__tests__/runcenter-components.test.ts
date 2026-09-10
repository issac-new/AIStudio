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

  it('状态筛选按钮过滤行；操作按钮 approve 路由到 loop 详情（loop- 前缀剥离）', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-1', graphId: 'loop-loop1', status: 'running', updatedAt: '2026-09-10T00:00:00Z' },
      { runId: 'run-2', graphId: 'loop-loop2', status: 'awaiting-input', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    // 点击"等待输入"筛选（第 3 个按钮：全部/运行中/等待输入/已完成/已失败）
    await w.findAll('.rc-view__filter')[2].trigger('click')
    const rows = w.findAll('.rc-table__row')
    expect(rows).toHaveLength(1)
    expect(rows[0].classes()).toContain('rc-table__row--awaiting')

    // awaiting-input 行的 approve 按钮 → loop 详情（loop-loop2 → loop2）
    await rows[0].find('.rc-table__action').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loopDetail', params: { id: 'loop2' } })
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
    rest.replay.mockResolvedValue([
      { type: 'graph.started', graphId: 'loop-loop1', threadId: 'run-1', ts: '2026-09-10T00:00:00Z' },
    ])
    const targetRow = w.findAll('.rc-table__row')
      .find(r => r.find('.rc-table__run-id').text() === 'run-1')
    expect(targetRow).toBeTruthy()
    await targetRow!.findAll('.rc-table__action')[0].trigger('click') // replay
    await new Promise(r => setTimeout(r, 0))
    expect(rest.replay).toHaveBeenCalledWith('run-1')
    expect(w.find('.rc-view__replay').exists()).toBe(true)
    expect(w.find('.rc-view__replay-body').text()).toContain('graph.started')
  })

  it('行点击 / detail 动作 → 运行详情页；approve 仍走 loop 详情（审批 UI 在那边）', async () => {
    rest.listRuns.mockResolvedValue([
      { runId: 'run-9', graphId: 'loop-loop1', status: 'running', updatedAt: '2026-09-10T00:00:00Z' },
    ])
    const w = mount(RunCenterView)
    await new Promise(r => setTimeout(r, 0))

    // 行点击 → 运行详情（task-6）
    await w.find('.rc-table__row').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loopRunDetail', params: { runId: 'run-9' } })

    // running 行操作集 [peek, detail]：peek → loop 详情；detail → 运行详情
    const buttons = w.findAll('.rc-table__row')[0].findAll('.rc-table__action')
    await buttons[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loopDetail', params: { id: 'loop1' } })
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

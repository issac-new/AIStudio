// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/cockpit-overview.test.ts
// J 批工作台概览守门（spec 2026-10-31-cockpit-attention-panel §4.2 五条规则）：
// ① 健康态零占位 ② 异常最多 3 条+「还有 N 条」 ③ 计数=列表长度
// ④ 无内部代码泄漏 ⑤ 状态不矛盾。另覆盖三问顺序、最近一条工作历史入口（open-task）
// 与健康信号落点（open-health）。词条取生产 zh 覆盖表，裸键/英文码直出即 fail。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { IA2_TERM_OVERRIDES_ZH } from '../i18n-term-overrides'
import CockpitOverview, { type HealthSignal } from '../components/flow/CockpitOverview.vue'
import type { CockpitTask } from '@/custom/shared/adapters/task-adapter'
import type { PendingApprovalItem } from '@/custom/shared/api/approvals'

type Dict = Record<string, unknown>

/** setup.ts 的全局 vue-i18n 替身只回键名；本文件替换成按生产 zh 词表插值的替身。 */
const i18nHolder = vi.hoisted(() => ({
  t: (key: string, _params?: Record<string, unknown>) => key,
  te: (_key: string) => false,
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: i18nHolder.t, te: i18nHolder.te }) }))

/** patch 473 基础词条（zh）中本组件消费、且 J 批未覆盖的键。 */
const BASE_ZH = {
  ia2: {
    overviewDash: {
      cardHint: '点击进入对应工作面',
      doneOfTotal: '已完成 {done}/{total}（{pct}%）',
      running: '进行中',
      review: '评审中',
      blocked: '受阻',
      open: '未开始',
    },
  },
}

function deepMerge(base: Dict, extra: Dict): Dict {
  const out: Dict = { ...base }
  for (const [k, v] of Object.entries(extra)) {
    const prev = out[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? deepMerge(prev && typeof prev === 'object' ? prev as Dict : {}, v as Dict)
      : v
  }
  return out
}

const ZH = deepMerge(BASE_ZH, IA2_TERM_OVERRIDES_ZH as unknown as Dict)

function lookup(key: string): unknown {
  let cur: unknown = ZH
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Dict)[part]
  }
  return cur
}

i18nHolder.te = (key: string) => typeof lookup(key) === 'string'
i18nHolder.t = (key: string, params?: Record<string, unknown>) => {
  const value = lookup(key)
  if (typeof value !== 'string') return key
  return params ? value.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : value
}

function mountOverview(props: {
  tasks: CockpitTask[]
  pending: PendingApprovalItem[]
  health?: HealthSignal[]
  username?: string
}) {
  return mount(CockpitOverview, { props: { username: 'fanfan', ...props } })
}

const RACI_MINE = { responsible: ['@fanfan:matrix.test'], approver: ['admin'], consulted: [], informed: [] }
const RACI_OTHER = { responsible: ['@other:matrix.test'], approver: ['admin'], consulted: [], informed: [] }

function task(id: string, status: string, createdAt = 0, raci?: unknown): CockpitTask {
  return { id, title: `任务 ${id}`, status, createdAt, raci } as unknown as CockpitTask
}

const TASKS: CockpitTask[] = [
  task('t_1', 'done', 1000),
  task('t_2', 'done', 2000),
  task('t_3', 'running', 3000, RACI_MINE),
  task('t_4', 'review', 4000, RACI_OTHER),
  task('t_5', 'blocked', 5000),
]

const PENDING: PendingApprovalItem[] = [
  { id: 'fleet:s1:a1', kind: 'command', title: '会话 A', detail: 'git push', createdAt: 1000 },
  { id: 'review:rev-1', kind: 'review', title: '评审 · t_4', detail: '未提交变更', taskId: 't_4', createdAt: 2000 },
]

function healthSignal(i: number, severity: HealthSignal['severity'] = 'blocker'): HealthSignal {
  return {
    id: `svc:svc${i}`, label: `服务 ${i} 不可用`,
    detail: '需要你检查服务进程或网络后重试', target: 'ia2.simOps', severity,
  }
}

describe('J 批三问结构与健康态零占位（§4.2 规则一）', () => {
  it('三问顺序：现在需要我做什么→系统是否健康→工作进展；健康输入为空不渲染健康节', () => {
    const healthy = mountOverview({ tasks: TASKS, pending: PENDING, health: [] })
    expect(healthy.findAll('section.ov__card').map(s => s.attributes('data-testid')))
      .toEqual(['ov-need-me', 'ov-progress'])
    expect(healthy.find('[data-testid="ov-health"]').exists()).toBe(false)
    expect(healthy.text()).not.toContain('系统是否健康')
    expect(healthy.find('[data-testid="ov-flow-hint"]').text()).toContain('先看要不要你动手')

    const abnormal = mountOverview({ tasks: TASKS, pending: PENDING, health: [healthSignal(1)] })
    expect(abnormal.findAll('section.ov__card').map(s => s.attributes('data-testid')))
      .toEqual(['ov-need-me', 'ov-health', 'ov-progress'])
  })

  it('未传 health 时按健康处理（默认空数组，不渲染健康节）', () => {
    const w = mountOverview({ tasks: [], pending: [] })
    expect(w.find('[data-testid="ov-health"]').exists()).toBe(false)
    expect(w.find('[data-testid="ov-health-more"]').exists()).toBe(false)
  })
})

describe('J 批注意力经济守门（§4.2 规则二~五）', () => {
  it('异常 5 条：只渲染 3 条 +「还有 2 条」，计数徽标=5', () => {
    const health = Array.from({ length: 5 }, (_, i) => healthSignal(i, i === 4 ? 'warning' : 'blocker'))
    const w = mountOverview({ tasks: [], pending: [], health })
    expect(w.findAll('[data-testid^="ov-health-signal-"]')).toHaveLength(3)
    expect(w.find('[data-testid="ov-health-more"]').text()).toBe('还有 2 条')
    expect(w.find('[data-testid="ov-health-count"]').text()).toBe('5')
  })

  it('异常 3 条以内不出现折叠提示', () => {
    const w = mountOverview({ tasks: [], pending: [], health: [healthSignal(1), healthSignal(2)] })
    expect(w.findAll('[data-testid^="ov-health-signal-"]')).toHaveLength(2)
    expect(w.find('[data-testid="ov-health-more"]').exists()).toBe(false)
  })

  it('计数=列表长度：待审=2、等我决定=1、待办合计=3、健康=3', () => {
    const w = mountOverview({ tasks: TASKS, pending: PENDING, health: [healthSignal(1), healthSignal(2), healthSignal(3)] })
    expect(w.find('[data-testid="ov-todo-approvals"] b').text()).toBe(String(PENDING.length))
    expect(w.find('[data-testid="ov-todo-raci"] b').text()).toBe('1')
    expect(w.find('[data-testid="ov-need-me-count"]').text()).toBe(String(PENDING.length + 1))
    expect(w.find('[data-testid="ov-health-count"]').text()).toBe('3')
  })

  it('无内部代码：状态以中文标签呈现，不出现 review/blocked/T1 等英文码或裸 i18n 键', () => {
    const tasks = [task('t_9', 'review', 9000), task('t_2', 'blocked', 2000), task('t_3', 'scheduled', 1000)]
    const w = mountOverview({ tasks, pending: PENDING, health: [healthSignal(1)] })
    const text = w.text()
    for (const re of [/\bT[123]\b/i, /\breview\b/i, /\bblocked\b/i, /\bscheduled\b/i, /\btriage\b/i]) {
      expect(text).not.toMatch(re)
    }
    expect(text).not.toContain('ia2.')
    expect(text).toContain('评审中')
    expect(text).toContain('受阻')
  })

  it('未知状态回落「状态未知」，不直出内部码', () => {
    const w = mountOverview({ tasks: [task('t_x', 'internal_code', 1)], pending: [] })
    expect(w.find('[data-testid="ov-recent-task"]').text()).toContain('状态未知')
    expect(w.text()).not.toContain('internal_code')
  })

  it('状态不矛盾：待办 0 不渲染红色徽标，有等待项才出现', () => {
    const empty = mountOverview({ tasks: [], pending: [] })
    expect(empty.find('[data-testid="ov-need-me-count"]').exists()).toBe(false)
    expect(empty.find('.ov__n--hot').exists()).toBe(false)

    const busy = mountOverview({ tasks: [], pending: [PENDING[0]] })
    expect(busy.find('[data-testid="ov-need-me-count"]').text()).toBe('1')
    expect(busy.find('.ov__n--hot').exists()).toBe(true)
  })
})

describe('J 批入口与既有聚合不回归', () => {
  it('最近一条工作历史：取创建最新任务，展示中文阶段并走 open-task', async () => {
    const w = mountOverview({ tasks: [task('t_old', 'done', 1000), task('t_new', 'review', 9000)], pending: [] })
    const row = w.find('[data-testid="ov-recent-task"]')
    expect(row.text()).toContain('任务 t_new')
    expect(row.text()).toContain('评审中')
    await row.trigger('click')
    expect(w.emitted('open-task')?.[0]).toEqual(['t_new'])
  })

  it('系统问题入口与健康行：均 emit open-health 并携带落点', async () => {
    const signal: HealthSignal = {
      id: 'svc:gateway', label: '网关不可用', detail: '需要你检查服务进程或网络后重试',
      target: 'ia2.simOps', severity: 'blocker',
    }
    const w = mountOverview({ tasks: [], pending: [], health: [signal] })
    expect(w.find('[data-testid="ov-system-issue"]').text()).toContain('系统问题：网关不可用')
    await w.find('[data-testid="ov-system-issue"]').trigger('click')
    await w.find('[data-testid="ov-health-signal-svc:gateway"]').trigger('click')
    const events = w.emitted('open-health')
    expect(events).toHaveLength(2)
    expect(events?.[0]?.[0]).toMatchObject({ id: 'svc:gateway', target: 'ia2.simOps' })
  })

  it('跳转 emit：待审行→open-inbox，等我决定行→open-board，任务行→open-task', async () => {
    const w = mountOverview({ tasks: TASKS, pending: PENDING })
    await w.find('[data-testid="ov-todo-approvals"]').trigger('click')
    await w.find('[data-testid="ov-todo-raci"]').trigger('click')
    await w.find('[data-testid="ov-mytask-t_3"]').trigger('click')
    expect(w.emitted('open-inbox')).toBeTruthy()
    expect(w.emitted('open-board')).toBeTruthy()
    expect(w.emitted('open-task')?.[0]).toEqual(['t_3'])
  })

  it('交付进度：完成率 2/5=40% 渲染进度条', () => {
    const w = mountOverview({ tasks: TASKS, pending: [] })
    expect(w.find('[data-testid="ov-progress-fill"]').attributes('style')).toContain('width: 40%')
  })

  it('未全部完成时绝不显示 100%：1149/1154 显示 99.5%', () => {
    const tasks = Array.from({ length: 1154 }, (_, i) => task(`t_${i}`, i < 1149 ? 'done' : 'blocked', i))
    const w = mountOverview({ tasks, pending: [] })
    expect(w.find('[data-testid="ov-progress-pct"]').attributes('data-complete')).toBe('false')
    expect(w.find('[data-testid="ov-progress-fill"]').attributes('style')).toContain('width: 99.5%')
    expect(w.find('[data-testid="ov-progress-pct"]').text()).not.toContain('100%')
  })

  it('空态：零任务零待审不炸，进度 0% 且显示暂无工作记录', () => {
    const w = mountOverview({ tasks: [], pending: [] })
    expect(w.find('[data-testid="ov-progress-fill"]').attributes('style')).toContain('width: 0%')
    expect(w.find('[data-testid="ov-recent-empty"]').text()).toBe('暂无工作记录')
  })
})

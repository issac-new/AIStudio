// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/trajectory-pane.test.ts
// 守门：运行观测吸收批（2026-10-01）——轨迹账本谓词过滤/排序/inspector +
// trace 路由双路径修复 + 运行来源徽标判据 + 常驻意图面板过滤逻辑。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const activeSessionId = vi.hoisted(() => ({ value: 'sess-traj-1' as string | null }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ activeSessionId: activeSessionId.value }),
}))

const traceResp = vi.hoisted(() => ({
  status: 200 as number,
  body: {
    session_id: 'sess-traj-1',
    nodes: [
      { id: 'wf', kind: 'workflow', label: 'aim', detail: null, status: 'ok', startedAt: 100, endedAt: 500, durationMs: 400, ref: { sessionId: 'sess-traj-1' } },
      { id: 't1', kind: 'tool', label: 'terminal', detail: 'npm test', status: 'error', startedAt: 110, endedAt: 4110, durationMs: 4000, ref: { sessionId: 'sess-traj-1', spanRef: 'tc-1', spanKind: 'tool_span' } },
      { id: 't2', kind: 'tool', label: 'read_file', detail: 'a.ts', status: 'ok', startedAt: 120, endedAt: 220, durationMs: 100 },
      { id: 'ag', kind: 'agent', label: 'coder', detail: null, status: 'ok', startedAt: 130, endedAt: 130, durationMs: null },
    ],
    edges: [],
    meta: { started_at: 100, duration_ms: 4000, usage: { input_tokens: 10, output_tokens: 20 }, format: 'legacy', complete: true },
  },
}))
const authFetch = vi.hoisted(() => vi.fn(async () => ({
  ok: traceResp.status >= 200 && traceResp.status < 300,
  status: traceResp.status,
  json: async () => traceResp.body,
})))
vi.mock('../utils/auth-fetch', () => ({ authFetch: authFetch }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
// 实例计数桩：切换转题目标必须重挂 Composer（:key），否则预览/表单停留在旧目标。
const composerMounts = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/custom/eval/components/TraceCaseComposer.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['sessionId', 'spanRef', 'spanKind'],
      setup(props: { sessionId: string; spanRef?: string }) {
        composerMounts.count += 1
        return () => h('div', { 'data-testid': 'trace-case-composer-stub' }, `${props.sessionId} ${props.spanRef ?? 'session'}`)
      },
    },
  }
})

import IdeTrajectoryPane from '../components/IdeTrajectoryPane.vue'

describe('IdeTrajectoryPane — 轨迹账本（dsh-TUI Trajectory Web 化）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeSessionId.value = 'sess-traj-1'
    traceResp.status = 200
    traceResp.body.meta = { started_at: 100, duration_ms: 4000, usage: { input_tokens: 10, output_tokens: 20 }, format: 'legacy', complete: true }
    setActivePinia(createPinia())
  })

  it('加载 trace 并渲染全部账本行（时间线序）', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    const rows = wrapper.findAll('.traj__row')
    expect(rows.length).toBe(4)
    // 时间线序：首行 startedAt 最小（100 = wf）
    expect(rows[0].attributes('data-testid')).toBe('traj-row-wf')
    // 摘要头：节点数+token
    expect(wrapper.find('.traj__head').text()).toContain('4')
    expect(wrapper.text()).toContain('↑10 ↓20')
  })

  it('谓词 kind:tool 只留工具行', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-query-input"]').setValue('kind:tool')
    const rows = wrapper.findAll('.traj__row')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('terminal')
  })

  it('谓词 err: 只留错误行（跳错误点）', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-query-input"]').setValue('err:')
    const rows = wrapper.findAll('.traj__row')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('terminal')
  })

  it('谓词 >2s 时长下限过滤（热点排查语义）', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-query-input"]').setValue('>2s')
    const rows = wrapper.findAll('.traj__row')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('4.0s')
  })

  it('组合谓词 AND（kind:tool >500ms）与文本匹配', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-query-input"]').setValue('kind:tool >500ms')
    expect(wrapper.findAll('.traj__row').length).toBe(1)
    await wrapper.find('[data-testid="traj-query-input"]').setValue('npm')
    expect(wrapper.findAll('.traj__row').length).toBe(1)
    await wrapper.find('[data-testid="traj-query-input"]').setValue('zzz')
    expect(wrapper.find('.traj__state').text()).toContain('无匹配')
  })

  it('热点排序=时长降序（4000ms 行置顶）', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-sort-toggle"]').trigger('click')
    const rows = wrapper.findAll('.traj__row')
    expect(rows[0].text()).toContain('terminal')
  })

  it('点击行开 inspector（detail/时长/状态），再点关闭', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-row-t1"]').trigger('click')
    const insp = wrapper.find('[data-testid="traj-inspector"]')
    expect(insp.exists()).toBe(true)
    expect(insp.text()).toContain('npm test')
    expect(insp.text()).toContain('error')
    await wrapper.find('[data-testid="traj-row-t1"]').trigger('click')
    expect(wrapper.find('[data-testid="traj-inspector"]').exists()).toBe(false)
  })

  it('完整 legacy trace 提供本会话转回归入口', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    const action = wrapper.find('[data-testid="traj-reflow-session"]')
    expect(action.exists()).toBe(true)
    expect(action.attributes('disabled')).toBeUndefined()
    await action.trigger('click')
    expect(wrapper.find('[data-testid="trace-case-composer-stub"]').text()).toContain('sess-traj-1')
    expect(wrapper.find('[data-testid="trace-case-composer-stub"]').text()).toContain('session')
  })

  it('带稳定 ref 的节点可转 span；无 ref 节点不显示该入口', async () => {
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-row-t1"]').trigger('click')
    const spanAction = wrapper.find('[data-testid="traj-reflow-span"]')
    expect(spanAction.exists()).toBe(true)
    await spanAction.trigger('click')
    expect(wrapper.find('[data-testid="trace-case-composer-stub"]').text()).toContain('tc-1')

    await wrapper.find('[data-testid="traj-row-t2"]').trigger('click')
    expect(wrapper.find('[data-testid="traj-reflow-span"]').exists()).toBe(false)
  })

  it('OTel 轨迹保留浏览能力，但禁用转题入口', async () => {
    traceResp.body.meta = { ...traceResp.body.meta, format: 'otel', complete: true }
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    const action = wrapper.find('[data-testid="traj-reflow-session"]')
    expect(action.exists()).toBe(true)
    expect(action.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="trace-case-composer-stub"]').exists()).toBe(false)
    // 评审 Important#3：span 级按钮同样必须禁用（OTel 经转换后 tool 节点仍带 ref）
    await wrapper.find('[data-testid="traj-row-t1"]').trigger('click')
    const spanAction = wrapper.find('[data-testid="traj-reflow-span"]')
    expect(spanAction.exists()).toBe(true)
    expect(spanAction.attributes('disabled')).toBeDefined()
  })

  it('切换转题目标会重挂 Composer（预览/表单不得停留在旧目标）', async () => {
    composerMounts.count = 0
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    await wrapper.find('[data-testid="traj-reflow-session"]').trigger('click')
    expect(composerMounts.count).toBe(1)
    await wrapper.find('[data-testid="traj-row-t1"]').trigger('click')
    await wrapper.find('[data-testid="traj-reflow-span"]').trigger('click')
    expect(wrapper.find('[data-testid="trace-case-composer-stub"]').text()).toContain('tc-1')
    expect(composerMounts.count).toBe(2)
  })

  it('无会话=诚实空态不发请求', async () => {
    activeSessionId.value = null
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    expect(authFetch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('未选择会话')
  })

  it('404=无 trace 文件的诚实空态（run-trace 插件未启用语义）', async () => {
    traceResp.status = 404
    const wrapper = mount(IdeTrajectoryPane)
    await flushPromises()
    expect(wrapper.text()).toContain('无轨迹文件')
  })
})

// ── trace 路由双路径修复（纯静态断言：上游 legacy-app-api 改写防御） ──
describe('trace 路由双路径注册（legacy-app-api 改写防御）', () => {
  it('控制器同时注册 /api/hermes 与 /api/studio 两路径', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    // jsdom 环境 import.meta.url 指向转换后模块——用 cwd（vitest 根=overlay）相对路径
    const src = readFileSync(resolve(process.cwd(), 'custom/server/controllers/hermes/trace.ts'), 'utf-8')
    expect(src).toContain("router.get('/api/hermes/sessions/:id/trace'")
    expect(src).toContain("router.get('/api/studio/sessions/:id/trace'")
  })
})

// ── 运行来源徽标判据（P11 Phase 2） ──
describe('run 来源徽标判据（graphId 前缀）', () => {
  it('loop- 前缀=循环 run（↻），其余=图规格 run（⟐）', () => {
    const badge = (graphId: string) => graphId?.startsWith('loop-') ? '↻' : '⟐'
    expect(badge('loop-l123')).toBe('↻')
    expect(badge('spec-456')).toBe('⟐')
    expect(badge(undefined as unknown as string)).toBe('⟐')
  })
})

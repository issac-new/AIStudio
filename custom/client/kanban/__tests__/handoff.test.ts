// B10 守门：交接单状态机（routa 4 类请求×5 态；载体=看板评论结构化标记）。
// 契约：序列化/折叠往返一致；同 id 最新态为准；坏协议行忽略不炸；状态机边界
// （终态不回边、requested 只能去 delivered/blocked/failed）；发起/推进写评论走
// store.addComment 真链。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import {
  buildHandoffCards, serializeHandoffCreate, serializeHandoffAdvance,
  canAdvanceTo, isTerminalHandoff, type HandoffState,
} from '../handoff'

describe('B10 交接单纯函数域', () => {
  it('序列化→折叠往返一致（发起+两次推进）', () => {
    const comments = [
      { id: 1, body: serializeHandoffCreate('clarification', '付款单位是分还是元？', 'hf-1'), created_at: '2026-09-29T10:00:00Z' },
      { id: 2, body: '普通评论（应被忽略）', created_at: '2026-09-29T10:01:00Z' },
      { id: 3, body: serializeHandoffAdvance('hf-1', 'delivered', '单位是分'), created_at: '2026-09-29T10:02:00Z' },
      { id: 4, body: serializeHandoffAdvance('hf-1', 'completed'), created_at: '2026-09-29T10:03:00Z' },
    ]
    const cards = buildHandoffCards(comments)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'hf-1', type: 'clarification', state: 'completed', body: '付款单位是分还是元？', lastNote: '' })
  })

  it('坏协议行忽略不炸（未知 type/未知 state/孤儿 ref）', () => {
    const comments = [
      { id: 1, body: '【交接单】id=x type=not_a_real_type state=requested\n正文', created_at: '' },
      { id: 2, body: '【交接】ref=ghost state=delivered', created_at: '' },
      { id: 3, body: '【交接单】id=y type=clarification state=requested\n正文', created_at: '' },
      { id: 4, body: '【交接】ref=y state=weird_state', created_at: '' },
    ]
    const cards = buildHandoffCards(comments)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.state).toBe('requested') // 未知 state 推进被忽略
  })

  it('状态机边界：终态不回边；requested/delivered/blocked 合法转移', () => {
    expect(isTerminalHandoff('completed')).toBe(true)
    expect(isTerminalHandoff('failed')).toBe(true)
    expect(canAdvanceTo('completed', 'delivered')).toBe(false)
    expect(canAdvanceTo('failed', 'requested')).toBe(false)
    expect(canAdvanceTo('requested', 'delivered')).toBe(true)
    expect(canAdvanceTo('requested', 'completed')).toBe(false) // 未交付不能直接完成
    expect(canAdvanceTo('delivered', 'completed')).toBe(true)
    expect(canAdvanceTo('delivered', 'blocked')).toBe(true)
    expect(canAdvanceTo('blocked', 'delivered')).toBe(true)
    expect(canAdvanceTo('requested', 'requested')).toBe(false)
  })
})

describe('B10 交接单组件（写链=store.addComment）', () => {
  // vi.mock 工厂被提升，引用外层变量须经 vi.hoisted（否则 TDZ ReferenceError）
  const { addComment } = vi.hoisted(() => ({ addComment: vi.fn(async () => ({})) }))
  vi.mock('@/stores/hermes/kanban', () => ({
    useKanbanStore: () => ({ addComment }),
  }))

  beforeEach(() => addComment.mockClear())

  const SEED = [
    { id: 1, body: serializeHandoffCreate('environment_preparation', '需要 Node 24 环境', 'hf-9'), created_at: '2026-09-29T10:00:00Z' },
  ]

  it('卡片渲染 + 状态徽标 + 合法推进按钮', async () => {
    const { default: KanbanHandoffSection } = await import('../components/KanbanHandoffSection.vue')
    const w = mount(KanbanHandoffSection, { props: { taskId: 't1', comments: SEED } })
    expect(w.find('[data-testid="handoff-card-hf-9"]').text()).toContain('环境准备')
    expect(w.find('[data-testid="handoff-card-hf-9"]').text()).toContain('已请求')
    // requested 的合法推进：delivered/blocked/failed（completed 不可直达）
    expect(w.find('[data-testid="handoff-adv-hf-9-delivered"]').exists()).toBe(true)
    expect(w.find('[data-testid="handoff-adv-hf-9-completed"]').exists()).toBe(false)
    await w.find('[data-testid="handoff-adv-hf-9-delivered"]').trigger('click')
    expect(addComment).toHaveBeenCalledTimes(1)
    expect(String(addComment.mock.calls[0][1])).toContain('ref=hf-9 state=delivered')
  })

  it('发起：表单→结构化评论；空正文拦截', async () => {
    const { default: KanbanHandoffSection } = await import('../components/KanbanHandoffSection.vue')
    const w = mount(KanbanHandoffSection, { props: { taskId: 't1', comments: [] } })
    await w.find('[data-testid="handoff-create-open"]').trigger('click')
    await w.find('[data-testid="handoff-submit"]').trigger('click') // 空正文
    expect(addComment).not.toHaveBeenCalled()
    await w.find('[data-testid="handoff-body"]').setValue('请提供重跑命令')
    await w.find('[data-testid="handoff-type"]').setValue('rerun_command')
    await w.find('[data-testid="handoff-submit"]').trigger('click')
    expect(addComment).toHaveBeenCalledTimes(1)
    const text = String(addComment.mock.calls[0][1])
    expect(text).toContain('【交接单】id=hf-')
    expect(text).toContain('type=rerun_command state=requested')
    expect(text).toContain('请提供重跑命令')
  })
})

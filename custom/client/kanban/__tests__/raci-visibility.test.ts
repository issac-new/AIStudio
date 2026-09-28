// overlay/custom/client/kanban/__tests__/raci-visibility.test.ts
// P2 看板 RACI 可视化守门（2026-09-28 产品 UI 缺陷修复 §三）：
// 结构化解析（417 列/body-JSON 两源合并）/ 徽章投影 / 我的角色 / 等您操作判定 /
// 卡片徽章渲染 + 我的角色高亮。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { KanbanTask } from '@/api/hermes/kanban'
import { parseTaskRaci, raciBadges, myRaciRole, needsMyAction } from '../utils/raci'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => 'alice' }))

function mkTask(over: Partial<KanbanTask> & { raci?: unknown }): KanbanTask {
  return {
    id: 't_1', title: '任务', body: null, assignee: null, status: 'review', priority: 2,
    created_by: null, created_at: 0, started_at: null, completed_at: null,
    workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null, result: null, skills: null,
    ...over,
  } as KanbanTask
}

const STRUCTURED = { responsible: ['@alice:matrix.dev'], approver: ['@bob:matrix.dev'], consulted: [], informed: ['carol'] }

describe('RACI 纯函数（utils/raci）', () => {
  it('字符串形成员归一（RFD 主卡 responsible:"fanfan" → ["fanfan"]，不逐字拆）', () => {
    const strForm = parseTaskRaci(mkTask({ raci: { responsible: 'fanfan', approver: 'admin', consulted: ['arch'], informed: [] } }))
    expect(strForm?.responsible).toEqual(['fanfan'])
    expect(strForm?.approver).toEqual(['admin'])
    expect(strForm?.consulted).toEqual(['arch'])
    const badges = raciBadges(strForm)
    expect(badges.find((b) => b.role === 'R')?.count).toBe(1)
    expect(myRaciRole(strForm, 'fanfan')).toBe('R')
  })

  it('结构化字段优先；body-JSON raci 块兜底；两源成员并集', () => {
    const byField = parseTaskRaci(mkTask({ raci: STRUCTURED }))
    expect(byField?.responsible).toEqual(['@alice:matrix.dev'])
    expect(byField?.approver).toEqual(['@bob:matrix.dev'])
    const byBody = parseTaskRaci(mkTask({ body: JSON.stringify({ raci: { responsible: ['dave'] } }) }))
    expect(byBody?.responsible).toEqual(['dave'])
    const both = parseTaskRaci(mkTask({ raci: { responsible: ['dave'] }, body: JSON.stringify({ raci: { responsible: ['erin'] } }) }))
    expect(both?.responsible.sort()).toEqual(['dave', 'erin'])
    expect(parseTaskRaci(mkTask({}))).toBeNull()
    expect(parseTaskRaci(mkTask({ body: '普通文字描述' }))).toBeNull()
  })

  it('徽章投影：非空角色字母+人数；空角色不出现', () => {
    const badges = raciBadges(parseTaskRaci(mkTask({ raci: STRUCTURED })))
    expect(badges.map((b) => `${b.role}:${b.count}`)).toEqual(['R:1', 'A:1', 'I:1'])
    expect(raciBadges(null)).toEqual([])
  })

  it('我的角色：@ 前缀与 host 后缀不敏感；先 R 后 A', () => {
    expect(myRaciRole(parseTaskRaci(mkTask({ raci: STRUCTURED })), 'alice')).toBe('R')
    expect(myRaciRole(parseTaskRaci(mkTask({ raci: STRUCTURED })), '@alice:matrix.dev')).toBe('R')
    expect(myRaciRole(parseTaskRaci(mkTask({ raci: STRUCTURED })), 'bob')).toBe('A')
    expect(myRaciRole(parseTaskRaci(mkTask({ raci: STRUCTURED })), 'nobody')).toBeNull()
  })

  it('等您操作：R 且未完成 / A 且在评审；完成卡与旁观角色不算', () => {
    expect(needsMyAction(mkTask({ raci: STRUCTURED, status: 'review' }), 'alice')).toBe(true)
    expect(needsMyAction(mkTask({ raci: STRUCTURED, status: 'done' }), 'alice')).toBe(false)
    expect(needsMyAction(mkTask({ raci: STRUCTURED, status: 'review' }), 'bob')).toBe(true)
    expect(needsMyAction(mkTask({ raci: STRUCTURED, status: 'todo' }), 'bob')).toBe(false)
    expect(needsMyAction(mkTask({ raci: STRUCTURED, status: 'todo' }), 'carol')).toBe(false)
  })
})

describe('KanbanTaskCard RACI 徽章渲染', () => {
  it('结构化 raci → 徽章渲染；我的角色 R 高亮', async () => {
    const { default: KanbanTaskCard } = await import('../components/KanbanTaskCard.vue')
    const wrap = mount(KanbanTaskCard, {
      props: { task: mkTask({ raci: STRUCTURED }) },
      global: { stubs: { NCheckbox: true } },
    })
    const badges = wrap.find('[data-testid="raci-badges"]')
    expect(badges.exists()).toBe(true)
    expect(badges.text()).toContain('R')
    expect(badges.text()).toContain('A')
    const mine = wrap.find('.raci-badge--mine')
    expect(mine.exists()).toBe(true)
    expect(mine.classes()).toContain('raci-badge--R')
  })

  it('无 raci 的卡不渲染徽章区', async () => {
    const { default: KanbanTaskCard } = await import('../components/KanbanTaskCard.vue')
    const wrap = mount(KanbanTaskCard, {
      props: { task: mkTask({}) },
      global: { stubs: { NCheckbox: true } },
    })
    expect(wrap.find('[data-testid="raci-badges"]').exists()).toBe(false)
  })
})

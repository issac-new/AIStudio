// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sitline.test.ts
// v12.7 态势条守门（2026-09-21 用户裁定：任务按钮改全状态分类汇总）：
// 三态势项——等我（最久副注）/任务（9 态词表分类汇总，零计数跳过）/在线（明细）；
// 会话/循环 chips 与 ⚙管理入口不再渲染。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

import SitlineBar from '../components/SitlineBar.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

function mountSit(overrides: Record<string, unknown> = {}) {
  return mount(SitlineBar, {
    props: {
      waitingCount: 2, oldestLabel: '3h',
      taskTotal: 12,
      taskByStatus: { triage: 3, todo: 2, ready: 1, running: 4, blocked: 2, review: 2 },
      onlinePeople: 5, onlineAgents: 9, onlineMachines: 3,
      ...overrides,
    },
  })
}

describe('SitlineBar — 态势条（v12.7 三项）', () => {
  it('两态势项（R6 合并）：任务（总数+待决策角标+分类汇总）/在线（明细）', () => {
    const w = mountSit()
    // R6：「等我」并入「任务」单 chip；waiting chip 已退役
    expect(w.find('[data-testid="sit-waiting"]').exists()).toBe(false)
    const tasks = w.find('[data-testid="sit-tasks"]')
    expect(tasks.text()).toContain('12')
    // 待决策角标（waitingCount 作为任务 chip 副注）
    expect(w.find('[data-testid="sit-tasks-decide"]').text()).toContain('2')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('17')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('"p":5')
  })

  it('任务按钮副注=9 态词表全量分类汇总，按词表序，零计数跳过', () => {
    const w = mountSit()
    const summary = w.find('[data-testid="sit-tasks-summary"]')
    expect(summary.exists()).toBe(true)
    const txt = summary.text()
    // 每个非零状态都须出现（词表词+计数）
    expect(txt).toContain('ia2.tdp.status.triage 3')
    expect(txt).toContain('ia2.tdp.status.todo 2')
    expect(txt).toContain('ia2.tdp.status.ready 1')
    expect(txt).toContain('ia2.tdp.status.running 4')
    expect(txt).toContain('ia2.tdp.status.blocked 2')
    expect(txt).toContain('ia2.tdp.status.review 2')
    // 零计数状态（scheduled 未传=0）不得出现
    expect(txt).not.toContain('scheduled')
    // 词表序：triage 先于 todo 先于 running
    expect(txt.indexOf('triage')).toBeLessThan(txt.indexOf('todo'))
    expect(txt.indexOf('todo')).toBeLessThan(txt.indexOf('running'))
  })

  it('全零状态时副注不渲染（v12.7 空态不落 "进行 0 · 待审 0" 旧式）', () => {
    const w = mountSit({ taskByStatus: {} })
    expect(w.find('[data-testid="sit-tasks-summary"]').exists()).toBe(false)
  })

  it('v12.4 退役断言：会话/循环 chips 与 ⚙管理入口不再渲染', () => {
    const w = mountSit()
    expect(w.find('[data-testid="sit-sessions"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-loops"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-gov"]').exists()).toBe(false)
  })

  it('两态势项可点击：各 emit select 自带段键（tasks/online；waiting 已并入 tasks）', async () => {
    const w = mountSit()
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await w.find('[data-testid="sit-online"]').trigger('click')
    expect(w.emitted('select')).toEqual([['tasks'], ['online']])
  })
})

// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sitline.test.ts
// v12.4 态势条守门（2026-09-20 用户裁定：删会话/循环/管理）：三态势项——
// 等我（最久副注）/任务（进行·待审）/在线（明细）；会话/循环 chips 与
// ⚙管理入口不再渲染。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

import SitlineBar from '../components/SitlineBar.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

function mountSit(overrides: Record<string, number | string> = {}) {
  return mount(SitlineBar, {
    props: {
      waitingCount: 2, oldestLabel: '3h',
      taskTotal: 12, taskRunning: 4, taskReview: 2,
      onlinePeople: 5, onlineAgents: 9, onlineMachines: 3,
      ...overrides,
    },
  })
}

describe('SitlineBar — 态势条（v12.4 三项）', () => {
  it('三态势项：等我（最久副注）/任务（进行·待审）/在线（明细）', () => {
    const w = mountSit()
    const wait = w.find('[data-testid="sit-waiting"]')
    expect(wait.text()).toContain('2')
    expect(wait.text()).toContain('3h')
    const tasks = w.find('[data-testid="sit-tasks"]')
    expect(tasks.text()).toContain('12')
    expect(tasks.text()).toContain('4')
    expect(tasks.text()).toContain('2')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('17')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('"p":5')
  })

  it('v12.4 退役断言：会话/循环 chips 与 ⚙管理入口不再渲染', () => {
    const w = mountSit()
    expect(w.find('[data-testid="sit-sessions"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-loops"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-gov"]').exists()).toBe(false)
  })

  it('三态势项可点击：各 emit select 自带段键（waiting/tasks/online）', async () => {
    const w = mountSit()
    await w.find('[data-testid="sit-waiting"]').trigger('click')
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await w.find('[data-testid="sit-online"]').trigger('click')
    expect(w.emitted('select')).toEqual([
      ['waiting'], ['tasks'], ['online'],
    ])
  })
})

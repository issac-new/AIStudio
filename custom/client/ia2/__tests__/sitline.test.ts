// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sitline.test.ts
// v12 态势条守门（2026-09-19 统一视图 Task 8）：五态势项计数渲染 + ⚙管理入口。
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
      sessionCount: 6, loopTotal: 3, loopBlocked: 1,
      onlinePeople: 5, onlineAgents: 9, onlineMachines: 3,
      ...overrides,
    },
  })
}

describe('SitlineBar — 态势条', () => {
  it('五态势项：等我（最久副注）/任务（进行·待审）/会话/循环（阻塞）/在线（明细）', () => {
    const w = mountSit()
    const wait = w.find('[data-testid="sit-waiting"]')
    expect(wait.text()).toContain('2')
    expect(wait.text()).toContain('3h')
    expect(w.find('[data-testid="sit-tasks"]').text()).toContain('12')
    expect(w.find('[data-testid="sit-tasks"]').text()).toContain('4')
    expect(w.find('[data-testid="sit-sessions"]').text()).toContain('6')
    const loops = w.find('[data-testid="sit-loops"]')
    expect(loops.text()).toContain('3')
    expect(loops.text()).toContain('1')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('17')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('"p":5')
  })

  it('⚙管理 → emit open-gov；无阻塞时循环项不带 err 调', async () => {
    const w = mountSit({ loopBlocked: 0 })
    expect(w.find('[data-testid="sit-loops"]').classes()).not.toContain('sit__item--err')
    await w.find('[data-testid="sit-gov"]').trigger('click')
    expect(w.emitted('open-gov')).toHaveLength(1)
  })

  it('五态势项可点击：各 emit select 自带段键（waiting/tasks/sessions/loops/online）', async () => {
    const w = mountSit()
    await w.find('[data-testid="sit-waiting"]').trigger('click')
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await w.find('[data-testid="sit-sessions"]').trigger('click')
    await w.find('[data-testid="sit-loops"]').trigger('click')
    await w.find('[data-testid="sit-online"]').trigger('click')
    expect(w.emitted('select')).toEqual([
      ['waiting'], ['tasks'], ['sessions'], ['loops'], ['online'],
    ])
  })
})

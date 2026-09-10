// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/observatory-components.test.ts
// P3 Task 8 — 观察者聚合最小版：StatusDistributionCard（TaskLifecycleView 生命周期
// 漏斗的等价收编——跨任务状态分布条形图）。useTaskLifecycle 数据层原样复用
// （cockpit/composables 保留资产），本组件只做投影与渲染。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusDistributionCard from '../components/StatusDistributionCard.vue'

function task(id: string, status: string) {
  return {
    id, title: `t-${id}`, priority: 'P2' as const, status: status as any,
    assignee: 'a', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 0,
  }
}

describe('StatusDistributionCard（观察者聚合最小版）', () => {
  it('空任务渲染空态', () => {
    const w = mount(StatusDistributionCard, { props: { tasks: [] } })
    expect(w.find('[data-testid="ia-status-dist"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-status-dist-empty"]').exists()).toBe(true)
    expect(w.findAll('.ia-status-dist__row').length).toBe(0)
  })

  it('按主链顺序渲染状态条形并给出计数与占比', () => {
    const tasks = [
      task('1', 'todo'), task('2', 'todo'), task('3', 'todo'),
      task('4', 'running'),
      task('5', 'blocked'),
      task('6', 'done'),
    ]
    const w = mount(StatusDistributionCard, { props: { tasks } })
    const rows = w.findAll('.ia-status-dist__row')
    // 只渲染有任务的行；顺序 = STATUS_FLOW 主链（漏斗序）
    const labels = rows.map(r => r.attributes('data-status'))
    expect(labels).toEqual(['todo', 'running', 'blocked', 'done'])
    const todoRow = rows[0]
    expect(todoRow.find('.ia-status-dist__count').text()).toBe('3')
    // 占比条宽：todo 3/6 = 50%
    const bar = todoRow.find('.ia-status-dist__bar')
    expect(bar.attributes('style')).toContain('50%')
    // 总数
    expect(w.find('[data-testid="ia-status-dist-total"]').text()).toBe('6')
  })

  it('done/archived 不计入活跃但仍出现在分布中', () => {
    const tasks = [task('1', 'done'), task('2', 'archived')]
    const w = mount(StatusDistributionCard, { props: { tasks } })
    const labels = w.findAll('.ia-status-dist__row').map(r => r.attributes('data-status'))
    expect(labels).toEqual(['done', 'archived'])
  })

  it('点击行发出 open（跳工作项区带状态筛选）', async () => {
    const tasks = [task('1', 'review')]
    const w = mount(StatusDistributionCard, { props: { tasks } })
    await w.find('.ia-status-dist__row').trigger('click')
    expect(w.emitted('open')).toEqual([['review']])
  })
})

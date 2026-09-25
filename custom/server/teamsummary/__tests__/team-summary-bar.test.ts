// 汇总条守门（minimax：五态计数/健康色/零值段省略）。
import { describe, it, expect } from 'vitest'
import { teamSummaryBar, type TeamMember, type WorkerState } from '../team-summary-bar'

const m = (id: string, state: WorkerState): TeamMember => ({ memberId: id, state })

describe('teamSummaryBar（minimax 语义）', () => {
  it('五态计数+摘要条零值段省略', () => {
    const bar = teamSummaryBar([m('a', 'running'), m('b', 'done'), m('c', 'done')])
    expect(bar.counts.done).toBe(2)
    expect(bar.bar).toBe('3 agents · 1 running · 2 done')
    expect(bar.bar).not.toContain('failed')
  })

  it('健康色：failed 红 > stale 黄 > 全绿', () => {
    expect(teamSummaryBar([m('a', 'failed')]).health).toBe('red')
    expect(teamSummaryBar([m('a', 'stale')]).health).toBe('amber')
    expect(teamSummaryBar([m('a', 'done')]).health).toBe('green')
    expect(teamSummaryBar([m('a', 'failed'), m('b', 'stale')]).health).toBe('red')
  })

  it('空团队=0 agents·绿', () => {
    const bar = teamSummaryBar([])
    expect(bar.bar).toBe('0 agents')
    expect(bar.health).toBe('green')
  })
})

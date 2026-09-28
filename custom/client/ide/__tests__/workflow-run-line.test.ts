// 工作流运行行模型守门（workflow 集成轮重写版）：workflowActivity 摘要 →
// 行视图（live 优先/确认集合折叠/上界 2 行）、迷你轨道折叠（≤6 全画、±2 窗口、
// 隐含站）、词汇对齐 zcode 五态。锚点 utils/workflow-run-line.ts。
import { describe, it, expect } from 'vitest'
import { buildRunLineViews, foldRunRail, isRunLive, RUN_LINE_MAX_LINES, type RunLineView } from '../utils/workflow-run-line'
import type { ZcodeWorkflowActivity, ZcodeWorkflowRunSummary } from '../../zcode/store/zcode-projection'

const run = (over: Partial<ZcodeWorkflowRunSummary> = {}): ZcodeWorkflowRunSummary => ({
  runId: 'r1', status: 'running', agentsWorking: 0, phases: [], ...over,
})

const act = (...runs: ZcodeWorkflowRunSummary[]): ZcodeWorkflowActivity => ({ runs })

describe('foldRunRail 迷你轨道折叠（zcode foldWorkflowRunRail 语义）', () => {
  it('无 phases → 隐含站（implicit）', () => {
    expect(foldRunRail([])).toEqual({ stations: [], hidden: 0, implicit: true })
  })

  it('≤6 站全画：reached 判定 + alongside 双线标志', () => {
    const rail = foldRunRail([
      { name: '扫描', status: 'done' },
      { name: '采样', status: 'running', alongside: [0] },
      { name: '报告', status: 'pending' },
    ])
    expect(rail.implicit).toBe(false)
    expect(rail.hidden).toBe(0)
    expect(rail.stations).toEqual([
      { name: '扫描', status: 'done', reached: true },
      { name: '采样', status: 'running', reached: true, twin: true },
      { name: '报告', status: 'pending', reached: false },
    ])
  })

  it('>6 站折到运行站 ±2 共 5 站 + hidden 尾数', () => {
    const phases = Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, status: i < 3 ? 'done' as const : 'pending' as const }))
    phases[3] = { name: 'p3', status: 'running' }
    const rail = foldRunRail(phases)
    expect(rail.stations.map((s) => s.name)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(rail.hidden).toBe(4)
  })

  it('>6 站无运行站：中心=最后到过的站', () => {
    const phases = Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, status: i < 2 ? 'done' as const : 'pending' as const }))
    const rail = foldRunRail(phases)
    expect(rail.stations.map((s) => s.name)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })
})

describe('buildRunLineViews 行视图', () => {
  it('live 在前、未确认终态次之、上界 2 行 + hiddenRuns', () => {
    const { lines, hiddenRuns } = buildRunLineViews(act(
      run({ runId: 'done-old', status: 'completed' }),
      run({ runId: 'live-1', status: 'running', name: '重构' }),
      run({ runId: 'done-2', status: 'errored' }),
      run({ runId: 'live-2', status: 'pending' }),
    ))
    expect(lines.map((l) => l.runId)).toEqual(['live-1', 'live-2'])
    expect(hiddenRuns).toBe(2)
    expect(lines[0].label).toBe('重构')
    expect(lines[0].live).toBe(true)
  })

  it('确认集合命中的终态行不进结果（无时钟折叠）', () => {
    const { lines } = buildRunLineViews(
      act(run({ runId: 'seen', status: 'completed' }), run({ runId: 'fresh', status: 'errored' })),
      { confirmedRunIds: new Set(['seen']) },
    )
    expect(lines.map((l) => l.runId)).toEqual(['fresh'])
    expect(lines[0].settled).toBe(false)
  })

  it('label 缺省 Workflow；isRunLive 词汇（pending/running=live）', () => {
    const { lines } = buildRunLineViews(act(run({ runId: 'a', status: 'pending' })))
    expect(lines[0].label).toBe('Workflow')
    expect(isRunLive('running')).toBe(true)
    expect(isRunLive('pending')).toBe(true)
    expect(isRunLive('completed')).toBe(false)
    expect(isRunLive('errored')).toBe(false)
    expect(isRunLive('stopped')).toBe(false)
  })

  it('空摘要/undefined → 零行（组件 v-if 守卫依赖）', () => {
    expect(buildRunLineViews(undefined)).toEqual({ lines: [], hiddenRuns: 0 })
    expect(buildRunLineViews(act())).toEqual({ lines: [], hiddenRuns: 0 })
  })

  it('行数上界常量与 zcode 对齐（2 行）', () => {
    expect(RUN_LINE_MAX_LINES).toBe(2)
  })
})

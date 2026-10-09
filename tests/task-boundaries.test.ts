import { describe, it, expect } from 'vitest'
// 派发边界纪律产品能力守门（过度交付盘查根因③，2026-10-09）：
// 模块在 overlay 正本（产品），本测试绝对路径直取——边界口径/幂等注入/角色推导/
// 模板全节点标注，任一端漂移当场红。
import {
  ROLE_BOUNDARIES, withBoundary, deriveBoundaryRole,
} from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/node-executors/task-boundaries'
import { compileRequirementToGraph } from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/simulation-graph-template'
import { registerSimulationNodeTypes } from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/node-executors/index'

describe('派发边界纪律（task-boundaries 产品能力）', () => {
  it('五种角色边界声明齐备且含关键禁做语', () => {
    const roles = ['analyst', 'dev', 'reviewer', 'tester', 'governance'] as const
    for (const r of roles) expect(ROLE_BOUNDARIES[r].length).toBeGreaterThan(10)
    expect(ROLE_BOUNDARIES.analyst).toContain('禁写实现代码')
    expect(ROLE_BOUNDARIES.dev).toContain('不得直接推 origin/main')
    expect(ROLE_BOUNDARIES.tester).toContain('含 worktree')
    expect(ROLE_BOUNDARIES.governance).toContain('禁做任何代码或文档的集成合并')
  })

  it('withBoundary 幂等注入：带标记不叠加、空 brief 可用', () => {
    const once = withBoundary('做任务 X', 'dev')
    expect(once).toContain('【边界纪律】')
    expect(withBoundary(once, 'dev')).toBe(once)
    expect(withBoundary('', 'analyst')).toContain('【边界纪律】')
  })

  it('角色推导：显式优先；feat/ 产出=dev；文档产出=analyst；review/test 节点各归其位', () => {
    expect(deriveBoundaryRole({ boundaryRole: 'governance' }, 'task')).toBe('governance')
    expect(deriveBoundaryRole({ output: 'feat/DEV-MP' }, 'task')).toBe('dev')
    expect(deriveBoundaryRole({ output: 'docs/analysis/AN-X.md' }, 'task')).toBe('analyst')
    expect(deriveBoundaryRole({}, 'review')).toBe('reviewer')
    expect(deriveBoundaryRole({}, 'test')).toBe('tester')
  })

  it('模板全量标注：编译产物中 agent 任务节点均带 boundaryRole 且角色正确', () => {
    const spec = compileRequirementToGraph({
      title: 't', description: '微信与支付宝收银台小程序，含支付下单',
      modules: ['pay-core', 'channel-wechat'],
    })
    const tasks = spec.nodes.filter((n) => n.type === 'agent-task')
    expect(tasks.length).toBeGreaterThan(4)
    for (const n of tasks) {
      const role = (n.config as Record<string, unknown>).boundaryRole
      expect(['analyst', 'dev', 'governance'], `node ${n.id} role=${role}`).toContain(role)
    }
    const by = (id: string) => spec.nodes.find((n) => n.id === id)!.config as Record<string, unknown>
    expect(by('analysis-pay-core').boundaryRole).toBe('analyst')
    expect(by('coding-pay-core').boundaryRole).toBe('dev')
    expect(by('uat').boundaryRole).toBe('governance')
  })

  it('执行器模块可加载（边界注入接线在位）', () => {
    expect(typeof registerSimulationNodeTypes).toBe('function')
  })
})

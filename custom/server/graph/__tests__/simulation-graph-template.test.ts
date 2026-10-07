// overlay/custom/server/graph/__tests__/simulation-graph-template.test.ts
// 推演图模板守门：结构合法性+并行度验证+编译器输出校验

import { describe, it, expect } from 'vitest'
import { compileRequirementToGraph, defaultSimulationGraph } from '../simulation-graph-template'
import type { GraphSpec } from '../../loop/graph/graph-spec'

describe('推演 GraphSpec 模板', () => {
  const spec = defaultSimulationGraph()

  it('默认模板：四模块 16 节点（每模块 4 节点）+全局 10 节点=26 节点', () => {
    expect(spec.nodes.length).toBe(26)
  })

  it('入口=g1-lock，终止=G6 PASS', () => {
    expect(spec.entryNode).toBe('g1-lock')
    expect(spec.endCondition).toBeDefined()
  })

  it('四模块并行：dispatch 有四条出边到各模块 analysis', () => {
    const dispatchOut = spec.edges.filter(e => e.from === 'dispatch')
    expect(dispatchOut.length).toBe(4)
    expect(dispatchOut.map(e => e.to)).toEqual(
      expect.arrayContaining(['analysis-pay-core', 'analysis-channel-wechat', 'analysis-channel-alipay', 'analysis-cashier-mp']))
  })

  it('fan-in：integration-test 有四条入边来自各模块 testing', () => {
    const integrationIn = spec.edges.filter(e => e.to === 'integration-test')
    expect(integrationIn.length).toBeGreaterThanOrEqual(4)
  })

  it('缺陷回流回边存在且带守卫（有限终止）', () => {
    const backEdges = spec.edges.filter(e => e.guard !== undefined)
    expect(backEdges.length).toBeGreaterThanOrEqual(4) // 每模块一条
    backEdges.forEach(e => {
      expect(e.guard?.maxIterations).toBeGreaterThan(0)
      expect(e.guard?.breakCondition).toBeDefined()
    })
  })

  it('治理三步并发：work-report/audit/retro 入边均来自 g5-release（不等彼此）', () => {
    const govEdges = spec.edges.filter(e =>
      ['work-report', 'audit', 'retro'].includes(e.to))
    expect(govEdges.length).toBe(3)
    govEdges.forEach(e => expect(e.from).toBe('g5-release'))
  })

  it('G6 join=all：等 UAT+三治理步全部完成', () => {
    const g6 = spec.nodes.find(n => n.id === 'g6-final')
    expect(g6?.joinMode).toBe('all')
    const g6In = spec.edges.filter(e => e.to === 'g6-final')
    expect(g6In.length).toBe(4) // uat + work-report + audit + retro
  })

  it('每模块子流水线：analysis→review→coding→testing 四节点串联', () => {
    for (const mod of ['pay-core', 'channel-wechat', 'channel-alipay', 'cashier-mp']) {
      const chain = ['analysis', 'review', 'coding', 'testing']
      for (let i = 0; i < chain.length - 1; i++) {
        const edge = spec.edges.find(e =>
          e.from === `${chain[i]}-${mod}` && e.to === `${chain[i + 1]}-${mod}`)
        expect(edge).toBeDefined()
      }
    }
  })
})

describe('需求→GraphSpec 编译器', () => {
  it('从自然语言需求推导模块并生成合法图', () => {
    const spec = compileRequirementToGraph({
      title: '退款功能',
      description: '支持微信和支付宝退款，含退款核心逻辑和小程序退款入口',
    })
    expect(spec.nodes.length).toBeGreaterThan(10)
    expect(spec.nodes.some(n => n.id.includes('refund') || n.id.includes('pay-core'))).toBe(true)
  })

  it('预指定模块时精确使用', () => {
    const spec = compileRequirementToGraph({
      title: '测试', description: '测试', modules: ['pay-core', 'cashier-mp'],
    })
    const analysisNodes = spec.nodes.filter(n => n.type === 'agent-task' && n.id.startsWith('analysis-'))
    expect(analysisNodes.length).toBe(2)
  })

  it('assignee 映射正确', () => {
    const spec = compileRequirementToGraph({
      title: '测试', description: '测试', modules: ['pay-core'],
      assignees: { 'pay-core': 'hu' },
    })
    const coding = spec.nodes.find(n => n.id === 'coding-pay-core')
    expect(coding?.config.assignee).toBe('hu')
  })
})

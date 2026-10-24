import { describe, it, expect } from 'vitest'
// 推演全流程 GraphSpec 模板守门冒烟（loop-graph 自驱动落实件，2026-10-09）：
// 模板/编译器在 overlay 正本，本测试以绝对路径直取（模板零运行时依赖，type-only
// import 不触发 overlay 缺席的 vitest 依赖树）——模板或 validate 任一端改动当场红。
import { compileRequirementToGraph, defaultSimulationGraph } from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/simulation-graph-template'
import { validateGraphSpec } from '/Users/cuishi/lab/ncwk/overlay/custom/server/loop/graph/graph-spec'
import { appendContractsById } from '/Users/cuishi/lab/ncwk/overlay/custom/server/loop/graph/phase-nodes'
// appendById 是领域 reducer：引擎所有内部调用方（compiler/shadow/assembly）均经
// 第三参注入 {appendById}——校验须同参（REST 端点缺此参的缺口已在 overlay 侧修复）
const DOMAIN_REDUCERS = { appendById: appendContractsById }

describe('loop-graph 自驱动：26 步推演 GraphSpec 模板可编译可校验', () => {
  it('defaultSimulationGraph 通过 validateGraphSpec（引擎侧同一校验器）', () => {
    const spec = defaultSimulationGraph()
    expect(() => validateGraphSpec(spec, DOMAIN_REDUCERS)).not.toThrow()
    expect(spec.entryNode).toBe('g1-lock')
    // 终点钉新值（2026-10-21 对齐）：overlay 3939e804（产品内导演台轮）把模板线性化为
    // 29 节点、终点由 g6_verdict 改为「G6 终闸批准」恢复标记——引擎校验器同步认可。
    // 本行继续强钉具体值：模板终点再变时此处仍当场红，逼两侧对账。
    expect(spec.endCondition.path).toBe('__resume:g6-final-gate.approved')
    expect(spec.nodes.length).toBeGreaterThan(10)
    expect(spec.edges.length).toBeGreaterThan(10)
  })

  it('需求→图编译器：RFD-001 形态输入产出合法 spec（四模块并行流水）', () => {
    const spec = compileRequirementToGraph({
      title: '收单商户多端小程序支付收银台',
      description: '微信/支付宝双渠道支付收银台，含支付核心/渠道适配/小程序前端',
      modules: ['pay-core', 'channel-wechat', 'channel-alipay', 'cashier-mp'],
      assignees: { 'pay-core': 'chen', 'channel-wechat': 'hu', 'channel-alipay': 'lin', 'cashier-mp': 'xiao' },
    })
    expect(() => validateGraphSpec(spec, DOMAIN_REDUCERS)).not.toThrow()
    // 边引用完整性（validateGraphSpec 内部如有等价断言则冗余无害）
    const ids = new Set(spec.nodes.map((n) => n.id))
    for (const e of spec.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
    }
  })

  it('需求关键词推导：无预指定模块时从描述推导四模块', () => {
    const spec = compileRequirementToGraph({
      title: 't',
      description: '微信与支付宝收银台小程序，含支付下单',
    })
    expect(() => validateGraphSpec(spec, DOMAIN_REDUCERS)).not.toThrow()
    expect(spec.description).toContain('模块并行流水')
  })
})

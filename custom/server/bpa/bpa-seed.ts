/**
 * 流程架构示例种子（bpa）：SwarmStudio 自身多智能体研发交付的示范架构。
 * 全合规（体检零高危）——示范「治理到 L3、责任到 Owner、指标到 KPI、链路到
 * 端到端」的终态长相；用户后续改动自然触发体检规则（产品叙事：机制约束）。
 * OES 分区遵循文章：战略/供应链类间接面向客户 → 使能（ENABLING）。
 */
import type { BpaNode } from './bpa-types'
import type { BpaArchitecture } from './bpa-store'
import { BPA_DEFAULT_CONFIG } from './bpa-types'

interface SeedRow {
  id: string
  name: string
  level: number
  parentId: string | null
  section?: BpaNode['section']
  owner?: string
  kpis?: BpaNode['kpis']
  inputs?: string[]
  outputs?: string[]
  drivers?: string[]
  supports?: string[]
  decomposition?: BpaNode['decomposition']
  pcfRef?: string
}

const ROWS: SeedRow[] = [
  // ===== O 运营（直接面向客户价值）=====
  { id: 'L1-01', name: '需求交付', level: 1, parentId: null, section: 'OPERATING', owner: '交付负责人', decomposition: 'functional', pcfRef: '4.0' },
  { id: 'L2-01-01', name: '需求分析', level: 2, parentId: 'L1-01', owner: '需求分析组长', decomposition: 'scenario' },
  { id: 'L3-01-01-01', name: '需求澄清与验收标准', level: 3, parentId: 'L2-01-01', owner: '需求分析师A',
    kpis: [{ name: '验收标准一次通过率', target: '≥90%', unit: '%' }], inputs: ['用户指令/工单'], outputs: ['AC 清单'], supports: ['L3-01-02-01'] },
  { id: 'L2-01-02', name: '开发实现', level: 2, parentId: 'L1-01', owner: '开发组长', decomposition: 'functional' },
  { id: 'L3-01-02-01', name: '代码实现与自测', level: 3, parentId: 'L2-01-02', owner: '开发工程师A',
    kpis: [{ name: '评审一次通过率', target: '≥80%', unit: '%' }], inputs: ['AC 清单'], outputs: ['PR'], drivers: ['L3-01-01-01'], supports: ['L3-01-03-01', 'L3-03-01-01'] },
  { id: 'L2-01-03', name: '质量验证', level: 2, parentId: 'L1-01', owner: '测试组长', decomposition: 'pdca' },
  { id: 'L3-01-03-01', name: '测试与验收', level: 3, parentId: 'L2-01-03', owner: '测试工程师A',
    kpis: [{ name: '缺陷逃逸率', target: '≤2%', unit: '%' }], inputs: ['PR'], outputs: ['验收报告'], drivers: ['L3-01-02-01'] },
  { id: 'L1-02', name: '缺陷修复', level: 1, parentId: null, section: 'OPERATING', owner: '交付负责人', decomposition: 'lifecycle', pcfRef: '5.0' },
  { id: 'L2-02-01', name: '缺陷处置', level: 2, parentId: 'L1-02', owner: '开发组长', decomposition: 'lifecycle' },
  { id: 'L3-02-01-01', name: '缺陷修复闭环', level: 3, parentId: 'L2-02-01', owner: '开发工程师B',
    kpis: [{ name: '修复周期', target: '≤24', unit: 'h' }], inputs: ['缺陷单'], outputs: ['回归通过记录'], drivers: ['L3-01-03-01'] },
  // ===== E 使能（间接面向客户：安全/环境由交付链牵引，非客户直接驱动）=====
  { id: 'L1-03', name: '安全与合规', level: 1, parentId: null, section: 'ENABLING', owner: '安全官', decomposition: 'pdca', pcfRef: '10.0' },
  { id: 'L2-03-01', name: '安全评审', level: 2, parentId: 'L1-03', owner: '安全官', decomposition: 'pdca' },
  { id: 'L3-03-01-01', name: '安全复审', level: 3, parentId: 'L2-03-01', owner: '安全评审AI',
    kpis: [{ name: '高危项清零率', target: '=100%', unit: '%' }], inputs: ['PR'], outputs: ['评审意见'], drivers: ['L3-01-02-01'] },
  { id: 'L1-04', name: '运维保障', level: 1, parentId: null, section: 'ENABLING', owner: '平台负责人', decomposition: 'lifecycle', pcfRef: '7.0' },
  { id: 'L2-04-01', name: '环境治理', level: 2, parentId: 'L1-04', owner: '平台负责人', decomposition: 'lifecycle' },
  { id: 'L3-04-01-01', name: '环境准备与巡检', level: 3, parentId: 'L2-04-01', owner: '运维工程师',
    kpis: [{ name: '环境可用率', target: '≥99%', unit: '%' }], inputs: ['部署单'], outputs: ['健康快照'], supports: ['L3-01-02-01'] },
  // ===== S 支撑（基础保障）=====
  { id: 'L1-05', name: '能力与知识治理', level: 1, parentId: null, section: 'SUPPORTING', owner: '知识官', decomposition: 'lifecycle', pcfRef: '12.0' },
  { id: 'L2-05-01', name: '技能与术语治理', level: 2, parentId: 'L1-05', owner: '知识官', decomposition: 'lifecycle' },
  { id: 'L3-05-01-01', name: '技能与本体治理', level: 3, parentId: 'L2-05-01', owner: '知识工程师',
    kpis: [{ name: '术语覆盖率', target: '≥95%', unit: '%' }], inputs: ['复盘报告'], outputs: ['技能/词条版本'], drivers: ['L3-02-01-01'] },
  { id: 'L1-06', name: '财务与预算', level: 1, parentId: null, section: 'SUPPORTING', owner: '财务负责人', decomposition: 'functional', pcfRef: '8.0' },
  { id: 'L2-06-01', name: '预算执行', level: 2, parentId: 'L1-06', owner: '财务负责人', decomposition: 'functional' },
  { id: 'L3-06-01-01', name: '预算与成本核算', level: 3, parentId: 'L2-06-01', owner: '财务分析师',
    kpis: [{ name: '预算偏差', target: '≤10%', unit: '%' }], inputs: ['用量台账'], outputs: ['成本月报'], supports: ['L3-01-02-01'] },
]

export function seedArchitecture(): BpaArchitecture {
  const now = Date.now()
  const nodes: BpaNode[] = ROWS.map((r) => ({
    id: r.id,
    name: r.name,
    level: r.level as BpaNode['level'],
    parentId: r.parentId,
    ...(r.section ? { section: r.section } : {}),
    ...(r.owner ? { owner: r.owner } : {}),
    ...(r.kpis ? { kpis: r.kpis } : {}),
    ...(r.inputs ? { inputs: r.inputs } : {}),
    ...(r.outputs ? { outputs: r.outputs } : {}),
    ...(r.drivers ? { drivers: r.drivers } : {}),
    ...(r.supports ? { supports: r.supports } : {}),
    ...(r.decomposition ? { decomposition: r.decomposition } : {}),
    ...(r.pcfRef ? { pcfRef: r.pcfRef } : {}),
    updatedAt: now,
  }))
  return { config: { ...BPA_DEFAULT_CONFIG }, nodes, updatedAt: now }
}

/**
 * 流程架构域类型面（bpa）：APQC PCF 分级 + 流程地图构图法 + PEMM 成熟度。
 * 方法论正本=specs/2026-10-14-bpa-process-architecture-spec.md（来源文章
 * 《企业级流程架构方法论》2026-10-13）。本文件只放类型与常量，不放行为。
 */

/** 流程地图分区（构图法维度，仅作用于 L1，不进入分级清单）。 */
export type BpaSection = 'OPERATING' | 'ENABLING' | 'SUPPORTING' | 'MANAGING'

/** L1→L2/L3 的分解逻辑标注（行业四种，保证 MECE 的拆解依据）。 */
export type BpaDecomposition = 'lifecycle' | 'pdca' | 'functional' | 'scenario'

/** PCF 分级：L1/L2=分类层级（一组流程），L3=一条流程，L4/L5/L6=拆解层级（华为六级兼容）。 */
export type BpaLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface BpaKpi {
  name: string
  target: string
  unit?: string
}

export interface BpaNode {
  /** 编号字典：^L[1-6](-[0-9]{2}){level-1}$，如 L3-06-02-01（文章：统一编号=统一工作语言） */
  id: string
  name: string
  level: BpaLevel
  parentId: string | null
  /** 仅 L1：流程地图分区（OES/POS/MOS 构图） */
  section?: BpaSection
  /** 仅 L1：APQC PCF 对标映射（如 "4.0"，显式映射优先于名称启发） */
  pcfRef?: string
  /** L1-L3 强制（治理规则 MISSING_OWNER） */
  owner?: string
  /** L3 治理主战场（治理规则 MISSING_KPI） */
  kpis?: BpaKpi[]
  /** 输入输出衔接：跨流程交接物（系统/单据/表单） */
  inputs?: string[]
  outputs?: string[]
  /** L3 间引用：哪些流程驱动我 / 我支撑哪些流程（治理规则 ORPHAN 断链） */
  drivers?: string[]
  supports?: string[]
  decomposition?: BpaDecomposition
  note?: string
  updatedAt: number
}

export type BpaFramework = 'OES+PCF6' | 'POS+PCF5' | 'MOS+PCF5' | 'OMS+PCF5'

export interface BpaConfig {
  framework: BpaFramework
  /** 构图法分区序列（仅地图呈现用） */
  mapSections: BpaSection[]
  maxDepth: number
  forbidSkippingLevel: boolean
  requireEndToEnd: boolean
  requireL3Owner: boolean
  requireL3Kpi: boolean
  /** 架构评审周期（天）——文章治理 YAML 的 reviewCycleDays */
  reviewCycleDays: number
}

export type BpaRuleCode =
  | 'MISSING_OWNER'
  | 'MISSING_KPI'
  | 'ORPHAN_L3'
  | 'DEPTH_EXCEEDED'
  | 'LEVEL_SKIP'
  | 'BAD_ID'
  | 'SECTION_INVALID'
  | 'DANGLING_REF'

export interface BpaViolation {
  rule: BpaRuleCode
  severity: 'high' | 'medium'
  nodeId: string
  nodeName: string
  detail: string
}

export interface BpaValidationReport {
  checkedAt: number
  nodes: number
  l3Count: number
  violations: BpaViolation[]
  bySeverity: { high: number; medium: number }
  /** L1-L3 Owner 落位率（%），架构终点是责任与指标的量化面 */
  ownerCoverage: number
  /** L3 KPI 覆盖率（%） */
  kpiCoverage: number
}

export const BPA_FRAMEWORK_SECTIONS: Record<BpaFramework, BpaSection[]> = {
  'OES+PCF6': ['OPERATING', 'ENABLING', 'SUPPORTING'],
  'POS+PCF5': ['MANAGING', 'OPERATING', 'SUPPORTING'], // P(规划)=MANAGING 区承载，呈现序 P/O/S
  'MOS+PCF5': ['MANAGING', 'OPERATING', 'SUPPORTING'],
  'OMS+PCF5': ['OPERATING', 'MANAGING'], // O/MS 二分：MS=管理+支撑合并区
}

export const BPA_DEFAULT_CONFIG: BpaConfig = {
  framework: 'OES+PCF6',
  mapSections: BPA_FRAMEWORK_SECTIONS['OES+PCF6'],
  maxDepth: 6,
  forbidSkippingLevel: true,
  requireEndToEnd: true,
  requireL3Owner: true,
  requireL3Kpi: true,
  reviewCycleDays: 180,
}

// ---------- PEMM 成熟度（哈默模型：5 能动因素 + 4 企业能力，P0-P4） ----------

export type PemmFactorKey =
  | 'design' | 'staff' | 'owner' | 'infrastructure' | 'metrics'
  | 'leadership' | 'culture' | 'expertise' | 'governance'

export interface PemmFactorDef {
  key: PemmFactorKey
  /** 板块：enabler=流程能动因素（单流程），capability=企业能力（组织渗透） */
  board: 'enabler' | 'capability'
  nameZh: string
  nameEn: string
  /** 评估要点（文章 PEMM 变量表的浓缩） */
  focusZh: string
}

export const PEMM_FACTORS: PemmFactorDef[] = [
  { key: 'design', board: 'enabler', nameZh: '流程设计', nameEn: 'Process Design', focusZh: '目的、环境与文档：流程目标是否清晰、是否适配环境、文档是否完备' },
  { key: 'staff', board: 'enabler', nameZh: '流程员工', nameEn: 'Process Staff', focusZh: '知识、技能与行为：执行人员是否具备相应能力与正确态度' },
  { key: 'owner', board: 'enabler', nameZh: '流程所有者', nameEn: 'Process Owner', focusZh: '身份、活动与权力：是否明确负责人及其职责权限' },
  { key: 'infrastructure', board: 'enabler', nameZh: '基础设施', nameEn: 'Infrastructure', focusZh: '信息系统与人力系统：支撑流程运转的软硬件与人力保障' },
  { key: 'metrics', board: 'enabler', nameZh: '流程指标', nameEn: 'Process Metrics', focusZh: '定义与运用：衡量流程绩效的标准是否明确且被有效使用' },
  { key: 'leadership', board: 'capability', nameZh: '领导力', nameEn: 'Leadership', focusZh: '高层是否真正重视并推动流程管理' },
  { key: 'culture', board: 'capability', nameZh: '文化', nameEn: 'Culture', focusZh: '以客户为中心、责任、团队合作与对待变革的态度' },
  { key: 'expertise', board: 'capability', nameZh: '专业技能', nameEn: 'Expertise', focusZh: '流程建模与改进的方法能力' },
  { key: 'governance', board: 'capability', nameZh: '治理', nameEn: 'Governance', focusZh: '问责机制与整合机制是否到位' },
]

export const PEMM_LEVELS: Array<{ level: 0 | 1 | 2 | 3 | 4; nameZh: string; descZh: string }> = [
  { level: 0, nameZh: 'P0 不稳定流程', descZh: '流程运行无法持续稳定' },
  { level: 1, nameZh: 'P1 部门级专业流程', descZh: '流程较为可靠、容易预测，但仍是部门视角' },
  { level: 2, nameZh: 'P2 卓越绩效流程', descZh: '企业已开始面向客户端到端设计流程' },
  { level: 3, nameZh: 'P3 最优流程', descZh: '高管在战略目标统领下整合了企业内部流程' },
  { level: 4, nameZh: 'P4 最佳流程', descZh: '流程已超越企业界限，延伸到供应商、合作伙伴与下游客户' },
]

export interface PemmAssessment {
  id: string
  scoredAt: number
  /** 各因素 P0-P4 分值（0-4） */
  scores: Partial<Record<PemmFactorKey, number>>
  note?: string
}

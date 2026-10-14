/**
 * 流程架构治理体检（bpa）：把文章第八节「启动校验器」产品化为可交互体检面。
 * 核心理念（原文）：流程架构不是靠自觉维护的，是靠机制约束的——缺 Owner、缺
 * KPI、断链、层级过深，都应是一眼可见的硬约束。
 * 规则八条：缺Owner/缺KPI/断链孤岛/超深/跨级/编号非法/分区非法/引用悬空。
 */
import type {
  BpaNode, BpaRuleCode, BpaValidationReport, BpaViolation,
} from './bpa-types'
import type { BpaArchitecture } from './bpa-store'
import { isValidNodeId } from './bpa-store'

function isBlank(s?: string): boolean {
  return !s || s.trim().length === 0
}

export function validateArchitecture(arch: BpaArchitecture): BpaValidationReport {
  const { config, nodes } = arch
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const violations: BpaViolation[] = []
  const push = (rule: BpaRuleCode, severity: BpaViolation['severity'], n: BpaNode, detail: string): void => {
    violations.push({ rule, severity, nodeId: n.id, nodeName: n.name, detail })
  }

  for (const n of nodes) {
    // 1. 缺 Owner：L1/L2 恒检（原则四：流程组与第一层流程必须有 Owner）；L3 受配置门控
    const ownerRequired = n.level <= 2 || (n.level === 3 && config.requireL3Owner)
    if (ownerRequired && isBlank(n.owner)) {
      push('MISSING_OWNER', 'high', n, `L${n.level} 缺流程所有者（Owner）——没人扛旗，架构就是废纸`)
    }
    // 2. 缺 KPI：L3 治理主战场必须有绩效指标
    if (n.level === 3 && config.requireL3Kpi && (!n.kpis || n.kpis.length === 0)) {
      push('MISSING_KPI', 'high', n, 'L3 流程缺 KPI——每条流程都应能回答「考核什么」')
    }
    // 3. 断链孤岛：L3 无驱动、无支撑、无输入、无输出 → 未接入任何端到端链路
    if (n.level === 3 && config.requireEndToEnd) {
      const linked = (n.drivers?.length ?? 0) + (n.supports?.length ?? 0) + (n.inputs?.length ?? 0) + (n.outputs?.length ?? 0)
      if (linked === 0) push('ORPHAN_L3', 'high', n, 'L3 未接入任何端到端链路（无输入输出、无驱动支撑引用）——谁都不对全程负责的切片')
    }
    // 4. 超深
    if (n.level > config.maxDepth) {
      push('DEPTH_EXCEEDED', 'high', n, `层级 L${n.level} 超过上限 L${config.maxDepth}`)
    }
    // 5. 跨级 + 父引用悬空
    if (n.level > 1) {
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      if (!parent) {
        push('DANGLING_REF', 'high', n, n.parentId ? `父节点 ${n.parentId} 不存在` : 'L>1 缺父节点')
      } else if (config.forbidSkippingLevel && parent.level !== n.level - 1) {
        push('LEVEL_SKIP', 'high', n, `跨级悬挂：L${n.level} 直挂 L${parent.level}（${parent.id}）`)
      }
    }
    // 6. 编号非法（导入/手改文件的兜底；upsert 已在写入点拦截）
    if (!isValidNodeId(n.id, n.level)) {
      push('BAD_ID', 'medium', n, `编号 ${n.id} 与层级 L${n.level} 不匹配（统一编号=统一工作语言）`)
    }
    // 7. 分区：L1 必须有分区且在构图法分区集内；非 L1 不得带分区
    if (n.level === 1) {
      if (!n.section || !config.mapSections.includes(n.section)) {
        push('SECTION_INVALID', 'medium', n, `L1 分区缺失或不在 ${config.framework} 分区集内（流程地图按构图法分区）`)
      }
    } else if (n.section) {
      push('SECTION_INVALID', 'medium', n, '分区只作用于 L1（分类法管图怎么画，不进分级清单）')
    }
    // 8. 引用悬空：drivers/supports 指向不存在的流程
    for (const ref of [...(n.drivers ?? []), ...(n.supports ?? [])]) {
      if (!byId.has(ref)) push('DANGLING_REF', 'medium', n, `引用的流程 ${ref} 不存在（驱动/支撑引用悬空）`)
    }
    // 9. L1 缺 PCF 映射（对标盲区显式化：pcfRef 未设且名称启发未命中任何 PCF 分类）
    if (n.level === 1 && !n.pcfRef) {
      push('PCF_UNMAPPED', 'medium', n, `L1 未映射 PCF 分类（对标页将走名称启发兜底——显式 pcfRef 更可靠）`)
    }
  }

  // 覆盖率（量化面：架构的终点是责任与指标，不是图）
  const governed = nodes.filter((n) => n.level <= 3)
  const ownerCoverage = governed.length === 0 ? 0 : Math.round((governed.filter((n) => !isBlank(n.owner)).length / governed.length) * 100)
  const l3s = nodes.filter((n) => n.level === 3)
  const kpiCoverage = l3s.length === 0 ? 0 : Math.round((l3s.filter((n) => (n.kpis?.length ?? 0) > 0).length / l3s.length) * 100)

  return {
    checkedAt: Date.now(),
    nodes: nodes.length,
    l3Count: l3s.length,
    violations: violations.sort((a, b) => (a.severity === b.severity ? a.nodeId.localeCompare(b.nodeId) : a.severity === 'high' ? -1 : 1)),
    bySeverity: {
      high: violations.filter((v) => v.severity === 'high').length,
      medium: violations.filter((v) => v.severity === 'medium').length,
    },
    ownerCoverage,
    kpiCoverage,
  }
}

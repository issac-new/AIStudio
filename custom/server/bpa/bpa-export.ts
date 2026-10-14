/**
 * 流程架构报告导出（bpa export）：架构清单+流程地图+治理体检+端到端链路+
 * PCF 对标+PEMM 最近评估 → 一份自包含 Markdown（ontology-export 同款交付文化；
 * 报告=架构的镜子：Owner/KPI/链路/差距四账全落纸）。
 */
import type { BpaArchitecture } from './bpa-store'
import type { BpaValidationReport } from './bpa-types'
import { PEMM_FACTORS } from './bpa-types'
import { enumerateE2E } from './bpa-e2e'
import { pcfGapReport } from './bpa-pcf'
import type { PemmAssessment } from './bpa-types'

const SECTION_ZH: Record<string, string> = {
  OPERATING: 'O 运营', ENABLING: 'E 使能', SUPPORTING: 'S 支撑', MANAGING: 'M 管理',
}
const DECOMP_ZH: Record<string, string> = {
  lifecycle: '生命周期法', pdca: 'PDCA 法', functional: '功能分解法', scenario: '场景分解法',
}

export function exportArchitectureMarkdown(
  arch: BpaArchitecture,
  report: BpaValidationReport,
  maturity: PemmAssessment | null,
): string {
  const L: string[] = []
  const nodes = [...arch.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const nameOf = (id: string): string => nodes.find((n) => n.id === id)?.name ?? id
  const c = arch.config

  L.push(`# 流程架构报告`)
  L.push('')
  L.push(`- 构图法与分级：${c.framework}（分区 ${c.mapSections.join(' / ')}；层级上限 L${c.maxDepth}${c.forbidSkippingLevel ? '，禁跨级' : ''}）`)
  L.push(`- 体检结论：高危 ${report.bySeverity.high} 项、注意 ${report.bySeverity.medium} 项；Owner 落位率 ${report.ownerCoverage}%（L1-L3）、KPI 覆盖率 ${report.kpiCoverage}%（L3）`)
  L.push(`- 架构评审周期：${c.reviewCycleDays} 天`)
  L.push(`- 节点 ${report.nodes} 个，其中 L3 流程 ${report.l3Count} 条（回答「有几条流程」数这里）`)
  L.push('')

  // 一、流程分级清单
  L.push(`## 一、流程分级清单`)
  L.push('')
  L.push(`| 编号 | 名称 | 层级 | Owner | KPI | 输入 | 输出 | 驱动 | 支撑 |`)
  L.push(`|---|---|---|---|---|---|---|---|---|`)
  for (const n of nodes) {
    const kpi = (n.kpis ?? []).map((k) => `${k.name}${k.target ? ` ${k.target}` : ''}${k.unit ?? ''}`).join('；')
    L.push(`| ${n.id} | ${n.name}${n.decomposition ? `（${DECOMP_ZH[n.decomposition] ?? n.decomposition}）` : ''} | L${n.level}${n.section ? ` ${SECTION_ZH[n.section]}` : ''} | ${n.owner ?? '—'} | ${kpi || '—'} | ${(n.inputs ?? []).join('，') || '—'} | ${(n.outputs ?? []).join('，') || '—'} | ${(n.drivers ?? []).join('，') || '—'} | ${(n.supports ?? []).join('，') || '—'} |`)
  }
  L.push('')

  // 二、流程地图
  L.push(`## 二、L1 流程地图（${c.framework}）`)
  L.push('')
  for (const s of c.mapSections) {
    const l1s = nodes.filter((n) => n.level === 1 && n.section === s)
    L.push(`### ${SECTION_ZH[s] ?? s}`)
    if (l1s.length === 0) { L.push('（该分区暂无 L1 流程类）'); L.push(''); continue }
    for (const l1 of l1s) {
      const groups = nodes.filter((n) => n.parentId === l1.id)
      L.push(`- **${l1.id} ${l1.name}**（Owner：${l1.owner ?? '—'}${l1.pcfRef ? `；PCF ${l1.pcfRef}` : ''}）`)
      for (const g of groups) {
        const l3s = nodes.filter((n) => n.parentId === g.id)
        L.push(`  - ${g.id} ${g.name}（${l3s.length} 条 L3）`)
      }
    }
    L.push('')
  }

  // 三、治理体检
  L.push(`## 三、治理体检（八规则）`)
  L.push('')
  if (report.violations.length === 0) {
    L.push('体检通过：零违规。')
  } else {
    L.push(`| 级别 | 规则 | 节点 | 说明 |`)
    L.push(`|---|---|---|---|`)
    for (const v of report.violations) {
      L.push(`| ${v.severity === 'high' ? '高危' : '注意'} | ${v.rule} | ${v.nodeId} ${v.nodeName} | ${v.detail} |`)
    }
  }
  L.push('')

  // 四、端到端链路
  const e2e = enumerateE2E(arch.nodes)
  L.push(`## 四、端到端链路`)
  L.push('')
  if (e2e.paths.length === 0) {
    L.push('暂无端到端路径。')
  } else {
    L.push(`共 ${e2e.paths.length} 条（按跳数取前 12 条）：`)
    L.push('')
    e2e.paths.slice(0, 12).forEach((p, i) => {
      const handoff = p.handoffs.map((h) => h ?? '⚠缺交接物').join(' → ')
      L.push(`${i + 1}. ${p.steps.map((s) => `${nameOf(s)}（${s}）`).join(' → ')}`)
      L.push(`   - 交接物：${handoff}`)
    })
  }
  if (e2e.unlinkedL3.length) L.push(`- 孤岛 L3：${e2e.unlinkedL3.join('、')}`)
  if (e2e.strandedL3.length) L.push(`- 断头节点：${e2e.strandedL3.join('、')}`)
  if (e2e.cycleL3.length) L.push(`- 环路：${e2e.cycleL3.join('、')}`)
  L.push('')

  // 五、PCF 对标
  const gap = pcfGapReport(nodes.filter((n) => n.level === 1).map((n) => ({ id: n.id, name: n.name, ...(n.pcfRef ? { pcfRef: n.pcfRef } : {}) })))
  L.push(`## 五、APQC PCF 对标`)
  L.push('')
  L.push(`覆盖 ${gap.summary.covered}/${gap.summary.total} 类。${gap.summary.missing > 0 ? `差距（先判断是否属本企业业务，再补建或裁剪——照搬不裁剪是第一大误区）：${gap.rows.filter((r) => r.status === 'missing').map((r) => `${r.code} ${r.nameZh}`).join('；')}` : '无差距。'}`)
  if (gap.unmappedMine.length) L.push(`未映射 PCF 的自有域：${gap.unmappedMine.map((u) => `${u.id} ${u.name}`).join('；')}`)
  L.push('')

  // 六、PEMM 最近评估
  L.push(`## 六、PEMM 成熟度（最近评估）`)
  L.push('')
  if (!maturity) {
    L.push('尚未评估。')
  } else {
    const vals = Object.entries(maturity.scores).filter(([k]) => PEMM_FACTORS.some((f) => f.key === k))
    const overall = Math.min(...vals.map(([, v]) => v))
    L.push(`- 时间：${new Date(maturity.scoredAt).toLocaleString('zh-CN')}；总体成熟度（短板决定）：P${overall}`)
    for (const f of PEMM_FACTORS) {
      const v = maturity.scores[f.key]
      if (v === undefined) continue
      L.push(`- ${f.board === 'enabler' ? '能动因素' : '企业能力'} · ${f.nameZh}：P${v}`)
    }
    if (maturity.note) L.push(`- 备注：${maturity.note}`)
  }
  L.push('')
  L.push(`> 流程架构不是靠自觉维护的，是靠机制约束的；架构的终点是责任与指标，不是图。`)
  return L.join('\n') + '\n'
}

/**
 * APQC PCF 跨行业参照集（bpa 对标面，精简版）：统一流程语言 + 对标找差距
 * （文章 §3.1：PCF 核心价值=统一语言/分层拆解/支撑对标与治理；§7.3 第一步
 * 现状盘点与架构诊断）。L1 十二分类 + 各分类代表性 L2；对标=我的 L1 映射
 * （pcfRef 显式映射优先，名称包含启发兜底）→ 覆盖/部分/缺失 三态。
 * 参照内容按 PCF 跨行业通用结构整理（编号沿用行业惯用 1.0-12.0 段），
 * 精简为对标可用的粒度，非逐条 PCF 授权原文。
 */

export interface PcfL1Category {
  code: string
  nameZh: string
  nameEn: string
  /** 代表性 L2 流程组（中文名） */
  groupsZh: string[]
  /** 与流程地图分区的大致对应（OES 语感，供呈现参考） */
  section: 'OPERATING' | 'ENABLING' | 'SUPPORTING'
}

export const PCF_CATEGORIES: PcfL1Category[] = [
  { code: '1.0', nameZh: '制定愿景与战略', nameEn: 'Develop Vision and Strategy', groupsZh: ['确定业务方向', '制定企业战略', '建立与管理战略执行'], section: 'ENABLING' },
  { code: '2.0', nameZh: '开发与管理产品与服务', nameEn: 'Develop and Manage Products and Services', groupsZh: ['管理产品与服务组合', '开发新产品与服务', '产品生命周期管理'], section: 'OPERATING' },
  { code: '3.0', nameZh: '营销与销售产品与服务', nameEn: 'Market and Sell Products and Services', groupsZh: ['理解市场与客户', '制定营销策略', '管理销售机会与订单'], section: 'OPERATING' },
  { code: '4.0', nameZh: '交付产品与服务', nameEn: 'Deliver Products and Services', groupsZh: ['计划与履约交付', '提供客户交付', '管理交付质量'], section: 'OPERATING' },
  { code: '5.0', nameZh: '管理客户服务', nameEn: 'Manage Customer Service', groupsZh: ['建立客户服务策略', '处理客户请求', '处理客户问题与缺陷'], section: 'OPERATING' },
  { code: '6.0', nameZh: '开发与管理人力资本', nameEn: 'Develop and Manage Human Capital', groupsZh: ['人力资源规划', '招聘与配置', '能力发展与绩效'], section: 'SUPPORTING' },
  { code: '7.0', nameZh: '管理信息技术', nameEn: 'Manage Information Technology', groupsZh: ['IT 战略与治理', '开发与运维系统', '管理安全与数据保护'], section: 'ENABLING' },
  { code: '8.0', nameZh: '管理财务资源', nameEn: 'Manage Financial Resources', groupsZh: ['预算与财务规划', '核算与报告', '管理应收应付与资金'], section: 'SUPPORTING' },
  { code: '9.0', nameZh: '获取、建设与管理资产', nameEn: 'Acquire, Construct, and Manage Assets', groupsZh: ['资本规划', '采购与供应商管理', '资产管理与处置'], section: 'SUPPORTING' },
  { code: '10.0', nameZh: '管理企业风险、合规与整改', nameEn: 'Manage Enterprise Risk, Compliance, and Remediation', groupsZh: ['风险与合规管理', '内控与审计', '整改与问责'], section: 'ENABLING' },
  { code: '11.0', nameZh: '管理外部关系', nameEn: 'Manage External Relationships', groupsZh: ['股东与投资者关系', '伙伴与联盟管理', '公共与社区关系'], section: 'ENABLING' },
  { code: '12.0', nameZh: '开发与管理业务能力与知识', nameEn: 'Develop and Manage Business Capabilities and Knowledge', groupsZh: ['能力与知识管理', '流程治理与改进', '变革管理'], section: 'SUPPORTING' },
]

export interface PcfCoverageRow {
  code: string
  nameZh: string
  nameEn: string
  groupsZh: string[]
  section: PcfL1Category['section']
  /** 我方映射到的 L1（id+名） */
  matched: Array<{ id: string; name: string; by: 'ref' | 'name' }>
  status: 'covered' | 'missing'
}

export interface PcfGapReport {
  rows: PcfCoverageRow[]
  summary: { total: number; covered: number; missing: number }
  /** 未映射到任何 PCF 分类的我方 L1（自成一域，提示裁剪/归类判断） */
  unmappedMine: Array<{ id: string; name: string }>
}

const ALIAS: Record<string, string[]> = {
  '1.0': ['战略', '愿景', '规划'],
  '2.0': ['产品', '研发', '需求', '设计'],
  '3.0': ['营销', '销售', '市场'],
  '4.0': ['交付', '履约', '订单', '实施'],
  '5.0': ['客户服务', '客服', '缺陷', '售后', '维护服务'],
  '6.0': ['人力', '招聘', '人事'],
  '7.0': ['信息技术', '运维', '环境', '系统', 'IT'],
  '8.0': ['财务', '预算', '成本'],
  '9.0': ['资产', '采购', '供应商', '设施'],
  '10.0': ['风险', '合规', '安全', '审计'],
  '11.0': ['外部关系', '伙伴', '公共'],
  '12.0': ['知识', '能力', '流程治理', '改进', '变革'],
}

/** 对标：pcfRef 显式映射优先；否则名称/别名包含启发（文章误区一警示：照搬不裁剪不可取，启发匹配只出建议态）。 */
export function pcfGapReport(l1s: Array<{ id: string; name: string; pcfRef?: string }>): PcfGapReport {
  const rows: PcfCoverageRow[] = PCF_CATEGORIES.map((c) => {
    const matched: PcfCoverageRow['matched'] = []
    for (const n of l1s) {
      if (n.pcfRef === c.code) matched.push({ id: n.id, name: n.name, by: 'ref' })
    }
    if (matched.length === 0) {
      for (const n of l1s) {
        if (n.pcfRef) continue // 已显式映射到别处的不再启发
        const hit = (ALIAS[c.code] ?? []).some((kw) => n.name.includes(kw)) || n.name.includes(c.nameZh.slice(0, 2))
        if (hit) matched.push({ id: n.id, name: n.name, by: 'name' })
      }
    }
    return {
      code: c.code, nameZh: c.nameZh, nameEn: c.nameEn, groupsZh: c.groupsZh, section: c.section,
      matched,
      status: matched.length > 0 ? 'covered' : 'missing',
    }
  })
  const mappedIds = new Set(rows.flatMap((r) => r.matched.map((m) => m.id)))
  return {
    rows,
    summary: {
      total: rows.length,
      covered: rows.filter((r) => r.status === 'covered').length,
      missing: rows.filter((r) => r.status === 'missing').length,
    },
    unmappedMine: l1s.filter((n) => !mappedIds.has(n.id)).map((n) => ({ id: n.id, name: n.name })),
  }
}

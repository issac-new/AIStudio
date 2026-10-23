// overlay[eval] 经营语言摘要（京东评测体系吸收轮·立项批，2026-10-23）。
//
// 范式来源：《京东 Agent 评测体系技术拆解》实践⑦「评测结果翻译成经营语言」——
// 「评测结论直接写成 GMV 增量/转化率，评测和经营说同一套话，跨部门沟通零折算；
// 让业务方听得懂评测，评测才进得了决策」。本仓没有 GMV 口径，对应物=把运行
// 读数合成为决策者三句话：能不能发布、质量成本几何、修什么最值。
//
// 形态纪律：后端只出结构化事实（verdict + facts[key,params]），句子由前端
// i18n 词条组装（双语免费）；数字缺席如实缺席（facts 里不出现的键=该读数无
// 数据），不造数。纯函数。
import type { EvalRun } from './types'

/** 发布裁决三态（决策者第一句）。 */
export type BizVerdict = 'releasable' | 'blocked' | 'insufficient'

export interface BizFact {
  /** 事实键（前端 i18n biz.facts.<key> 渲染；params 为句子插值参数）。 */
  key: string
  params: Record<string, string | number>
}

export interface BusinessSummary {
  verdict: BizVerdict
  /** 裁决理由键（前端 i18n biz.verdicts.<key>）。 */
  verdictKey: string
  facts: BizFact[]
  boundary: string
}

const pct = (v: number | null): number | null => (v === null ? null : Math.round(v * 100))

/**
 * 合成经营语言摘要（纯函数）。规则：
 *   红线触发/门禁 fail → blocked（不可发布，先修红线）；
 *   k<2 或判定端离线   → insufficient（证据不足，不构成发布结论——统计纪律）；
 *   其余               → releasable（可发布）。
 * 事实行按决策优先级排序：质量 → 成本 → 归因 → 稳定性。
 */
export function businessSummaryOf(run: Pick<EvalRun, 'k' | 'aggregates'>): BusinessSummary {
  const agg = run.aggregates
  let verdict: BizVerdict = 'releasable'
  let verdictKey = 'all_gates_pass'
  if (agg.riskVeto) {
    verdict = 'blocked'
    verdictKey = 'risk_veto'
  } else if (agg.releaseGate && agg.releaseGate.verdict === 'fail') {
    verdict = 'blocked'
    verdictKey = 'gate_fail'
  } else if (run.k < 2 || agg.statisticallyInsufficient) {
    verdict = 'insufficient'
    verdictKey = 'single_run'
  } else if (agg.judgeOnline === false) {
    verdict = 'insufficient'
    verdictKey = 'judge_offline'
  }

  const facts: BizFact[] = []
  const p1 = pct(agg.passAt1)
  if (p1 !== null) {
    facts.push({ key: 'quality', params: { pass: p1, tasks: agg.taskCount, unknownPct: Math.round(agg.unknownRatio * 100) } })
  }
  const cost = agg.byLayer.efficiency.avgCostUsd
  if (cost !== null && cost !== undefined) {
    facts.push({ key: 'cost', params: { cost: Math.round(cost * 10000) / 10000 } })
  }
  const duration = agg.byLayer.efficiency.avgDurationMs
  if (duration !== null && duration !== undefined) {
    facts.push({ key: 'duration', params: { minutes: Math.round((duration / 60000) * 10) / 10 } })
  }
  // 归因行：失败最集中的责任角色（京东「归因按角色切」的决策语言化）；无角色标注回落最弱链路环节。
  const worstRole = [...(agg.byRole ?? [])]
    .filter((r) => r.taskCount > 0 && (r.passAtK ?? 1) < 1)
    .sort((a, b) => (a.passAtK ?? 1) - (b.passAtK ?? 1))[0]
  if (worstRole) {
    facts.push({
      key: 'attribution_role',
      params: { role: worstRole.role, failed: worstRole.taskCount - worstRole.passed, total: worstRole.taskCount },
    })
  } else {
    const links = Object.entries(agg.byLink ?? {})
      .filter(([, v]) => v && v.total > 0 && (v.passRate ?? 1) < 1)
      .sort((a, b) => (a[1].passRate ?? 1) - (b[1].passRate ?? 1))
    if (links.length > 0) {
      facts.push({ key: 'attribution_link', params: { link: links[0][0], passPct: Math.round((links[0][1].passRate ?? 0) * 100) } })
    }
  }
  if (agg.outputStability && agg.outputStability.checked > 0) {
    facts.push({
      key: 'stability',
      params: { flipPct: Math.round((agg.outputStability.flipRate ?? 0) * 100), rounds: agg.outputStability.rounds },
    })
  }

  return {
    verdict,
    verdictKey,
    facts,
    boundary: '摘要由运行读数机械合成（规则可审计），不是人工判断；经营换算（如单位成本对基线的差额）见虚拟损益表，本面不重复造账。',
  }
}

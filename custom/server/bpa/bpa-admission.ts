// 场景准入守门（B1，2026-11-28）：四条排除规则的三态判定与结论推导。
// 来源：《德勤AI落地方法论拆解》场景排除清单（业务主责缺失／无法提供基线／数据无合法依据／
// 重大影响无人复核——命中即不纳入）。本模块是纯函数：不读盘、不抛异常；在岗名单由调用方传入
// （读不到传 null，相关规则如实「无法判定」，不猜）。
//
// 纪律：只给缺口与三态结论，不打分、不加权、不排序（2026-11-06「只建记录不建评分」；
// loop-review 头注「不做加权评分」）。规则码用自有类型，不并入架构体检的 BpaRuleCode
// （那边被客户端键齐平测试锁死，准入规则也不是架构体检）。
import type { BpaNode } from './bpa-types'

export type AdmissionRuleCode =
  | 'OWNER_MISSING'
  | 'NO_BASELINE'
  | 'DATA_UNLAWFUL'
  | 'MAJOR_UNREVIEWED'

/** 三态：hit=命中排除规则；clear=未命中；undetermined=判不了（数据源缺席或登记不完整）。 */
export type AdmissionRuleVerdict = 'hit' | 'clear' | 'undetermined'

export interface AdmissionRuleResult {
  rule: AdmissionRuleCode
  verdict: AdmissionRuleVerdict
  /** 人读说明：命中=缺什么；无法判定=为什么判不了。 */
  detail: string
}

export interface AdmissionAssessment {
  nodeId: string
  nodeName: string
  level: number
  rules: AdmissionRuleResult[]
  /** eligible=四条全清，可由人签署进入试点或暂缓；blocked=有命中或无法判定，先补缺口。 */
  derived: 'eligible' | 'blocked'
  /** blocked 时的待补清单（命中与无法判定的说明按规则序拼接）。 */
  pendingItems: string[]
}

/** 在岗自然人（id 与显示名都参与主责匹配）；null=名单读不到。 */
export interface AdmissionDeps {
  activePeople: Array<{ id: string; name: string }> | null
}

export const ADMISSION_RULES: Array<{ code: AdmissionRuleCode; nameZh: string }> = [
  { code: 'OWNER_MISSING', nameZh: '业务主责' },
  { code: 'NO_BASELINE', nameZh: '可比基线' },
  { code: 'DATA_UNLAWFUL', nameZh: '数据合规' },
  { code: 'MAJOR_UNREVIEWED', nameZh: '重大影响复核' },
]

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** 指标目标里有没有数值锚点（≥90%、≤24h、=100% 都算有；「高」「达标」不算）。 */
function hasNumericAnchor(target: string): boolean {
  return /\d/.test(target)
}

function ruleOf(code: AdmissionRuleCode, verdict: AdmissionRuleVerdict, detail: string): AdmissionRuleResult {
  return { rule: code, verdict, detail }
}

/** 单条规则判定（导出便于逐规则单测与未来单独复核面复用）。 */
export function assessRule(
  code: AdmissionRuleCode,
  node: Pick<BpaNode, 'owner' | 'kpis' | 'dataCompliance' | 'majorImpact' | 'reviewer'>,
  deps: AdmissionDeps,
): AdmissionRuleResult {
  switch (code) {
    case 'OWNER_MISSING': {
      const owner = node.owner?.trim() ?? ''
      if (!owner) return ruleOf(code, 'hit', '未登记业务负责人（业务归属不明确）')
      if (deps.activePeople === null) {
        return ruleOf(code, 'undetermined', `负责人「${owner}」已登记，但在岗自然人名单读不到，无法核实归属`)
      }
      const matched = deps.activePeople.some((p) => p.id === owner || p.name === owner)
      return matched
        ? ruleOf(code, 'clear', `负责人是在岗自然人：${owner}`)
        : ruleOf(code, 'undetermined', `负责人「${owner}」不是在岗自然人名单里的人（按编号或姓名都没匹配上）——请改为在岗自然人，或先在自然人名单登记`)
    }
    case 'NO_BASELINE': {
      const kpis = Array.isArray(node.kpis) ? node.kpis : []
      if (kpis.length === 0) return ruleOf(code, 'hit', '未登记任何指标，无从对比效果')
      const withAnchor = kpis.filter((k) => nonEmpty(k.target) && hasNumericAnchor(k.target))
      return withAnchor.length > 0
        ? ruleOf(code, 'clear', `有 ${withAnchor.length} 项指标带数值锚点（${withAnchor.map((k) => k.name).join('、')}）`)
        : ruleOf(code, 'hit', `登记了 ${kpis.length} 项指标，但目标都没有数值锚点（如 ≥90%、≤24h），效果无从对比`)
    }
    case 'DATA_UNLAWFUL': {
      const c = node.dataCompliance
      if (c === 'cleared') return ruleOf(code, 'clear', '数据合规已核（合法依据在档）')
      if (c === 'none') return ruleOf(code, 'clear', '已声明不涉及敏感数据')
      if (c === 'pending') return ruleOf(code, 'hit', '数据合规待核：涉及敏感数据但合法使用依据未落实')
      return ruleOf(code, 'undetermined', '未声明数据合规结论，是否涉及敏感数据未知')
    }
    case 'MAJOR_UNREVIEWED': {
      if (!node.majorImpact) return ruleOf(code, 'clear', '未声明重大影响')
      const reviewer = node.reviewer?.trim() ?? ''
      return nonEmpty(reviewer)
        ? ruleOf(code, 'clear', `重大影响已登记复核人：${reviewer}`)
        : ruleOf(code, 'hit', '已声明重大影响但未登记复核人')
    }
  }
}

/** 场景准入主判定：四条规则逐条判，任一命中或无法判定即 blocked（待补清单按规则序）。 */
export function assessAdmission(node: BpaNode, deps: AdmissionDeps): AdmissionAssessment {
  const rules = ADMISSION_RULES.map((r) => assessRule(r.code, node, deps))
  const pendingItems = rules
    .filter((r) => r.verdict !== 'clear')
    .map((r) => `${ADMISSION_RULES.find((x) => x.code === r.rule)?.nameZh ?? r.rule}：${r.detail}`)
  return {
    nodeId: node.id,
    nodeName: node.name,
    level: node.level,
    rules,
    derived: pendingItems.length === 0 ? 'eligible' : 'blocked',
    pendingItems,
  }
}

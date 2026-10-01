/**
 * 确定性决策规则闸（乙6，2026-09-30 调研落地）——YAML 注册表驱动的 LLM-free 派发预检。
 *
 * 为什么不用 semantica check_decision_rules：实测其内置语义不可控（把 outcome=approved
 * 判为非法、confidence 缺省 0 触发过低告警），策略须可审计可测试——本表谓词在 TS 侧
 * 强校验（未知谓词键=problems 必红），词表冻结与 capability-ledger 字段对齐。
 *
 * 与 governance-budget 互补：budget 闸管 SLO 错误预算额度；本闸管声明式策略
 * （生命周期禁派/分档提醒）。mode 三档同款：off/warn/enforce
 * （GOVERNANCE_RULES_MODE 环境覆盖 > YAML mode 字段）。
 */
import { loadCapabilityLedger } from './governance-ledger'

export type RuleMode = 'off' | 'warn' | 'enforce'
export type RuleAction = 'deny' | 'warn'

/** 谓词键词表（冻结）：与 LedgerUnit 字段 + 派发上下文对齐。 */
export const RULE_PREDICATE_KEYS = ['unitTier', 'unitLifecycle', 'unitKind', 'specialist', 'column'] as const
export type RulePredicateKey = (typeof RULE_PREDICATE_KEYS)[number]

export interface DecisionRule {
  id: string
  description?: string
  when: Partial<Record<RulePredicateKey, string>>
  then: RuleAction
  message: string
}

export interface DecisionRulesDoc {
  version: number
  reviewedAt: string
  mode: RuleMode
  rules: DecisionRule[]
}

export interface RuleViolation {
  ruleId: string
  action: RuleAction
  message: string
}

export interface RuleEvaluation {
  mode: RuleMode
  violations: RuleViolation[]
  problems: string[]
}

/** enforce 模式命中 deny 规则时抛出（REST 侧 409，与 BudgetExhaustedError 同族）。 */
export class DecisionRuleError extends Error {
  constructor(public violations: RuleViolation[]) {
    super(`决策规则拒派：${violations.map((v) => `${v.ruleId}（${v.message}）`).join('；')}`)
    this.name = 'DecisionRuleError'
  }
}

const UNIT_LIFECYCLES = ['introduced', 'active', 'sustaining', 'retire-candidate', 'retired']
const RULE_ACTIONS: RuleAction[] = ['deny', 'warn']

/** 校验+装载（GOVERNANCE_DIR 同族解析；schema 违规进 problems 不静默）。 */
export function loadDecisionRules(): { exists: boolean; doc: DecisionRulesDoc | null; problems: string[] } {
  const path = resolveRulesPath()
  if (!path) return { exists: false, doc: null, problems: ['decision-rules.yaml 未找到（runtime/governance/）'] }
  const problems: string[] = []
  let raw: unknown
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs') as typeof import('fs')
    raw = parse(readFileSync(path, 'utf8'))
  } catch (err) {
    return { exists: true, doc: null, problems: [`解析失败：${err instanceof Error ? err.message : String(err)}`] }
  }
  const d = raw as Partial<DecisionRulesDoc> | null
  if (!d || typeof d !== 'object') return { exists: true, doc: null, problems: ['顶层非对象'] }
  if (d.version !== 1) problems.push('version 须为 1')
  if (!Array.isArray(d.rules)) problems.push('rules 须为数组')
  const rules: DecisionRule[] = []
  let idx = 0
  for (const r of (d.rules ?? []) as unknown[]) {
    idx += 1
    const rr = r as Partial<DecisionRule> & Record<string, unknown>
    if (!rr || typeof rr !== 'object' || typeof rr.id !== 'string' || !rr.id) {
      problems.push(`rules[${idx}] 缺 id`); continue
    }
    if (!rr.when || typeof rr.when !== 'object') { problems.push(`规则 ${rr.id} 缺 when`); continue }
    for (const k of Object.keys(rr.when)) {
      if (!(RULE_PREDICATE_KEYS as readonly string[]).includes(k)) {
        problems.push(`规则 ${rr.id} 未知谓词键 ${k}（词表：${RULE_PREDICATE_KEYS.join('/')}）`)
      }
    }
    if (rr.when && typeof rr.when === 'object') {
      const lc = (rr.when as Record<string, unknown>).unitLifecycle
      if (typeof lc === 'string' && !UNIT_LIFECYCLES.includes(lc)) {
        problems.push(`规则 ${rr.id} unitLifecycle=${lc} 不在词表 ${UNIT_LIFECYCLES.join('/')}`)
      }
    }
    if (rr.then !== 'deny' && rr.then !== 'warn') {
      problems.push(`规则 ${rr.id} then 须为 deny|warn（得 ${String(rr.then)}）`)
    }
    if (typeof rr.message !== 'string' || !rr.message) problems.push(`规则 ${rr.id} 缺 message`)
    rules.push({
      id: rr.id,
      description: typeof rr.description === 'string' ? rr.description : undefined,
      when: rr.when as DecisionRule['when'],
      then: (rr.then === 'deny' ? 'deny' : 'warn') as RuleAction,
      message: typeof rr.message === 'string' ? rr.message : '',
    })
  }
  const mode = d.mode === 'off' || d.mode === 'warn' || d.mode === 'enforce' ? d.mode : 'warn'
  if (mode !== d.mode) problems.push(`mode 须为 off|warn|enforce（得 ${String(d.mode)}）`)
  return { exists: true, doc: { version: 1, reviewedAt: typeof d.reviewedAt === 'string' ? d.reviewedAt : '', mode, rules }, problems }
}

function resolveRulesPath(): string | null {
  // 对齐 governance-ledger resolveGovFile：GOVERNANCE_DIR 优先，仓内 runtime/governance/ 兜底。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path')
  const env = process.env.GOVERNANCE_DIR?.trim()
  if (env) return resolve(env, 'decision-rules.yaml')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { existsSync } = require('fs') as typeof import('fs')
  const candidates = [
    resolve(__dirname, '../../../runtime/governance/decision-rules.yaml'),
    resolve(process.cwd(), 'runtime/governance/decision-rules.yaml'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return null
}

export interface RuleContext {
  specialist?: string
  column?: string
}

/** 求值：context × 规则表（off 全过；台账无档单元谓词不命中——不编造 tier/lifecycle）。 */
export function evaluateDecisionRules(ctx: RuleContext, opts: { now?: number } = {}): RuleEvaluation {
  void opts
  const { doc, problems } = loadDecisionRules()
  const envMode = process.env.GOVERNANCE_RULES_MODE?.trim()
  const mode: RuleMode = envMode === 'off' || envMode === 'warn' || envMode === 'enforce' ? envMode : (doc?.mode ?? 'warn')
  if (!doc || problems.length > 0) {
    // 规则表损坏=fail-open（无规则可命中，不产生新拒派），但 mode 不得被硬写 warn：
    // enforce 意图下静默降级会让"以为有闸其实没闸"；此处显性报错并如实返回意图档位。
    if (mode === 'enforce') {
      console.error(`[decision-rules] 规则表损坏而 GOVERNANCE_RULES_MODE=enforce，规则闸失效放行：${problems.join('；')}`)
    }
    return { mode, violations: [], problems }
  }
  if (mode === 'off') return { mode, violations: [], problems: [] }
  const unit = ctx.specialist ? loadCapabilityLedger().doc?.units.find((u) => u.id === ctx.specialist) : undefined
  const facts: Partial<Record<RulePredicateKey, string>> = {
    unitTier: unit?.sloTier,
    unitLifecycle: unit?.lifecycle,
    unitKind: unit?.kind,
    specialist: ctx.specialist,
    column: ctx.column,
  }
  const violations: RuleViolation[] = []
  for (const rule of doc.rules) {
    const matched = Object.entries(rule.when).every(([k, v]) => facts[k as RulePredicateKey] === v)
    if (matched) violations.push({ ruleId: rule.id, action: rule.then, message: rule.message })
  }
  return { mode, violations, problems }
}

/** 派发侧闸（column-dispatch 调用）：enforce 模式 deny 命中即抛 DecisionRuleError。 */
export function checkDecisionRulesForDispatch(ctx: RuleContext): RuleEvaluation {
  const res = evaluateDecisionRules(ctx)
  if (res.mode === 'enforce') {
    const denies = res.violations.filter((v) => v.action === 'deny')
    if (denies.length > 0) throw new DecisionRuleError(denies)
  }
  return res
}

// overlay[handoff] 团队作用域交接规则（EvoTeam 吸收，2026-11-08）。
//
// 语义：规则＝(from,to) 列/角色对上的信息契约——传什么证据、怎么验、缺项怎么办。
// 与既有 stage-keys/claims/acceptance 的分工：
//   - stage-keys/claims/acceptance：阶段出口与结果形状的全局契约（执法面）；
//   - 本模块：按协作对给出的交接建议（建议面，不阻断派发）。
// 纪律：作用域只认列/角色对，不绑 agent 实例（同角色可换 profile）；无命中即 NONE，
// 不硬套无关规则；跨家族同对多命中且未指定家族 → 不猜，返回 null。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ArtifactProvenance } from '../lib/provenance'
import { parseProvenance } from '../lib/provenance'

export interface HandoffRule {
  ruleId: string
  familyId: string
  from: string
  to: string
  trigger: string | null
  instruction: string
  requiredEvidence: string[]
  verification: string | null
  fallback: string | null
  version: number
  status: 'active' | 'retired'
  provenance?: ArtifactProvenance
}

export interface HandoffRuleFamily {
  familyId: string
  description: string
  rules: HandoffRule[]
}

export interface HandoffRuleLibrary {
  version: number
  updated: string | null
  families: HandoffRuleFamily[]
}

export interface HandoffRuleReport {
  available: boolean
  reason?: string
  source: string
  updated: string | null
  families: HandoffRuleFamily[]
}

export interface HandoffRuleQuery {
  from?: string | null
  to: string
  trigger?: string | null
  familyId?: string | null
}

export interface HandoffRuleSelection {
  rule: HandoffRule | null
  reason: string
  /** 命中候选数（含跨家族），用于观测规则冲突。 */
  candidates: number
}

export interface HandoffConformance {
  ok: boolean
  ruleId: string
  missing: string[]
}

/** required_evidence 键的中文标签（渲染用；缺标签时原样显示键）。 */
export const EVIDENCE_LABELS: Record<string, string> = {
  scope: '改动面',
  acceptance_criteria: '验收口径',
  changed_files: '改动文件清单',
  repro_command: '复现命令',
  not_verified: '未验证项',
  review_verdict: '评审判词',
  test_evidence: '测试证据',
  residual_risks: '残余风险',
}

/** 正本路径：env 覆盖 ＞ 仓内 team/shared/handoff-rules.yaml。 */
export function handoffRulesPath(): string {
  const env = process.env.HANDOFF_RULES_PATH?.trim()
  if (env) return env
  const here = typeof __dirname !== 'undefined' ? __dirname : resolve(process.cwd(), 'custom/server/handoff')
  return resolve(here, '../../..', 'team/shared/handoff-rules.yaml')
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))]
}

const RULE_ID_RE = /^[a-z0-9][a-z0-9-]{2,79}$/

/** 纯解析＋校验：任一规则违规即整表拒绝（半坏规则表比缺席更危险）。 */
export function parseHandoffRules(text: string): { ok: true; library: HandoffRuleLibrary } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    const { parse } = require('yaml') as typeof import('yaml')
    parsed = parse(text)
  } catch (e) {
    return { ok: false, reason: `handoff-rules.yaml 解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'handoff-rules.yaml 根节点不是对象' }
  const root = parsed as Record<string, unknown>
  if (!Array.isArray(root.families)) return { ok: false, reason: 'handoff-rules.yaml 缺 families 数组（结构不符）' }

  const problems: string[] = []
  const families: HandoffRuleFamily[] = []
  const seenFamilies = new Set<string>()
  const seenRules = new Set<string>()
  for (const [fi, rawFamily] of root.families.entries()) {
    const f = (rawFamily && typeof rawFamily === 'object' ? rawFamily : null) as Record<string, unknown> | null
    if (!f) {
      problems.push(`families[${fi}] 不是对象`)
      continue
    }
    const familyId = str(f.family_id) ?? ''
    if (!familyId) {
      problems.push(`families[${fi}].family_id 必填`)
      continue
    }
    if (seenFamilies.has(familyId)) {
      problems.push(`handoff family_id 重复：${familyId}`)
      continue
    }
    seenFamilies.add(familyId)
    const rulesRaw = Array.isArray(f.rules) ? f.rules : []
    const rules: HandoffRule[] = []
    for (const [ri, rawRule] of rulesRaw.entries()) {
      const r = (rawRule && typeof rawRule === 'object' ? rawRule : null) as Record<string, unknown> | null
      if (!r) {
        problems.push(`${familyId}.rules[${ri}] 不是对象`)
        continue
      }
      const ruleId = str(r.rule_id) ?? ''
      if (!RULE_ID_RE.test(ruleId)) {
        problems.push(`${familyId}.rules[${ri}].rule_id 非法：${ruleId || '(空)'}`)
        continue
      }
      const scopeKey = `${familyId}/${ruleId}`
      if (seenRules.has(scopeKey)) {
        problems.push(`rule_id 在家族内重复：${scopeKey}`)
        continue
      }
      seenRules.add(scopeKey)
      const from = str(r.from)?.toLowerCase() ?? ''
      const to = str(r.to)?.toLowerCase() ?? ''
      if (!from || !to) problems.push(`${scopeKey}.from/to 均必填`)
      if (from && to && from === to) problems.push(`${scopeKey} 的 from 与 to 不能相同`)
      const instruction = str(r.instruction) ?? ''
      if (!instruction) problems.push(`${scopeKey}.instruction 必填`)
      const version = Number(r.version)
      if (!Number.isInteger(version) || version < 1) problems.push(`${scopeKey}.version 须为正整数`)
      const status = str(r.status) ?? 'active'
      if (status !== 'active' && status !== 'retired') problems.push(`${scopeKey}.status 须为 active|retired`)
      rules.push({
        ruleId,
        familyId,
        from,
        to,
        trigger: str(r.trigger),
        instruction,
        requiredEvidence: strList(r.required_evidence),
        verification: str(r.verification),
        fallback: str(r.fallback),
        version: Number.isInteger(version) ? version : 0,
        status: status as HandoffRule['status'],
        provenance: parseProvenance(r.provenance),
      })
    }
    families.push({ familyId, description: str(f.description) ?? '', rules })
  }
  if (problems.length > 0) return { ok: false, reason: problems.join('；') }
  const libVersion = Number(root.version)
  return {
    ok: true,
    library: {
      version: Number.isInteger(libVersion) && libVersion > 0 ? libVersion : 1,
      updated: str(root.updated),
      families,
    },
  }
}

export function loadHandoffRules(): HandoffRuleReport {
  const path = handoffRulesPath()
  if (!existsSync(path)) {
    return { available: false, reason: `交接规则正本缺席：${path}（HANDOFF_RULES_PATH 可覆盖）`, source: path, updated: null, families: [] }
  }
  try {
    const parsed = parseHandoffRules(readFileSync(path, 'utf8'))
    // strict:false 下布尔判别不窄化（与 board-ownership 同款先例）——显式取 reason。
    if (!parsed.ok) return { available: false, reason: (parsed as { reason?: string }).reason ?? '交接规则解析失败', source: path, updated: null, families: [] }
    return { available: true, source: path, updated: parsed.library.updated, families: parsed.library.families }
  } catch (e) {
    return { available: false, reason: `交接规则读取失败：${e instanceof Error ? e.message : String(e)}`, source: path, updated: null, families: [] }
  }
}

function triggerMatches(rule: HandoffRule, trigger: string | null): boolean {
  if (!trigger || !rule.trigger) return false
  const t = trigger.toLowerCase()
  return t.includes(rule.trigger.toLowerCase()) || rule.trigger.toLowerCase().includes(t)
}

/**
 * 选择一条适用规则：
 *   1) 精确匹配 (from,to) 的 active 规则；
 *   2) 指定 familyId 时只在该家族内选；
 *   3) 多条命中：trigger 唯一匹配者胜；否则同家族取 ruleId 字典序最小；
 *      跨家族且未指定 familyId → null（不猜）。
 */
export function selectHandoffRule(families: HandoffRuleFamily[], query: HandoffRuleQuery): HandoffRuleSelection {
  const from = String(query.from ?? '').trim().toLowerCase()
  const to = String(query.to ?? '').trim().toLowerCase()
  const familyId = String(query.familyId ?? '').trim()
  if (!to) return { rule: null, reason: 'to 必填（目标列/角色）', candidates: 0 }
  const scoped = familyId ? families.filter((f) => f.familyId === familyId) : families
  if (familyId && scoped.length === 0) return { rule: null, reason: `家族不存在：${familyId}`, candidates: 0 }

  const hits: HandoffRule[] = []
  for (const family of scoped) {
    for (const rule of family.rules) {
      if (rule.status !== 'active') continue
      if (rule.to !== to) continue
      // from 为空（无来源列）时只匹配声明了空来源的规则——本库用非空 from，等价于无命中。
      if (from && rule.from !== from) continue
      if (!from && rule.from) continue
      hits.push(rule)
    }
  }
  if (hits.length === 0) return { rule: null, reason: '无命中规则（NONE，直接交接）', candidates: 0 }

  const familyIds = new Set(hits.map((r) => r.familyId))
  if (!familyId && familyIds.size > 1) {
    return { rule: null, reason: `命中 ${hits.length} 条且跨 ${familyIds.size} 个家族，未指定 familyId（不猜）`, candidates: hits.length }
  }
  if (hits.length === 1) return { rule: hits[0], reason: `命中 ${hits[0].familyId}/${hits[0].ruleId}`, candidates: 1 }

  const trigger = String(query.trigger ?? '').trim()
  const byTrigger = hits.filter((r) => triggerMatches(r, trigger || null))
  const pool = byTrigger.length === 1 ? byTrigger : hits
  const chosen = [...pool].sort((a, b) => a.ruleId.localeCompare(b.ruleId))[0]
  return { rule: chosen, reason: `命中 ${hits.length} 条，取 ${chosen.ruleId}${byTrigger.length === 1 ? '（trigger 唯一匹配）' : '（同家族按 ruleId 定序）'}`, candidates: hits.length }
}

/** 渲染建议注入行：不承诺强制执行，写明缺项处置。 */
export function renderHandoffRuleLine(rule: HandoffRule): string {
  const parts = [
    `交接契约（handoff-rules:${rule.familyId}/${rule.ruleId} v${rule.version}）：${rule.instruction}`,
  ]
  if (rule.requiredEvidence.length > 0) {
    parts.push(`必须携带：${rule.requiredEvidence.map((k) => `${EVIDENCE_LABELS[k] ?? k}(${k})`).join(' / ')}`)
  }
  if (rule.verification) parts.push(`验证：${rule.verification}`)
  if (rule.fallback) parts.push(`缺项处置：${rule.fallback}`)
  return parts.join('；')
}

/** 回执侧一致性检查（只读建议）：present 为本次交接实际携带的键。 */
export function checkHandoffConformance(rule: HandoffRule, present: string[]): HandoffConformance {
  const have = new Set(present.map((p) => String(p).trim()))
  const missing = rule.requiredEvidence.filter((k) => !have.has(k))
  return { ok: missing.length === 0, ruleId: rule.ruleId, missing }
}

/**
 * 派单注入入口（column-dispatch 消费）：默认开，HANDOFF_RULES_INJECT=0 关闭；
 * 存储缺席/坏表/无命中 → null（不占行，不阻断派发）。
 */
export function handoffRuleLineFor(from: string | null, to: string, trigger?: string | null): string | null {
  if (process.env.HANDOFF_RULES_INJECT === '0') return null
  try {
    const report = loadHandoffRules()
    if (!report.available) return null
    const selected = selectHandoffRule(report.families, { from, to, trigger })
    return selected.rule ? renderHandoffRuleLine(selected.rule) : null
  } catch {
    return null
  }
}

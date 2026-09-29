// overlay/enginemodels 域（B2，2026-09-29）：提供方策略层——opencode v2
// provider-policy 契约吸收。
//
// 语义（specs/v2/provider-policy.md）：
// - 语句 {effect: allow|deny, resource}；resource 通配（* 段内 / ** 跨段）；
// - **最后一条匹配语句生效**（无 specificity 优先级）；无匹配默认 allow；
// - 治理面语句拼接在用户语句之后 → 天然拥有最终权威（治理 deny 压过用户
//   allow；治理 allow 只能取消更早的用户 deny，不越权放行被治理 deny 的）；
// - 治理面来源：runtime/governance/provider-policy.json（4A 治理平面所有，
//   fail-soft：缺席/坏档=无治理语句）。
//
// 强制面：PUT /api/ide/engine-models 的层 2 写穿按有效策略跳过被拒 provider
// （引擎侧永远读不到 → 派发不可达）；UI 侧按 effectivePolicy 置灰。
import { existsSync, readFileSync } from 'fs'

export interface PolicyStatement {
  effect: 'allow' | 'deny'
  /** providerId 或通配模式（'openai'、'company-*'、'*'）。 */
  resource: string
}

export const POLICY_STATEMENTS_MAX = 50
export const POLICY_RESOURCE_MAX = 64

export interface PolicyVerdict {
  allowed: boolean
  /** 判定来源：governance=治理面压轴语句 / user=用户语句 / default=无匹配默认放行。 */
  source: 'governance' | 'user' | 'default'
  statement?: PolicyStatement
}

/** 通配匹配：providerId 是扁平标识（无路径分隔），* 即任意串（'company-*'）；
 *  空模式不匹配任何——策略必须显式。 */
export function matchPolicyResource(pattern: string, providerId: string): boolean {
  if (!pattern || !providerId) return false
  const re = new RegExp('^'
    + pattern.split('*').map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    + '$')
  return re.test(providerId)
}

/** 语句合法性（REST 400 依据；计数上限防策略面被灌爆）。 */
export function validatePolicyStatements(statements: unknown): { ok: true; statements: PolicyStatement[] } | { ok: false; problems: string[] } {
  if (statements == null) return { ok: true, statements: [] }
  if (!Array.isArray(statements)) return { ok: false, problems: ['policy.statements 须为数组'] }
  if (statements.length > POLICY_STATEMENTS_MAX) return { ok: false, problems: [`语句数 ≤${POLICY_STATEMENTS_MAX}`] }
  const out: PolicyStatement[] = []
  const problems: string[] = []
  statements.forEach((raw, i) => {
    const s = (raw ?? {}) as { effect?: unknown; resource?: unknown }
    if (s.effect !== 'allow' && s.effect !== 'deny') problems.push(`statements[${i}].effect 须为 allow|deny`)
    else if (typeof s.resource !== 'string' || !s.resource.trim() || s.resource.length > POLICY_RESOURCE_MAX) {
      problems.push(`statements[${i}].resource 必填且 ≤${POLICY_RESOURCE_MAX} 字符`)
    } else {
      out.push({ effect: s.effect, resource: s.resource.trim() })
    }
  })
  return problems.length > 0 ? { ok: false, problems } : { ok: true, statements: out }
}

/** 合并序：用户语句在前、治理面语句在后（最后匹配生效 → 治理面压轴权威）。 */
export function mergePolicyStatements(user: PolicyStatement[], governance: PolicyStatement[]): PolicyStatement[] {
  return [...user, ...governance]
}

/** 判定：最后一条匹配生效；无匹配默认 allow。 */
export function evaluateProviderPolicy(
  userStatements: PolicyStatement[],
  governanceStatements: PolicyStatement[],
  providerId: string,
): PolicyVerdict {
  const merged = mergePolicyStatements(userStatements, governanceStatements)
  let verdict: PolicyVerdict | null = null
  for (let i = 0; i < merged.length; i++) {
    const st = merged[i]
    if (!matchPolicyResource(st.resource, providerId)) continue
    verdict = {
      allowed: st.effect === 'allow',
      source: i >= userStatements.length ? 'governance' : 'user',
      statement: st,
    }
  }
  return verdict ?? { allowed: true, source: 'default' }
}

/** 治理面语句加载（fail-soft：缺席/坏档/结构不符=空）。 */
export function loadGovernancePolicyStatements(path: string): PolicyStatement[] {
  try {
    if (!existsSync(path)) return []
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { statements?: unknown }
    const res = validatePolicyStatements(raw?.statements)
    return res.ok ? res.statements : []
  } catch {
    return []
  }
}

/** 目录级过滤辅助：返回目录中被有效策略拒绝的 providerId 集。 */
export function deniedProviderIds(
  userStatements: PolicyStatement[],
  governanceStatements: PolicyStatement[],
  providerIds: readonly string[],
): Array<{ providerId: string; verdict: PolicyVerdict }> {
  return providerIds
    .map((providerId) => ({ providerId, verdict: evaluateProviderPolicy(userStatements, governanceStatements, providerId) }))
    .filter((x) => !x.verdict.allowed)
}

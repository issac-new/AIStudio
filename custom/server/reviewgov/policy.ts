// overlay/custom/server/reviewgov/policy.ts
// 变更风险分级与人工审批名额（纯函数，无 IO）。
//
// 设计原则（对齐 Anthropic 文章）：
//   - 按「这次改动可能出什么问题」分级，不按「代码是谁写的」分级；
//   - 受保护路径永远至少 high，熔断激活时只升不降；
//   - 只有与当前 headCommit 绑定、未被新提交/解冲突失效的人类 approve 才计数；
//   - Agent 审批可以记录，但永远不占人工名额。
import {
  DEFAULT_POLICY,
  type ActorKind,
  type BreakerState,
  type ReviewApproval,
  type ReviewPolicy,
  type RiskAssessment,
  type RiskTier,
} from './types'

export interface ChangeRiskInput {
  changedPaths: string[]
  diffLines?: number
  behindFlag?: boolean
  author?: string
  authorKind?: ActorKind
  policy?: ReviewPolicy
  breaker?: BreakerState | null
  now?: number
}

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g

/** glob → 正则：支持 **（跨目录）、*（单段）、?（单字符）；无斜杠的模式按 basename 匹配。 */
export function globToRegExp(glob: string): RegExp {
  const normalized = glob.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized) return /^$/
  const anchored = !normalized.includes('/')
  let out = ''
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        const slashAfter = normalized[i + 2] === '/'
        out += slashAfter ? '(?:.*/)?' : '.*'
        i += slashAfter ? 2 : 1
      } else {
        out += '[^/]*'
      }
      continue
    }
    if (ch === '?') {
      out += '[^/]'
      continue
    }
    out += ch.replace(REGEX_SPECIAL, '\\$&')
  }
  return new RegExp(anchored ? `^(?:.*/)?${out}$` : `^${out}$`)
}

/** 返回命中的路径模式（去重，保持策略声明顺序）。 */
export function matchPaths(paths: string[], globs: string[]): string[] {
  const hits: string[] = []
  for (const glob of globs) {
    const re = globToRegExp(glob)
    if (paths.some((p) => re.test(p))) hits.push(glob)
  }
  return hits
}

/** 所有变更路径都落在某个模式集合内（用于「纯文档」判定）。 */
export function allPathsMatch(paths: string[], globs: string[]): boolean {
  if (!paths.length) return false
  const res = globs.map(globToRegExp)
  return paths.every((p) => res.some((re) => re.test(p)))
}

export function escalateTier(tier: RiskTier, steps = 1): RiskTier {
  if (steps <= 0) return tier
  const order: RiskTier[] = ['low', 'medium', 'high']
  const idx = order.indexOf(tier)
  return order[Math.min(order.length - 1, idx + steps)]
}

export function isRiskTier(v: unknown): v is RiskTier {
  return v === 'low' || v === 'medium' || v === 'high'
}

/** 变更风险分级（服务端权威；纯函数）。 */
export function classifyChangeRisk(input: ChangeRiskInput): RiskAssessment {
  const policy = input.policy ?? DEFAULT_POLICY
  const paths = input.changedPaths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean)
  const reasons: string[] = []
  const protectedHits = matchPaths(paths, policy.protectedPaths)
  const sensitiveHits = matchPaths(paths, policy.sensitivePaths)
  const trustedAuthor = !!input.author && policy.trustedAuthors.includes(input.author)
  const diffLines = Math.max(0, input.diffLines ?? 0)

  let tier: RiskTier
  if (!paths.length) {
    tier = 'medium'
    reasons.push('unknown_scope：没有变更路径，保守判中风险')
  } else if (protectedHits.length) {
    tier = 'high'
    reasons.push(`protected_path：命中受保护路径 ${protectedHits.join(', ')}`)
  } else if (diffLines >= policy.hugeDiffLines) {
    tier = 'high'
    reasons.push(`huge_diff：${diffLines} 行超过 ${policy.hugeDiffLines} 行上限`)
  } else if (sensitiveHits.length) {
    tier = 'medium'
    reasons.push(`sensitive_path：命中敏感路径 ${sensitiveHits.join(', ')}`)
  } else if (diffLines >= policy.largeDiffLines) {
    tier = 'medium'
    reasons.push(`large_diff：${diffLines} 行超过 ${policy.largeDiffLines} 行，升一档`)
  } else if (allPathsMatch(paths, policy.docPaths)) {
    tier = 'low'
    reasons.push('docs_only：纯文档/文案改动')
  } else if (input.behindFlag) {
    tier = 'low'
    reasons.push('behind_flag：改动藏在特性开关后')
  } else if (allPathsMatch(paths, policy.internalPaths)) {
    tier = 'low'
    reasons.push('internal_only：纯内部工具改动')
  } else {
    tier = 'medium'
    reasons.push('product_logic：常规产品逻辑改动')
  }

  let breakerTightened = false
  if (input.breaker?.active && tier !== 'high') {
    const tightened = policy.circuitBreaker.escalateOneTier ? escalateTier(tier, 1) : tier
    if (tightened !== tier) {
      breakerTightened = true
      reasons.push(`circuit_breaker：回滚/事故信号触发熔断，审批门槛 ${tier} → ${tightened}`)
      tier = tightened
    }
  }

  // low 档：受信任作者可零人工；非受信任作者仍需 1 人（文章：只有 trusted 才走快速通道）。
  const base = policy.tiers[tier] ?? 0
  let requiredHumanApprovals = base
  if (tier === 'low' && !trustedAuthor) requiredHumanApprovals = Math.max(1, base)
  if (tier === 'low') {
    reasons.push(trustedAuthor ? 'trusted_author：受信任作者，自动检查全绿后可零人工' : 'untrusted_author：非受信任作者，低风险档仍需 1 人')
  }
  if (tier === 'high') reasons.push('high_risk：高危改动，必须 2 人放行')
  if (input.authorKind === 'agent') reasons.push('author_is_agent：作者是 Agent 不改变风险档，但审批责任归下指令的人')

  return {
    tier,
    requiredHumanApprovals,
    reasons,
    protectedHits,
    sensitiveHits,
    trustedAuthor,
    breakerTightened,
    classifiedAt: input.now ?? Date.now(),
  }
}

export interface ApprovalCounts {
  human: number
  agent: number
  effective: ReviewApproval[]
}

/** 有效人工审批：人类 + approve + 绑定当前提交 + 未失效。 */
export function countEffectiveApprovals(
  approvals: ReviewApproval[],
  headCommit?: string,
): ApprovalCounts {
  const effective = approvals.filter(
    (a) => a.actorKind === 'human' && a.decision === 'approve' && !a.invalidatedAt
      && (headCommit ? a.commit === headCommit : true),
  )
  const agent = approvals.filter(
    (a) => a.actorKind === 'agent' && a.decision === 'approve' && !a.invalidatedAt
      && (headCommit ? a.commit === headCommit : true),
  )
  return { human: effective.length, agent: agent.length, effective }
}

/** 新提交 / 解冲突后，把此前审批标记失效（返回副本，不改入参）。 */
export function invalidateApprovals(
  approvals: ReviewApproval[],
  by: 'new_commit' | 'conflict_resolution',
  at = Date.now(),
): ReviewApproval[] {
  return approvals.map((a) => (
    a.invalidatedAt ? a : { ...a, invalidatedAt: at, invalidatedBy: by }
  ))
}

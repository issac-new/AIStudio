/**
 * 自治刻度判定纯函数（A 组）——无 IO，可被测试直接调用。
 *
 * 纪律：判定逻辑一律纯函数（仓内教训：382 条标记断言全绿仍连炸 3 个，
 * 见 docs/design/mechanism-map.md 的「行为测试」段）。控制器只做参数收窄与响应组装。
 */
import type {
  Assessment, AutonomyLevel, AutonomyScaleEntry, DistributionReport, Dod, LadderLevel,
  RuleFinding, Tier, TierCounts, Verdict,
} from './types'

/** 三圈归属：AL0-1 人类圈、AL2-3 协作圈、AL4-5 自主圈（下篇 Step5 界碑）。 */
export function tierFromAl(al: AutonomyLevel): Tier {
  if (al <= 1) return 'human'
  if (al <= 3) return 'collab'
  return 'auto'
}

/**
 * 流程级阶梯 → 任务级 AL 的只读映射。
 *
 * 刻意映射不到 AL5：流程级「自动执行」不等于任务级「完全脱离人工」。这是两套语义
 * 之间最重要的边界——合并会让 auto 档被误读成可到 AL5。
 */
export function alFromLadder(level: LadderLevel): AutonomyLevel {
  if (level === 'insight') return 1
  if (level === 'assist') return 3
  return 4
}

function samplingOk(entry: Pick<AutonomyScaleEntry, 'auditSampling'>): boolean {
  return Number.isFinite(entry.auditSampling) && entry.auditSampling > 0 && entry.auditSampling <= 1
}

/** 60 分线：验收判据、真实样例、停止条件三者必须都在。 */
export function checkDod(dod: Dod | undefined): RuleFinding {
  const criteria = Array.isArray(dod?.criteria) ? dod!.criteria.filter((c) => typeof c === 'string' && c.trim()) : []
  const sample = typeof dod?.sample === 'string' ? dod!.sample.trim() : ''
  const stop = typeof dod?.stopCondition === 'string' ? dod!.stopCondition.trim() : ''
  const missing: string[] = []
  if (criteria.length === 0) missing.push('验收判据')
  if (!sample) missing.push('真实样例')
  if (!stop) missing.push('停止条件')
  if (missing.length === 0) {
    return { rule: 'dod-complete', verdict: 'ok', detail: `60 分线完整（${criteria.length} 条判据）` }
  }
  return {
    rule: 'dod-complete',
    verdict: 'blocked',
    detail: `60 分线缺 ${missing.join('、')}——缺停止条件即无法被停掉，按辨伪底线判假 AI 化`,
  }
}

/**
 * AL5 成立条件（用户 2026-11-05 裁决：条件式而非硬禁）。
 *
 * 文章红线原句是「不允许任何任务完全脱离人工策略扫描与抽样审计」——红线约束的是
 * 「脱离审计」，不是「等级本身」。因此 AL5 允许存在，但两条必须在。
 */
export function checkAl5(entry: Pick<AutonomyScaleEntry, 'al' | 'auditSampling' | 'humanScan'>): RuleFinding {
  if (entry.al !== 5) {
    return { rule: 'al5-condition', verdict: 'ok', detail: '非 AL5，本条不适用' }
  }
  const missing: string[] = []
  if (!samplingOk(entry)) missing.push('抽样审计比例（须 > 0）')
  if (entry.humanScan !== true) missing.push('人工策略扫描')
  if (missing.length === 0) {
    return { rule: 'al5-condition', verdict: 'ok', detail: 'AL5 成立：抽样审计与人工扫描齐备' }
  }
  return {
    rule: 'al5-condition',
    verdict: 'blocked',
    detail: `AL5 不成立：缺 ${missing.join('、')}——不允许任何任务完全脱离人工扫描与抽样审计`,
  }
}

/** AL4 抽样底线：仍可运行，但缺抽样要显性告警（告警不得静默）。 */
export function checkAl4(entry: Pick<AutonomyScaleEntry, 'al' | 'auditSampling'>): RuleFinding {
  if (entry.al !== 4) {
    return { rule: 'al4-sampling', verdict: 'ok', detail: '非 AL4，本条不适用' }
  }
  if (samplingOk(entry)) {
    return { rule: 'al4-sampling', verdict: 'ok', detail: 'AL4 抽样审计已配置' }
  }
  return {
    rule: 'al4-sampling',
    verdict: 'warn',
    detail: 'AL4 未配置抽样审计比例——端到端运行但无人抽样核查',
  }
}

function worst(findings: RuleFinding[]): Verdict {
  if (findings.some((f) => f.verdict === 'blocked')) return 'blocked'
  if (findings.some((f) => f.verdict === 'warn')) return 'warn'
  return 'ok'
}

/** 单条配置的完整判定。 */
export function assess(entry: AutonomyScaleEntry): Assessment {
  const findings: RuleFinding[] = [
    checkDod(entry.dod),
    checkAl5(entry),
    checkAl4(entry),
  ]
  // 辨伪底线：拿不出「什么条件下该停掉」的判据，就已经是假 AI 化（下篇八种假 AI 化）。
  const stopCondition = typeof entry.dod?.stopCondition === 'string' ? entry.dod.stopCondition.trim() : ''
  return {
    target: entry.target,
    al: entry.al,
    tier: tierFromAl(entry.al),
    verdict: worst(findings),
    findings,
    fakeAi: stopCondition === '',
  }
}

/** 三圈配比 + 两条退化自检。不做硬阈值（文章自述 80/15/5 是经验比例，不是合规线）。 */
export function ratioReport(entries: AutonomyScaleEntry[]): DistributionReport {
  const counts: TierCounts = { human: 0, collab: 0, auto: 0 }
  const verdicts = { ok: 0, warn: 0, blocked: 0 }
  for (const e of entries) {
    counts[tierFromAl(e.al)] += 1
    verdicts[assess(e).verdict] += 1
  }
  const total = entries.length
  const share = (n: number): number => (total === 0 ? 0 : Number((n / total).toFixed(4)))
  const shares = { human: share(counts.human), collab: share(counts.collab), auto: share(counts.auto) }

  const checks: DistributionReport['checks'] = []
  if (total === 0) {
    checks.push({
      id: 'no-data',
      verdict: 'warn',
      detail: '无自治配置——治理面尚未接入，任何「已治理」的结论都不成立',
    })
  } else {
    if (counts.human === total) {
      checks.push({
        id: 'all-human',
        verdict: 'warn',
        detail: '全部任务落在人类圈——只有控制，没有治理（文章下篇 6.2 判词）',
      })
    }
    if (counts.auto === 0) {
      checks.push({
        id: 'no-autonomy',
        verdict: 'warn',
        detail: '无自主圈配置——有治理框架，无授权',
      })
    }
  }

  return {
    total,
    counts,
    shares,
    verdicts,
    reference: { auto: 0.8, collab: 0.15, human: 0.05 },
    checks,
  }
}

/** 写入前校验：返回问题清单（空数组=通过）。与 assess 分离——输入校验不管语义判定。 */
export function validateEntryInput(v: {
  target?: unknown
  al?: unknown
  dod?: unknown
  auditSampling?: unknown
  humanScan?: unknown
  note?: unknown
}): string[] {
  const problems: string[] = []
  if (typeof v.target !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(v.target)) {
    problems.push('target 须为 1-160 位安全字符（profile 名或 workflow:<workflow>:<node>）')
  }
  if (typeof v.al !== 'number' || !Number.isInteger(v.al) || v.al < 0 || v.al > 5) {
    problems.push('al 须为 0-5 整数')
  }
  if (v.auditSampling !== undefined) {
    if (typeof v.auditSampling !== 'number' || !Number.isFinite(v.auditSampling)
      || v.auditSampling < 0 || v.auditSampling > 1) {
      problems.push('auditSampling 须为 0-1 之间的数')
    }
  }
  if (v.humanScan !== undefined && typeof v.humanScan !== 'boolean') {
    problems.push('humanScan 须为布尔值')
  }
  if (v.note !== undefined && typeof v.note !== 'string') {
    problems.push('note 须为字符串')
  }
  if (v.dod === undefined || typeof v.dod !== 'object' || v.dod === null) {
    problems.push('dod 必填（60 分线：验收判据/真实样例/停止条件）')
  } else {
    const dod = v.dod as Record<string, unknown>
    if (!Array.isArray(dod.criteria) || dod.criteria.length === 0
      || dod.criteria.some((c) => typeof c !== 'string' || !c.trim())) {
      problems.push('dod.criteria 须为非空字符串数组')
    }
    if (typeof dod.sample !== 'string' || !dod.sample.trim()) {
      problems.push('dod.sample 须为非空字符串')
    }
    if (typeof dod.stopCondition !== 'string' || !dod.stopCondition.trim()) {
      problems.push('dod.stopCondition 须为非空字符串（拿不出停止判据即假 AI 化）')
    }
  }
  return problems
}

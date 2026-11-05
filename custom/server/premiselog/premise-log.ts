/**
 * 假设登记簿（B 组，2026-11-05 组织治理能力批）——类型 + 判定纯函数。
 *
 * 来源：泊珩简澈《从规划未来到生成未来》上篇 1.2 的第 1 个判断「战略规划的第一产物
 * 不是规划书，是假设清单」，以及下篇 Step3「校准不是提高开会频率，是给每一条假设
 * 标上复核日期」。
 *
 * 定位：登记簿是业务对象（承重判断的台账），影响面是读侧计算——不保存第二份业务真值。
 * 判定只做**形式校验**（可证伪性），不做真假裁决：内容真假无法机器判断，用机器判真伪
 * 会制造假权威。
 */

export type PremiseKind = 'market' | 'tech' | 'org' | 'cost' | 'compliance'
export type PremiseStatus = 'hold' | 'pending' | 'refuted' | 'expired'
export type PremiseConfidence = 'high' | 'medium' | 'low'

export const PREMISE_KINDS: readonly PremiseKind[] = ['market', 'tech', 'org', 'cost', 'compliance']
export const PREMISE_STATUSES: readonly PremiseStatus[] = ['hold', 'pending', 'refuted', 'expired']

export const KIND_TITLES: Record<PremiseKind, string> = {
  market: '市场',
  tech: '技术',
  org: '组织',
  cost: '成本',
  compliance: '合规',
}

export const STATUS_TITLES: Record<PremiseStatus, string> = {
  hold: '成立中（待复核）',
  pending: '待复核',
  refuted: '已被推翻',
  expired: '已过期',
}

export interface Premise {
  /** pr-YYYYMMDD-NNNN */
  id: string
  statement: string
  kind: PremiseKind
  /** 失效传播范围：受影响对象锚（spec 文件名 / 域 / 端点 / 看板列） */
  scope: string[]
  /** 复核日期（校准入库落点） */
  reviewAt: number
  status: PremiseStatus
  confidence: PremiseConfidence
  refutedBy?: { evidence: string; at: number; by: string }
  supersededBy?: string
  createdAt: number
  createdBy: string
  updatedAt: number
  /** statement 历史版本（改写不得静默覆盖） */
  history?: { statement: string; at: number; by: string }[]
}

export interface ReevalItem {
  id: string
  premiseId: string
  anchors: string[]
  reason: string
  queuedAt: number
  state: 'queued' | 'done' | 'dismissed'
  /** dismissed 必带理由（无理由删除等于把闭环重新切断） */
  resolution?: { by: string; at: number; note: string }
}

export interface ImpactAnchor {
  anchor: string
  /** 锚是否仍存在（读侧探测） */
  exists: boolean
  /** 锚类型（按形态推断：spec / domain / endpoint / column / unknown） */
  shape: 'spec' | 'domain' | 'endpoint' | 'column' | 'unknown'
}

export interface ImpactReport {
  premiseId: string
  anchors: ImpactAnchor[]
  /** 失联锚数（>0 说明影响面已部分失效，需人工重写 scope） */
  stale: number
}

// ── 形式校验：可证伪性 ──

/** 纯口号特征：只有态度没有可观测对象。 */
const SLOGAN_PATTERNS: RegExp[] = [
  /^(我们|公司|团队)(要|应该|必须|需要)(加强|提升|优化|完善|推进|深化|打造|构建)/,
  /^(以|用).*(为中心|为抓手|为导向|为引领)$/,
  /全面(提升|加强|深化|推进)/,
]

/** 可观测标记：数字、比较、条件、时点、量纲。命中其一即认为有可证伪形态。 */
const OBSERVABLE: RegExp[] = [
  /\d/, /%|％/,
  /(低于|高于|超过|少于|大于|不超过|至少|至多|跌|降|涨|增|持平|不变)/,
  /(如果|若|当.*时|一旦)/,
  /(成本|价格|单价|占比|份额|周期|时长|延迟|吞吐|规模|数量)/,
  /(季度|月度|年度|Q[1-4]|上半年|下半年|年底|三个?月|六个?月)/,
]

/**
 * 陈述质量门槛：返回问题清单（空=通过）。
 *
 * 只拦明显口号与过短陈述。真实可证伪性依赖人的判断，这里不假装能判真伪。
 */
export function checkStatement(statement: unknown): string[] {
  if (typeof statement !== 'string') return ['statement 须为字符串']
  const s = statement.trim()
  const problems: string[] = []
  if (s.length < 8) {
    problems.push('陈述过短（<8 字）——至少写清「谁/什么 在什么条件下 会怎样」')
  }
  if (s.length > 400) {
    problems.push('陈述过长（>400 字）——一条假设只写一件事，长句拆成多条')
  }
  if (SLOGAN_PATTERNS.some((re) => re.test(s))) {
    problems.push('这是口号不是假设（只有态度没有可观测对象）——请写成可被推翻的陈述')
  }
  if (!OBSERVABLE.some((re) => re.test(s))) {
    problems.push('缺可观测标记（数字/比较/条件/时点/量纲任一）——不可观测的陈述无法被推翻')
  }
  return problems
}

/** scope 必填：写不出影响面，等于这条假设不承重。 */
export function checkScope(scope: unknown): string[] {
  if (!Array.isArray(scope) || scope.length === 0) {
    return ['scope 必填（失效传播范围：受影响的 spec/域/端点/看板列）——写不出影响面说明这条假设不承重']
  }
  if (scope.some((a) => typeof a !== 'string' || !a.trim())) {
    return ['scope 条目须为非空字符串']
  }
  if (scope.length > 40) {
    return ['scope 至多 40 条（超过说明该假设过宽，应拆分）']
  }
  return []
}

// ── 到期与过期 ──

export interface DueRow {
  premise: Premise
  /** 逾期天数（未到期为负） */
  overdueDays: number
}

/** 到期队列：`reviewAt <= now` 且仍成立中的假设。 */
export function dueQueue(premises: Premise[], now: number): DueRow[] {
  const DAY = 86_400_000
  return premises
    .filter((p) => (p.status === 'hold' || p.status === 'pending') && p.reviewAt <= now)
    .map((p) => ({ premise: p, overdueDays: Math.floor((now - p.reviewAt) / DAY) }))
    .sort((a, b) => b.overdueDays - a.overdueDays)
}

/**
 * 过期升级：超宽限期仍未复核 → expired。纯函数（返回新数组与新状态标记）。
 *
 * 宽限期默认 14 天：不是给拖延留后门，而是避开「复核日恰逢发布窗口」的假阳性。
 */
export function expireOverdue(
  premises: Premise[],
  now: number,
  graceDays = 14,
): { premises: Premise[]; expired: string[] } {
  const DAY = 86_400_000
  const expired: string[] = []
  const next = premises.map((p) => {
    if ((p.status === 'hold' || p.status === 'pending')
      && p.reviewAt + graceDays * DAY <= now) {
      expired.push(p.id)
      return { ...p, status: 'expired' as PremiseStatus, updatedAt: now }
    }
    return p
  })
  return { premises: next, expired }
}

// ── 影响面 ──

export function inferAnchorShape(anchor: string): ImpactAnchor['shape'] {
  const a = anchor.trim()
  if (/\.md$/.test(a)) return 'spec'
  if (a.startsWith('/api/')) return 'endpoint'
  if (/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(a) || a.startsWith('governance.')) return 'column'
  if (/^[a-z][a-z0-9-]*(\/[a-z0-9-]+)*$/.test(a)) return 'domain'
  return 'unknown'
}

/**
 * 影响面计算（读侧）。`exists` 由调用方注入探测函数——本函数不碰盘，保持可测。
 */
export function impactOf(
  premise: Pick<Premise, 'id' | 'scope'>,
  exists: (anchor: string) => boolean,
): ImpactReport {
  const anchors = premise.scope.map((anchor) => ({
    anchor,
    exists: exists(anchor),
    shape: inferAnchorShape(anchor),
  }))
  return {
    premiseId: premise.id,
    anchors,
    stale: anchors.filter((a) => !a.exists).length,
  }
}

// ── 推翻 ──

export function canRefute(p: Premise): string[] {
  if (p.status === 'refuted') return ['该假设已被推翻，重复推翻会污染影响面']
  if (p.status === 'expired') return ['该假设已过期——过期不等于被推翻，请先补复核再决定推翻或废止']
  return []
}

/** 推翻：返回新前提对象与重评项（不落盘，落盘在 store）。 */
export function refute(
  p: Premise,
  input: { evidence: string; by: string; now: number },
): { premise: Premise; reeval: ReevalItem } {
  const problems = canRefute(p)
  if (problems.length) throw new Error(problems.join('；'))
  if (typeof input.evidence !== 'string' || !input.evidence.trim()) {
    throw new Error('推翻须带证据来源（evidence）——无证据的推翻只是换个说法')
  }
  const premise: Premise = {
    ...p,
    status: 'refuted',
    refutedBy: { evidence: input.evidence.trim(), at: input.now, by: input.by },
    updatedAt: input.now,
  }
  const reeval: ReevalItem = {
    id: `re-${p.id}-${input.now}`,
    premiseId: p.id,
    anchors: p.scope.slice(),
    reason: `假设被推翻：${p.statement}`,
    queuedAt: input.now,
    state: 'queued',
  }
  return { premise, reeval }
}

/** 改写陈述：留历史，不允许静默覆盖。 */
export function reviseStatement(
  p: Premise,
  statement: string,
  by: string,
  now: number,
): Premise {
  const problems = checkStatement(statement)
  if (problems.length) throw new Error(problems.join('；'))
  const trimmed = statement.trim()
  if (trimmed === p.statement) return p
  return {
    ...p,
    statement: trimmed,
    history: [...(p.history ?? []), { statement: p.statement, at: now, by }],
    updatedAt: now,
  }
}

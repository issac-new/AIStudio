// overlay[expdual] 双轨生命周期引擎（TTSE 四阶段，纯函数）。
//
// 论文 Algorithm 1：每批 检索注入 → 执行 → Blame → Retire → Contradict/Synthesize → Induce。
// 本层只负责「确定性」的一半：归因校验、计数、退役、矛盾结构检测、归纳操作应用；
// 「读轨迹起草操作」的语义一半由调用方（agent/人）提供，引擎逐条校验或拒绝（DESIGN 4.8
// 「AI 只起草，门禁和人工批准原样生效」）。所有函数返回新 store，不改入参。
import { createHash } from 'node:crypto'
import { classifyRule, validateRuleShape } from './dual-classify'
import { jaccard, oppositePolarity, tokenSet } from './dual-text'
import {
  BLAME_THRESHOLD,
  COUNT_DELTA,
  MAX_INDUCE_OPS,
  MAX_OPS_PER_RULE,
  ruleId,
  type BlameInput,
  type BlameRecord,
  type ChunkSnapshot,
  type DualRule,
  type DualStoreShape,
  type InduceOp,
  type RetireInput,
  type RetiredRule,
  type SynthesisCandidate,
  type SynthesisInput,
} from './dual-types'

/** 单条规则保留的证据引用上限（计数才是主证据；引用只留最近 20 条）。 */
const MAX_EVIDENCE = 20

export interface OpRejection {
  index: number
  reason: string
}

export interface InduceResult {
  store: DualStoreShape
  /** 已应用操作的可读摘要（ADD t-3 等）。 */
  applied: string[]
  rejected: OpRejection[]
}

function pushEvidence(rule: DualRule, topic: DualRule['evidence'][number]): void {
  rule.evidence.push(topic)
  if (rule.evidence.length > MAX_EVIDENCE) rule.evidence = rule.evidence.slice(-MAX_EVIDENCE)
}

/** 归纳：校验并应用调用方起草的 ADD/AGREE/EDIT/REMOVE（论文每批 ≤4 条、每规则 ≤1 条）。 */
export function applyInduce(
  store: DualStoreShape,
  ops: InduceOp[],
  chunk: number,
  now: number = Date.now(),
): InduceResult {
  const next = structuredClone(store)
  const applied: string[] = []
  const rejected: OpRejection[] = []
  const list = Array.isArray(ops) ? ops : []
  if (list.length > MAX_INDUCE_OPS) {
    for (let index = 0; index < list.length; index += 1) {
      rejected.push({ index, reason: `每批归纳操作上限 ${MAX_INDUCE_OPS} 条` })
    }
    return { store: next, applied, rejected }
  }
  const perRule = new Map<string, number>()
  for (const [index, op] of list.entries()) {
    const targetId = 'ruleId' in op ? op.ruleId : undefined
    if (targetId) {
      const used = (perRule.get(targetId) ?? 0) + 1
      perRule.set(targetId, used)
      if (used > MAX_OPS_PER_RULE) {
        rejected.push({ index, reason: `同一规则每批最多 ${MAX_OPS_PER_RULE} 条操作（防重复放大）` })
        continue
      }
    }
    if (!op || typeof op !== 'object' || !('op' in op)) {
      rejected.push({ index, reason: '操作形态非法' })
      continue
    }
    if (op.op === 'ADD') {
      if (op.channel !== 'fact' && op.channel !== 'tip') {
        rejected.push({ index, reason: 'channel 须为 fact/tip' })
        continue
      }
      const shape = validateRuleShape({ channel: op.channel, text: op.text, condition: op.condition, action: op.action })
      if (shape.ok === false) {
        rejected.push({ index, reason: shape.problems.join('；') })
        continue
      }
      const seq = next.nextSeq[op.channel]
      next.nextSeq[op.channel] = seq + 1
      const id = ruleId(op.channel, seq)
      const rule: DualRule = {
        id,
        channel: op.channel,
        seq,
        text: shape.text,
        count: COUNT_DELTA.ADD,
        blameCount: 0,
        evidence: [{ kind: 'chunk', ref: `chunk-${chunk}`, at: now }],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }
      if (shape.condition) rule.condition = shape.condition
      if (shape.action) rule.action = shape.action
      const scope = sanitizeScope(op.scope)
      if (scope) rule.scope = scope
      next.rules.push(rule)
      applied.push(`ADD ${id}`)
      continue
    }
    const idx = next.rules.findIndex((r) => r.id === op.ruleId && r.status === 'active')
    if (idx < 0) {
      rejected.push({ index, reason: `规则不存在或已退役：${op.ruleId}` })
      continue
    }
    const rule = next.rules[idx]
    if (op.op === 'AGREE') {
      rule.count += COUNT_DELTA.AGREE
      rule.updatedAt = now
      for (const ev of op.evidence ?? []) pushEvidence(rule, { ...ev })
      applied.push(`AGREE ${rule.id}（count=${rule.count}）`)
      continue
    }
    if (op.op === 'EDIT') {
      const shape = validateRuleShape({
        channel: rule.channel,
        text: op.text,
        condition: op.condition,
        action: op.action,
      })
      if (shape.ok === false) {
        rejected.push({ index, reason: shape.problems.join('；') })
        continue
      }
      rule.text = shape.text
      rule.condition = shape.condition
      rule.action = shape.action
      rule.count += COUNT_DELTA.EDIT
      rule.updatedAt = now
      applied.push(`EDIT ${rule.id}（count=${rule.count}）`)
      continue
    }
    if (op.op === 'REMOVE') {
      if (op.reason !== 'redundant' && op.reason !== 'contradictory') {
        rejected.push({ index, reason: 'REMOVE.reason 须为 redundant/contradictory' })
        continue
      }
      const delta = op.reason === 'contradictory' ? COUNT_DELTA.REMOVE_CONTRADICTORY : COUNT_DELTA.REMOVE_REDUNDANT
      rule.count += delta
      rule.updatedAt = now
      if (rule.count <= 0) {
        next.rules.splice(idx, 1)
        next.removed.push({
          id: rule.id,
          channel: rule.channel,
          text: rule.text,
          count: rule.count,
          reason: op.reason,
          chunk,
          removedAt: now,
        })
        applied.push(`REMOVE ${rule.id}（count=${rule.count}，删除）`)
      } else {
        applied.push(`REMOVE ${rule.id}（count=${rule.count}）`)
      }
      continue
    }
    rejected.push({ index, reason: `未知操作：${String((op as { op?: string }).op)}` })
  }
  return { store: next, applied, rejected }
}

export interface BlameResult {
  store: DualStoreShape
  /** 被归因的规则（退役后即 RetiredRule 的副本）。 */
  retired?: RetiredRule
  rejected?: string
}

/** 归因：每条失败轨迹最多归因一条规则，且必须定位到出错步骤；blameCount ≥ τ 即退役。 */
export function recordBlame(store: DualStoreShape, input: BlameInput, now: number = Date.now()): BlameResult {
  const next = structuredClone(store)
  if (!input.taskRef?.trim()) return { store: next, rejected: 'taskRef 不能为空（归因必须可追溯到失败轨迹）' }
  if (!input.step?.trim()) return { store: next, rejected: 'step 不能为空（归因必须定位到出错步骤）' }
  if (!input.note?.trim()) return { store: next, rejected: 'note 不能为空（归因必须写清规则如何误导执行）' }
  if (!Number.isFinite(input.chunk) || input.chunk <= 0) return { store: next, rejected: 'chunk 须为正整数' }
  if (next.blames.some((b) => b.chunk === input.chunk && b.taskRef === input.taskRef)) {
    return { store: next, rejected: '每条失败轨迹最多归因一条规则（防归因稀释）' }
  }
  const idx = next.rules.findIndex((r) => r.id === input.ruleId && r.status === 'active')
  if (idx < 0) return { store: next, rejected: `规则不存在或已退役：${input.ruleId}` }
  const rule = next.rules[idx]
  rule.blameCount += 1
  rule.updatedAt = now
  const seq = next.blames.filter((b) => b.chunk === input.chunk).length + 1
  const record: BlameRecord = {
    id: `bl-${input.chunk}-${seq}`,
    chunk: input.chunk,
    taskRef: input.taskRef.trim(),
    step: input.step.trim(),
    ruleId: rule.id,
    note: input.note.trim(),
    at: now,
  }
  next.blames.push(record)
  if (rule.blameCount < BLAME_THRESHOLD) return { store: next }
  const retired = retireInPlace(next, rule, 'blame', input.chunk, now, input.note.trim())
  return { store: next, retired }
}

export interface RetireResult {
  store: DualStoreShape
  retired?: RetiredRule
  rejected?: string
}

/** 人工/矛盾/容量退役（论文只按 blame；其余入口同样留原因与批次）。 */
export function retireRule(
  store: DualStoreShape,
  targetId: string,
  input: RetireInput,
  now: number = Date.now(),
): RetireResult {
  const next = structuredClone(store)
  if (!input.reason) return { store: next, rejected: '退役必须给出原因' }
  if (!Number.isFinite(input.chunk) || input.chunk <= 0) return { store: next, rejected: 'chunk 须为正整数' }
  const idx = next.rules.findIndex((r) => r.id === targetId && r.status === 'active')
  if (idx < 0) return { store: next, rejected: `规则不存在或已退役：${targetId}` }
  const retired = retireInPlace(next, next.rules[idx], input.reason, input.chunk, now, input.note)
  return { store: next, retired }
}

function retireInPlace(
  store: DualStoreShape,
  rule: DualRule,
  reason: RetiredRule['reason'],
  chunk: number,
  now: number,
  note?: string,
): RetiredRule {
  const idx = store.rules.findIndex((r) => r.id === rule.id)
  if (idx >= 0) store.rules.splice(idx, 1)
  const record: RetiredRule = {
    id: rule.id,
    channel: rule.channel,
    seq: rule.seq,
    text: rule.text,
    count: rule.count,
    blameCount: rule.blameCount,
    reason,
    chunk,
    retiredAt: now,
  }
  if (rule.condition) record.condition = rule.condition
  if (rule.action) record.action = rule.action
  if (note?.trim()) record.note = note.trim()
  store.retired.push(record)
  return record
}

export interface ContradictionResult {
  store: DualStoreShape
  /** 本次新登记的候选对（已存在的对不重复登记）。 */
  candidates: SynthesisCandidate[]
}

/**
 * 矛盾检测：只在退役池里找结构证据，输出「候选对」而不是「真矛盾」。
 * 两类证据：同条件不同动作；同动作相反极性。已有同对（任何状态）不重复登记。
 */
export function detectContradictions(store: DualStoreShape, now: number = Date.now(), limit = 20): ContradictionResult {
  const next = structuredClone(store)
  const tips = next.retired.filter((r) => r.channel === 'tip' && r.condition && r.action)
  const existing = new Set(next.synthesis.map((c) => pairKey(c.retiredIds[0], c.retiredIds[1])))
  let seq = next.synthesis.reduce((max, c) => {
    const n = Number(c.id.replace(/^sc-/, ''))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  const candidates: SynthesisCandidate[] = []
  for (let i = 0; i < tips.length; i += 1) {
    for (let j = i + 1; j < tips.length; j += 1) {
      if (candidates.length >= limit) break
      const a = tips[i]
      const b = tips[j]
      const key = pairKey(a.id, b.id)
      if (existing.has(key)) continue
      const condSim = jaccard(tokenSet(a.condition ?? ''), tokenSet(b.condition ?? ''))
      const actSim = jaccard(tokenSet(a.action ?? ''), tokenSet(b.action ?? ''))
      let reason = ''
      if (condSim >= 0.5 && actSim < 0.5) reason = '同条件不同动作'
      else if (actSim >= 0.5 && oppositePolarity(a.action ?? '', b.action ?? '')) reason = '同动作相反极性'
      if (!reason) continue
      seq += 1
      const candidate: SynthesisCandidate = {
        id: `sc-${seq}`,
        retiredIds: [a.id, b.id],
        reason: `${reason}：${a.text} ↔ ${b.text}`,
        status: 'open',
        createdAt: now,
      }
      next.synthesis.push(candidate)
      candidates.push(candidate)
      existing.add(key)
    }
  }
  return { store: next, candidates }
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export interface SynthesisCommitResult {
  store: DualStoreShape
  tipId?: string
  rejected?: string
}

/** 合成提交：必须给出合法的条件-动作 TIP；落库为 TIP 并回指退役规则。 */
export function commitSynthesis(
  store: DualStoreShape,
  input: SynthesisInput,
  now: number = Date.now(),
): SynthesisCommitResult {
  const candidate = store.synthesis.find((c) => c.id === input.candidateId)
  if (!candidate) return { store, rejected: `矛盾候选不存在：${input.candidateId}` }
  if (candidate.status !== 'open') return { store, rejected: `矛盾候选不是 open 状态：${candidate.status}` }
  const shape = validateRuleShape({ channel: 'tip', text: '', condition: input.condition, action: input.action })
  if (shape.ok === false) return { store, rejected: shape.problems.join('；') }
  const applied = applyInduce(
    store,
    [{ op: 'ADD', channel: 'tip', text: shape.text, condition: shape.condition, action: shape.action }],
    input.chunk,
    now,
  )
  if (applied.rejected.length > 0) return { store: applied.store, rejected: applied.rejected[0].reason }
  const tipId = applied.applied[0]?.replace(/^ADD\s+/, '')
  if (!tipId) return { store: applied.store, rejected: '合成落库失败（未产生 TIP）' }
  const next = applied.store
  const rule = next.rules.find((r) => r.id === tipId)
  if (rule) pushEvidence(rule, { kind: 'synthesis', ref: candidate.id, note: candidate.reason, at: now })
  const target = next.synthesis.find((c) => c.id === candidate.id)
  if (target) {
    target.status = 'committed'
    target.tipId = tipId
    if (input.note?.trim()) target.note = input.note.trim()
  }
  for (const retired of next.retired) {
    if (candidate.retiredIds.includes(retired.id)) {
      retired.synthesizedInto = tipId
      retired.reason = 'contradiction'
    }
  }
  return { store: next, tipId }
}

/** 驳回矛盾候选：必须写理由（无理由删除等于把闭环重新切断）。 */
export function dismissSynthesis(
  store: DualStoreShape,
  candidateId: string,
  note: string,
): { store: DualStoreShape; rejected?: string } {
  const next = structuredClone(store)
  if (!note?.trim()) return { store: next, rejected: '驳回必须写理由' }
  const target = next.synthesis.find((c) => c.id === candidateId)
  if (!target) return { store: next, rejected: `矛盾候选不存在：${candidateId}` }
  if (target.status !== 'open') return { store: next, rejected: `矛盾候选不是 open 状态：${target.status}` }
  target.status = 'dismissed'
  target.note = note.trim()
  return { store: next }
}

export interface CloseChunkResult {
  store: DualStoreShape
  snapshot: ChunkSnapshot
}

/** 关闭当前批次：落快照（计数＋摘要），批次号 +1 供下一轮演进。 */
export function closeChunk(store: DualStoreShape, now: number = Date.now()): CloseChunkResult {
  const next = structuredClone(store)
  const snapshot: ChunkSnapshot = {
    chunk: next.chunk,
    at: now,
    facts: next.rules.filter((r) => r.channel === 'fact').length,
    tips: next.rules.filter((r) => r.channel === 'tip').length,
    retired: next.retired.length,
    removed: next.removed.length,
    digest: digestBanks(next),
  }
  next.snapshots.push(snapshot)
  next.chunk += 1
  return { store: next, snapshot }
}

/** 双库摘要：只对活跃规则的 id+count+text 取哈希（批次间对账用，不含时刻）。 */
export function digestBanks(store: DualStoreShape): string {
  const rows = [...store.rules]
    .filter((r) => r.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({ id: r.id, channel: r.channel, count: r.count, text: r.text }))
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)
}

/** 分类初判的只读入口（控制器 /classify 复用，避免控制器直接依赖 classify 模块细节）。 */
export function previewClassification(text: string) {
  return classifyRule(text)
}

function sanitizeScope(scope?: DualRule['scope']): DualRule['scope'] | undefined {
  if (!scope) return undefined
  const columns = Array.isArray(scope.columns) ? scope.columns.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : []
  const specialists = Array.isArray(scope.specialists)
    ? scope.specialists.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : []
  if (columns.length === 0 && specialists.length === 0) return undefined
  return { ...(columns.length > 0 ? { columns } : {}), ...(specialists.length > 0 ? { specialists } : {}) }
}

// custom/server/agentidentity/judgments.ts
// 人署名记录：验收结论 / 打回理由 / 推翻依据 / 升级 / 暂停 / 组织能力贡献。
// 只收 human-entry。没有遥测写入端点——这是研究文档 5.3 的取证前提：
// 若「已复核」能由系统自动勾选，复核行为本身会退化。
// 批三 T5：JudgmentRecord 扩展为判别联合——旧六 kind 形态零变化（仍要 unitId）；
// 新 kind='contribution_review' 走 outcomeId＋subject＋assessment（免 unitId）。
// 读侧按 kind 判别：kind==='contribution_review' 为新形态，其余（含历史行）按旧形态读。
import { join } from 'node:path'
import { appendJsonl, readJsonl } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { Person } from './people'

export type JudgmentKind = 'acceptance' | 'rejection' | 'override' | 'escalation' | 'pause' | 'capability'

/** 旧形态（批三 T5 起更名保形）：组织单元上的人署名判断，六 kind 逐一零变化。 */
export interface LegacyJudgmentRecord {
  id: string
  unitId: string
  kind: JudgmentKind
  subjectRef: string
  rationale: string
  evidenceRefs: string[]
  signedBy: string
  signedAt: number
  source: 'human-entry'
}

/** 贡献评价主体种类：person/agent/team（结果合同的贡献面覆盖三类主体）。 */
export type ContributionSubjectKind = 'person' | 'agent' | 'team'

/** 贡献评价结论四态（不设数值分——反目标：不生成排名）。 */
export type ContributionAssessment = 'effective' | 'mixed' | 'ineffective' | 'unknown'

/** 贡献评价（批三 T5，spec 2026-11-21 批三 §五）：锚定结果合同，免 unitId。 */
export interface ContributionReviewRecord {
  id: string
  kind: 'contribution_review'
  outcomeId: string
  subject: { subjectKind: ContributionSubjectKind; subjectId: string }
  assessment: ContributionAssessment
  rationale: string
  evidenceRefs: string[]
  signedBy: string
  signedAt: number
  source: 'human-entry'
}

/** 判别联合：judgments.jsonl 单账两形态共存，读侧按 kind 判别。 */
export type JudgmentRecord = LegacyJudgmentRecord | ContributionReviewRecord

export interface JudgmentInput {
  unitId: string
  kind: JudgmentKind
  subjectRef: string
  rationale: string
  evidenceRefs?: string[]
}

/** appendContributionReview 所需合同最小面（结构化类型：agentidentity 不反向依赖 outcome 域）。 */
export interface ContributionReviewContract {
  outcomeId: string
  ownerPersonId: string
  verificationOwnerId: string
}

export interface ContributionReviewInput {
  /** 幂等键（可选）：客户端网络重试重放同键返回原记录不追加。 */
  reviewId?: string
  /** 签署人：由服务端身份注入（端点层），此处校验须∈{owner,verifier} 且 active。 */
  signedBy: string
  subject: { subjectKind: ContributionSubjectKind; subjectId: string }
  assessment: ContributionAssessment
  rationale: string
  evidenceRefs?: string[]
}

export interface ContributionReviewResult {
  ok: boolean
  problems: string[]
  record?: ContributionReviewRecord
  /** true=reviewId 命中重放，返回的是原记录（未追加）。 */
  replayed?: boolean
}

const KINDS: JudgmentKind[] = ['acceptance', 'rejection', 'override', 'escalation', 'pause', 'capability']
const SUBJECT_KINDS: ContributionSubjectKind[] = ['person', 'agent', 'team']
const ASSESSMENTS: ContributionAssessment[] = ['effective', 'mixed', 'ineffective', 'unknown']

let overrideDir: string | null = null

export function _useJudgmentStoreForTests(dir: string | null): void {
  overrideDir = dir
}

function storeDir(): string {
  if (overrideDir) return overrideDir
  const env = process.env.AGENT_IDENTITY_STORE?.trim()
  return env || underWebUi('agent-identity')
}

function filePath(): string {
  return join(storeDir(), 'judgments.jsonl')
}

/** 新形态判别（读侧）：kind==='contribution_review' 即贡献评价；其余（含历史行）旧形态。 */
const isContributionReview = (r: JudgmentRecord): r is ContributionReviewRecord =>
  (r as { kind?: unknown }).kind === 'contribution_review'

export function listJudgments(unitId?: string): JudgmentRecord[] {
  const { rows } = readJsonl<JudgmentRecord>(filePath())
  if (!unitId) return rows
  // unitId 过滤只命中旧形态：贡献评价无 unitId（判别读，不猜归属）
  return rows.filter((r) => !isContributionReview(r) && r.unitId === unitId)
}

/** 贡献评价反查（批三 T5 贡献面消费）：按 outcomeId 过滤 contribution_review 行。 */
export function listContributionReviews(outcomeId: string): ContributionReviewRecord[] {
  return readJsonl<JudgmentRecord>(filePath()).rows.filter(isContributionReview).filter(
    (r) => r.outcomeId === outcomeId,
  )
}

export function appendJudgment(
  input: JudgmentInput,
  signedBy: string,
  people: Person[],
): { ok: boolean; problems: string[]; record?: LegacyJudgmentRecord } {
  const problems: string[] = []
  if (!input.unitId?.trim()) problems.push('unitId 必填')
  if (!KINDS.includes(input.kind)) problems.push('kind 非法')
  if (!input.subjectRef?.trim()) problems.push('subjectRef 必填（任务/交付物/规则引用）')
  if (typeof input.rationale !== 'string' || input.rationale.trim().length < 20) {
    problems.push('rationale 至少 20 字（写出依据，不写结论）')
  }
  const signer = people.find((p) => p.id === signedBy)
  if (!signer || !signer.active) problems.push('signedBy 必须是在岗自然人')
  if (problems.length) return { ok: problems.length === 0, problems }

  const record: LegacyJudgmentRecord = {
    id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    unitId: input.unitId.trim(),
    kind: input.kind,
    subjectRef: input.subjectRef.trim(),
    rationale: input.rationale.trim(),
    evidenceRefs: (input.evidenceRefs ?? []).map(String),
    signedBy,
    signedAt: Date.now(),
    source: 'human-entry',
  }
  appendJsonl(filePath(), record)
  return { ok: true, problems: [], record }
}

/** 追加贡献评价（批三 T5）。校验全服务端：签署人须∈{owner,verifier} 且在岗；
 *  person 主体禁自评（subjectId!==signedBy）；rationale≥20 字＋evidenceRefs 非空。
 *  幂等键 reviewId（作用域=outcome）：命中返回原记录不追加（重放不同值不覆盖）。
 *  source 恒 human-entry——本函数是唯一写面，遥测口径进不了这份账。 */
export function appendContributionReview(
  input: ContributionReviewInput,
  contract: ContributionReviewContract,
  activePersonIds: Set<string>,
): ContributionReviewResult {
  const problems: string[] = []
  const i = (input ?? {}) as ContributionReviewInput
  const signer = (i.signedBy ?? '').trim()
  const reviewId = typeof i.reviewId === 'string' ? i.reviewId.trim() : ''
  if (i.reviewId !== undefined && !reviewId) problems.push('reviewId 须为非空字符串')
  if (!signer) {
    problems.push('signedBy 必填')
  } else {
    if (signer !== contract.ownerPersonId && signer !== contract.verificationOwnerId) {
      problems.push('签署人必须是合同 owner 或 verificationOwner（贡献评价不允许责任位之外的人署名）')
    }
    if (!activePersonIds.has(signer)) problems.push('signedBy 必须是在岗自然人')
  }
  const subject = i.subject as { subjectKind?: unknown; subjectId?: unknown } | undefined
  if (!subject || typeof subject !== 'object') {
    problems.push('subject 必填（{subjectKind, subjectId}）')
  } else {
    if (!SUBJECT_KINDS.includes(subject.subjectKind as ContributionSubjectKind)) {
      problems.push('subjectKind 须为 person|agent|team')
    }
    if (typeof subject.subjectId !== 'string' || !subject.subjectId.trim()) {
      problems.push('subjectId 必填')
    } else if (
      subject.subjectKind === 'person' &&
      subject.subjectId.trim() === signer
    ) {
      problems.push('subjectKind=person 时 subjectId 不得等于签署人（禁自评）')
    }
  }
  if (!ASSESSMENTS.includes(i.assessment as ContributionAssessment)) {
    problems.push('assessment 须为 effective|mixed|ineffective|unknown')
  }
  if (typeof i.rationale !== 'string' || i.rationale.trim().length < 20) {
    problems.push('rationale 至少 20 字（写出依据，不写结论）')
  }
  if (!Array.isArray(i.evidenceRefs) || i.evidenceRefs.length === 0 || !i.evidenceRefs.every((x) => typeof x === 'string' && x.trim())) {
    problems.push('evidenceRefs 必填（至少一条非空证据引用）')
  }
  if (problems.length) return { ok: false, problems }

  // 幂等扫描（appendMeasurement 同款：先查后写、重放返回原记录不覆盖）。
  // 作用域边界（T5-M3 注记，不改行为）：扫描经 listContributionReviews(contract.outcomeId)
  // 预过滤，reviewId 唯一性只在单 outcome 域内成立——跨 outcome 重放同 reviewId 不会命中
  // 幂等，而是各自追加（judgments.jsonl 全局单账出现同 id 双行；读侧按 outcomeId 过滤，
  // 互不串面）。后续若需全局唯一：改为读全量 contribution_review 行先按 id 匹配，命中
  // 异域 id 时显式拒绝（422 reviewId 冲突）而非追加。
  if (reviewId) {
    const hit = listContributionReviews(contract.outcomeId).find((r) => r.id === reviewId)
    if (hit) return { ok: true, problems: [], record: hit, replayed: true }
  }

  const record: ContributionReviewRecord = {
    id: reviewId || `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'contribution_review',
    outcomeId: contract.outcomeId,
    subject: {
      subjectKind: (subject as { subjectKind: ContributionSubjectKind }).subjectKind,
      subjectId: (subject as { subjectId: string }).subjectId.trim(),
    },
    assessment: i.assessment as ContributionAssessment,
    rationale: i.rationale.trim(),
    evidenceRefs: (i.evidenceRefs ?? []).map((x) => String(x).trim()),
    signedBy: signer,
    signedAt: Date.now(),
    source: 'human-entry',
  }
  appendJsonl(filePath(), record)
  return { ok: true, problems: [], record }
}

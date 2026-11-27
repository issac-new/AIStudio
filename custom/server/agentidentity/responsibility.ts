// custom/server/agentidentity/responsibility.ts
// 责任卡：任务边界之外的可追责要素（交付标准 / 单元类型 / 风险档 / 协作等级 /
// 主责任人与复核人 / 升级与暂停条件 / 接管人 / 检验用例版本 / 成本预算 / 维护人与部署位置）。
// 校验是纯函数，不读盘。
//
// 任务边界（能力边界）与权限范围（工具白名单）登记在身份户口上而不在卡上；
// 准入时由 lifecycle 并查两处（2026-11-27 研究报告讨论稿吸收，spec 2026-11-27-workunit-framework-align）。
//
// 复核人分离按单元类型分：顶岗型（直接对外或进业务系统）强制复核人且不得与主责任人同人；
// 助手型（人发起人采用）不强制，未分离只作提示。
// 风险档按后果分三级：tier1 可独立执行 / tier2 复核后生效 / tier3 只提供线索和建议。
// 存量 low|medium|high 只在读侧映射、不改写数据（spec D6）。
import { createHash } from 'node:crypto'
import type { JudgmentRecord } from './judgments'
import type { Person } from './people'

export interface AdmissionEvidence {
  representativeTasks: string[]
  edgeCases: string[]
  dataPermissionReview: string[]
  recordedAt: number
}

/** 单元类型：assistant 助手型（人发起人采用，不顶岗）；post 顶岗型（直接对外或进业务系统，结果直接生效）。 */
export type UnitType = 'assistant' | 'post'

/** 三级风险档（按后果）：数字越大人工介入越多。 */
export type RiskTierLevel = 'tier1' | 'tier2' | 'tier3'

/** 存量取值（只读不改写）。 */
export type LegacyRiskTier = 'low' | 'medium' | 'high'

export type CardRiskTier = RiskTierLevel | LegacyRiskTier

/** 协作等级：1 人操作／2 AI 建议／3 AI 承接人验收／4 AI 端到端人管例外／5 AI 管理循环人定边界。
 *  取值域与 autonomygov 的 AL0–AL5 同构，不新建第二套等级名目。 */
export type CollabLevel = 1 | 2 | 3 | 4 | 5

export interface ResponsibilityCard {
  deliveryStandard: string
  /** 单元类型（2026-11-27 起）；存量可缺，缺口由 validateCard 报出——未声明不得准入 */
  unitType?: UnitType
  riskTier: CardRiskTier
  /** 协作等级（2026-11-27 起）；存量可缺 */
  collabLevel?: CollabLevel
  /** 协作等级取 4 时的「仅单点验证」标注；取 4 必填 */
  collabLevelNote?: string
  primaryOwner: string
  reviewer?: string
  escalation: string[]
  pauseConditions: string[]
  takerOver: string
  testCaseVersion: string
  costBudget: { limit: number; unit: string }
  maintainer: string
  deploymentLocation: string
  businessOwnerSign?: { signedBy: string; signedAt: number; note?: string; cardRevision?: string; stale?: boolean }
  admissionEvidence?: AdmissionEvidence
}

export interface CardGap { field: string; detail: string }

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const arrNonEmpty = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(nonEmpty)

/** 顶岗型风险档下限：结果直接生效，复核后生效（二级）是最低要求。 */
const POST_RISK_FLOOR: RiskTierLevel = 'tier2'

/** 协作等级校验的可选上下文：al5Configured=存在判定通过的自治刻度配置（由调用方读 autonomygov 后传入，本模块不反向依赖）。 */
export interface CardValidateOptions {
  al5Configured?: boolean
  /** 写入口径（保存责任卡）：风险档只收三级取值。缺省为读侧口径——存量旧值 low|medium|high
   *  只要能归一就不算缺口（spec D6：读侧映射不改写）。读侧若把旧值当缺口，存量带卡单元会在
   *  本批合并当天全部被派单门拦下（独立审查阻断 3）。 */
  forSave?: boolean
}

const RISK_LEVELS: RiskTierLevel[] = ['tier1', 'tier2', 'tier3']
const LEGACY_RISK_MAP: Record<LegacyRiskTier, RiskTierLevel> = { low: 'tier1', medium: 'tier2', high: 'tier2' }
const RISK_ORDER: Record<RiskTierLevel, number> = { tier1: 1, tier2: 2, tier3: 3 }

/** 读侧映射：把存量 low|medium|high 归一到三级；非法或缺省返回 null（调用方按缺口处理）。 */
export function normalizeRiskTier(tier: unknown): RiskTierLevel | null {
  if (typeof tier !== 'string') return null
  if ((RISK_LEVELS as string[]).includes(tier)) return tier as RiskTierLevel
  if (tier in LEGACY_RISK_MAP) return LEGACY_RISK_MAP[tier as LegacyRiskTier]
  return null
}

/** 保存口径：只收三级取值；存量旧值可读但新保存拒绝（spec D6）。 */
function isWritableRiskTier(tier: unknown): tier is RiskTierLevel {
  return typeof tier === 'string' && (RISK_LEVELS as string[]).includes(tier)
}

/** 卡的字段级校验（不含准入专属证据）。空数组=通过。 */
export function validateCard(
  card: ResponsibilityCard | undefined,
  people: Person[],
  opts: CardValidateOptions = {},
): string[] {
  if (!card) return ['责任卡未填写']
  const problems: string[] = []
  const active = new Map(people.filter((p) => p.active).map((p) => [p.id, p]))
  if (!nonEmpty(card.deliveryStandard)) problems.push('deliveryStandard 必填（交付标准）')
  if (card.unitType !== 'assistant' && card.unitType !== 'post') {
    problems.push('unitType 必填（助手型或顶岗型）——未声明类型的执行单元不得准入')
  }
  // 风险档：写入口径只收三级取值；读侧口径只要求能归一（旧值可读）
  const tier = normalizeRiskTier(card.riskTier)
  if (opts.forSave ? !isWritableRiskTier(card.riskTier) : tier === null) {
    problems.push(opts.forSave
      ? 'riskTier 须为 tier1|tier2|tier3（旧值 low|medium|high 可读，重新保存须改三级取值）'
      : 'riskTier 取值无法识别（既非三级取值，也非存量旧值）')
  }
  // 顶岗型风险档下限：按归一后的等级判（存量 high 归一为二级，满足下限）
  if (card.unitType === 'post' && tier && RISK_ORDER[tier] < RISK_ORDER[POST_RISK_FLOOR]) {
    problems.push('顶岗型执行单元风险档不得低于二级（结果直接生效，至少复核后生效）')
  }
  if (!active.has(card.primaryOwner)) problems.push('primaryOwner 必须是在岗自然人')
  if (card.unitType === 'post') {
    if (!card.reviewer) problems.push('顶岗型执行单元必须登记复核人')
    else if (card.reviewer === card.primaryOwner) problems.push('复核人不得为同一人（顶岗型）')
  }
  if (card.reviewer && !active.has(card.reviewer)) problems.push('reviewer 必须是在岗自然人')
  if (card.collabLevel !== undefined) {
    const lv = card.collabLevel as unknown
    if (typeof lv !== 'number' || !Number.isInteger(lv) || lv < 1 || lv > 5) {
      problems.push('collabLevel 须为 1-5 的整数')
    } else {
      // 第四级须标明仅单点验证（报告：第四级只在单点验证）
      if (lv === 4 && !nonEmpty(card.collabLevelNote)) problems.push('协作等级取 4 须标注「仅单点验证」')
      // 第五级沿用用户 2026-11-05 对 AL5 的条件式裁决：须有判定通过的自治刻度配置
      if (lv === 5 && !opts.al5Configured) problems.push('协作等级取 5 须有判定通过的自治刻度配置')
    }
  }
  if (!arrNonEmpty(card.escalation)) problems.push('escalation 至少一条（什么情况必须升级）')
  if (!arrNonEmpty(card.pauseConditions)) problems.push('pauseConditions 至少一条（什么情况必须暂停）')
  if (!active.has(card.takerOver)) problems.push('takerOver 必须是在岗自然人')
  if (!nonEmpty(card.testCaseVersion)) problems.push('testCaseVersion 必填')
  if (!card.costBudget || !(card.costBudget.limit > 0) || !nonEmpty(card.costBudget.unit)) {
    problems.push('costBudget 须含正的 limit 与 unit')
  }
  if (!active.has(card.maintainer)) problems.push('maintainer 必须是在岗自然人')
  if (!nonEmpty(card.deploymentLocation)) problems.push('deploymentLocation 必填')
  return problems
}

/** 带缺口字段名的读模型；forAdmission 时追加签署与准入证据两项。 */
export function cardGaps(
  card: ResponsibilityCard | undefined,
  people: Person[],
  opts: { forAdmission?: boolean } & CardValidateOptions = {},
): CardGap[] {
  const gaps: CardGap[] = validateCard(card, people, opts).map((detail) => ({ field: 'card', detail }))
  if (!card) return gaps
  if (opts.forAdmission) {
    if (!card.businessOwnerSign || !nonEmpty(card.businessOwnerSign.signedBy)) {
      gaps.push({ field: 'business-owner-sign', detail: '准入前须由业务负责人签署责任卡' })
    } else {
      // 签署绑定卡版本指纹：内容改动后旧签署失效（stale），须重新签署
      if (card.businessOwnerSign.stale) {
        gaps.push({ field: 'business-owner-sign', detail: '业务负责人签署已失效（责任卡内容已变更），须重新签署' })
      }
      // 存量签署缺版本指纹时无法判定对应哪个版本，一律要求重签
      if (!nonEmpty(card.businessOwnerSign.cardRevision)) {
        gaps.push({ field: 'business-owner-sign', detail: '旧签署无版本指纹，须重签' })
      }
    }
    const ev = card.admissionEvidence
    if (!ev || !arrNonEmpty(ev.representativeTasks) || !arrNonEmpty(ev.edgeCases) || !arrNonEmpty(ev.dataPermissionReview)) {
      gaps.push({ field: 'admission-evidence', detail: '准入须记录代表性任务、边界情况、数据与权限评估' })
    }
  }
  return gaps
}

/** 规范化 JSON（键字典序排序）——同一内容恒得同一串，是版本指纹的输入。 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** 责任卡版本指纹：去掉签署与准入证据后规范化 JSON 的 SHA-256 十六进制。
 *  签署对象与准入证据不进指纹——改证据不该让签署失效，改卡面内容才失效。 */
export function cardRevision(card: ResponsibilityCard): string {
  const { businessOwnerSign: _sign, admissionEvidence: _evidence, ...content } = card
  return createHash('sha256').update(canonicalJson(content)).digest('hex')
}

/** 未分离提示：顶岗型由 validateCard 强制（不走提示）；助手型未填或同人才提示。 */
export function separationNotice(card: ResponsibilityCard | undefined): string | null {
  if (!card || card.unitType === 'post') return null
  if (card.reviewer && card.reviewer === card.primaryOwner) return '复核人与主责任人为同一人（助手型允许，但未分离）'
  if (!card.reviewer) return '未登记复核人（助手型允许，但未分离）'
  return null
}

// ── 扩权判定与就绪度（2026-11-27，spec §变更 三）──

/** 变更前后的范围快照：户口的边界与白名单 ＋ 卡上的风险档与协作等级。 */
export interface ScopeSnapshot {
  can: string[]
  cannot: string[]
  toolAllowlist: string[]
  riskTier: RiskTierLevel
  collabLevel: CollabLevel
  /** 检验用例版本（就绪度判定用，不参与扩权比较） */
  testCaseVersion?: string
}

/** 扩权命中的维度。空数组=未扩权。 */
export type ScopeExpansionKind =
  | 'capability-can'      // 能做条目增加
  | 'capability-cannot'   // 不做条目减少
  | 'tool-allowlist'      // 工具白名单变多
  | 'risk-lowered'        // 风险档降低（人工介入变少）
  | 'collab-raised'       // 协作等级升高

/** 变更前后对比，任一命中即扩权。只比较范围维度，不比较文本字段（交付标准改写不算扩权）。 */
export function isScopeExpansion(before: ScopeSnapshot, after: ScopeSnapshot): ScopeExpansionKind[] {
  const hits: ScopeExpansionKind[] = []
  const bCan = new Set(before.can), aCan = new Set(after.can)
  if ([...aCan].some((x) => !bCan.has(x))) hits.push('capability-can')
  const bCannot = new Set(before.cannot), aCannot = new Set(after.cannot)
  if ([...bCannot].some((x) => !aCannot.has(x))) hits.push('capability-cannot')
  const bTools = new Set(before.toolAllowlist), aTools = new Set(after.toolAllowlist)
  if ([...aTools].some((x) => !bTools.has(x))) hits.push('tool-allowlist')
  if (RISK_ORDER[after.riskTier] < RISK_ORDER[before.riskTier]) hits.push('risk-lowered')
  if (after.collabLevel > before.collabLevel) hits.push('collab-raised')
  return hits
}

/** 五项能力就绪度（建设顺序即解锁顺序）。 */
export type ReadinessId = 'net-contribution' | 'correction-channel' | 'discretion' | 'reliability' | 'case-maintenance'

export type ReadinessState = 'yes' | 'no' | 'unknown'

export interface ReadinessItem {
  id: ReadinessId
  state: ReadinessState
  /** no 与 unknown 必须带缺口说明；yes 为空串 */
  gap: string
}

export interface ReadinessInput {
  snapshot: ScopeSnapshot
  /** 本单元的人署名记录（只收 human-entry） */
  judgments: Pick<JudgmentRecord, 'kind'>[]
  /** stabilityRetest>=2 的评测读数条数；缺省=无数据源 */
  stabilityReadings?: number
}

const READINESS_ORDER: ReadinessId[] = ['net-contribution', 'correction-channel', 'discretion', 'reliability', 'case-maintenance']

/** 五项就绪度。净贡献今天无数据源恒 unknown；其余按已有数据如实判，不补数。只记录，不评分。 */
export function readiness(input: ReadinessInput): ReadinessItem[] {
  const { snapshot, judgments } = input
  const kinds = new Set(judgments.map((j) => j.kind))
  const hasCaseVersion = nonEmpty(snapshot.testCaseVersion)
  const stability = input.stabilityReadings ?? 0

  const items: Record<ReadinessId, ReadinessItem> = {
    'net-contribution': {
      id: 'net-contribution', state: 'unknown',
      gap: '净贡献核算尚无数据源（复核、纠错、维护成本未入账）——只记录不考核',
    },
    'correction-channel': kinds.has('rejection')
      ? { id: 'correction-channel', state: 'yes', gap: '' }
      : { id: 'correction-channel', state: 'no', gap: '无驳回类署名记录——业务专家纠错通道未经使用' },
    discretion: kinds.has('override') || kinds.has('escalation') || kinds.has('pause')
      ? { id: 'discretion', state: 'yes', gap: '' }
      : { id: 'discretion', state: 'no', gap: '无推翻／升级／暂停类署名记录——管理者裁量保障未经使用' },
    reliability: hasCaseVersion && stability > 0
      ? { id: 'reliability', state: 'yes', gap: '' }
      : hasCaseVersion
        ? { id: 'reliability', state: 'unknown', gap: '无稳定性重测读数（stabilityRetest < 2 或未跑评测）' }
        : { id: 'reliability', state: 'no', gap: '无检验用例版本，无从重测' },
    'case-maintenance': hasCaseVersion
      ? { id: 'case-maintenance', state: 'yes', gap: '' }
      : { id: 'case-maintenance', state: 'no', gap: '无检验用例版本' },
  }
  return READINESS_ORDER.map((id) => items[id])
}

/** 从身份与卡取出范围快照。风险档取值非法时按最严（三级）落，宁可多判扩权。 */
export function scopeSnapshotOf(identity: {
  toolAllowlist?: string[]
  capabilityBoundary?: { can?: string[]; cannot?: string[] }
  responsibilityCard?: ResponsibilityCard
}): ScopeSnapshot {
  const card = identity.responsibilityCard
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
  return {
    can: strs(identity.capabilityBoundary?.can),
    cannot: strs(identity.capabilityBoundary?.cannot),
    toolAllowlist: strs(identity.toolAllowlist),
    riskTier: normalizeRiskTier(card?.riskTier) ?? 'tier3',
    collabLevel: card?.collabLevel ?? 1,
    // 检验用例版本供就绪度判定；不参与扩权比较（isScopeExpansion 只比五个范围维度）
    ...(nonEmpty(card?.testCaseVersion) ? { testCaseVersion: card.testCaseVersion } : {}),
  }
}

// custom/server/outcome/snapshot.ts
// 派单最小上下文快照（spec 2026-11-19-ai-native-operating-model-design.md §4.4；Task 6）。
// 快照是「Agent 当时实际看到的上下文」的不可变物化：content 承载规范化只读内容，
// sourceRefs 只负责溯源，历史还原不承诺外部链接永存。
//
// 信任边界（立法）：content 物化的合同侧文本已过 validate.ts 入库校验；
// sanitizeForSnapshot 是物化前的最小真防线——针对「已验证文本仍可能携带的凭据泄漏形态」
// （如 measure sourceRef 内嵌 token），不是对未验证输入的完整净化。附件字节、密钥原值
// 与未授权材料永不物化（spec §4.4）；本函数之外的新增自由文本字段必须同步纳入脱敏面。
//
// 结构纪律（纯核心＋IO 薄壳分离）：
//   - buildSnapshotFromResolved：纯核心——只接收已解析输入，不读盘、不取时钟、不随机，
//     同输入产出全同快照（含 sha256/snapshotId）；
//   - buildMinimalSnapshot：IO 薄壳——签名=任务简报逐字＋可选 extraPersonIds，负责调
//     resolve 拿任务摘要与身份册、吞解析异常转 problems，再委托纯核心。
//
// 身份行语义（审查 Important-2 裁决）：owner 与 verifier 的身份行是关键源——解析结果中
// 任一缺席（含身份册返回空数组/未收录）→ ok:false 禁止派单，不降级进 excludedSources；
// excludedSources 的 people 行仅适用于合同/团队额外引用的其他人（extraPersonIds 通道，
// 批二接团队 roster 时复用）。
//
// 哈希口径：sha256 = sha256(canonicalJson(信封去 {snapshotId, createdAt, sha256}))。
// 易变字段（生成时刻、派生 id）不入哈希——同语义输入跨时刻同哈希，是存储面
// 「幂等按内容 sha256 重放」的前提；snapshotId 取哈希前 16 hex（内容寻址），
// 同输入两次构建全同。canonicalJson 复用 outcome-store 导出（同构唯一实现，不再另抄）。
//
// 临界（spec §4.4 逐字）：content canonical 超 1 MiB 或 sourceRefs 超 100 → 拒绝生成，
// 不静默截断；problems 注明实际超限值。关键源（合同/任务/身份/政策）失败 → ok:false
// 禁止派单。批一：teamVersion 恒 null、approvedExperienceVersions 恒 []（批二在同一
// 信封追加，不另建格式）。
import { createHash } from 'node:crypto'
import vectors from './decision-vectors.json'
import { canonicalJson } from './outcome-store'
import type { OutcomeContract } from './types'

/** 快照信封（spec §4.4 逐字；批一 teamVersion 恒 null、approvedExperienceVersions 恒 []）。 */
export interface OutcomeContextSnapshot {
  snapshotId: string
  outcomeId: string
  contractVersion: number
  teamVersion: number | null
  decisionPolicyVersion: string
  /** 实际注入 Agent 的规范化只读内容（已过脱敏防线）；不是仅有一组可失效引用。 */
  content: Record<string, unknown>
  sourceRefs: Array<{ kind: string; id: string; version?: string; sha256?: string }>
  approvedExperienceVersions: string[]
  excludedSources: Array<{ kind: string; reason: string }>
  createdAt: number
  sha256: string
}

/** 任务摘要行（resolve.task 契约）。 */
export interface SnapshotTaskSummary {
  id: string
  title: string
  status: string
}

/** 身份行（resolve.people 契约；active=false 是信息不是缺席，照常物化）。 */
export interface SnapshotPersonRow {
  id: string
  name: string
  active: boolean
}

/** 纯核心入参：一切来源均已解析完毕，无 IO、无时钟、无随机。 */
export interface ResolvedSnapshotInput {
  contract: OutcomeContract
  decisionPolicyVersion: string
  /** 矩阵版本标识（批一取共享判定向量内容摘要）。 */
  matrixVersion: string
  task: SnapshotTaskSummary
  /** 身份册已解析成功的行。owner/verifier 为关键（缺席→ok:false）；
   *  extraPersonIds 为额外引用人（缺席→excludedSources，非关键）。 */
  people: SnapshotPersonRow[]
  /** 合同/团队额外引用的其他人（可选）：与 owner/verifier 一并去重后对照 people 判缺席。 */
  extraPersonIds?: string[]
  createdAt: number
}

export type BuildSnapshotResult =
  | { ok: true; snapshot: OutcomeContextSnapshot }
  | { ok: false; problems: string[] }

/** IO 薄壳入参（任务简报逐字＋审查 Important-2 增补的可选额外人通道）：resolve 由调用方供给读取面。 */
export interface BuildMinimalSnapshotInput {
  contract: OutcomeContract
  decisionPolicyVersion: string
  /** 合同/团队额外引用的其他人（可选）：缺席进 excludedSources（非关键）；owner/verifier 恒为关键。 */
  extraPersonIds?: string[]
  resolve: {
    task(): { ok: boolean; task?: SnapshotTaskSummary }
    people(ids: string[]): { ok: boolean; people?: SnapshotPersonRow[] }
  }
}

/** content canonical 字节上限（spec §4.4：超 1 MiB 拒绝生成，不截断）。 */
export const SNAPSHOT_CONTENT_MAX_BYTES = 1024 * 1024

/** sourceRefs 条数上限（spec §4.4：超 100 拒绝生成，不截断）。 */
export const SNAPSHOT_SOURCE_REFS_MAX = 100

/** 矩阵版本标识：共享判定向量（decision-vectors.json）的内容摘要——向量变更即版本变更，
 *  与授权矩阵（decision-matrix.ts）单一事实源同体，不另立手维护版本号。 */
export const DECISION_MATRIX_VERSION = `vec-${createHash('sha256')
  .update(canonicalJson(vectors))
  .digest('hex')
  .slice(0, 16)}`

/**
 * URL userinfo 密码形态脱敏（物化前最小真防线）：`scheme://user:pass@…` → `scheme://user:***@…`；
 * 无密码（`scheme://user@…`）原样保留；要求合法 scheme（字母开头，RFC 3986 字符集）＋`://`，
 * 裸 `user:pass@host` 文本不误伤。重复应用幂等（密码段已是 `***` 再脱不变）。
 *
 * 实现为线性手写扫描器而非全局正则：正则在每个起点做长回溯，无匹配长文本（如 1 MiB
 * valueStatement）上退化为 O(n²)——实测 1.1M 字符卡死分钟级以上。扫描器只沿 indexOf('://')
 * 锚点推进，整体线性（审查修复轮实测教训，勿改回正则版）。
 */
const isSchemeChar = (ch: string): boolean => /[A-Za-z0-9+.-]/.test(ch)
const isLetter = (ch: string): boolean => /[A-Za-z]/.test(ch)

export function sanitizeForSnapshot(text: string): string {
  let out = ''
  let i = 0
  for (;;) {
    const p = text.indexOf('://', i)
    if (p < 0) return out + text.slice(i)
    // scheme 起点：从 :// 向左取最长 scheme 字符段；首字符须字母，否则不是合法 URL（跳过该 ://）
    let s = p
    while (s > 0 && isSchemeChar(text[s - 1])) s--
    if (s === p || !isLetter(text[s])) {
      out += text.slice(i, p + 3)
      i = p + 3
      continue
    }
    // userinfo 段：:// 之后到首个 '/' '?' '#' 或 '@' 止；无 '@' 即无凭据形态，原样越过
    let e = p + 3
    while (e < text.length && text[e] !== '/' && text[e] !== '?' && text[e] !== '#' && text[e] !== '@') e++
    if (e >= text.length || text[e] !== '@') {
      out += text.slice(i, e)
      i = e
      continue
    }
    const userinfo = text.slice(p + 3, e)
    const colon = userinfo.indexOf(':')
    if (colon <= 0) {
      // 无冒号（user@，无密码）或空 user：保留
      out += text.slice(i, e + 1)
      i = e + 1
      continue
    }
    out += text.slice(i, p + 3) + userinfo.slice(0, colon) + ':***@'
    i = e + 1
  }
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
const shaHex = (s: string): string => createHash('sha256').update(s).digest('hex')

/** 身份行形状守卫：id/name 字符串、active 布尔。 */
const isPersonRow = (v: unknown): v is SnapshotPersonRow => {
  if (v === null || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return nonEmpty(p.id) && typeof p.name === 'string' && typeof p.active === 'boolean'
}

/**
 * 纯核心：由已解析来源构建最小快照。关键源（合同/任务/身份/政策）失真或缺失、
 * 或 owner/verifier 身份行缺席 → ok:false；额外引用人缺席 → excludedSources（非关键）；
 * 临界超限 → ok:false 不截断。content 五类自由文本面过 sanitizeForSnapshot 后物化。
 */
export function buildSnapshotFromResolved(input: ResolvedSnapshotInput): BuildSnapshotResult {
  const problems: string[] = []
  const c = input?.contract
  if (c === null || typeof c !== 'object') {
    problems.push('合同关键源失败：contract 缺失或非对象，禁止派单')
  } else {
    if (!nonEmpty(c.outcomeId)) problems.push('合同关键源失败：outcomeId 必填')
    if (typeof c.version !== 'number' || !Number.isInteger(c.version) || c.version < 1)
      problems.push('合同关键源失败：version 须为正整数')
    if (!nonEmpty(c.ownerPersonId)) problems.push('合同关键源失败：ownerPersonId 必填')
    if (!nonEmpty(c.verificationOwnerId)) problems.push('合同关键源失败：verificationOwnerId 必填')
    if (!Array.isArray(c.measures))
      problems.push('合同关键源失败：measures 须为数组')
    else if (!c.measures.every((m) => m !== null && typeof m === 'object' && nonEmpty((m as { measureId?: unknown }).measureId)))
      problems.push('合同关键源失败：measures 各项须为带 measureId 的对象')
    // acceptance/scope 形状守卫：content 构建要对这些数组逐项脱敏，脏形状必须在此拒绝
    // （判据与 validateContractInput 同构），否则核心纯函数会在 map 上抛异常。
    const acc = c.acceptance
    if (acc === null || typeof acc !== 'object' || Array.isArray(acc)
      || !isStrArray((acc as { statements?: unknown }).statements)
      || !isStrArray((acc as { requiredEvidenceKinds?: unknown }).requiredEvidenceKinds))
      problems.push('合同关键源失败：acceptance 须为 {statements, requiredEvidenceKinds} 字符串数组')
    const scope = c.scope
    if (scope === null || typeof scope !== 'object' || Array.isArray(scope)
      || !isStrArray((scope as { included?: unknown }).included)
      || !isStrArray((scope as { excluded?: unknown }).excluded))
      problems.push('合同关键源失败：scope 须为 {included, excluded} 字符串数组')
  }
  if (!nonEmpty(input.decisionPolicyVersion))
    problems.push('政策关键源失败：decisionPolicyVersion 必填，禁止派单')
  if (!nonEmpty(input.matrixVersion))
    problems.push('政策关键源失败：矩阵版本标识缺失，禁止派单')

  const t = input.task
  if (t === null || typeof t !== 'object' || !nonEmpty(t.id) || typeof t.title !== 'string' || typeof t.status !== 'string')
    problems.push('任务关键源失败：任务摘要形状非法（须 {id 非空, title, status}），禁止派单')

  const people = Array.isArray(input.people) ? input.people : []
  people.forEach((p, i) => {
    if (!isPersonRow(p)) problems.push(`身份行形状非法（people[${i}] 须 {id 非空, name, active}）`)
  })
  const extraRequested = Array.isArray(input.extraPersonIds)
    ? input.extraPersonIds.filter(nonEmpty)
    : []

  if (typeof input.createdAt !== 'number' || !Number.isFinite(input.createdAt))
    problems.push('createdAt 须为有限数值')

  if (problems.length) return { ok: false, problems }

  // —— 以下 input 已通过守卫，可安全收窄 ——
  const contract = input.contract
  const task = input.task as SnapshotTaskSummary

  // 身份行分诊（审查 Important-2 裁决）：owner/verifier=关键（任一缺席禁止派单）；
  // 额外引用人=非关键（缺席记 excludedSources，命中物化 additionalPeople）。
  const criticalIds = Array.from(new Set([contract.ownerPersonId, contract.verificationOwnerId]))
  const extraIds = Array.from(new Set(extraRequested)).filter((id) => !criticalIds.includes(id))
  const found = new Map(people.map((p) => [p.id, p]))
  const missingCritical = criticalIds.filter((id) => !found.has(id))
  if (missingCritical.length) {
    return {
      ok: false,
      problems: [
        `身份关键源失败：owner/verifier 身份行未返回（缺席：${missingCritical.join('、')}），禁止派单（spec §4.4）`,
      ],
    }
  }
  const ownerRow = found.get(contract.ownerPersonId) as SnapshotPersonRow
  const verifierRow = found.get(contract.verificationOwnerId) as SnapshotPersonRow
  const additionalRows = extraIds
    .map((id) => found.get(id))
    .filter((p): p is SnapshotPersonRow => !!p)
  const excludedSources: OutcomeContextSnapshot['excludedSources'] = extraIds
    .filter((id) => !found.has(id))
    .map((id) => ({ kind: 'people', reason: `person:${id} 身份册未返回（额外引用人，非关键源）` }))

  // content：合同规范子集（不含 status 等运行态面）＋身份行＋任务摘要＋策略块。
  // 五类自由文本面过脱敏防线后物化（新数组/新对象，不回写合同原身）。
  const content: Record<string, unknown> = {
    contract: {
      outcomeId: contract.outcomeId,
      rootTaskId: contract.rootTaskId,
      contractVersion: contract.version,
      title: contract.title,
      valueStatement: sanitizeForSnapshot(contract.valueStatement),
      measures: contract.measures.map((m) => ({
        ...m,
        definition: sanitizeForSnapshot(m.definition),
        sourceRef: sanitizeForSnapshot(m.sourceRef),
      })),
      acceptance: {
        statements: contract.acceptance.statements.map(sanitizeForSnapshot),
        requiredEvidenceKinds: [...contract.acceptance.requiredEvidenceKinds],
      },
      scope: {
        included: contract.scope.included.map(sanitizeForSnapshot),
        excluded: contract.scope.excluded.map(sanitizeForSnapshot),
      },
      riskTier: contract.riskTier,
      defaultReversibility: contract.defaultReversibility,
    },
    task: { id: task.id, title: task.title, status: task.status },
    policy: { decisionPolicyVersion: input.decisionPolicyVersion, matrixVersion: input.matrixVersion },
  }
  content.owner = { ...ownerRow }
  content.verifier = { ...verifierRow }
  if (additionalRows.length) content.additionalPeople = additionalRows.map((p) => ({ ...p }))

  // sourceRefs：只溯源不承载内容；measure 定义逐条入 refs（超限由临界检查拒收）
  const sourceRefs: OutcomeContextSnapshot['sourceRefs'] = [
    {
      kind: 'contract',
      id: contract.outcomeId,
      version: String(contract.version),
      sha256: shaHex(canonicalJson(contract)),
    },
    { kind: 'task', id: task.id },
  ]
  const peopleRefIds = new Set([...criticalIds, ...additionalRows.map((p) => p.id)])
  for (const id of peopleRefIds) sourceRefs.push({ kind: 'people', id })
  sourceRefs.push({ kind: 'decision-policy', id: input.decisionPolicyVersion })
  sourceRefs.push({ kind: 'decision-matrix', id: input.matrixVersion })
  for (const m of contract.measures) sourceRefs.push({ kind: 'measure', id: m.measureId })

  // 临界检查（spec §4.4 逐字：拒绝生成、不截断；两项都超则一并注明）
  const contentBytes = Buffer.byteLength(canonicalJson(content), 'utf8')
  if (contentBytes > SNAPSHOT_CONTENT_MAX_BYTES)
    problems.push(
      `content canonical ${contentBytes} 字节，超过 1 MiB 上限（${SNAPSHOT_CONTENT_MAX_BYTES}），拒绝生成且不截断`,
    )
  if (sourceRefs.length > SNAPSHOT_SOURCE_REFS_MAX)
    problems.push(
      `sourceRefs ${sourceRefs.length} 条，超过上限 ${SNAPSHOT_SOURCE_REFS_MAX}，拒绝生成且不截断`,
    )
  if (problems.length) return { ok: false, problems }

  // 哈希体＝信封去易变字段（snapshotId/createdAt/sha256）；批一 teamVersion 恒 null、
  // approvedExperienceVersions 恒 []
  const body = {
    outcomeId: contract.outcomeId,
    contractVersion: contract.version,
    teamVersion: null,
    decisionPolicyVersion: input.decisionPolicyVersion,
    content,
    sourceRefs,
    approvedExperienceVersions: [],
    excludedSources,
  }
  const sha256 = shaHex(canonicalJson(body))
  const snapshot: OutcomeContextSnapshot = {
    snapshotId: `snap-${sha256.slice(0, 16)}`,
    ...body,
    createdAt: input.createdAt,
    sha256,
  }
  return { ok: true, snapshot }
}

/**
 * IO 薄壳（任务简报签名逐字＋可选 extraPersonIds）：解析任务摘要与身份册后委托纯核心。
 * 关键源失败（合同/政策入参缺失、resolve.task 或 resolve.people 未返回可用数据、解析抛异常、
 * owner/verifier 身份行缺席）→ ok:false；额外引用人缺席 → excludedSources（非关键）。
 */
export function buildMinimalSnapshot(input: BuildMinimalSnapshotInput): BuildSnapshotResult {
  const contract = input?.contract
  if (contract === null || typeof contract !== 'object')
    return { ok: false, problems: ['合同关键源失败：contract 缺失或非对象，禁止派单'] }
  if (!nonEmpty(input.decisionPolicyVersion))
    return { ok: false, problems: ['政策关键源失败：decisionPolicyVersion 必填，禁止派单'] }

  let task: SnapshotTaskSummary | undefined
  try {
    const t = input.resolve?.task?.()
    if (t && t.ok === true && t.task && typeof t.task === 'object') task = t.task
  } catch {
    task = undefined // 解析面异常视同关键源失败，不向上抛
  }
  if (!task)
    return { ok: false, problems: ['任务关键源失败：resolve.task 未返回可用任务摘要，禁止派单'] }

  let people: SnapshotPersonRow[] | undefined
  try {
    const ids = Array.from(
      new Set(
        [
          contract.ownerPersonId,
          contract.verificationOwnerId,
          ...(Array.isArray(input.extraPersonIds) ? input.extraPersonIds : []),
        ].filter(nonEmpty),
      ),
    )
    const p = input.resolve?.people?.(ids)
    if (p && p.ok === true && Array.isArray(p.people)) people = p.people
  } catch {
    people = undefined
  }
  // ok:true 但缺 people 数组=身份源自报成功却未交册，fail-closed 拒绝（不猜空册）；
  // ok:true+[] 交由核心判 owner/verifier 全缺席（同样 ok:false）。
  if (!people)
    return { ok: false, problems: ['身份关键源失败：resolve.people 未返回身份册，禁止派单（spec §4.4）'] }

  return buildSnapshotFromResolved({
    contract,
    decisionPolicyVersion: input.decisionPolicyVersion.trim(),
    matrixVersion: DECISION_MATRIX_VERSION,
    task,
    people,
    extraPersonIds: Array.isArray(input.extraPersonIds) ? input.extraPersonIds : [],
    createdAt: Date.now(),
  })
}

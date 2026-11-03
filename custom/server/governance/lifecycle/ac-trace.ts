// overlay/governance 域：AC 追溯链（四性四格收敛批 C1，2026-11-03）。
//
// 背景：requirements.ts 的 judgeRequirementFreeze 只判「形式完备」（AC ≥3 条、
// 无模糊词、Scope-Out/影响面/涉敏齐备）。AC 与测试用例之间没有链，所以「AC 覆盖
// N/N」只能靠文件名与文件头注释做结构映射（simharness product-outcome-summary），
// 无法回答「这条 AC 由哪几个用例证明、跑没跑过、过没过」。
//
// 本模块补的是追溯这一段，判据三件：
//   1. 每条 AC 至少绑定 1 个用例（未绑定 → ac-unbound）；
//   2. 绑定用例必须在本轮结果里有状态（无状态/缺席 → ac-no-result）；
//   3. 绑定用例不得有 fail（→ ac-failed）。
// 孤儿用例（不属于任何 AC）只计入提示，不阻断——它们不证明需求，但也不构成缺口。
//
// 设计边界（spec D3）：不替换 judgeRequirementFreeze，形式判据与追溯判据并列。
// 用例绑定只认显式标记（@ac 注释 / [AC-N] 标签），不猜语义——猜出来的覆盖等于造假。

/** 可验证方式：auto=命令/断言可自动判；manual=人工走查；evidence=截图/录屏等证据；unspecified=未声明。 */
export const VERIFIABLE_KINDS = ['auto', 'manual', 'evidence', 'unspecified'] as const
export type VerifiableKind = (typeof VERIFIABLE_KINDS)[number]

export interface AcceptanceCriterion {
  /** 编号，形如 AC-1（保留原始大小写归一为大写）。 */
  id: string
  text: string
  verifiable: VerifiableKind
}

export interface CaseBinding {
  /** 用例标识：测试标题优先，取不到时用 file:line。 */
  case: string
  acs: string[]
  file?: string
}

export const CASE_STATUSES = ['pass', 'fail', 'skipped', 'missing', 'unknown'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export interface AcTraceRow {
  acId: string
  text: string
  verifiable: VerifiableKind
  cases: Array<{ case: string; status: CaseStatus }>
}

export interface AcTraceJudgement {
  ok: boolean
  /** 没有任何绑定用例的 AC。 */
  unbound: string[]
  /** 有绑定但全部无运行结果（missing/unknown）的 AC。 */
  noResult: string[]
  /** 绑定用例中存在 fail 的 AC。 */
  failed: string[]
  /** 不属于任何 AC 的用例（提示项，不阻断）。 */
  orphanCases: string[]
}

const AC_ITEM_RE = /^-\s+\*\*(AC-\d+)\*\*\s*[:：]?\s*(.*)$/i
const EXPLICIT_KIND_RE = /\[(auto|manual|evidence)\]/i
const AUTO_HINT_RE = /断言|命令|脚本|接口|curl|vitest|pytest|npm run|返回码|HTTP\s*\d{3}/i
const MANUAL_HINT_RE = /人工|走查|真机|评审|签字|审批/i
const EVIDENCE_HINT_RE = /截图|录屏|证据|日志留档/i
const AT_AC_RE = /@ac\s+((?:AC-\d+)(?:[\s,、]+AC-\d+)*)/i
const BRACKET_AC_RE = /\[((?:AC-\d+)(?:\s*[,、]\s*AC-\d+)*)\]/i
const CASE_TITLE_RE = /(?:it|test|describe)\s*\(\s*['"`]([^'"`]{1,160})['"`]/

function normalizeAcId(raw: string): string {
  return raw.trim().toUpperCase()
}

function splitAcList(raw: string): string[] {
  return raw
    .split(/[\s,、]+/)
    .map((x) => normalizeAcId(x))
    .filter((x) => /^AC-\d+$/.test(x))
}

/** 从 AC 文本判定可验证方式（显式标记优先于关键词推断）。 */
export function classifyVerifiable(text: string): VerifiableKind {
  const explicit = EXPLICIT_KIND_RE.exec(text)
  if (explicit) return explicit[1].toLowerCase() as VerifiableKind
  if (AUTO_HINT_RE.test(text)) return 'auto'
  if (MANUAL_HINT_RE.test(text)) return 'manual'
  if (EVIDENCE_HINT_RE.test(text)) return 'evidence'
  return 'unspecified'
}

/** 解析 spec 的 AC 条目（只认行首 `- **AC-N` 形态，与 requirements.ts 同源）。 */
export function parseAcceptanceCriteria(doc: string): AcceptanceCriterion[] {
  const out: AcceptanceCriterion[] = []
  const seen = new Set<string>()
  for (const line of doc.split('\n')) {
    const m = AC_ITEM_RE.exec(line.trim())
    if (!m) continue
    const id = normalizeAcId(m[1])
    if (seen.has(id)) continue // 同号重复只认首条：编号是主键，静默覆盖会藏错
    seen.add(id)
    const text = m[2].trim()
    out.push({ id, text, verifiable: classifyVerifiable(text) })
  }
  return out
}

/** 解析单文件里的用例绑定（@ac 注释或 [AC-N] 标签，不猜语义）。 */
export function parseCaseBindings(source: string, file?: string): CaseBinding[] {
  const out: CaseBinding[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const at = AT_AC_RE.exec(line)
    const bracket = at ? null : BRACKET_AC_RE.exec(line)
    const raw = at?.[1] ?? bracket?.[1]
    if (!raw) continue
    const acs = splitAcList(raw)
    if (acs.length === 0) continue
    const title = CASE_TITLE_RE.exec(line)?.[1]?.trim()
    out.push({
      case: title || `${file ?? 'inline'}:${i + 1}`,
      acs,
      ...(file ? { file } : {}),
    })
  }
  return out
}

/** 汇总多文件绑定（同文件多行同 AC 合并去重，按首次出现序）。 */
export function collectBindings(sources: Array<{ file: string; content: string }>): CaseBinding[] {
  const out: CaseBinding[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    for (const b of parseCaseBindings(s.content, s.file)) {
      const key = `${b.case}::${b.acs.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(b)
    }
  }
  return out
}

/**
 * 建追溯表并判定。
 * results 缺省为空 → 所有绑定用例状态按 unknown 处理（对应「没跑过」而非「跑过了」）。
 */
export function buildAcTrace(
  acs: AcceptanceCriterion[],
  bindings: CaseBinding[],
  results: Record<string, CaseStatus> = {},
): { rows: AcTraceRow[]; judgement: AcTraceJudgement } {
  const byAc = new Map<string, CaseBinding[]>()
  for (const b of bindings) {
    for (const ac of b.acs) {
      const list = byAc.get(ac) ?? []
      list.push(b)
      byAc.set(ac, list)
    }
  }

  const rows: AcTraceRow[] = acs.map((ac) => ({
    acId: ac.id,
    text: ac.text,
    verifiable: ac.verifiable,
    cases: (byAc.get(ac.id) ?? []).map((b) => ({
      case: b.case,
      status: results[b.case] ?? 'unknown',
    })),
  }))

  const casesToAcs = new Map<string, Set<string>>()
  for (const b of bindings) {
    const set = casesToAcs.get(b.case) ?? new Set<string>()
    for (const ac of b.acs) set.add(ac)
    casesToAcs.set(b.case, set)
  }
  const knownAcs = new Set(acs.map((a) => a.id))
  const orphanCases = [...casesToAcs.entries()]
    .filter(([, acs]) => [...acs].every((a) => !knownAcs.has(a)))
    .map(([c]) => c)

  const unbound: string[] = []
  const noResult: string[] = []
  const failed: string[] = []
  for (const row of rows) {
    if (row.cases.length === 0) {
      unbound.push(row.acId)
      continue
    }
    if (row.cases.some((c) => c.status === 'fail')) failed.push(row.acId)
    if (row.cases.every((c) => c.status === 'unknown' || c.status === 'missing')) noResult.push(row.acId)
  }

  return {
    rows,
    judgement: {
      ok: unbound.length === 0 && noResult.length === 0 && failed.length === 0,
      unbound,
      noResult,
      failed,
      orphanCases,
    },
  }
}

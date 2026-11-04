// custom/server/result-contract：Agent 结果协议 v1（2026-11-04 W2 轮）。
//
// 来源：vivo《面向技术产品经理的 Agent Harness 设计》06 节——Agent 的结果
// 不应只有一段 Markdown：结论必须可回指来源（evidenceRefs 带 locator），
// 发布前须过确定性校验器（普通代码守协议边界，不交给模型自判）。
// 盘点现状：结果形状分散在 completion receipt / metadata / chat output /
// handoff 卡四套，无 resultVersion/generatorVersion，证据只有 path+sha256
// 无 locator/role；本域先立「类型 + 校验器」单一事实源，读侧投影逐步接入
// （首个消费者=看板详情 resultContract 面）。
//
// 纪律：本文件纯类型与纯函数，不做 IO、不猜数——派生侧源缺失返回 null。

/** 证据定位器：把「结论依据了哪条来源」定位到可机检的位置。 */
export interface EvidenceLocator {
  kind: 'path' | 'line' | 'row' | 'range' | 'jsonptr' | 'url' | 'date-range'
  /** 定位值（如 `src/a.ts:120`、`row:328`、`$.items[0]`、`2026-08-01..2026-08-15`）。 */
  value: string
}

export interface EvidenceRef {
  /** 来源对象稳定标识（evidenceId / 反馈记录 id / 指标名）。 */
  sourceId: string
  locator: EvidenceLocator
  /** 该来源对结论的作用（支持/反驳/上下文）。 */
  role: 'supports' | 'refutes' | 'context'
}

export interface ResultArtifactRef {
  kind: 'file' | 'report' | 'external-record' | 'dataset'
  /** 产物引用（路径 / URL / 外部系统记录 id）。 */
  ref: string
  sha256?: string
  /** external-record 类必填：写工具成功后获得的稳定外部 id。 */
  externalRecordId?: string
}

export interface ResultClaim {
  id: string
  statement: string
  /** 优先级枚举（业务建议面；缺省不带即不校验）。 */
  priority?: 'P0' | 'P1' | 'P2' | 'P3'
  confidence?: number
  evidence: EvidenceRef[]
  /** 推理前提显式化（源文 6.1：assumptions 把前提摊开）。 */
  assumptions?: string[]
}

export interface ResultEnvelope {
  /** 协议形状版本（本类型=1）。 */
  resultVersion: 1
  generatedAt: string
  /** 生成器身份与版本（workflow/graph/model 名+版本），用于结果间 diff。 */
  generatorVersion: string
  summary: string
  claims?: ResultClaim[]
  evidence?: EvidenceRef[]
  artifactRefs?: ResultArtifactRef[]
  decisions?: string[]
  risks?: Array<{ level: 'low' | 'medium' | 'high' | 'critical'; note: string }>
  pendingQuestions?: string[]
  nextActions?: string[]
}

export interface ResultValidationProblem {
  path: string
  rule:
    | 'summary-empty'
    | 'claim-no-evidence'
    | 'claim-bad-priority'
    | 'claim-bad-confidence'
    | 'evidence-locator-empty'
    | 'external-id-without-record'
    | 'high-risk-no-action'
    | 'bad-generated-at'
  detail: string
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

/**
 * 确定性校验器（源文 6.2 节：模型生成候选，校验器守边界）：
 *   - summary 非空
 *   - 每条 claim 至少一条 role=supports 的证据（且 locator 非空）
 *   - priority 若声明必须属 P0-P3；confidence 若声明必须在 [0,1]
 *   - externalRecordId 只能在 kind=external-record 的 artifact 上出现
 *     （写成功才可有外部记录 id——防「未写先报」）
 *   - risks 含 high/critical 时 nextActions 必须非空
 * 纯函数不抛异常；返回 {ok, problems}。
 */
export function validateResultEnvelope(env: ResultEnvelope): { ok: boolean; problems: ResultValidationProblem[] } {
  const problems: ResultValidationProblem[] = []

  if (!env || typeof env !== 'object') {
    return { ok: false, problems: [{ path: '$', rule: 'summary-empty', detail: 'envelope 非对象' }] }
  }
  if (!env.summary || !String(env.summary).trim()) {
    problems.push({ path: '$.summary', rule: 'summary-empty', detail: 'summary 为空' })
  }
  if (!env.generatedAt || !ISO_RE.test(String(env.generatedAt))) {
    problems.push({ path: '$.generatedAt', rule: 'bad-generated-at', detail: `generatedAt 非 ISO 时间：${String(env.generatedAt)}` })
  }
  if (!env.generatorVersion || !String(env.generatorVersion).trim()) {
    problems.push({ path: '$.generatorVersion', rule: 'summary-empty', detail: 'generatorVersion 为空' })
  }

  const claims = Array.isArray(env.claims) ? env.claims : []
  claims.forEach((claim, i) => {
    const base = `$.claims[${i}]`
    const supporting = (claim.evidence ?? []).filter((e) => e.role === 'supports')
    if (supporting.length === 0) {
      problems.push({ path: `${base}.evidence`, rule: 'claim-no-evidence', detail: `claim ${claim.id} 无 supports 证据` })
    }
    for (const [j, e] of (claim.evidence ?? []).entries()) {
      if (!e.sourceId || !e.locator || !String(e.locator.value ?? '').trim()) {
        problems.push({ path: `${base}.evidence[${j}].locator`, rule: 'evidence-locator-empty', detail: '证据缺 sourceId 或 locator.value' })
      }
    }
    if (claim.priority !== undefined && !['P0', 'P1', 'P2', 'P3'].includes(claim.priority)) {
      problems.push({ path: `${base}.priority`, rule: 'claim-bad-priority', detail: `priority 不在枚举：${String(claim.priority)}` })
    }
    if (claim.confidence !== undefined && (typeof claim.confidence !== 'number' || claim.confidence < 0 || claim.confidence > 1)) {
      problems.push({ path: `${base}.confidence`, rule: 'claim-bad-confidence', detail: `confidence 不在 [0,1]：${String(claim.confidence)}` })
    }
  })

  for (const [i, a] of (env.artifactRefs ?? []).entries()) {
    if (a.externalRecordId !== undefined && a.kind !== 'external-record') {
      problems.push({
        path: `$.artifactRefs[${i}]`,
        rule: 'external-id-without-record',
        detail: `kind=${a.kind} 的产物不应携带 externalRecordId（写工具未成功不得报外部记录）`,
      })
    }
  }

  const highRisk = (env.risks ?? []).some((r) => r.level === 'high' || r.level === 'critical')
  if (highRisk && (!env.nextActions || env.nextActions.length === 0)) {
    problems.push({ path: '$.nextActions', rule: 'high-risk-no-action', detail: 'risk=high|critical 时 nextActions 必须非空' })
  }

  return { ok: problems.length === 0, problems }
}

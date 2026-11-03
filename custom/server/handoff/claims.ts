// overlay/handoff 域：主张-回执核验（DeerFlow L1 report_contract 吸收轮 2026-11-03）。
//
// 来源：DeerFlow 2.0 `subagents/report_contract.py`（RFC #4651 PR3）——子代理的最终报告是**自述**，
// 必须给主张挂可核验把手；父侧拿执行记录对账，**未引用即判 UNVERIFIED**。
//
// 本仓已有可当回执的东西：`custom/server/evidence/evidence-store.ts` 的 EvidenceRecord
// （evidenceId 稳定、按 taskId 归档、前向 hash 链防篡改）。缺的是「主张 → 回执」这一层判定：
// 一条「我修好了」如果没有指向任何证据，就只是自述。
//
// 判定纪律（保守）：
//   · 无引用 → unverified(no_receipt)；
//   · 引用解不到（该 task 台账里没有这个 evidenceId）→ unverified(unresolvable_receipt)；
//   · 引用了**别的任务**的证据 → unverified(cross_task_receipt)（跨任务引用等于没引用）；
//   · 全部引用可解析 → verified。
// 只判「有没有依据」，不判「依据够不够强」——强度是验收断言（acceptance.ts）的活。

export interface ClaimInput {
  /** 主张标识（呈现与工单回引用；重名报错由调用方保证）。 */
  id: string
  /** 主张正文（一句话；不解析语义，只做记账）。 */
  text: string
  /** 引用的证据 id（evidence-store 的 evidenceId）。 */
  evidenceRefs?: string[]
}

export type ClaimStatus = 'verified' | 'unverified'

export type ClaimIssue =
  | 'no_receipt'
  | 'unresolvable_receipt'
  | 'cross_task_receipt'
  | 'not_verifiable'

export interface ClaimVerdict {
  id: string
  text: string
  status: ClaimStatus
  /** 命中问题（verified 为空）。 */
  issues: ClaimIssue[]
  /** 成功解析的回执 id。 */
  resolved: string[]
  detail: string
}

export interface ClaimsReport {
  taskId: string
  claims: ClaimVerdict[]
  verified: number
  unverified: number
  allVerified: boolean
  note: string
}

export interface ReceiptFacts {
  /** 本任务台账里存在的 evidenceId（含 kind 便于未来做强度分级）。 */
  ownEvidenceIds: ReadonlySet<string>
  /** 其他任务已存在的 evidenceId → taskId（用于识别跨任务引用）。 */
  foreignEvidenceTask?: ReadonlyMap<string, string>
}

/**
 * 逐条核验主张（纯函数）。空主张列表 → allVerified=false 且 note 说明「无可核验主张」，
 * 避免「没主张」被读成「全都有依据」。
 */
export function verifyClaims(taskId: string, claims: ClaimInput[], facts: ReceiptFacts): ClaimsReport {
  const list = (claims ?? []).filter((c) => c && String(c.id ?? '').trim() !== '')
  if (list.length === 0) {
    return {
      taskId,
      claims: [],
      verified: 0,
      unverified: 0,
      allVerified: false,
      note: '无可核验主张（空列表不判通过）',
    }
  }
  const verdicts: ClaimVerdict[] = list.map((c) => {
    const refs = (c.evidenceRefs ?? []).map((r) => String(r ?? '').trim()).filter(Boolean)
    if (refs.length === 0) {
      return { id: c.id, text: c.text, status: 'unverified', issues: ['no_receipt'], resolved: [], detail: '主张未引用任何回执——自述不等于证据' }
    }
    const issues: ClaimIssue[] = []
    const resolved: string[] = []
    for (const ref of refs) {
      if (facts.ownEvidenceIds.has(ref)) {
        resolved.push(ref)
        continue
      }
      const foreign = facts.foreignEvidenceTask?.get(ref)
      if (foreign && foreign !== taskId) {
        issues.push('cross_task_receipt')
        continue
      }
      issues.push('unresolvable_receipt')
    }
    const uniq = [...new Set(issues)]
    return {
      id: c.id,
      text: c.text,
      status: uniq.length === 0 ? 'verified' : 'unverified',
      issues: uniq,
      resolved,
      detail:
        uniq.length === 0
          ? `${resolved.length} 条回执全部可解析`
          : uniq
              .map((i) =>
                i === 'cross_task_receipt'
                  ? '引用了其他任务的证据（跨任务引用不算依据）'
                  : '回执在该任务台账里找不到',
              )
              .join('；'),
    }
  })
  const verified = verdicts.filter((v) => v.status === 'verified').length
  const unverified = verdicts.length - verified
  return {
    taskId,
    claims: verdicts,
    verified,
    unverified,
    allVerified: unverified === 0,
    note:
      unverified === 0
        ? `${verified} 条主张全部有可解析回执`
        : `${unverified} 条主张缺依据或依据不可解析——未引用判未验证，不放行`,
  }
}

/** 从 evidence-store 的记录列表构造 ReceiptFacts（本任务）。 */
export function receiptFactsOf(records: Array<{ evidenceId: string }>): ReceiptFacts {
  return { ownEvidenceIds: new Set(records.map((r) => r.evidenceId)) }
}

// overlay/evidence 域：任务结果卡聚合（deepseek-harness §十任务结果卡语义，矩阵 §3.8 dsh P0）。
//
// 结果卡字段（dsh 交付卡）：时长（首末证据跨度）+ 验证 bullet（verdict 序列）
// + 文件清单（artifact 卡汇总：每文件一张证据卡）+ 交付冻结（snapshot revision）
// + 最新裁决。纯聚合函数：台账是事实源，卡片是读侧投影（不落盘不冗余）。
import { listEvidence, latestVerdict, loadEvidence, type EvidenceRecord } from './evidence-store'

export interface ResultCard {
  taskId: string
  /** 证据跨度时长（秒；单条/空台账为 0）。 */
  durationSeconds: number
  /** 验证 bullet：verdict 序列（新在前），每条带 basis。 */
  verificationBullets: Array<{ verdict: string; basis?: string; at: number; evidenceId: string }>
  /** 文件清单：artifact 卡汇总（ref 去重 + 每文件的工件类型集合/里程碑）。 */
  files: Array<{ ref: string; artifactTypes: string[]; milestones: string[]; count: number }>
  /** 交付冻结（最后一张 snapshot）。 */
  deliverySnapshot?: { base: string; head: string; at: number }
  /** 最新裁决（单值速览；序列在 bullets）。 */
  verdict: string | null
  evidenceCount: number
}

export function buildResultCard(taskId: string): ResultCard {
  const all = loadEvidence(taskId).records
  const verifications = all.filter((r: EvidenceRecord) => r.kind === 'verification')
  const artifacts = all.filter((r: EvidenceRecord) => r.kind === 'artifact')
  const snapshots = all.filter((r: EvidenceRecord) => r.kind === 'delivery_snapshot')
  const times = all.map((r: EvidenceRecord) => r.at).filter((t) => typeof t === 'number')

  const fileMap = new Map<string, { artifactTypes: Set<string>; milestones: Set<string>; count: number }>()
  for (const a of artifacts) {
    const entry = fileMap.get(a.ref) ?? { artifactTypes: new Set<string>(), milestones: new Set<string>(), count: 0 }
    entry.count += 1
    if (a.artifactType) entry.artifactTypes.add(a.artifactType)
    if (a.milestone) entry.milestones.add(a.milestone)
    fileMap.set(a.ref, entry)
  }

  const latestSnap = snapshots.length ? snapshots[snapshots.length - 1] : undefined
  const latest = latestVerdict(taskId)
  return {
    taskId,
    durationSeconds: times.length >= 2 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : 0,
    verificationBullets: [...verifications].reverse().slice(0, 20).map((r) => ({
      verdict: String(r.verdict), basis: r.basis, at: r.at, evidenceId: r.evidenceId,
    })),
    files: [...fileMap.entries()].map(([ref, v]) => ({
      ref, artifactTypes: [...v.artifactTypes], milestones: [...v.milestones], count: v.count,
    })),
    deliverySnapshot: latestSnap?.revision ? { ...latestSnap.revision, at: latestSnap.at } : undefined,
    verdict: latest?.verdict ?? null,
    evidenceCount: all.length,
  }
}

/** per-turn changed-files 汇总（dsh §十 P0-4 的读侧）：artifactType='changed-files' 卡按里程碑（轮）分组。 */
export function changedFilesByTurn(taskId: string): Array<{ milestone: string; files: string[] }> {
  const artifacts = listEvidence(taskId, 'artifact', 500)
    .filter((r) => r.artifactType === 'changed-files')
  const byTurn = new Map<string, Set<string>>()
  for (const a of artifacts) {
    const turn = a.milestone ?? 'turn-?'
    const set = byTurn.get(turn) ?? new Set<string>()
    set.add(a.ref)
    byTurn.set(turn, set)
  }
  return [...byTurn.entries()].map(([milestone, files]) => ({ milestone, files: [...files] }))
}

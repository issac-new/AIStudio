// overlay/changedfiles 域：每轮改动文件卡（deepseek-harness per-turn changed-files 卡吸收，矩阵 §3.2 dsh P2）。
//
// deepseek-harness 语义（每轮结束出一张 changed-files 卡）：
// - **一轮一卡**：只含本轮改动文件（非全仓 diff）；
// - **行数账**：每文件 added/deleted，卡头汇总总增删；
// - **状态三态**：added/modified/deleted；
// - **列表截断**：超出 maxFiles 折叠为 "+N more"。
// 衔接 evidence artifactType='changed-files' 与 RunTrace 时序：本层=卡投影纯函数。
export type FileStatus = 'added' | 'modified' | 'deleted'

export interface ChangedFile {
  path: string
  status: FileStatus
  added: number
  deleted: number
}

export interface ChangedFilesCard {
  files: ChangedFile[]
  /** 折叠掉的文件数（超出 maxFiles）。 */
  hiddenCount: number
  totalAdded: number
  totalDeleted: number
  /** 卡头摘要：N files +A -D（含折叠计数）。 */
  headline: string
}

/** 一轮改动 → changed-files 卡投影（deepseek 语义）。 */
export function changedFilesCard(
  files: readonly ChangedFile[],
  maxFiles = 8,
): ChangedFilesCard {
  const totalAdded = files.reduce((n, f) => n + f.added, 0)
  const totalDeleted = files.reduce((n, f) => n + f.deleted, 0)
  const shown = files.slice(0, maxFiles)
  const hiddenCount = files.length - shown.length
  const hidden = hiddenCount > 0 ? ` (+${hiddenCount} more)` : ''
  return {
    files: shown,
    hiddenCount,
    totalAdded,
    totalDeleted,
    headline: `${files.length} files +${totalAdded} -${totalDeleted}${hidden}`,
  }
}

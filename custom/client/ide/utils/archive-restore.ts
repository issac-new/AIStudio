// overlay/custom/client/ide/utils/archive-restore.ts
// B11 归档批量恢复（09-19 全景 #5，cc Unarchive all 对照）：纯函数域模块，
// 逐条走 unarchive 真链，返回 ok/failed 分明细（调用方据此前更新列表与提示）。
export interface RestoreAllResult {
  okIds: string[]
  failedIds: string[]
}

export async function restoreAllArchived(
  ids: string[],
  unarchive: (id: string) => Promise<boolean>,
): Promise<RestoreAllResult> {
  const okIds: string[] = []
  const failedIds: string[] = []
  for (const id of ids) {
    try {
      if (await unarchive(id)) okIds.push(id)
      else failedIds.push(id)
    } catch {
      failedIds.push(id) // 单条异常不中断批量，如实计入失败
    }
  }
  return { okIds, failedIds }
}

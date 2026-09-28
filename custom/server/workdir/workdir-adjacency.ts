// overlay/workdir 域：共享工作目录并发警告（multica §2.5 吸收，矩阵 §3.5 P2）。
//
// multica 语义（§2.5 本地目录互斥+共享目录并发警告块）：同一 work_dir 上多任务
// 并发有竞态（写同一文件互踩）——multica 用路径锁互斥；Ycode 轻量版=**警告块**：
// 检测同 work_dir 活跃任务数，超 1 给并发警告（互斥锁归调度层，本域给判定面）。
// chat 轮可豁免（multica：chat 任务可共享目录但带"共享工作目录"警告块）。
export interface WorkdirTask {
  taskId: string
  workDir: string
  kind: 'task' | 'chat'
  startedAt: number
}

export interface WorkdirWarning {
  workDir: string
  activeTaskIds: string[]
  /** 并发警告（>1 活跃且至少一个非 chat 任务——chat 豁免互斥但警告仍在）。 */
  concurrent: boolean
  /** chat 共享警告（multica：chat 任务共享目录带警示块）。 */
  chatShared: boolean
  detail: string
}

/** 活跃任务面→逐 workDir 警告块（空闲目录不出块）。 */
export function workdirAdjacency(tasks: readonly WorkdirTask[], now: number = Date.now()): WorkdirWarning[] {
  const byDir = new Map<string, WorkdirTask[]>()
  for (const t of tasks) {
    const list = byDir.get(t.workDir) ?? []
    list.push(t)
    byDir.set(t.workDir, list)
  }
  const out: WorkdirWarning[] = []
  for (const [workDir, list] of byDir) {
    const nonChat = list.filter((t) => t.kind === 'task')
    const concurrent = nonChat.length > 1
    const chatShared = list.some((t) => t.kind === 'chat') && list.length > 1
    if (!concurrent && !chatShared) continue
    out.push({
      workDir,
      activeTaskIds: list.map((t) => t.taskId),
      concurrent,
      chatShared,
      detail: concurrent
        ? `共享目录并发：${nonChat.length} 个任务在 ${workDir}（写互踩风险）`
        : `chat 共享工作目录（multica 警示块）：${list.map((t) => t.taskId).join('、')}`,
    })
  }
  void now
  return out.sort((a, b) => b.activeTaskIds.length - a.activeTaskIds.length)
}

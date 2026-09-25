// overlay/fileundo 域：任务结果卡逐文件 Undo（codex-product 行 242 半边，矩阵 §3.8 行 242 P0）。
//
// codex-product 语义（任务结果卡=验证 bullet+文件±行数+**逐文件 Undo**）：
// 结果卡前两半已落（result-card.ts）；本层=逐文件 Undo 计划面：
// - **逐文件独立**：每个文件一行 undo 能力位（可 Undo/无快照/已 Undo）；
// - **计划先行**：undoPlan 产出回写计划（before 内容来自 file-history restoreFileBefore）；
// - **执行留调用方**：本层纯函数，写回副作用由调用方走 saveFile。
export type UndoState = 'undoable' | 'no-snapshot' | 'undone'

export interface UndoRow {
  path: string
  state: UndoState
  /** before 内容（no-snapshot/undone 为 null）。 */
  beforeContent: string | null
}

export interface UndoPlan {
  taskId: string
  turnIndex: number
  rows: UndoRow[]
  /** 可执行回写行（state=undoable）。 */
  writes: Array<{ path: string; content: string }>
}

/** 逐文件 Undo 计划（快照读取由调用方注入——restoreFileBefore 语义同 file-history）。 */
export function undoPlan(
  taskId: string,
  turnIndex: number,
  paths: readonly string[],
  restoreBefore: (path: string) => string | null,
  undonePaths: readonly string[] = [],
): UndoPlan {
  const undone = new Set(undonePaths)
  const rows: UndoRow[] = []
  const writes: Array<{ path: string; content: string }> = []
  for (const path of paths) {
    if (undone.has(path)) {
      rows.push({ path, state: 'undone', beforeContent: null })
      continue
    }
    const before = restoreBefore(path)
    if (before === null) {
      rows.push({ path, state: 'no-snapshot', beforeContent: null })
      continue
    }
    rows.push({ path, state: 'undoable', beforeContent: before })
    writes.push({ path, content: before })
  }
  return { taskId, turnIndex, rows, writes }
}

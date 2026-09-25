// overlay/memscope 域：记忆两级分治（qoder §三差距表 P2 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（记忆全局/项目两级分治：开关/文件数/清空）：记忆按作用域分治——
// **global**（跨项目共用偏好）与 **project**（本项目约定），每级独立开关/文件计数/
// 清空。衔接 406 记忆 FTS（检索面）与 memory-taxonomy（四类型）：本层=作用域管理面。
export type MemoryScopeKind = 'global' | 'project'

export interface MemoryScopeState {
  enabled: boolean
  /** 该作用域记忆文件数（qoder 文件数统计）。 */
  fileCount: number
}

export interface MemoryScopeBoard {
  global: MemoryScopeState
  project: MemoryScopeState
}

/** 两级分治管理：开关切换（qoder 开关语义）。 */
export function toggleScope(board: MemoryScopeBoard, scope: MemoryScopeKind): MemoryScopeBoard {
  return { ...board, [scope]: { ...board[scope], enabled: !board[scope].enabled } }
}

/** 清空作用域（qoder 清空语义：文件数归零，enabled 不动）。 */
export function clearScope(board: MemoryScopeBoard, scope: MemoryScopeKind): MemoryScopeBoard {
  return { ...board, [scope]: { ...board[scope], fileCount: 0 } }
}

/** 文件数更新（写入/删除记忆时调用）。 */
export function setFileCount(board: MemoryScopeBoard, scope: MemoryScopeKind, count: number): MemoryScopeBoard {
  return { ...board, [scope]: { ...board[scope], fileCount: Math.max(0, count) } }
}

/** 分治汇总（管理面板数据面）。 */
export function scopeSummary(board: MemoryScopeBoard): { enabledScopes: number; totalFiles: number } {
  const scopes = [board.global, board.project]
  return {
    enabledScopes: scopes.filter((s) => s.enabled).length,
    totalFiles: scopes.reduce((s, x) => s + x.fileCount, 0),
  }
}

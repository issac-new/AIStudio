// custom/server/loop/engine/git-sos.ts
// Git 冲突 SOS 降级：合并冲突自动降级处理
// 依赖：无外部依赖

export enum SosLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface SosDecision {
  level: SosLevel
  action: 'CONTINUE' | 'ABORT_MERGE' | 'ROLLBACK' | 'ESCALATE'
  message: string
  details?: string
}

// ─── 冲突检测与降级 ────────────────────────────────────

/**
 * 检测合并冲突类型
 * 真实 git 冲突标记按行分布（<<<<<<< / ======= / >>>>>>> 各占一行）——
 * content 判左侧标记；structural 判分隔与右侧标记在标记集中成对出现；
 * 其余归为 semantic（需人工理解意图）。
 */
export function detectConflictType(conflictMarkers: string[]): 'content' | 'structural' | 'semantic' {
  // 检测冲突标记
  if (conflictMarkers.some(m => m.includes('<<<<<<<'))) {
    return 'content'
  }
  const hasSeparator = conflictMarkers.some(m => m.includes('==='))
  const hasEnd = conflictMarkers.some(m => m.includes('>>>'))
  if (hasSeparator && hasEnd) {
    return 'structural'
  }
  return 'semantic'
}

/**
 * 根据冲突类型和当前状态给出降级决策
 */
export function evaluateSos(
  conflictType: string,
  currentRetryCount: number,
  isLeaderMode: boolean,
): SosDecision {
  if (conflictType === 'semantic') {
    // 语义冲突：无法自动解决，必须人工介入
    return {
      level: SosLevel.CRITICAL,
      action: 'ESCALATE',
      message: '检测到语义冲突，无法自动解决',
      details: '建议人工审查冲突文件，确认意图后手动解决',
    }
  }

  if (currentRetryCount >= 3) {
    // 重试次数过多，降级到 Leader 介入
    return {
      level: SosLevel.WARNING,
      action: 'ESCALATE',
      message: `合并冲突重试 ${currentRetryCount} 次仍未解决`,
      details: '已达到自动重试上限，升级到 Leader 介入',
    }
  }

  if (isLeaderMode) {
    // Leader 模式下尝试回滚
    return {
      level: SosLevel.INFO,
      action: 'ROLLBACK',
      message: 'Leader 模式下检测到冲突，尝试回滚到合并前状态',
      details: '将回滚到最近的稳定提交',
    }
  }

  // 默认：中止合并，清理冲突状态
  return {
    level: SosLevel.WARNING,
    action: 'ABORT_MERGE',
    message: '检测到内容冲突，自动中止合并',
    details: '将执行 git merge --abort 清理冲突状态',
  }
}

/**
 * 执行降级操作
 */
export async function executeSosAction(decision: SosDecision): Promise<void> {
  switch (decision.action) {
    case 'ABORT_MERGE':
      // TODO: 执行 git merge --abort
      console.log('[GitSOS] 执行 ABORT_MERGE')
      break
    case 'ROLLBACK':
      // TODO: 回滚到最近的稳定提交
      console.log('[GitSOS] 执行 ROLLBACK')
      break
    case 'ESCALATE':
      // TODO: 发送通知到 Leader
      console.log('[GitSOS] 执行 ESCALATE')
      break
    case 'CONTINUE':
      // 继续执行
      break
  }
}

// ─── 生产接线：IDE Git 面板 /status 的冲突态建议 ────────────────

/** porcelain v1 冲突码 → 冲突类型：UU/AA（双方改/双方加）为 content
 *  （文本重叠，可标记级解决）；DD/AU/UA/UD/DU（双方删、增删删改交错）为
 *  structural（结构分歧）。非冲突码返回 null。 */
export function porcelainConflictType(indexStatus: string, worktreeStatus: string): 'content' | 'structural' | null {
  if (indexStatus === 'U' && worktreeStatus === 'U') return 'content'
  if (indexStatus === 'A' && worktreeStatus === 'A') return 'content'
  if (indexStatus === 'D' && worktreeStatus === 'D') return 'structural'
  if (indexStatus === 'U' || worktreeStatus === 'U') return 'structural'
  return null
}

/** 冲突态 SOS 建议（只读 advisory）：有 porcelain 冲突项时给出降级决策，
 *  供 /api/ide/git/status 随状态返回；不在读路径执行 merge --abort——
 *  动作执行留给引擎或人确认（executeSosAction）。 */
export function sosAdvisoryForConflicts(
  changes: Array<{ indexStatus: string; worktreeStatus: string }>,
): SosDecision | null {
  let structural = 0
  let content = 0
  for (const c of changes) {
    const t = porcelainConflictType(c.indexStatus, c.worktreeStatus)
    if (t === 'content') content++
    else if (t === 'structural') structural++
  }
  if (content === 0 && structural === 0) return null
  // structural 优先上报（结构分歧更难自动解决）；status 读路径无重试计数，按 0（首次建议）
  return evaluateSos(structural > 0 ? 'structural' : 'content', 0, false)
}

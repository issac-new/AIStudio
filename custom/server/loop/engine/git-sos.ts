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
 */
export function detectConflictType(conflictMarkers: string[]): 'content' | 'structural' | 'semantic' {
  // 检测冲突标记
  if (conflictMarkers.some(m => m.includes('<<<<<<<'))) {
    return 'content'
  }
  if (conflictMarkers.some(m => m.includes('===') && m.includes('>>>'))) {
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

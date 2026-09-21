// overlay/custom/client/ide/utils/goalEngine.ts
// goal 预算引擎投影（R5/G5，hermes GoalManager 引擎语义）。
// 引擎单一事实源在 hermes（hermes_cli/goals.py：GoalState turns_used/max_turns
// + judge 完成判定 + auto-pause）；工作台不另起引擎，只做两件事：
//   ① 从 /goal status 的文本回执解析 turn 进度（server formatGoalStatusMessage
//      同款口径：N/M turns）；
//   ② 预算警示：turn 用量越过阈值（默认 80%）时在面板给警示色。
// 命令驱动经 chatStore.sendMessage 注入 `/goal <args>` 文本命令（session-command
// 通道已把 /goal 系列路由进 bridge → GoalManager）。

export interface GoalTurnProgress {
  used: number
  max: number
}

/** 从 /goal status 回执文本提取 turn 进度（N/M turns；server 同款正则） */
export function parseGoalTurns(text: string | undefined): GoalTurnProgress | null {
  if (!text) return null
  const m = text.match(/\b(\d+)\s*\/\s*(\d+)\s+turns\b/i)
  if (!m) return null
  const used = Number(m[1])
  const max = Number(m[2])
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return null
  return { used, max }
}

/** 从会话消息流找最近一次 /goal status 的助手回执（含 turns 进度的那条） */
export function extractGoalProgress(
  messages: Array<{ role: string; content?: string }>,
): GoalTurnProgress | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant' && m.role !== 'tool' && m.role !== 'system') continue
    const progress = parseGoalTurns(typeof m.content === 'string' ? m.content : '')
    if (progress) return progress
  }
  return null
}

export const GOAL_WARN_PCT = 80

/** 预算警示：used/max ≥ 80% 返回 'warn'，≥100% 返回 'over'，否则 'ok' */
export function goalBudgetLevel(progress: GoalTurnProgress): 'ok' | 'warn' | 'over' {
  const pct = (progress.used / progress.max) * 100
  if (pct >= 100) return 'over'
  if (pct >= GOAL_WARN_PCT) return 'warn'
  return 'ok'
}

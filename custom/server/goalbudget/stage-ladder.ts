// overlay/custom/server/goalbudget/stage-ladder.ts
// 工具调用阶段阶梯（2026-10-23 HarnessPro×Harness 十一坑吸收轮 HP-3）。
//
// 来源（HarnessPro repo harnesses/*/runtime/hook.py，arXiv 2610.26770）：
// 进化出的运行时钩子按工具调用次数做递进干预——达 economy_after_tools 注入「经济
// 阶段」提醒（合并检查、停复读机）；达 strict_after_tools 每 reminder_every 次重发
// 「收敛阶段」警告（停止广泛探索、专注收尾验证）；超 finalize_after_tools 直接拦截
// （「保留当前文件，基于现有证据交卷」）。三档 harness（lite/medium/heavy）=同一
// 机制不同旋钮（TB2 lite/medium 仅 finalize 38→44，heavy 全面提高 effort+阈值）。
//
// 本仓定位：纯机制库（与 GoalBudget 三预算同域），不改 hermes-agent 运行时——
// 消费方：goal-autonomy 预算触顶语义、workbench 树候选的 hook 阈值声明检查
// （loop.ts validateTree）。阶梯消息的设计纪律：拼在工具结果尾部而非改写 prompt
// 头部，保护前缀缓存（hook.py 的缓存复用细节）。

/** 阶段名（hook.py `_stage_name` 同序：normal→economy→strict→finalize）。 */
export type StageName = 'normal' | 'economy' | 'strict' | 'finalize'

/** 阶梯阈值（占 maxSteps 的比例；HookPro 为绝对次数，本仓归一到步数预算的比例旋钮）。 */
export interface StageThresholds {
  economyAfter: number
  strictAfter: number
  finalizeAfter: number
  /** strict 阶段每 N 次重发收敛警告（缺省 8，hook.py strict_reminder_every 同名）。 */
  strictReminderEvery: number
}

/** 三档预设（占 maxSteps 比例）：lite 收敛早、heavy 余量足——同机制不同旋钮。 */
export const STAGE_TIER_PRESETS: Record<'lite' | 'medium' | 'heavy', StageThresholds> = {
  lite: { economyAfter: 0.35, strictAfter: 0.65, finalizeAfter: 0.95, strictReminderEvery: 4 },
  medium: { economyAfter: 0.40, strictAfter: 0.70, finalizeAfter: 1.0, strictReminderEvery: 8 },
  heavy: { economyAfter: 0.50, strictAfter: 0.80, finalizeAfter: 1.0, strictReminderEvery: 8 },
}

/** 阈值合法性：三个比例 ∈ (0,1] 且严格递增（economy < strict < finalize）。 */
export function thresholdsValid(t: StageThresholds): boolean {
  const { economyAfter, strictAfter, finalizeAfter } = t
  if (!(economyAfter > 0 && economyAfter <= 1)) return false
  if (!(strictAfter > 0 && strictAfter <= 1)) return false
  if (!(finalizeAfter > 0 && finalizeAfter <= 1)) return false
  return economyAfter < strictAfter && strictAfter < finalizeAfter
}

/**
 * 当前阶段判定（纯函数）。
 * steps/maxSteps 达 economyAfter → economy；达 strictAfter → strict（且按步数对
 * strictReminderEvery 取模可判「本轮是否重发」）；超 finalizeAfter×maxSteps →
 * finalize（拦截档）。maxSteps≤0 视为无预算，恒 normal。
 */
export function stageAt(
  steps: number,
  maxSteps: number,
  t: StageThresholds = STAGE_TIER_PRESETS.medium,
): StageName {
  if (!(maxSteps > 0) || steps < 0) return 'normal'
  const ratio = steps / maxSteps
  if (ratio > t.finalizeAfter) return 'finalize'
  if (ratio >= t.strictAfter) return 'strict'
  if (ratio >= t.economyAfter) return 'economy'
  return 'normal'
}

/** strict 阶段本步是否应重发收敛警告（hook.py `(count - strict) % reminder == 0` 同式）。 */
export function strictReminderDue(
  steps: number,
  maxSteps: number,
  t: StageThresholds = STAGE_TIER_PRESETS.medium,
): boolean {
  if (stageAt(steps, maxSteps, t) !== 'strict') return false
  const strictStart = Math.ceil(t.strictAfter * maxSteps)
  const every = Math.max(1, t.strictReminderEvery)
  return (steps - strictStart) % every === 0
}

/**
 * 阶段递进消息（hook.py `_stage_context` 语义的中文对译；文案锚点：
 * economy=合并检查停复读机、strict=停广泛探索专注收尾、finalize=保留现场交卷）。
 * 消费方应把消息拼接在工具结果尾部（前缀缓存纪律），不改写 prompt 头部。
 */
export function escalationMessage(stage: StageName): string | null {
  switch (stage) {
    case 'economy':
      return '［经济阶段］合并同类检查（ls/读文件/测试可并则并），停止过程叙述与重复已确认的检查；任务要求的行为验证与终态检查不得省略。'
    case 'strict':
      return '［收敛阶段］停止广泛探索，只检查与当前失败或交付直接相关的证据；若存在具体失败或交付物被改动，先修复再收尾；临时验证产物与最终交付分离，最后完整核对一次路径/接口/行为/终态后交卷。'
    case 'finalize':
      return '［预算耗尽］工具预算已到顶：保留当前文件，停止调用工具，基于现有证据给出最佳最终答案。'
    default:
      return null
  }
}

/**
 * hook 阈值声明解析：从 harness 树的 runtime/policy.json（HarnessPro 路径约定）读
 * economy_after_tools/strict_after_tools/finalize_after_tools（绝对次数）并按
 * maxSteps 归一为比例阈值。缺文件/缺键/非正数/非递增 → null（调用方如实报缺）。
 */
export function parseHookPolicy(
  policyJson: string | undefined,
  maxSteps: number,
): StageThresholds | null {
  if (!policyJson || !(maxSteps > 0)) return null
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(policyJson) as Record<string, unknown>
  } catch {
    return null
  }
  const pick = (k: string): number | null => {
    const v = doc[k]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  }
  const economy = pick('economy_after_tools')
  const strict = pick('strict_after_tools')
  const finalize = pick('finalize_after_tools')
  if (economy == null || strict == null || finalize == null) return null
  const reminder = pick('strict_reminder_every')
  const t: StageThresholds = {
    economyAfter: economy / maxSteps,
    strictAfter: strict / maxSteps,
    finalizeAfter: finalize / maxSteps,
    strictReminderEvery: reminder ?? 8,
  }
  return thresholdsValid(t) ? t : null
}

// overlay/custom/client/bpa/pemm.ts
// PEMM 因素与级别常量（客户端镜像；服务端正本在 custom/server/bpa/bpa-types.ts，
// 两端纯常量各自持有，避免 client 构建拉入 server 依赖树）。
export interface PemmFactorDef {
  key: string
  board: 'enabler' | 'capability'
  nameZh: string
  focusZh: string
}

export const PEMM_FACTORS: PemmFactorDef[] = [
  { key: 'design', board: 'enabler', nameZh: '流程设计', focusZh: '目的、环境与文档：目标是否清晰、是否适配环境、文档是否完备' },
  { key: 'staff', board: 'enabler', nameZh: '流程员工', focusZh: '知识、技能与行为：执行人员是否具备能力与正确态度' },
  { key: 'owner', board: 'enabler', nameZh: '流程所有者', focusZh: '身份、活动与权力：是否明确负责人及其职责权限' },
  { key: 'infrastructure', board: 'enabler', nameZh: '基础设施', focusZh: '信息系统与人力系统：软硬件与人力保障' },
  { key: 'metrics', board: 'enabler', nameZh: '流程指标', focusZh: '定义与运用：绩效标准是否明确且被有效使用' },
  { key: 'leadership', board: 'capability', nameZh: '领导力', focusZh: '高层是否真正重视并推动流程管理' },
  { key: 'culture', board: 'capability', nameZh: '文化', focusZh: '客户为中心、责任、合作与变革态度' },
  { key: 'expertise', board: 'capability', nameZh: '专业技能', focusZh: '流程建模与改进的方法能力' },
  { key: 'governance', board: 'capability', nameZh: '治理', focusZh: '问责机制与整合机制是否到位' },
]

export const PEMM_LEVEL_NAMES: Array<{ level: number; nameZh: string }> = [
  { level: 0, nameZh: 'P0 不稳定流程' },
  { level: 1, nameZh: 'P1 部门级专业流程' },
  { level: 2, nameZh: 'P2 卓越绩效流程' },
  { level: 3, nameZh: 'P3 最优流程' },
  { level: 4, nameZh: 'P4 最佳流程' },
]

/** 一次 PEMM 自评的打分表：因素键 → 级别（0–4）。 */
export type PemmScores = Record<string, number>

function validLevel(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4
}

/** 打分进度：哪些因素已打、哪些没打。只认 PEMM_FACTORS 里的键，忽略表里的多余键。 */
export function pemmProgress(scores: PemmScores | null | undefined): {
  scoredCount: number
  total: number
  missing: string[]
} {
  const keys = PEMM_FACTORS.map((f) => f.key)
  const missing = keys.filter((k) => !validLevel(scores?.[k]))
  return { scoredCount: keys.length - missing.length, total: keys.length, missing }
}

/** 总体成熟度（短板决定＝九项里的最低分）。
 *  九项全部打了合法分值才给结论；否则 overall 为 null——没打分的因素可能正是最短板，
 *  只拿已打分项取最低分会把它们排除在外（2026-11-28 之前：打一项 P4 就显示「总体 P4」）。 */
export function pemmOverall(scores: PemmScores | null | undefined): {
  complete: boolean
  overall: number | null
  weakest: string[]
  scoredCount: number
  missing: string[]
} {
  const progress = pemmProgress(scores)
  if (progress.missing.length > 0) {
    return { complete: false, overall: null, weakest: [], ...progress }
  }
  const entries = PEMM_FACTORS.map((f) => ({ name: f.nameZh, level: scores![f.key] as number }))
  const overall = Math.min(...entries.map((e) => e.level))
  return {
    complete: true,
    overall,
    weakest: entries.filter((e) => e.level === overall).map((e) => e.name),
    ...progress,
  }
}

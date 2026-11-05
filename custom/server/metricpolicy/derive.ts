/**
 * 四类核心指标派生（C 组）——全部从既有台账派生，不新增埋点。
 *
 * 文章给出的四类核心：自主运营比例、人机配比、单任务人时、返工率。
 * 纪律：样本不足或无源时 `available:false` 并写明缺口，不猜数、不返回 0 冒充「无异常」。
 */
import { listIdentities } from '../agentidentity/agent-identity'
import { listScale } from '../autonomygov/store'
import { collectAssigneeStats, kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import type { DerivedReading } from './types'

/** 小样本下限：低于此值给 available:false（比例/中位数在小样本上无解释力）。 */
export const MIN_SAMPLE = 5

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = xs.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? Number(((s[mid - 1] + s[mid]) / 2).toFixed(2)) : s[mid]
}

function reading(patch: Omit<DerivedReading, 'unit'> & { unit?: string }): DerivedReading {
  return { unit: '', ...patch } as DerivedReading
}

/**
 * 自主运营比例 = 派给「AL>=4 配置目标」的任务数 / 已派发任务总数。
 *
 * 口径边界：分子按 assignee 名精确匹配自治配置 target（不前缀模糊匹配——模糊匹配会把
 * `worker-coder-v2` 算进 `worker-coder`，把比例吹高）。配置为空时不可用。
 */
export async function autonomyRate(): Promise<DerivedReading> {
  const base = {
    key: 'measure/autonomy-rate',
    title: '自主运营比例',
    definition: 'AL>=4 配置目标承接的任务数 / 已派发任务总数',
    sources: ['autonomygov/scale', 'kanban tasks'],
  }
  const scale = listScale()
  const autonomousTargets = new Set(scale.filter((e) => e.al >= 4).map((e) => e.target))
  const stats = await collectAssigneeStats()
  let assigned = 0
  let autonomous = 0
  for (const s of stats.values()) {
    assigned += s.total
    if (autonomousTargets.has(s.assignee)) autonomous += s.total
  }
  if (scale.length === 0) {
    return reading({ ...base, value: null, sample: 0, available: false, gap: '自治刻度未配置——先登记 AL 等级才谈得上自主运营比例' })
  }
  if (assigned < MIN_SAMPLE) {
    return reading({ ...base, value: null, sample: assigned, available: false, gap: `已派发任务仅 ${assigned} 条，低于样本下限 ${MIN_SAMPLE}` })
  }
  return reading({
    ...base,
    value: Number((autonomous / assigned).toFixed(4)),
    sample: assigned,
    available: true,
    ...(autonomous === 0 ? { gap: '无任务落在 AL>=4 目标上——配置存在但未实际启用' } : {}),
  })
}

/**
 * 人机配比 = agent 身份承接的任务数 / human 身份承接的任务数。
 *
 * 口径边界：assignee 名须能在身份台账里精确命中；未命中归 `unknown` 并在 gap 里报数。
 */
export async function humanMachineRatio(): Promise<DerivedReading> {
  const base = {
    key: 'measure/human-machine-ratio',
    title: '人机配比',
    definition: 'agent 身份承接任务数 / human 身份承接任务数',
    sources: ['agentidentity/identities', 'kanban tasks'],
  }
  const identities = listIdentities()
  if (identities.length === 0) {
    return reading({ ...base, value: null, sample: 0, available: false, gap: '身份台账为空——无法判定 assignee 是人还是 agent' })
  }
  const kindOf = new Map(identities.map((i) => [i.name, i.kind]))
  const stats = await collectAssigneeStats()
  let agentTasks = 0
  let humanTasks = 0
  let unknownTasks = 0
  for (const s of stats.values()) {
    const kind = kindOf.get(s.assignee)
    if (kind === 'agent' || kind === 'bot' || kind === 'service') agentTasks += s.total
    else if (kind === 'human') humanTasks += s.total
    else unknownTasks += s.total
  }
  const known = agentTasks + humanTasks
  if (known < MIN_SAMPLE) {
    return reading({ ...base, value: null, sample: known, available: false, gap: `身份可判定的任务仅 ${known} 条（未知 ${unknownTasks} 条），低于样本下限 ${MIN_SAMPLE}` })
  }
  if (humanTasks === 0) {
    return reading({ ...base, value: null, sample: known, available: false, gap: `human 身份承接任务为 0（agent ${agentTasks} 条）——比值无分母` })
  }
  return reading({
    ...base,
    value: Number((agentTasks / humanTasks).toFixed(2)),
    sample: known,
    available: true,
    ...(unknownTasks > 0 ? { gap: `${unknownTasks} 条任务的 assignee 不在身份台账内，未计入` } : {}),
  })
}

/** 单任务人时 = 任务 started→completed 时长的中位数（分钟）。 */
export async function humanMinutesPerTask(): Promise<DerivedReading> {
  const base = {
    key: 'measure/human-minutes-per-task',
    title: '单任务人时',
    definition: '任务 started→completed 时长中位数 / 60（分钟）',
    sources: ['kanban tasks (started_at, completed_at)'],
    unit: '分钟',
  }
  const stats = await collectAssigneeStats()
  const durations: number[] = []
  for (const s of stats.values()) durations.push(...s.durationsS)
  if (durations.length < MIN_SAMPLE) {
    return reading({ ...base, value: null, sample: durations.length, available: false, gap: `有起止时间的任务仅 ${durations.length} 条，低于样本下限 ${MIN_SAMPLE}` })
  }
  const med = median(durations)
  return reading({
    ...base,
    value: med === null ? null : Number((med / 60).toFixed(1)),
    sample: durations.length,
    available: true,
  })
}

/**
 * 返工率（代理口径）=（crashed + gave_up + respawn_guarded）/ completed。
 *
 * 诚实边界：文章口径的「返工率」指 changes_requested 次数，本仓看板事件里没有该 kind。
 * 用异常重试类事件做代理并在 definition 里写明——不是同一个量，不能对外混称。
 */
export async function reworkRate(): Promise<DerivedReading> {
  const base = {
    key: 'measure/rework-rate',
    title: '返工率（代理口径）',
    definition: '（crashed + gave_up + respawn_guarded）/ completed',
    sources: ['kanban task_events'],
  }
  let completed = 0
  let rework = 0
  let files = 0
  for (const file of kanbanDbFiles()) {
    let db
    try { db = await openReadonly(file) } catch { continue }
    files += 1
    try {
      const rows = db.prepare(
        'SELECT kind, COUNT(*) AS n FROM task_events GROUP BY kind',
      ).all() as unknown as { kind: string; n: number }[]
      for (const r of rows) {
        if (r.kind === 'completed') completed += r.n
        else if (r.kind === 'crashed' || r.kind === 'gave_up' || r.kind === 'respawn_guarded') rework += r.n
      }
    } catch { /* 单库失败跳过 */ }
    finally { try { db.close() } catch { /* 已关 */ } }
  }
  if (files === 0) {
    return reading({ ...base, value: null, sample: 0, available: false, gap: '未找到看板库——task_events 不可读' })
  }
  if (completed < MIN_SAMPLE) {
    return reading({ ...base, value: null, sample: completed, available: false, gap: `完成事件仅 ${completed} 条，低于样本下限 ${MIN_SAMPLE}` })
  }
  return reading({
    ...base,
    value: Number((rework / completed).toFixed(4)),
    sample: completed,
    available: true,
    gap: '代理口径：统计异常重试类事件，非 changes_requested；跨口径不可比较',
  })
}

/**
 * 技能声明覆盖率 + 声明分布（技能调用计量的可采部分）。
 *
 * 诚实边界：本仓只在任务创建事件里记了 skills 声明，没有技能级调用计数，
 * 因此**不能**算复用率与失败率。这里只报覆盖率与声明分布，并明写缺口。
 */
export async function skillUsage(): Promise<{
  available: boolean
  coverage: number | null
  declared: number
  total: number
  top: { skill: string; tasks: number }[]
  gap?: string
}> {
  let declared = 0
  let total = 0
  const counter = new Map<string, number>()
  for (const file of kanbanDbFiles()) {
    let db
    try { db = await openReadonly(file) } catch { continue }
    try {
      const rows = db.prepare(
        "SELECT payload FROM task_events WHERE kind='created'",
      ).all() as unknown as { payload: string | null }[]
      for (const r of rows) {
        total += 1
        let skills: unknown = null
        try { skills = r.payload ? (JSON.parse(r.payload) as { skills?: unknown }).skills : null } catch { skills = null }
        if (!Array.isArray(skills) || skills.length === 0) continue
        declared += 1
        for (const s of skills) {
          const name = String(s)
          counter.set(name, (counter.get(name) ?? 0) + 1)
        }
      }
    } catch { /* 单库失败跳过 */ }
    finally { try { db.close() } catch { /* 已关 */ } }
  }
  const top = [...counter.entries()]
    .map(([skill, tasks]) => ({ skill, tasks }))
    .sort((a, b) => b.tasks - a.tasks)
    .slice(0, 20)
  if (total === 0) {
    return { available: false, coverage: null, declared: 0, total: 0, top: [], gap: '未找到看板库或任务创建事件' }
  }
  const coverage = Number((declared / total).toFixed(4))
  const gaps: string[] = []
  if (declared === 0) gaps.push('没有任何任务声明 skills——技能复用完全不可观测')
  else if (coverage < 0.5) gaps.push(`仅 ${(coverage * 100).toFixed(1)}% 的任务声明了 skills，复用率与失败率无法据此计算`)
  gaps.push('运行时未记录技能级调用计数——复用率环比需先补采集（vendor 面，单独轮次）')
  return {
    available: declared > 0,
    coverage,
    declared,
    total,
    top,
    gap: gaps.join('；'),
  }
}

/** 反向指标：接口数（一个新任务要跨几个系统取上下文）。当前无统一采集源。 */
export function interfaceCount(): DerivedReading {
  return reading({
    key: 'measure/interface-count',
    title: '接口数（反向指标）',
    definition: '一个新任务为取上下文需要跨越的系统数（越小越好）',
    sources: [],
    value: null,
    sample: 0,
    available: false,
    gap: '无统一接口计数源——需跨系统调用链采集，本轮只占位不伪造趋势',
  })
}

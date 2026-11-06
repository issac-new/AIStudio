// custom/server/agentidentity/lifecycle.ts
// 五阶段状态机（纯函数）：登记 → 准入 → 运行 → 变更 → 退出。
// 每次迁移本身就是一次署名：记录 by（在岗自然人）、at、reason、evidenceRefs。
import type { Person } from './people'
import { cardGaps, type ResponsibilityCard } from './responsibility'

export type Stage = 'registered' | 'admitted' | 'running' | 'changing' | 'retired'

export interface LifecycleEvent {
  from: Stage | null
  to: Stage
  at: number
  by: string
  reason: string
  evidenceRefs: string[]
}

export interface ExitRecord {
  kind: 'pause' | 'revoke' | 'decommission'
  items: string[]
  confirmedBy?: string
  confirmedAt?: number
}

export interface Lifecycle {
  stage: Stage
  history: LifecycleEvent[]
  exit?: ExitRecord
}

export interface TransitionInput {
  to: Stage
  by: string
  reason: string
  evidenceRefs?: string[]
  exit?: ExitRecord
}

export function initialLifecycle(): Lifecycle {
  return { stage: 'registered', history: [] }
}

export function normalizeLifecycle(l?: Lifecycle): Lifecycle {
  if (!l || !l.stage) return initialLifecycle()
  return {
    stage: l.stage,
    history: Array.isArray(l.history) ? l.history : [],
    ...(l.exit ? { exit: l.exit } : {}),
  }
}

export function stageOf(identity: { lifecycle?: Lifecycle }): Stage {
  return identity.lifecycle?.stage ?? 'registered'
}

const LEGAL: Record<Stage, Stage[]> = {
  registered: ['admitted', 'retired'],
  admitted: ['running', 'retired'],
  running: ['changing', 'retired'],
  changing: ['running', 'retired'],
  retired: [],
}

export function canTransition(
  identity: { responsibilityCard?: ResponsibilityCard; lifecycle?: Lifecycle },
  input: TransitionInput,
  people: Person[],
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const active = new Set(people.filter((p) => p.active).map((p) => p.id))
  const from = stageOf(identity)

  if (!active.has(input.by)) problems.push('迁移人必须是在岗自然人')
  if (typeof input.reason !== 'string' || !input.reason.trim()) problems.push('迁移理由必填')
  if (from === input.to) problems.push(`已处于 ${from}，无需迁移`)
  if (from === 'retired') problems.push('已退役，不可再迁移')
  if (from !== input.to && !LEGAL[from].includes(input.to)) problems.push(`非法迁移：${from} → ${input.to}`)

  if (input.to === 'admitted') {
    for (const gap of cardGaps(identity.responsibilityCard, people, { forAdmission: true })) {
      problems.push(gap.detail)
    }
  }
  if (from === 'changing' && input.to === 'running') {
    if ((input.evidenceRefs ?? []).length < 2) problems.push('变更后重启须有重新验证与重新授权两条证据')
  }
  if (input.to === 'retired') {
    const exit = input.exit
    if (!exit || !Array.isArray(exit.items) || exit.items.length === 0) {
      problems.push('退出须登记暂停/撤权/未完事项/交接确认项')
    }
    if (!exit?.confirmedBy || !active.has(exit.confirmedBy)) problems.push('退出须由在岗自然人确认交接')
    if (
      identity.responsibilityCard?.riskTier === 'high'
      && exit?.confirmedBy === identity.responsibilityCard.primaryOwner
    ) {
      problems.push('高风险执行单元退出确认人不得与主责任人为同一人')
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true }
}

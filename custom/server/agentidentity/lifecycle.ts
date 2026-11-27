// custom/server/agentidentity/lifecycle.ts
// 五阶段状态机（纯函数）：登记 → 准入 → 运行 → 变更 → 退出。
// 每次迁移本身就是一次署名：记录 by（在岗自然人）、at、reason、evidenceRefs。
//
// 2026-11-27 研究报告讨论稿吸收（spec 2026-11-27-workunit-framework-align）：
//   - 准入并查户口：任务边界、权限范围、审计要求齐备且责任卡有效，缺一不可准入；
//   - 进入变更时留范围快照，变更后恢复时比对：扩权须五项就绪或由迁移人署名豁免理由；
//   - 无快照的存量变更按「无法判断」处理，要求豁免理由，不默认未扩权；
//   - 退出确认人分离改按单元类型（顶岗型强制），不再看风险档。
import type { Person } from './people'
import type { JudgmentRecord } from './judgments'
import {
  cardGaps, isScopeExpansion, readiness, scopeSnapshotOf,
  type ResponsibilityCard, type ScopeExpansionKind, type ScopeSnapshot,
} from './responsibility'
import { rosterGaps } from './roster-gaps'

export type Stage = 'registered' | 'admitted' | 'running' | 'changing' | 'retired'

export interface LifecycleEvent {
  from: Stage | null
  to: Stage
  at: number
  by: string
  reason: string
  evidenceRefs: string[]
  /** 进入变更时的范围快照（2026-11-27 起，仅 to='changing' 的事件携带；存量事件可缺） */
  snapshot?: ScopeSnapshot
  /** 扩权变更的豁免理由（仅 to='running' 且本次判定为扩权时携带） */
  expansionWaiver?: string
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
  /** 扩权变更的豁免理由（扩权且五项未全就绪时必填） */
  expansionWaiver?: string
}

/** 判定上下文（可选）：不传按「无数据源」处理——扩权只能走豁免，不会误判为就绪。 */
export interface TransitionContext {
  /** 本单元的人署名记录（只收 human-entry） */
  judgments?: Pick<JudgmentRecord, 'kind'>[]
  /** stabilityRetest>=2 的评测读数条数 */
  stabilityReadings?: number
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

/** 扩权维度的人读标签（问题列表用）。 */
const EXPANSION_LABEL: Record<ScopeExpansionKind, string> = {
  'capability-can': '能力边界变宽（能做增多）',
  'capability-cannot': '能力边界变宽（不做减少）',
  'tool-allowlist': '工具白名单变多',
  'risk-lowered': '风险档降低',
  'collab-raised': '协作等级升高',
}

/** 最近一次进入变更时留下的范围快照；没有则 undefined（存量变更事件）。 */
function lastChangingSnapshot(identity: { lifecycle?: Lifecycle }): ScopeSnapshot | undefined {
  const history = identity.lifecycle?.history ?? []
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].to === 'changing') return history[i].snapshot
  }
  return undefined
}

/** 判定所用的身份最小面：户口（能力边界/白名单/审计）＋ 责任卡 ＋ 生命周期。 */
export type TransitionIdentity = {
  name?: string
  owner?: string
  toolAllowlist?: string[]
  capabilityBoundary?: { can?: string[]; cannot?: string[] }
  auditRequirement?: { sampling?: number; retentionDays?: number; note?: string }
  responsibilityCard?: ResponsibilityCard
  lifecycle?: Lifecycle
}

export function canTransition(
  identity: TransitionIdentity,
  input: TransitionInput,
  people: Person[],
  ctx: TransitionContext = {},
  // 返回型不用判别联合：typecheck:harness 跑 --strict false，布尔判别不生效；
  // 调用方一律按 problems.length 判定（ok 仅为便捷镜像）。
): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  const active = new Set(people.filter((p) => p.active).map((p) => p.id))
  const from = stageOf(identity)

  if (!active.has(input.by)) problems.push('迁移人必须是在岗自然人')
  if (typeof input.reason !== 'string' || !input.reason.trim()) problems.push('迁移理由必填')
  if (from === input.to) problems.push(`已处于 ${from}，无需迁移`)
  if (from === 'retired') problems.push('已退役，不可再迁移')
  if (from !== input.to && !LEGAL[from].includes(input.to)) problems.push(`非法迁移：${from} → ${input.to}`)

  if (input.to === 'admitted') {
    // 卡与户口并查：两处缺口都报，便于一次补齐
    for (const gap of cardGaps(identity.responsibilityCard, people, { forAdmission: true })) {
      problems.push(gap.detail)
    }
    for (const gap of rosterGaps({
      name: identity.name ?? '', owner: identity.owner ?? '',
      toolAllowlist: identity.toolAllowlist ?? [],
      ...(identity.capabilityBoundary ? { capabilityBoundary: identity.capabilityBoundary } : {}),
      ...(identity.auditRequirement ? { auditRequirement: identity.auditRequirement } : {}),
    })) {
      problems.push(gap.detail)
    }
  }
  if (from === 'changing' && input.to === 'running') {
    if ((input.evidenceRefs ?? []).length < 2) problems.push('变更后重启须有重新验证与重新授权两条证据')
    // 扩权判定：变更前取进入变更时的快照，变更后取当前身份的范围
    const before = lastChangingSnapshot(identity)
    const after = scopeSnapshotOf(identity)
    const waiver = typeof input.expansionWaiver === 'string' && input.expansionWaiver.trim() ? input.expansionWaiver.trim() : ''
    if (!before) {
      // 存量变更事件无快照：无法判断是否扩权，按规格要求豁免理由，不默认未扩权
      if (!waiver) problems.push('本次变更无变更前快照，无法判断是否扩权——须填写豁免理由（说明范围未变或已获授权）')
    } else {
      const hits = isScopeExpansion(before, after)
      if (hits.length) {
        if (!waiver) {
          const items = readiness({ snapshot: after, judgments: ctx.judgments ?? [], stabilityReadings: ctx.stabilityReadings })
          const notReady = items.filter((r) => r.state !== 'yes')
          problems.push(
            `本次变更属扩权（${hits.map((h) => EXPANSION_LABEL[h]).join('、')}）：五项能力须全部就绪，或填写豁免理由。` +
            `未就绪：${notReady.map((r) => `${readinessLabel(r.id)}（${r.state === 'unknown' ? '未知' : '未就绪'}）`).join('、')}`,
          )
        }
      }
    }
  }
  if (input.to === 'retired') {
    const exit = input.exit
    if (!exit || !Array.isArray(exit.items) || exit.items.length === 0) {
      problems.push('退出须登记暂停/撤权/未完事项/交接确认项')
    }
    if (!exit?.confirmedBy || !active.has(exit.confirmedBy)) problems.push('退出须由在岗自然人确认交接')
    if (
      identity.responsibilityCard?.unitType === 'post'
      && exit?.confirmedBy === identity.responsibilityCard.primaryOwner
    ) {
      problems.push('顶岗型执行单元退出确认人不得与主责任人为同一人')
    }
  }
  return { ok: problems.length === 0, problems }
}

const READINESS_LABEL: Record<string, string> = {
  'net-contribution': '净贡献核算',
  'correction-channel': '纠错通道',
  discretion: '裁量保障',
  reliability: '可靠性检验',
  'case-maintenance': '用例维护',
}

function readinessLabel(id: string): string {
  return READINESS_LABEL[id] ?? id
}

// overlay/handoff 域：交接质量账本（MAS-RSI 吸收轮 2026-11-03）。
//
// 两篇调研的共同落点：
//   · 《Recursive Self-Improvement through Multi-Agent Self-Supervision》（MASS, arXiv 2610.12176）
//     把「多智能体协作」当成可学对象，核心是**交接**：谁产出什么、交给谁、下一个阶段拿到没有。
//     论文把交接成功当作学习信号（子代理调用 1/110→87/110、代码交接 1/110→83/110）。
//   · DeerFlow 2.0 的工程分工（Lead Agent 拆活 → Researcher/Coder/Reporter/Creator 接活）
//     同样以「派活—收活」为骨架。
//
// 本仓已有 stage-keys 管**声明式**阶段契约（四把键 + 产物哈希 + 提交锚点）。缺的是**运行态**：
// 真实的「派了活、接手方有没有交出东西」。看板事件正好有这些信号——
//   claimed（认领）→ worker_bound/spawned（拉起）→ worker_result/completed（交付）
//   gave_up / crashed / reclaimed（锁过期回收）＝没交出东西
// 于是本模块从 kanban 事件推「认领回合」（claim episode）的质量：完成率、掉落率、停滞、抖动。
//
// 纯函数：不读盘不读 env；事件/任务由 delivery 的看板读取器提供。

export interface HandoffEvent {
  taskId: string
  kind: string
  /** epoch 秒（task_events.created_at 同源）。 */
  at: number
}

export interface HandoffTask {
  id: string
  title?: string
  status?: string
  assignee?: string | null
}

export interface HandoffQualityOptions {
  /** 统计窗口（小时）：只数窗口内认领的回合。 */
  windowHours?: number
  /** 认领后多久没有终态＝停滞（小时）。 */
  stallHours?: number
  /** 同一任务在窗口内被认领多少次算抖动。 */
  pingPongClaims?: number
  nowMs?: number
}

export type EpisodeOutcome = 'completed' | 'dropped' | 'stalled' | 'running'

export interface ClaimEpisode {
  taskId: string
  claimedAtMs: number
  endedAtMs: number | null
  outcome: EpisodeOutcome
  /** dropped 时的具体事件 kind（gave_up/crashed/reclaimed/archived）。 */
  dropKind?: string
}

export interface HandoffQualityReport {
  available: boolean
  reason?: string
  windowHours: number
  stallHours: number
  tasks: number
  /** 窗口内认领回合数。 */
  episodes: number
  completed: number
  dropped: number
  stalled: number
  running: number
  /** 交付率 = completed / (completed+dropped+stalled)。running 不进分母（还没到判的时候）。 */
  takeoverSuccessRate: number | null
  dropRate: number | null
  /** 认领→完成的时长中位数（毫秒）；无完成样本 null。 */
  medianTakeoverMs: number | null
  /** 同任务多次认领（抖动）。 */
  pingPong: Array<{ taskId: string; title?: string; claims: number }>
  /** 跨卡/跨板依赖等待次数与其后是否被解除。 */
  dependencyWaits: number
  dependencyUnblocked: number
  /** 最该看的问题回合（掉落/停滞，按持续时间降序）。 */
  worst: Array<{ taskId: string; title?: string; outcome: EpisodeOutcome; dropKind?: string; ageHours: number }>
  note: string
}

const TERMINAL_COMPLETED = new Set(['completed'])
const TERMINAL_DROPPED = new Set(['gave_up', 'crashed', 'reclaimed', 'archived'])
const CLAIM_KINDS = new Set(['claimed'])

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid]
}

/**
 * 从看板事件推交接质量。语义边界：
 *   · 只看窗口内发起的认领回合；窗口前认领、窗口内完成的不计入（避免偷看历史）；
 *   · `reclaimed`（锁过期回收）既结束上一回合（判 dropped），也开启新回合；
 *   · 停滞用「认领后 stallHours 内无终态」判定，不猜「大概在做」；
 *   · 任务当前状态为 done 且回合未闭合时，按完成计（事件可能被裁剪，状态是权威兜底）。
 */
export function computeHandoffQuality(
  tasks: HandoffTask[],
  events: HandoffEvent[],
  options: HandoffQualityOptions = {},
): HandoffQualityReport {
  const windowHours = Math.max(1, Math.trunc(options.windowHours ?? 24))
  const stallHours = Math.max(1, Math.trunc(options.stallHours ?? 6))
  const pingPongClaims = Math.max(2, Math.trunc(options.pingPongClaims ?? 3))
  const nowMs = options.nowMs ?? Date.now()
  const windowStartMs = nowMs - windowHours * 3_600_000
  const stallMs = stallHours * 3_600_000

  const byTask = new Map<string, HandoffEvent[]>()
  for (const e of events) {
    if (!Number.isFinite(e.at) || e.at <= 0) continue
    const arr = byTask.get(e.taskId) ?? []
    arr.push(e)
    byTask.set(e.taskId, arr)
  }
  for (const arr of byTask.values()) arr.sort((a, b) => a.at - b.at)
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const statusOf = (taskId: string): string => String(taskById.get(taskId)?.status ?? '').toLowerCase()

  const episodes: ClaimEpisode[] = []
  const claimCountByTask = new Map<string, number>()
  let dependencyWaits = 0
  let dependencyUnblocked = 0

  for (const [taskId, evs] of byTask) {
    let open: ClaimEpisode | null = null
    let waited = false
    for (const e of evs) {
      if (e.kind === 'dependency_wait') {
        if (e.at * 1000 >= windowStartMs) dependencyWaits += 1
        waited = true
        continue
      }
      if (e.kind === 'unblocked' && waited) {
        if (e.at * 1000 >= windowStartMs) dependencyUnblocked += 1
        waited = false
        continue
      }
      // reclaimed：锁过期回收＝上一任没交出东西（关上一回合），本身不开新回合；
      // 真正的接手由随后的 claimed 事件表达（避免一次回收被记成两次认领）
      if (e.kind === 'reclaimed') {
        if (open) {
          open.endedAtMs = e.at * 1000
          open.outcome = 'dropped'
          open.dropKind = 'reclaimed'
          episodes.push(open)
          open = null
        }
        continue
      }
      if (CLAIM_KINDS.has(e.kind)) {
        const atMs = e.at * 1000
        // 新认领先关掉上一回合：锁过期回收（reclaimed）＝上一任没交出东西
        if (open) {
          open.endedAtMs = atMs
          open.outcome = 'dropped'
          open.dropKind = e.kind === 'reclaimed' ? 'reclaimed' : 'superseded'
          episodes.push(open)
          open = null
        }
        if (atMs < windowStartMs) continue
        open = { taskId, claimedAtMs: atMs, endedAtMs: null, outcome: 'running' }
        claimCountByTask.set(taskId, (claimCountByTask.get(taskId) ?? 0) + 1)
        continue
      }
      if (!open) continue
      const atMs = e.at * 1000
      if (TERMINAL_COMPLETED.has(e.kind) || (e.kind === 'worker_result' && statusOf(taskId) === 'done')) {
        open.endedAtMs = atMs
        open.outcome = 'completed'
        episodes.push(open)
        open = null
        continue
      }
      if (TERMINAL_DROPPED.has(e.kind)) {
        open.endedAtMs = atMs
        open.outcome = 'dropped'
        open.dropKind = e.kind
        episodes.push(open)
        open = null
      }
    }
    if (open) {
      // 未闭合：任务状态是权威兜底（事件可能被裁剪），否则按停滞/在跑判
      if (statusOf(taskId) === 'done') {
        open.endedAtMs = nowMs
        open.outcome = 'completed'
        episodes.push(open)
      } else if (nowMs - open.claimedAtMs > stallMs) {
        open.endedAtMs = nowMs
        open.outcome = 'stalled'
        episodes.push(open)
      } else {
        episodes.push(open)
      }
    }
  }

  const completed = episodes.filter((e) => e.outcome === 'completed').length
  const dropped = episodes.filter((e) => e.outcome === 'dropped').length
  const stalled = episodes.filter((e) => e.outcome === 'stalled').length
  const running = episodes.filter((e) => e.outcome === 'running').length
  const judged = completed + dropped + stalled
  const rate = (n: number): number | null => (judged > 0 ? Number((n / judged).toFixed(4)) : null)
  const takeoverDurations = episodes
    .filter((e) => e.outcome === 'completed' && e.endedAtMs != null)
    .map((e) => (e.endedAtMs as number) - e.claimedAtMs)

  const pingPong = [...claimCountByTask.entries()]
    .filter(([, c]) => c >= pingPongClaims)
    .map(([taskId, claims]) => ({ taskId, ...(taskById.get(taskId)?.title ? { title: taskById.get(taskId)!.title } : {}), claims }))
    .sort((a, b) => b.claims - a.claims)

  const worst = episodes
    .filter((e) => e.outcome === 'dropped' || e.outcome === 'stalled')
    .map((e) => ({
      taskId: e.taskId,
      ...(taskById.get(e.taskId)?.title ? { title: taskById.get(e.taskId)!.title } : {}),
      outcome: e.outcome,
      ...(e.dropKind ? { dropKind: e.dropKind } : {}),
      ageHours: Number((((e.endedAtMs ?? nowMs) - e.claimedAtMs) / 3_600_000).toFixed(2)),
    }))
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, 10)

  return {
    available: true,
    windowHours,
    stallHours,
    tasks: tasks.length,
    episodes: episodes.length,
    completed,
    dropped,
    stalled,
    running,
    takeoverSuccessRate: rate(completed),
    dropRate: rate(dropped),
    medianTakeoverMs: median(takeoverDurations),
    pingPong,
    dependencyWaits,
    dependencyUnblocked,
    worst,
    note:
      '口径：认领回合（claimed/reclaimed 起，completed/gave_up/crashed/reclaimed/archived 止）；running 不进分母；' +
      '停滞＝认领后超过阈值无终态且任务未 done；不猜「大概在做」。',
  }
}

/** 多板聚合：合并事件后统一计算（跨板依赖也在这里体现）。 */
export function mergeBoardsForHandoff(
  boards: Array<{ slug: string; available: boolean; tasks: HandoffTask[]; events: HandoffEvent[] }>,
): { tasks: HandoffTask[]; events: HandoffEvent[]; boards: number; boardsAvailable: number } {
  const tasks: HandoffTask[] = []
  const events: HandoffEvent[] = []
  for (const b of boards) {
    if (!b.available) continue
    tasks.push(...b.tasks)
    events.push(...b.events)
  }
  return { tasks, events, boards: boards.length, boardsAvailable: boards.filter((b) => b.available).length }
}

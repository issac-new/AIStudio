// overlay[optadvice] 交付周期分解（F 项，2026-10-14 阿里调研轮）：从看板
// column_transition 事件算各阶段时长瀑布——「编码只占 2/20 天」这笔账的产品面。
// 纯函数：输入事件轻量行（task_events 读取面产出），无 DB 依赖。

export interface TransitionLite {
  taskId: string
  /** 流入列（payload.to） */
  to: string
  /** 事件秒级时间戳（created_at） */
  at: number
  /** 事件 id（同秒排序稳定锚） */
  seq: number
}

export interface StageStat {
  stage: string
  /** 流入该列的迁移数（=进入该阶段的卡次） */
  entered: number
  /** 阶段累计停留秒（到下一迁移为止） */
  totalSec: number
  medianSec: number
  p90Sec: number
  /** 占全部阶段累计的百分比（0-100，一位小数） */
  sharePct: number
}

export interface CardTotal {
  taskId: string
  /** 首迁移→末迁移跨度秒（跨阶段总交付周期下界；只含已发生迁移） */
  spanSec: number
  transitions: number
}

export interface Waterfall {
  /** 阶段序=全局首次流入顺序（稳定，不按耗时重排） */
  stages: StageStat[]
  cards: CardTotal[]
  /** 全部卡 spanSec 的中位数（秒）；无完整卡为 null */
  medianSpanSec: number | null
  events: number
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function p90(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]
}

/**
 * 事件→瀑布：按任务分组、组内按 (at, seq) 排序，相邻迁移对的间隔记入前阶段；
 * 末迁移无下游不计时（只计入 entered）。负间隔（时钟回拨/同秒）截为 0。
 */
export function waterfallFromEvents(events: TransitionLite[]): Waterfall {
  const byTask = new Map<string, TransitionLite[]>()
  for (const e of events) {
    const list = byTask.get(e.taskId) ?? []
    list.push(e)
    byTask.set(e.taskId, list)
  }
  const durations = new Map<string, number[]>()
  const entered = new Map<string, number>()
  const firstSeen = new Map<string, number>()
  const cards: CardTotal[] = []
  let seen = 0
  for (const [taskId, list] of byTask) {
    list.sort((a, b) => a.at - b.at || a.seq - b.seq)
    for (const e of list) {
      entered.set(e.to, (entered.get(e.to) ?? 0) + 1)
      if (!firstSeen.has(e.to)) firstSeen.set(e.to, seen++)
    }
    for (let i = 0; i + 1 < list.length; i++) {
      const stage = list[i].to
      const d = Math.max(0, list[i + 1].at - list[i].at)
      const arr = durations.get(stage) ?? []
      arr.push(d)
      durations.set(stage, arr)
    }
    if (list.length >= 2) {
      cards.push({
        taskId,
        spanSec: Math.max(0, list[list.length - 1].at - list[0].at),
        transitions: list.length,
      })
    }
  }
  const totalAll = [...durations.values()].reduce((acc, arr) => acc + arr.reduce((x, y) => x + y, 0), 0)
  const stages: StageStat[] = [...durations.keys()]
    .map((stage) => {
      const arr = durations.get(stage) as number[]
      const totalSec = arr.reduce((x, y) => x + y, 0)
      return {
        stage,
        entered: entered.get(stage) ?? 0,
        totalSec,
        medianSec: median(arr) ?? 0,
        p90Sec: p90(arr) ?? 0,
        sharePct: totalAll > 0 ? Math.round((totalSec / totalAll) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => (firstSeen.get(a.stage) ?? 0) - (firstSeen.get(b.stage) ?? 0))
  return {
    stages,
    cards,
    medianSpanSec: median(cards.map((c) => c.spanSec)),
    events: events.length,
  }
}

/** 瓶颈 Top-N：按累计停留秒降序（并列按阶段名稳定序）。 */
export function topStages(w: Waterfall, limit = 5): StageStat[] {
  return [...w.stages].sort((a, b) => b.totalSec - a.totalSec || a.stage.localeCompare(b.stage)).slice(0, limit)
}

/**
 * 排期生成器（PR-7，V8.29 治理轮）——排期产物的产品源。
 *
 * 定位：步 17 排期的预写派发词（dispatch-preset 代偿）退役路径——排期计算进产品，
 * 驱动/PM 只消费本端点的结构化产物。算法=单机串行日历 + 并行上限约束（同刻在制
 * 任务 ≤ max_wip，缺省 2，方案 §2.4 步 17 附在制上限声明）+ 人日折算工作窗。
 *
 * POST /api/hermes/autosched/schedule
 *   { tasks: [{id, estimate_days, assignee?, deps?: [id]}], start?: "YYYY-MM-DD", max_wip?: 2, hours_per_day?: 8 }
 *   → { start, max_wip, plan: [{id, assignee, estimate_days, window: {start, end}, order}], total_days }
 * 纯函数 compute_schedule 可单测；无状态、不落库（排期产物由调用方入仓）。
 * 挂载：B 类 patch 636（bootstrap/routes.ts，同 631 模式）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'

const router = new Router({ prefix: '/api/hermes/autosched' })

export interface SchedTask { id: string; estimate_days: number; assignee?: string; deps?: string[] }

/** 工作日推进（跳过周六日）；无假期面——推演环境单机日历足够。 */
function nextWorkday(d: Date): Date {
  const n = new Date(d)
  do { n.setUTCDate(n.getUTCDate() + 1) } while (n.getUTCDay() === 0 || n.getUTCDay() === 6)
  return n
}

/** 排期计算（纯函数，测试面）：拓扑序（依赖先行）+ 在制上限（max_wip）分窗。 */
export function compute_schedule(
  tasks: SchedTask[],
  startISO: string,
  maxWip: number,
): { plan: Array<Record<string, unknown>>; total_days: number } {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const done = new Set<string>()
  const plan: Array<Record<string, unknown>> = []
  const remaining = new Set(tasks.map(t => t.id))
  let cursor = new Date(`${startISO}T00:00:00Z`)
  let wip: Array<{ id: string; free: number }> = []
  let totalDays = 0
  let guard = 0
  while (remaining.size > 0 && guard++ < 10_000) {
    // 依赖就绪且未排的任务
    const ready = [...remaining].filter(id => (byId.get(id)?.deps ?? []).every(d => done.has(d)))
    if (ready.length === 0) throw new Error('circular or missing deps in tasks')
    // 在制槽位释放（当天容量用尽即释放）
    wip = wip.filter(s => s.free > 0)
    for (const id of ready) {
      if (wip.length >= maxWip) break
      const t = byId.get(id)!
      const est = Math.max(0.25, Number(t.estimate_days) || 0.5)
      wip.push({ id, free: est })
      totalDays += est
      const start = new Date(cursor)
      let end = new Date(cursor)
      let left = est
      while (left > 0) {
        const dayCap = 1
        const used = Math.min(left, dayCap)
        left -= used
        if (left > 0) end = nextWorkday(end)
      }
      plan.push({ id, assignee: t.assignee ?? null, estimate_days: est, order: plan.length + 1,
        window: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) } })
      remaining.delete(id)
      done.add(id)
    }
    // 推进一天：扣减在制容量
    for (const s of wip) s.free = Math.round((s.free - 1) * 100) / 100
    cursor = nextWorkday(cursor)
  }
  return { plan, total_days: Math.round(totalDays * 100) / 100 }
}

router.post('/schedule', (ctx: Context) => {
  const body = ctx.request.body as { tasks?: unknown; start?: unknown; max_wip?: unknown } | undefined
  const raw = body?.tasks
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) {
    ctx.status = 400; ctx.body = { error: 'tasks 须为非空数组（≤500）' }; return
  }
  const tasks: SchedTask[] = []
  for (const t of raw) {
    const r = t as Partial<SchedTask>
    if (typeof r.id !== 'string' || !r.id) { ctx.status = 400; ctx.body = { error: 'task.id 必填' }; return }
    tasks.push({ id: r.id, estimate_days: Number(r.estimate_days) || 0.5,
      assignee: typeof r.assignee === 'string' ? r.assignee : undefined,
      deps: Array.isArray(r.deps) ? r.deps.filter((d): d is string => typeof d === 'string') : undefined })
  }
  const start = typeof body?.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start)
    ? body.start : new Date().toISOString().slice(0, 10)
  const maxWip = Math.max(1, Math.min(10, Number(body?.max_wip) || 2))
  try {
    const { plan, total_days } = compute_schedule(tasks, start, maxWip)
    ctx.body = { start, max_wip: maxWip, plan, total_days,
      note: 'PR-7 排期产品源（V8.29）：单机工作日历+在制上限；产物由调用方入仓' }
  } catch (exc) {
    ctx.status = 422; ctx.body = { error: (exc as Error).message }
  }
})

export { router as autoschedRouter }

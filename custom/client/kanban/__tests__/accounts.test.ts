// 管理三账纯函数守门（docs/2026-09-29-change-gov-three-accounts-research.md §4.2）：
// ① 停滞分级与 KanbanTaskCard 阈值同源（ready/blocked 1h·24h，running 10m·1h，todo 7d·30d）
// ② 绿灯率/最劣偏差天数；空数据 null 不做除零假数据
// ③ 风险 Pareto：头部 20% 占偏差天数比例（集中度口径）
// ④ 资源账：过载阈值 max(3, 2×均值)、闲置、结构性错配（最大/均值 ≥2）
import { describe, it, expect } from 'vitest'
import { computeAccounts, taskHealth, STALE_THRESHOLDS, type AccountsTask } from '../utils/accounts'

const H = 3600
const D = 86400
const now = 1_800_000_000

function t(partial: Partial<AccountsTask>): AccountsTask {
  return { id: 'x', title: 'x', status: 'todo', board: 'b', created_at: now - 1000, ...partial }
}

describe('taskHealth 停滞分级（卡片阈值同源）', () => {
  it('ready 1h 内绿 / 超 1h 琥珀 / 超 24h 红且偏差天数按超琥珀部分计', () => {
    expect(taskHealth(t({ status: 'ready', created_at: now - 30 * 60 }), now).tier).toBe('green')
    expect(taskHealth(t({ status: 'ready', created_at: now - 2 * H }), now).tier).toBe('amber')
    const red = taskHealth(t({ status: 'ready', created_at: now - 3 * D }), now)
    expect(red.tier).toBe('red')
    expect(red.delayDays).toBe(Math.floor((3 * D - H) / D)) // (72h-1h)/24h = 2
  })
  it('running 用 started_at 年龄；无 started_at 视为绿', () => {
    expect(taskHealth(t({ status: 'running', started_at: now - 20 * 60 }), now).tier).toBe('amber')
    expect(taskHealth(t({ status: 'running', started_at: now - 2 * H }), now).tier).toBe('red')
    expect(taskHealth(t({ status: 'running', started_at: null }), now).tier).toBe('green')
  })
  it('todo 7d/30d；blocked 1h/24h；无阈值状态（triage/review/done）恒绿', () => {
    expect(taskHealth(t({ status: 'todo', created_at: now - 8 * D }), now).tier).toBe('amber')
    expect(taskHealth(t({ status: 'todo', created_at: now - 31 * D }), now).tier).toBe('red')
    expect(taskHealth(t({ status: 'blocked', created_at: now - 2 * H }), now).tier).toBe('amber')
    expect(taskHealth(t({ status: 'review', created_at: now - 40 * D }), now).tier).toBe('green')
    expect(taskHealth(t({ status: 'done' }), now).tier).toBe('green')
  })
  it('阈值常量与看板卡口径一致', () => {
    expect(STALE_THRESHOLDS.ready).toEqual({ amber: 3600, red: 86400 })
    expect(STALE_THRESHOLDS.running).toEqual({ amber: 600, red: 3600 })
    expect(STALE_THRESHOLDS.todo).toEqual({ amber: 604800, red: 2592000 })
  })
})

describe('computeAccounts 三账', () => {
  it('进度账：绿灯率 + 空数据 null（不造除零假数据）', () => {
    const empty = computeAccounts([], now)
    expect(empty.progress.greenRate).toBeNull()
    expect(empty.progress.total).toBe(0)
    expect(empty.progress.worstDelayDays).toBe(0)

    const a = computeAccounts([
      t({ id: '1', status: 'done' }),
      t({ id: '2', status: 'ready', created_at: now - 2 * H }), // 超 1h 未达 24h → 琥珀
      t({ id: '3', status: 'blocked', created_at: now - 2 * D }),
    ], now)
    expect(a.progress).toMatchObject({ total: 3, green: 1, amber: 1, red: 1 })
    expect(a.progress.greenRate).toBeCloseTo(1 / 3)
    // 红单 blocked 2d：偏差 (48h-1h)/24h = 1 天
    expect(a.progress.worstDelayDays).toBe(1)
  })

  it('风险账：Pareto 头部 20% 集中度', () => {
    // 10 个风险单：2 个重灾（各 10+ 天）+ 8 个轻（各 1 天）→ 头部 2 单占大头
    const tasks: AccountsTask[] = [
      t({ id: 'heavy1', status: 'blocked', created_at: now - 11 * D }),
      t({ id: 'heavy2', status: 'todo', created_at: now - 38 * D }),
      ...Array.from({ length: 8 }, (_, i) =>
        t({ id: `light${i}`, status: 'ready', created_at: now - 2 * D })),
    ]
    const a = computeAccounts(tasks, now)
    expect(a.risk.items[0].id).toBe('heavy2') // 偏差天数降序
    expect(a.risk.paretoTopShare).toBeCloseTo((a.risk.items[0].delayDays + a.risk.items[1].delayDays) / a.risk.totalDelayDays)
    expect(a.risk.paretoTopShare!).toBeGreaterThan(0.7) // 高集中度场景
  })

  it('资源账：过载阈值/闲置/结构性错配；done 不计未结', () => {
    const tasks: AccountsTask[] = [
      ...Array.from({ length: 9 }, (_, i) => t({ id: `a${i}`, status: 'todo', assignee: '@busy' })),
      t({ id: 'b0', status: 'done', assignee: '@idle' }),   // 历史出现、当前零未结 → 闲置
      t({ id: 'b1', status: 'todo', assignee: '@calm' }),
      t({ id: 'u0', status: 'todo', assignee: '' }),        // 空受理人 → 未指派桶
    ]
    const a = computeAccounts(tasks, now)
    expect(a.resource.loads).toHaveLength(4) // @busy/@idle/@calm + 未指派桶
    const busy = a.resource.loads.find((l) => l.assignee === '@busy')!
    expect(busy.open).toBe(9)
    // 人均未结 = 11/4 桶 = 2.75 → 阈值 max(3, ceil(5.5)) = 6 → busy(9) 过载
    expect(a.resource.overloadThreshold).toBe(6)
    expect(busy.overloaded).toBe(true)
    expect(a.resource.idle).toContain('@idle')
    expect(a.resource.structuralMismatch).toBe(true) // 9 / 2.75 ≥ 2
    const unassigned = a.resource.loads.find((l) => l.assignee === '未指派')!
    expect(unassigned.open).toBe(1)
  })
})

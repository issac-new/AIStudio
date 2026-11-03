// 交接质量账本测试（MAS-RSI/DeerFlow 吸收轮）：认领回合的完成/掉落/停滞/抖动/依赖。
import { describe, it, expect } from 'vitest'
import { computeHandoffQuality, mergeBoardsForHandoff, type HandoffEvent, type HandoffTask } from '../handoff-quality'

const NOW = new Date(2026, 10, 3, 12, 0, 0, 0).getTime()
const nowSec = Math.floor(NOW / 1000)
/** n 小时前（秒）。 */
const h = (n: number): number => nowSec - Math.round(n * 3600)

const task = (id: string, patch: Partial<HandoffTask> = {}): HandoffTask => ({ id, title: `任务${id}`, status: 'running', ...patch })
const ev = (taskId: string, kind: string, atSec: number): HandoffEvent => ({ taskId, kind, at: atSec })

describe('认领回合', () => {
  it('认领→完成 = 交付；给出交付率与中位时长', () => {
    const tasks = [task('t1', { status: 'done' }), task('t2', { status: 'done' })]
    const events = [
      ev('t1', 'claimed', h(4)), ev('t1', 'worker_bound', h(4)), ev('t1', 'completed', h(2)),
      ev('t2', 'claimed', h(3)), ev('t2', 'completed', h(1)),
    ]
    const r = computeHandoffQuality(tasks, events, { nowMs: NOW, windowHours: 24 })
    expect(r.episodes).toBe(2)
    expect(r.completed).toBe(2)
    expect(r.takeoverSuccessRate).toBe(1)
    expect(r.medianTakeoverMs).toBe(2 * 3600_000) // 2h 与 2h 的中位
    expect(r.worst).toHaveLength(0)
  })

  it('gave_up / crashed → 掉落；reclaimed 关掉上一回合并开新回合', () => {
    const tasks = [task('t1'), task('t2'), task('t3')]
    const events = [
      ev('t1', 'claimed', h(5)), ev('t1', 'gave_up', h(3)),
      ev('t2', 'claimed', h(6)), ev('t2', 'crashed', h(5)),
      ev('t3', 'claimed', h(8)), ev('t3', 'reclaimed', h(6)), ev('t3', 'claimed', h(6)), ev('t3', 'completed', h(2)),
    ]
    const r = computeHandoffQuality(tasks, events, { nowMs: NOW, windowHours: 24 })
    expect(r.dropped).toBe(3) // t1、t2，加 t3 的回收回合
    expect(r.completed).toBe(1)
    expect(r.dropRate).toBeCloseTo(0.75, 3)
    const t3Drops = r.worst.filter((w) => w.taskId === 't3')
    expect(t3Drops[0].dropKind).toBe('reclaimed')
  })

  it('认领后超时无终态 → 停滞（任务未 done）；任务状态 done 兜底按完成', () => {
    const tasks = [task('stall'), task('doneFb', { status: 'done' }), task('fresh')]
    const events = [
      ev('stall', 'claimed', h(10)),
      ev('doneFb', 'claimed', h(10)),
      ev('fresh', 'claimed', h(1)),
    ]
    const r = computeHandoffQuality(tasks, events, { nowMs: NOW, windowHours: 24, stallHours: 6 })
    expect(r.stalled).toBe(1)
    expect(r.completed).toBe(1)
    expect(r.running).toBe(1)
    expect(r.worst.map((w) => w.taskId)).toContain('stall')
  })

  it('窗口外的认领不计（不偷看历史）；窗口前的回合不参与', () => {
    const tasks = [task('old', { status: 'done' })]
    const events = [ev('old', 'claimed', h(48)), ev('old', 'completed', h(47))]
    const r = computeHandoffQuality(tasks, events, { nowMs: NOW, windowHours: 24 })
    expect(r.episodes).toBe(0)
    expect(r.takeoverSuccessRate).toBeNull()
  })

  it('抖动：同任务窗口内被认领 ≥3 次', () => {
    const tasks = [task('pp', { status: 'done' })]
    const events = [
      ev('pp', 'claimed', h(9)), ev('pp', 'reclaimed', h(7)),
      ev('pp', 'claimed', h(7)), ev('pp', 'reclaimed', h(5)),
      ev('pp', 'claimed', h(5)), ev('pp', 'completed', h(3)),
    ]
    const r = computeHandoffQuality(tasks, events, { nowMs: NOW, windowHours: 24, pingPongClaims: 3 })
    expect(r.pingPong.map((p) => p.taskId)).toEqual(['pp'])
    expect(r.pingPong[0].claims).toBe(3)
  })

  it('依赖等待与解除分别计数', () => {
    const tasks = [task('d1'), task('d2')]
    const events = [
      ev('d1', 'dependency_wait', h(5)), ev('d1', 'unblocked', h(4)),
      ev('d2', 'dependency_wait', h(3)),
    ]
    const r = computeHandoffQuality(tasks, events, { nowMs: NOW })
    expect(r.dependencyWaits).toBe(2)
    expect(r.dependencyUnblocked).toBe(1)
  })

  it('空输入：全零且比率为 null（不造 0%）', () => {
    const r = computeHandoffQuality([], [], { nowMs: NOW })
    expect(r.episodes).toBe(0)
    expect(r.takeoverSuccessRate).toBeNull()
    expect(r.dropRate).toBeNull()
    expect(r.medianTakeoverMs).toBeNull()
    expect(r.note).toContain('不猜')
  })
})

describe('多板合并', () => {
  it('只合可用板；不可用板计入统计但不贡献数据', () => {
    const merged = mergeBoardsForHandoff([
      { slug: 'a', available: true, tasks: [task('t1')], events: [ev('t1', 'claimed', h(2))] },
      { slug: 'b', available: false, tasks: [], events: [] },
    ])
    expect(merged.boards).toBe(2)
    expect(merged.boardsAvailable).toBe(1)
    expect(merged.tasks).toHaveLength(1)
    expect(merged.events).toHaveLength(1)
  })
})

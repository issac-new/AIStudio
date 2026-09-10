// overlay/custom/client/loop/runcenter/__tests__/use-run-replay.test.ts
// useRunReplay composable 单测（TDD 先行）：游标重放（重放至第 N 事件）/
// 播放暂停倍速 / 事件数组变更夹紧 / 步进。fake timers 驱动播放节拍。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRunReplay } from '../composables/useRunReplay'
import type { ReplayEventLike } from '../adapters/run-graph'

const ev = (i: number): ReplayEventLike => ({ kind: 'node.completed', nodeId: 'n1', ts: i * 1000 })

const EVENTS: ReplayEventLike[] = Array.from({ length: 5 }, (_, i) => ev(i))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useRunReplay — 游标与投影', () => {
  it('初始：cursorIndex=0、visibleEvents 为空、total 为事件总数', () => {
    const r = useRunReplay(EVENTS)
    expect(r.cursorIndex.value).toBe(0)
    expect(r.visibleEvents.value).toEqual([])
    expect(r.total.value).toBe(5)
    expect(r.playing.value).toBe(false)
    expect(r.atEnd.value).toBe(false)
  })

  it('seek：重放至第 N 事件 = 截断前 N 条', () => {
    const r = useRunReplay(EVENTS)
    r.seek(3)
    expect(r.cursorIndex.value).toBe(3)
    expect(r.visibleEvents.value).toHaveLength(3)
    expect(r.visibleEvents.value[2]).toEqual(ev(2))
    expect(r.atEnd.value).toBe(false)
  })

  it('seek 越界夹紧到 [0, total]', () => {
    const r = useRunReplay(EVENTS)
    r.seek(-7)
    expect(r.cursorIndex.value).toBe(0)
    r.seek(99)
    expect(r.cursorIndex.value).toBe(5)
    expect(r.atEnd.value).toBe(true)
  })

  it('事件数组变更（重新拉取回放）后游标夹紧', async () => {
    const events = ref<ReplayEventLike[]>(EVENTS)
    const r = useRunReplay(() => events.value)
    r.seek(5)
    expect(r.atEnd.value).toBe(true)

    events.value = EVENTS.slice(0, 2) // 缩短
    await nextTick()
    expect(r.cursorIndex.value).toBe(2)
    expect(r.atEnd.value).toBe(true)

    events.value = EVENTS // 变长不越界
    await nextTick()
    expect(r.cursorIndex.value).toBe(2)
  })

  it('stepForward / stepBack：单步移动并夹紧', () => {
    const r = useRunReplay(EVENTS)
    r.stepForward()
    expect(r.cursorIndex.value).toBe(1)
    r.seek(5)
    r.stepForward()
    expect(r.cursorIndex.value).toBe(5)
    r.stepBack()
    expect(r.cursorIndex.value).toBe(4)
    r.seek(0)
    r.stepBack()
    expect(r.cursorIndex.value).toBe(0)
  })
})

describe('useRunReplay — 播放 / 暂停 / 倍速', () => {
  it('play 按节拍推进游标，到尾自动暂停', () => {
    const r = useRunReplay(EVENTS, { tickMs: 500 })
    r.play()
    expect(r.playing.value).toBe(true)

    vi.advanceTimersByTime(500)
    expect(r.cursorIndex.value).toBe(1)
    vi.advanceTimersByTime(2000) // 共 5 拍 → 到尾
    expect(r.cursorIndex.value).toBe(5)
    vi.advanceTimersByTime(500) // 守卫拍：发现到尾 → 自动暂停
    expect(r.playing.value).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(r.cursorIndex.value).toBe(5) // 不再推进
  })

  it('pause 停止推进；seek 播放中跳转不中断播放', () => {
    const r = useRunReplay(EVENTS, { tickMs: 500 })
    r.play()
    vi.advanceTimersByTime(1000)
    r.pause()
    expect(r.playing.value).toBe(false)
    const at = r.cursorIndex.value
    vi.advanceTimersByTime(2000)
    expect(r.cursorIndex.value).toBe(at)

    r.play()
    r.seek(1)
    vi.advanceTimersByTime(500)
    expect(r.cursorIndex.value).toBe(2) // 播放中 seek 后继续推进
  })

  it('到尾后再 play 从头重放', () => {
    const r = useRunReplay(EVENTS, { tickMs: 500 })
    r.seek(5)
    r.play()
    expect(r.cursorIndex.value).toBe(0) // 立即归零重放
    vi.advanceTimersByTime(500)
    expect(r.cursorIndex.value).toBe(1)
  })

  it('倍速：speed=2 时推进速率翻倍', () => {
    const r = useRunReplay(EVENTS, { tickMs: 500 })
    r.setSpeed(2)
    r.play()
    vi.advanceTimersByTime(500)
    expect(r.cursorIndex.value).toBe(2) // 速率翻倍：同样 500ms 推进 2 拍
  })

  it('播放中改 speed 立即生效', () => {
    const r = useRunReplay(EVENTS, { tickMs: 500 })
    r.play()
    vi.advanceTimersByTime(500)
    expect(r.cursorIndex.value).toBe(1)
    r.setSpeed(2)
    vi.advanceTimersByTime(500)
    expect(r.cursorIndex.value).toBe(3) // interval=250ms → 再推进 2 拍
  })

  it('toggle 在播放/暂停间切换；组件卸载清理定时器不泄露', () => {
    const r = useRunReplay(EVENTS, { tickMs: 500 })
    r.toggle()
    expect(r.playing.value).toBe(true)
    r.toggle()
    expect(r.playing.value).toBe(false)

    r.toggle()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    r.dispose()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2000)
    expect(r.cursorIndex.value).toBe(0) // dispose 后不再推进
  })
})

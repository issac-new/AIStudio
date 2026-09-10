// overlay/custom/client/loop/runcenter/composables/useRunReplay.ts
// 时间轴回放 composable（task-6）：游标语义 = "重放至第 N 事件"。
//
// cursorIndex 是已重放的事件数（0..events.length）；visibleEvents 即按游标
// 截断的前缀——图状态（buildRunGraph）与时间轴行（projectEvents）都吃这个
// 前缀，实现 time-travel。播放按固定节拍（tickMs / speed）单步推进，到尾
// 自动暂停；到尾再 play 从头重放。定时器随作用域卸载或 dispose() 清理。

import { computed, getCurrentScope, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ReplayEventLike } from '../adapters/run-graph'

export interface UseRunReplayOptions {
  /** 一个事件的重放节拍（ms），实际间隔 = tickMs / speed；默认 500 */
  tickMs?: number
}

export interface UseRunReplayReturn {
  /** 已重放事件数（0..total）——"重放至第 N 事件"的 N */
  cursorIndex: Ref<number>
  /** 事件总数 */
  total: ComputedRef<number>
  playing: Ref<boolean>
  speed: Ref<number>
  /** 按游标截断的事件前缀（图与时间轴的共同投影源） */
  visibleEvents: ComputedRef<ReplayEventLike[]>
  atEnd: ComputedRef<boolean>
  play(): void
  pause(): void
  /** 播放/暂停切换 */
  toggle(): void
  /** 重放至第 i 事件（越界夹紧到 [0, total]） */
  seek(i: number): void
  stepForward(): void
  stepBack(): void
  setSpeed(s: number): void
  /** 显式清理定时器（作用域卸载时也会自动清理） */
  dispose(): void
}

export function useRunReplay(
  events: readonly ReplayEventLike[] | Ref<readonly ReplayEventLike[]> | (() => readonly ReplayEventLike[]),
  options: UseRunReplayOptions = {},
): UseRunReplayReturn {
  const tickMs = options.tickMs ?? 500
  const source = computed<readonly ReplayEventLike[]>(() =>
    typeof events === 'function' ? events()
      : 'value' in events ? events.value
      : events,
  )

  const cursorIndex = ref(0)
  const playing = ref(false)
  const speed = ref(1)

  const total = computed(() => source.value.length)
  const visibleEvents = computed(() => source.value.slice(0, cursorIndex.value))
  const atEnd = computed(() => cursorIndex.value >= total.value)

  // ── 定时器（单一 interval；speed 变更重建以立即生效）──
  let timer: ReturnType<typeof setInterval> | null = null

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function startTimer(): void {
    stopTimer()
    timer = setInterval(() => {
      if (cursorIndex.value >= total.value) {
        playing.value = false // 到尾自动暂停
        stopTimer()
        return
      }
      cursorIndex.value += 1
    }, Math.max(1, tickMs / speed.value))
  }

  // 事件数组变更（重新拉取回放/实时增量）→ 游标夹紧
  watch(total, (len) => {
    if (cursorIndex.value > len) cursorIndex.value = len
  })

  // ── 控制面 ──
  function play(): void {
    if (atEnd.value) cursorIndex.value = 0 // 到尾 → 从头重放
    playing.value = true
    startTimer()
  }

  function pause(): void {
    playing.value = false
    stopTimer()
  }

  function toggle(): void {
    if (playing.value) pause()
    else play()
  }

  function seek(i: number): void {
    cursorIndex.value = Math.min(Math.max(0, i), total.value)
  }

  function stepForward(): void { seek(cursorIndex.value + 1) }
  function stepBack(): void { seek(cursorIndex.value - 1) }

  function setSpeed(s: number): void {
    speed.value = Number.isFinite(s) && s > 0 ? s : 1
    if (playing.value) startTimer() // 立即按新节拍重排
  }

  function dispose(): void {
    pause()
  }

  // 无活动 effect scope（纯调用/测试）时不注册清理钩子，避免 Vue warn
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    cursorIndex, total, playing, speed, visibleEvents, atEnd,
    play, pause, toggle, seek, stepForward, stepBack, setSpeed, dispose,
  }
}

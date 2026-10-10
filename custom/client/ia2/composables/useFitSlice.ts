// overlay/custom/client/ia2/composables/useFitSlice.ts
// 「自适应限量显示」装配（2026-10-10 注意力条根治轮）：隐藏测量行渲染全量 chip 取
// 实测宽度，容器 ResizeObserver + 依赖变化时重算可见前缀数。纯算术在
// utils/fit-count.ts（守门测试在那边）；本组合式只做 DOM 胶水：
// - 测量行 = 与可见行同 class 的绝对定位隐藏行（widths 与真实渲染一致）；
// - jsdom（clientWidth=0 / RO 桩）下 fitCount 兜底全量显示，单测不依赖布局。
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'
import { fitCount } from '../utils/fit-count'

export interface UseFitSliceOptions {
  /** 可见行容器（取 clientWidth + ResizeObserver 监听） */
  container: Ref<HTMLElement | null>
  /** 隐藏测量行（内含全量 chip，class 与可见行一致） */
  measurer: Ref<HTMLElement | null>
  /** 测量行内 chip 选择器 */
  selector: string
  /** chip 间距（px） */
  gap: number
  /** 「+N」chip 预留宽度（px） */
  moreWidth: number
  /** 容器内其它兄弟元素的固定占位（如后台条的运行态 chip），返回 0 表示无 */
  reserved?: () => number
  /** 数据源（变化后重测宽度并重算） */
  deps?: WatchSource<unknown>[]
}

export function useFitSlice(opts: UseFitSliceOptions): { visibleCount: Ref<number> } {
  const visibleCount = ref<number>(Number.MAX_SAFE_INTEGER)
  let ro: ResizeObserver | null = null

  function chipWidths(): number[] {
    const el = opts.measurer.value
    if (!el) return []
    return Array.from(el.querySelectorAll<HTMLElement>(opts.selector)).map(c => c.offsetWidth)
  }

  function recompute(): void {
    const widths = chipWidths()
    const avail = (opts.container.value?.clientWidth ?? 0) - (opts.reserved?.() ?? 0)
    // 宽度列表与全量数据等长才有效（数据刚变、测量行未更新的间隙跳过本轮）
    visibleCount.value = fitCount({ widths, available: avail, gap: opts.gap, moreWidth: opts.moreWidth })
  }

  onMounted(() => {
    void nextTick(recompute)
    if (typeof ResizeObserver !== 'undefined' && opts.container.value) {
      ro = new ResizeObserver(() => recompute())
      ro.observe(opts.container.value)
    }
  })
  onBeforeUnmount(() => { ro?.disconnect(); ro = null })
  if (opts.deps?.length) {
    watch(opts.deps, () => { void nextTick(recompute) }, { deep: false })
  }

  return { visibleCount }
}

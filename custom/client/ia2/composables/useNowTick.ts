// overlay/custom/client/ia2/composables/useNowTick.ts
// v12.3 态势时效（2026-09-20 用户裁定：30s 刷新）：模块级共享时钟 tick。
// buildWaiting/buildLoopRows 等纯函数依赖 Date.now()，非响应式不触发重算——
// 引用计数单例 interval 每 30s 推一次响应式 now，所有消费方（态势 chips/
// 通知下拉/注意力条/最久等待标签）随之重算。最后一个作用域退出时清定时器。
import { onScopeDispose, ref, type Ref } from 'vue'

const TICK_MS = 30_000

const now = ref(Date.now())
let holders = 0
let timer: ReturnType<typeof setInterval> | null = null

/** 共享 30s 时钟（app 内多组件挂载只起一份 interval） */
export function useNowTick(): Readonly<Ref<number>> {
  if (!timer) {
    timer = setInterval(() => { now.value = Date.now() }, TICK_MS)
  }
  holders++
  onScopeDispose(() => {
    holders--
    if (holders <= 0 && timer) {
      clearInterval(timer)
      timer = null
      holders = 0
    }
  })
  return now
}

// overlay/custom/client/ia2/composables/useRunContext.ts
// 运行目录上下文跨签贯通（2026-10-17 驾驶舱动线批）：
// 此前监督/交付/追溯/问题清单各自本地 run=ref('')，从运行总览跳转时明明带了
// query.run 也无人消费——用户每个签都要重打一遍运行目录名（用户实报「往返动线
// 不合理」最痛的一处）。统一口径：query.run 优先（可分享/刷新保持，与页签路由
// 级化同理由），无 query 回落最近一次成功读取的记忆值。
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const LAST_RUN_KEY = 'ia2.lastRun'

export function useRunContext() {
  // 无路由上下文（嵌板测试态）兜底：useRoute 可能返回 undefined（IaOverviewEntry 先例）
  const route = useRoute() as ReturnType<typeof useRoute> | undefined
  const fromQuery = () => String(route?.query?.run ?? '').trim()
  const run = ref(fromQuery() || localStorage.getItem(LAST_RUN_KEY) || '')

  // 跨签跳转（同路由不同 query / 兄弟路由）时跟随 query 刷新输入框
  watch(
    () => route?.query?.run,
    (v) => {
      const s = String(v ?? '').trim()
      if (s && s !== run.value) run.value = s
    },
  )

  /** 读取成功后调用：记忆最近运行，供无 query 的直达签回填 */
  function remember(): void {
    const s = run.value.trim()
    if (s) localStorage.setItem(LAST_RUN_KEY, s)
  }

  return { run, remember }
}

// overlay/custom/client/ia2/composables/useRunContext.ts
// 运行上下文按域隔离（2026-10-20 日常/推演拆分）：
// - query.run 是显式跨域链接，出现时两域都尊重；
// - 无 query 时只读本域最近运行，日常页不再“继承”推演运行；
// - 推演域记忆沿用 ia2.lastRun（旧深链/测试兼容），日常域单独记 ia2.dailyRun。
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

export type RunContextScope = 'sim' | 'daily'
export const LAST_RUN_KEY = 'ia2.lastRun'
export const DAILY_RUN_KEY = 'ia2.dailyRun'

function storageKey(scope: RunContextScope): string {
  return scope === 'sim' ? LAST_RUN_KEY : DAILY_RUN_KEY
}

export function useRunContext(scope?: RunContextScope) {
  // 无路由上下文（嵌板测试态）兜底：useRoute 可能返回 undefined；此时默认推演域，
  // 保持监督/证据等历史面板单测的可预期性。
  const route = useRoute() as ReturnType<typeof useRoute> | undefined
  const path = String(route?.path ?? '')
  const resolvedScope: RunContextScope = scope ?? (path.startsWith('/app/sim') ? 'sim' : path ? 'daily' : 'sim')
  const key = storageKey(resolvedScope)
  const fromQuery = () => String(route?.query?.run ?? '').trim()
  const run = ref(fromQuery() || localStorage.getItem(key) || '')

  // query.run 是唯一跨域通道；query 被删除时回到本域记忆（无记忆则为空）。
  watch(
    () => route?.query?.run,
    (v) => {
      const s = String(v ?? '').trim()
      run.value = s || localStorage.getItem(key) || ''
    },
  )

  /** 读取成功后调用：只记忆当前域，避免另一域下次挂载被污染。 */
  function remember(): void {
    const s = run.value.trim()
    if (s) localStorage.setItem(key, s)
  }

  return { run, remember, scope: resolvedScope }
}

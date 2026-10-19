// overlay/custom/client/ia2/composables/useTabQuery.ts
// 专题工作台页签状态入 URL：刷新、分享、后退保持当前位置。
// 只同步页签键；未知值回退默认签（与阶段页 resolveTab 同语义）。
import { ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useTabQuery<T extends string>(
  queryKey: string,
  allowed: readonly T[],
  fallback: T,
): Ref<T> {
  const route = useRoute()
  const router = useRouter()

  function read(): T {
    const raw = Array.isArray(route.query[queryKey]) ? route.query[queryKey][0] : route.query[queryKey]
    return allowed.includes(raw as T) ? raw as T : fallback
  }

  const tab = ref<T>(read()) as Ref<T>

  watch(tab, (value) => {
    if (String(route.query[queryKey] ?? '') === value) return
    void router.replace({ query: { ...route.query, [queryKey]: value } })
  })

  watch(() => route.query[queryKey], () => {
    const next = read()
    if (next !== tab.value) tab.value = next
  })

  return tab
}

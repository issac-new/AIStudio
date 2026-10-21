// overlay/custom/client/ide/composables/useZcodeCliUsage.ts
// zcode CLI 用量徽共享单例（2026-10-21 遗留项收编轮）：侧栏两处 CLI 渲染面
// （「分组」模式独立段=IdeCliSessions；「项目/时间线」混排行=IdeTaskSidebar
// 自渲染）共用一份用量数据与一次拉取——模块级单例缓存 + in-flight 去重。
// fail-soft：端点缺席/失败=徽章不出现，不影响任何宿主功能。
import { ref } from 'vue'
import { zcodeUsageApi, type ZcodeUsageSession } from '../api/zcodeUsage'

const usageById = ref<Map<string, ZcodeUsageSession>>(new Map())
let inflight: Promise<void> | null = null
let loaded = false

async function loadUsage(force = false): Promise<void> {
  if (!force && (loaded || inflight)) return inflight ?? Promise.resolve()
  inflight = (async () => {
    try {
      const usage = await zcodeUsageApi.sessions(100)
      usageById.value = new Map((usage.sessions ?? []).map(s => [s.id, s]))
      loaded = true
    } catch {
      /* fail-soft：老服务端无此端点=无徽章 */
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** 测试复位（生产不调用）。 */
function resetUsageForTest(): void {
  usageById.value = new Map()
  inflight = null
  loaded = false
}

export function useZcodeCliUsage() {
  return {
    usageById,
    loadUsage,
    usageOf: (id: string): ZcodeUsageSession | null => usageById.value.get(id) ?? null,
  }
}

export const __zcodeCliUsageTestHooks = { resetUsageForTest }

// overlay/custom/client/ia2/store/platforms.ts
// v12 平台/网关探测 store（2026-09-19 统一视图）：自 IaShellHeader 整段上移
// （逻辑零改动）——30s 倒计时驱动轮询 /agent-health/detailed，投影 loaded_platforms
// （served_profiles 过滤）。多消费方（页头探测组 / ⚙管理台·团队与通道）经
// retain/release 引用计数共享单份轮询，互不重复请求。
// 文案注意：updated 保留 ISO 原文（i18n 相对时间由消费方渲染，store 不持 t()）。
import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface PlatformInfo {
  name: string
  icon: string
  state: string
  /** ISO 时间原文（消费方自行格式化） */
  updated: string
  profile?: string
}

const PLATFORM_ICONS: Record<string, string> = {
  api_server: 'plug', matrix: 'users', email: 'mail',
}

export const usePlatformsStore = defineStore('ia2-platforms', () => {
  const gatewayState = ref<'checking' | 'running' | 'stopped'>('checking')
  const platforms = ref<PlatformInfo[]>([])
  const refreshing = ref(false)
  const rawData = ref<unknown>(null)
  const countdown = ref(30)

  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let consumers = 0
  // 上次投影结果指纹，仅变化时更新 UI 避免闪动
  let lastLoaded = ''

  function projectLoadedPlatforms(data: unknown): PlatformInfo[] {
    if (!data || typeof data !== 'object') return []
    const loaded = (data as { loaded_platforms?: unknown }).loaded_platforms
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return []
    const profiles = new Set(
      Array.isArray((data as { served_profiles?: unknown }).served_profiles)
        ? (data as { served_profiles: unknown[] }).served_profiles.filter((profile): profile is string => typeof profile === 'string')
        : [],
    )
    const projected: PlatformInfo[] = []
    for (const [key, value] of Object.entries(loaded)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const info = value as { state?: unknown; updated_at?: unknown }
      const separator = key.indexOf(':')
      const profile = separator > 0 ? key.slice(0, separator) : undefined
      const name = separator > 0 ? key.slice(separator + 1) : key
      if (!name || (profile && profiles.size > 0 && !profiles.has(profile))) continue
      const state = typeof info.state === 'string' ? info.state : 'unknown'
      const updated = typeof info.updated_at === 'string' ? info.updated_at : ''
      projected.push({ name, profile, icon: PLATFORM_ICONS[name] || 'radar', state, updated })
    }
    return projected
  }

  async function fetchGatewayStatus(silent = true): Promise<void> {
    if (!silent) refreshing.value = true
    try {
      const res = await fetch('/agent-health/detailed')
      const data = await res.json()
      rawData.value = data
      const gw = data.gateway_state === 'running' ? 'running' as const : 'stopped' as const
      if (gw !== gatewayState.value) gatewayState.value = gw
      const next = projectLoadedPlatforms(data)
      const key = JSON.stringify(next)
      if (lastLoaded !== key) {
        lastLoaded = key
        platforms.value = next
      }
      // 成功收到返回 → 重置倒计时
      countdown.value = 30
    } catch {
      if (gatewayState.value !== 'stopped') gatewayState.value = 'stopped'
      // 收不到返回 → 倒计时保持不动（卡在 0s）
    } finally {
      if (!silent) refreshing.value = false
    }
  }

  /** 消费方挂载即持有：首客启动轮询，末客释放停止 */
  function retain(): void {
    consumers += 1
    if (countdownTimer) return
    void fetchGatewayStatus()
    countdownTimer = setInterval(() => {
      if (countdown.value > 0) {
        countdown.value -= 1
        if (countdown.value === 0) void fetchGatewayStatus(true)
      }
    }, 1000)
  }

  function release(): void {
    consumers = Math.max(0, consumers - 1)
    if (consumers === 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  /** 平台通道状态速查（管理台·团队与通道卡片）：connected / stopped / unknown */
  function channelStateOf(name: string): string {
    return platforms.value.find(p => p.name === name)?.state ?? 'unknown'
  }

  return {
    gatewayState, platforms, refreshing, rawData, countdown,
    fetchGatewayStatus, retain, release, channelStateOf,
  }
})

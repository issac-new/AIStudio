// overlay/custom/client/ide/composables/useSessionMetrics.ts
// 状态栏会话遥测：上下文水位 / TPS / 缓存命中（chatStore 投影，只读无动作）。
//
// 数据源（均为既有通道，零后端改动）：
//   - 上下文占用：activeSession.contextTokens（服务端 calcAndUpdateUsage 已按
//     input+cacheRead+cacheWrite 口径汇总）优先，退化 input+output；
//     窗口大小走 /api/studio/sessions/context-length（ChatInput 同款）。
//   - TPS：流式 assistant 文本增量（chars/4 实时估计）+ outputTokens 结算
//     （usage.updated），见 utils/metrics.ts TpsTracker。
//   - 缓存命中：SessionSummary.cache_read_tokens 等（会话列表接口），轮结束
//     与会话切换时刷新（socket 不推 cache 字段，实时值后端暂无）。
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { fetchContextLength, fetchSessions } from '@/api/studio/sessions'
import {
  TpsTracker,
  cacheHitRate,
  contextPercent,
  contextPressure,
  contextReadout,
  speedLevel,
  sparkline,
  type PressureLevel,
  type SpeedLevel,
} from '../utils/metrics'

// ChatInput.vue FALLBACK_CONTEXT 同值（窗口接口失败时的兜底）
const FALLBACK_CONTEXT = 256000
const CACHE_REFRESH_MIN_INTERVAL_MS = 3000

export interface SessionCacheDetail {
  inputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function useSessionMetrics() {
  const chatStore = useChatStore()
  const tracker = new TpsTracker()

  // ── 上下文窗口（profile/provider/model 变化时重取，ChatInput 同键）──
  const contextLength = ref(FALLBACK_CONTEXT)
  let contextKeyLoaded = ''

  async function loadContextLength(): Promise<void> {
    const session = chatStore.activeSession
    const key = `${session?.profile || ''}|${session?.provider || ''}|${session?.model || ''}`
    if (key === contextKeyLoaded) return
    contextKeyLoaded = key
    try {
      contextLength.value = await fetchContextLength(
        session?.profile || undefined,
        session?.provider || undefined,
        session?.model || undefined,
      )
    } catch {
      contextLength.value = FALLBACK_CONTEXT
    }
  }

  watch(
    () => [
      chatStore.activeSessionId,
      chatStore.activeSession?.profile,
      chatStore.activeSession?.provider,
      chatStore.activeSession?.model,
    ],
    () => {
      void loadContextLength()
    },
    { immediate: true },
  )

  // ChatInput totalTokens 同款口径：contextTokens 优先，退化 in+out
  const contextUsed = computed(() => {
    const session = chatStore.activeSession
    const context = session?.contextTokens
    if (typeof context === 'number' && Number.isFinite(context) && context > 0) return context
    return (session?.inputTokens ?? 0) + (session?.outputTokens ?? 0)
  })
  const showContext = computed(() => Boolean(chatStore.activeSession))
  const contextPct = computed(() => contextPercent(contextUsed.value, contextLength.value))
  const contextLevel = computed<PressureLevel>(() => contextPressure(contextPct.value))
  const contextText = computed(() => contextReadout(contextUsed.value, contextLength.value))

  // ── TPS：run 生命周期 + 流式增量 + 结算 ──
  const tpsLive = ref<number | null>(null)
  const tpsLast = ref<number | null>(null)
  const tpsSpark = ref('')

  function feedStreamChars(): number {
    const session = chatStore.activeSession
    const messages = session?.messages
    if (!messages?.length) return 0
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !(last as { isStreaming?: boolean }).isStreaming) return 0
    const content = last.content
    return typeof content === 'string' ? content.length : 0
  }

  watch(
    () => chatStore.activeSessionId,
    () => {
      // 会话切换：TPS 历史归属单会话，整体重置（水位/缓存走各自刷新）
      tracker.startRun(0)
      tracker.endRun(0)
      tpsLive.value = null
      tpsLast.value = null
      tpsPeak.value = null
      tpsSpark.value = ''
      refreshCache()
    },
  )

  watch(
    () => chatStore.isRunActive,
    (active, prev) => {
      const now = Date.now()
      if (active && !prev) {
        tracker.startRun(now, chatStore.activeSession?.outputTokens)
        tpsLive.value = null
      } else if (!active && prev) {
        tracker.endRun(now)
        tpsLive.value = null
        tpsLast.value = tracker.getLastRunTps()
        bumpPeak(tpsLast.value)
        tpsSpark.value = sparkline(tracker.getSamples() as { tps: number; at: number }[])
        refreshCache()
      }
    },
  )

  watch(feedStreamChars, (chars, prev) => {
    if (chars > (prev ?? 0)) tracker.onStreamDelta(Date.now(), chars)
  })

  watch(
    () => chatStore.activeSession?.outputTokens,
    (output) => {
      if (typeof output === 'number' && chatStore.isRunActive) tracker.onUsageOutput(Date.now(), output)
    },
  )

  // 流式中 500ms 心跳驱动实时估计衰减（无新 delta 时数值随之过期为 null）
  let liveTimer: ReturnType<typeof setInterval> | null = null
  watch(
    () => chatStore.isRunActive,
    (active) => {
      if (active && !liveTimer) {
        liveTimer = setInterval(() => {
          tpsLive.value = tracker.liveTps(Date.now())
          bumpPeak(tpsLive.value)
        }, 500)
      } else if (!active && liveTimer) {
        clearInterval(liveTimer)
        liveTimer = null
        tpsLive.value = null
      }
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    if (liveTimer) clearInterval(liveTimer)
  })

  const tpsDisplay = computed(() => tpsLive.value ?? tpsLast.value)
  const tpsSpeed = computed<SpeedLevel>(() => speedLevel(tpsDisplay.value ?? 0))
  const running = computed(() => Boolean(chatStore.isRunActive))
  // 仪表条峰值缩放（dsh-TUI：scale = max(peak, floor 40)），会话内累计、切换重置
  const tpsPeak = ref<number | null>(null)
  function bumpPeak(value: number | null): void {
    if (value == null || !Number.isFinite(value) || value <= 0) return
    if (tpsPeak.value == null || value > tpsPeak.value) tpsPeak.value = value
  }

  // ── 缓存命中（SessionSummary，低频刷新）──
  const cacheDetail = ref<SessionCacheDetail | null>(null)
  let cacheFetching = false
  let cacheLastFetchAt = 0

  async function refreshCache(): Promise<void> {
    const sid = chatStore.activeSessionId
    if (!sid || cacheFetching) return
    const now = Date.now()
    if (now - cacheLastFetchAt < CACHE_REFRESH_MIN_INTERVAL_MS) return
    cacheFetching = true
    cacheLastFetchAt = now
    try {
      const list = await fetchSessions()
      const summary = list.find((item) => item.id === sid)
      cacheDetail.value = summary
        ? {
            inputTokens: Number(summary.input_tokens ?? 0),
            cacheReadTokens: Number(summary.cache_read_tokens ?? 0),
            cacheWriteTokens: Number(summary.cache_write_tokens ?? 0),
          }
        : null
    } catch {
      cacheDetail.value = null
    } finally {
      cacheFetching = false
    }
  }

  watch(
    () => chatStore.activeSessionId,
    () => {
      cacheDetail.value = null
    },
  )

  const cacheHit = computed(() =>
    cacheDetail.value
      ? cacheHitRate(cacheDetail.value.inputTokens, cacheDetail.value.cacheReadTokens, cacheDetail.value.cacheWriteTokens)
      : null,
  )

  return {
    // 上下文水位
    showContext,
    contextUsed,
    contextLength,
    contextPct,
    contextLevel,
    contextText,
    // TPS
    running,
    tpsLive,
    tpsLast,
    tpsDisplay,
    tpsSpeed,
    tpsPeak,
    tpsSpark,
    // 缓存
    cacheHit,
    cacheDetail,
    refreshCache,
  }
}

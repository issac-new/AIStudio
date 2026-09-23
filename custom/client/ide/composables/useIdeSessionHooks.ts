// overlay/custom/client/ide/composables/useIdeSessionHooks.ts
// IDE 会话级钩子合批（R2）：runaway-guard 失控检测 + 子代理结果反注入扫描
// + 会话恢复 recap（claude-code 2.1.108 语义）。由 IdeChatPane 挂载（会话域
// 而非状态栏域——状态栏不感知消息流）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { detectRunaway, type RunawaySignal, type RunawayMessage } from '../utils/runawayGuard'
import { scanInjection } from '../utils/subagentGuard'
import { showToast } from '../utils/toast'

const RECAP_MAX_MESSAGES = 12
const RECAP_MAX_ITEMS = 5
const RUNAWAY_TOAST_DURATION_MS = 12000

interface RecapState {
  sessionId: string
  items: string[]
  lastUserText: string
}

/** 从消息流提 recap 条目：最近一条用户输入 + 最近若干动作摘要（工具/助手行） */
export function buildRecap(
  sessionId: string,
  messages: Array<{ role: string; content?: string; toolName?: string | null; timestamp?: number }>,
): RecapState | null {
  if (!Array.isArray(messages) || messages.length < 2) return null
  const tail = messages.slice(-RECAP_MAX_MESSAGES)
  const lastUser = [...tail].reverse().find((m) => m.role === 'user')
  if (!lastUser || typeof lastUser.content !== 'string' || !lastUser.content.trim()) return null
  const items: string[] = []
  for (const m of tail.slice(-8)) {
    if (items.length >= RECAP_MAX_ITEMS) break
    if (m.role === 'tool' && m.toolName) {
      items.push(`tool:${m.toolName}`)
    } else if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      items.push(m.content.trim().slice(0, 60))
    }
  }
  return {
    sessionId,
    items,
    lastUserText: lastUser.content.trim().slice(0, 120),
  }
}

export function useIdeSessionHooks() {
  const chatStore = useChatStore()
  const { t } = useI18n()

  // ── recap：会话切换时对「有历史」的旧会话弹一次恢复摘要 ──
  const recap = ref<RecapState | null>(null)
  let recapShownFor = ''
  watch(
    () => [chatStore.activeSessionId, chatStore.activeSession?.messages?.length] as const,
    ([sid, len]) => {
      if (!sid || !len || recapShownFor === sid) return
      const session = chatStore.activeSession
      if (!session?.messages || session.messages.length < 4) return
      recapShownFor = sid
      const built = buildRecap(
        sid,
        session.messages as Array<{ role: string; content?: string; toolName?: string | null; timestamp?: number }>,
      )
      if (built) recap.value = built
    },
    { immediate: true },
  )
  function dismissRecap(): void {
    recap.value = null
  }

  // ── runaway-guard：运行中对消息流做六信号扫描，命中 toast 一次/轮 ──
  let runawayNotifiedRun = ''
  const runawaySignal = ref<RunawaySignal | null>(null)
  watch(
    () => [chatStore.isRunActive, chatStore.activeSession?.messages?.length, chatStore.activeSession?.updatedAt] as const,
    ([active]) => {
      if (!active) {
        runawayNotifiedRun = ''
        runawaySignal.value = null
        return
      }
      const sid = chatStore.activeSessionId ?? ''
      if (runawayNotifiedRun === sid) return
      const messages = (chatStore.activeSession?.messages ?? []) as unknown as RunawayMessage[]
      // runStartedAt 是 store 顶层的 Map<sessionId, ts>（chat.ts:1393），
      // 不在 Session 对象上——此前读 activeSession.runStartedAt 恒 undefined，
      // 导致 tool_storm 等按「单轮」口径的信号退化为整个会话口径误报
      const signal = detectRunaway(messages, {
        isRunning: true,
        nowMs: Date.now(),
        runStartedAtMs: chatStore.runStartedAt?.get(sid) ?? undefined,
      })
      runawaySignal.value = signal
      if (signal) {
        runawayNotifiedRun = sid
        showToast(
          t(`ide.runaway.${signal.kind}`, { detail: signal.detail }),
          'warning',
          RUNAWAY_TOAST_DURATION_MS,
        )
      }
    },
  )

  // ── 子代理结果反注入：终态子代理的 summary/末条文本扫描，命中标疑点 ──
  // 只扫终态（completed/failed/error/…）：running 中的半截流式文本可能瞬时
  // 命中注入指纹，造成「可疑指令」标注闪现后自行消失的噪音
  const flaggedSubagents = computed<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>()
    const sid = chatStore.activeSessionId
    if (!sid) return map
    for (const [key, stream] of chatStore.subagentStreams) {
      if (!key.startsWith(`${sid}:`)) continue
      if (stream.status === 'running' || stream.status === 'started') continue
      const texts: string[] = []
      if (stream.summary) texts.push(stream.summary)
      const lastText = [...stream.entries].reverse().find((e) => e.kind === 'text' && e.text)
      if (lastText?.text) texts.push(lastText.text)
      for (const text of texts) {
        const hits = scanInjection(text)
        if (hits.length > 0) {
          map.set(stream.subagentId, hits.map((h) => h.pattern))
          break
        }
      }
    }
    return map
  })

  return {
    recap,
    dismissRecap,
    runawaySignal,
    flaggedSubagents,
  }
}

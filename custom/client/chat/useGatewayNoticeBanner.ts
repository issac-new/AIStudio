import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

const STORAGE_KEY_PREFIX = 'gateway-notice-dismissed:'

export interface Message {
  id: string
  role: string
  content: string
  timestamp: number
  systemType?: 'command' | 'error' | 'fork-divider' | 'gateway'
  [key: string]: unknown
}

/**
 * 管理单个会话的网关告警横幅状态。
 *
 * @param sessionId - 当前会话/房间 ID（Ref）
 * @param messages  - 当前会话的消息列表（Ref 或 ComputedRef）
 * @returns showBanner（是否显示横幅）、noticeMessage（告警文本）、dismiss（关闭并持久化）
 */
export function useGatewayNoticeBanner(
  sessionId: Ref<string | null>,
  messages: Ref<readonly Message[]> | ComputedRef<readonly Message[]>,
) {
  const storageKey = (id: string) => STORAGE_KEY_PREFIX + id

  const dismissed = ref(false)

  // 监听 sessionId 变化，从 localStorage 读取是否已关闭
  watch(
    sessionId,
    (id) => {
      if (id) {
        dismissed.value = localStorage.getItem(storageKey(id)) === '1'
      } else {
        dismissed.value = false
      }
    },
    { immediate: true },
  )

  // 从消息列表中取第一条 systemType === 'gateway' 的消息
  const noticeMessage = computed<string | undefined>(() => {
    if (!sessionId.value) return undefined
    const msg = messages.value.find((m) => m.systemType === 'gateway')
    return msg?.content as string | undefined
  })

  // 有告警消息 且 未关闭
  const showBanner = computed(() => !!noticeMessage.value && !dismissed.value)

  // 关闭横幅并持久化
  function dismiss() {
    dismissed.value = true
    const id = sessionId.value
    if (id) {
      localStorage.setItem(storageKey(id), '1')
    }
  }

  return { showBanner, noticeMessage, dismiss }
}

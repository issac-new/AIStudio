// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useGatewayNoticeBanner } from '@/custom/chat/useGatewayNoticeBanner'

const STORAGE_KEY = (id: string) => `gateway-notice-dismissed:${id}`

// Minimal localStorage mock — jsdom may not always expose a writable localStorage
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
  get length() { return storage.size },
  key: (index: number) => [...storage.keys()][index] ?? null,
})

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  role: 'assistant',
  content: '⚠️ Gateway shutting down — Your current task will be interrupted.',
  timestamp: Date.now(),
  systemType: 'gateway',
  ...overrides,
})

describe('useGatewayNoticeBanner', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('showBanner=true 当有 gateway 消息且未关闭', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(true)
    expect(noticeMessage.value).toBe('⚠️ Gateway shutting down — Your current task will be interrupted.')
  })

  it('showBanner=false 当无 gateway 消息', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: Date.now() },
    ])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(noticeMessage.value).toBeUndefined()
  })

  it('showBanner=false 当 messages 为空数组', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(noticeMessage.value).toBeUndefined()
  })

  it('showBanner=false 当 sessionId 为 null', async () => {
    const sessionId = ref<string | null>(null)
    const messages = ref([makeMessage()])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(noticeMessage.value).toBeUndefined()
  })

  it('showBanner=false 当已 dismiss', async () => {
    localStorage.setItem(STORAGE_KEY('sess-1'), '1')
    const sessionId = ref('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
  })

  it('dismiss() 将 showBanner 置 false 并写 localStorage', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner, dismiss } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(true)

    dismiss()
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY('sess-1'))).toBe('1')
  })

  it('切换 sessionId 时重新读 localStorage', async () => {
    // sess-1 已关闭 → 不应显示
    localStorage.setItem(STORAGE_KEY('sess-1'), '1')
    const sessionId = ref<string | null>('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()
    expect(showBanner.value).toBe(false)

    // 切换到 sess-2（未关闭）→ 应显示
    sessionId.value = 'sess-2'
    await nextTick()
    expect(showBanner.value).toBe(true)

    // 切换到 sess-3（已关闭）→ 不应显示
    localStorage.setItem(STORAGE_KEY('sess-3'), '1')
    sessionId.value = 'sess-3'
    await nextTick()
    expect(showBanner.value).toBe(false)
  })

  it('dismiss() 在 sessionId 为 null 时不写 localStorage', async () => {
    const sessionId = ref<string | null>(null)
    const messages = ref([makeMessage()])

    const { dismiss } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    dismiss()
    await nextTick()

    // 不应写入任何 key
    expect(localStorage.length).toBe(0)
  })

  it('取多条 gateway 消息中的第一条', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([
      { id: 'm1', role: 'assistant', content: 'normal msg', timestamp: 1 },
      makeMessage({ id: 'm2', content: '⚠️ Gateway shutting down — first.' }),
      makeMessage({ id: 'm3', content: '⚠️ Gateway restarting — second.' }),
    ])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(true)
    expect(noticeMessage.value).toBe('⚠️ Gateway shutting down — first.')
  })
})

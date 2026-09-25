// C3 守门：jumpToEvent 对 loadOlderMessages() 返回 0 的语义区分（2026-09-25 修复）。
// 返回 0 有三种来源（matrix-room.ts loadOlderMessages）：①到头/翻页失败停试
// （hasMore=false）；②忙（isLoadingOlder，另有翻页在飞）；③未就绪（分页状态未建立，
// refreshMessages 尚未落 oldestToken）。修复前 ②③ 也被当"到头"break → 点搜索结果
// 跳远古历史静默无动作。修复后：只有 ① 放弃，②③ 短暂等待重试（限次）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { clientState } = vi.hoisted(() => ({ clientState: { client: null as unknown } }))
vi.mock('../stores/matrix-client', () => ({ useMatrixClientStore: () => clientState }))

import { useMatrixRoomStore } from '../stores/matrix-room'

const fakeRoom = { roomId: 'r1' }

/** 假 MatrixEvent：够过 isTimelineEvent / awaitDecryption / idOf 的最小面。 */
function makeEvent(id: string, ts = 1) {
  return {
    getId: () => id,
    getType: () => 'm.room.message',
    getTs: () => ts,
    isRedacted: () => false,
    isRelation: () => false,
    isEncrypted: () => false,
  }
}

/** 安装假 client：getRoom 固定 r1，createMessagesRequest 返回给定页。 */
function installClient(pages: Array<{ chunk: Array<{ id: string; ts?: number }>; end: string | null }>) {
  let call = 0
  clientState.client = {
    getRoom: (id: string) => (id === 'r1' ? fakeRoom : null),
    getEventMapper: () => (raw: { id: string; ts?: number }) => makeEvent(raw.id, raw.ts),
    createMessagesRequest: async () => pages[Math.min(call++, Math.max(pages.length - 1, 0))] ?? { chunk: [], end: null },
  }
}

describe('C3 jumpToEvent：loadOlderMessages 返回 0 不再一律当"到头"', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installClient([])
  })

  it('忙（isLoadingOlder）：等待重试而非 break，事件随后出现即高亮', async () => {
    const store = useMatrixRoomStore()
    store.activeRoomId = 'r1'
    store.messageList = []
    store.paginationState = { r1: { oldestToken: null, hasMore: true, isLoadingOlder: true } }
    setTimeout(() => { store.messageList.push(makeEvent('evt-target') as never) }, 30)
    await store.jumpToEvent('evt-target')
    expect(store.selectedEventId).toBe('evt-target')
  })

  it('未就绪（分页状态未建立）：等待重试，就绪后翻页命中', async () => {
    installClient([{ chunk: [{ id: 'evt-old', ts: 1 }], end: null }])
    const store = useMatrixRoomStore()
    store.activeRoomId = 'r1'
    store.messageList = []
    store.paginationState = {}
    setTimeout(() => {
      store.paginationState = { r1: { oldestToken: null, hasMore: true, isLoadingOlder: false } }
    }, 30)
    await store.jumpToEvent('evt-old')
    expect(store.selectedEventId).toBe('evt-old')
    expect(store.messageList.some((ev) => ev.getId() === 'evt-old')).toBe(true)
  })

  it('到头（hasMore=false）：立即放弃，不空转等待重试', async () => {
    const store = useMatrixRoomStore()
    store.activeRoomId = 'r1'
    store.messageList = []
    store.paginationState = { r1: { oldestToken: null, hasMore: false, isLoadingOlder: false } }
    const t0 = Date.now()
    await store.jumpToEvent('evt-missing')
    expect(store.selectedEventId).toBeNull()
    // 到头走 break（毫秒级返回）；误走等待重试会 ≥2s（20 次 × 100ms）
    expect(Date.now() - t0).toBeLessThan(200)
  })
})

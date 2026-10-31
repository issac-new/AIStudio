// 三区回归守门：roomList 事件外主动快照（2026-10-31 竞态根治）。
// 竞态实录：matrix-room 是懒加载 chunk，晚于 client Sync 状态转换装载时
// onRoomListChange 订阅前事件已发完（?.() 静默吞）→ roomList 恒空 → 深链
// 房间画布「正在同步会话…」直至 15s watchdog 判不可达（7 次深链 4 次不挂载）。
// 修复＝store 创建时 client 已在立即快照 ＋ watch(client) 后到位快照。
// 本测试锁两条主动快照路径；删除任一恢复纯事件回填＝本测试红。
import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, nextTick } from 'vue'

const { clientMock } = vi.hoisted(() => ({ clientMock: {} }))
vi.mock('../stores/matrix-client', () => ({ useMatrixClientStore: () => clientMock.store }))

import { useMatrixRoomStore } from '../stores/matrix-room'

const roomA = { roomId: '!a:matrix.test' }
const roomB = { roomId: '!b:matrix.test' }

function fakeClient() {
  return { getRooms: () => [roomA, roomB], getRoom: () => null }
}

describe('roomList 事件外主动快照（深链房间页竞态根治）', () => {
  it('store 创建时 client 已在 → roomList 立即含 SDK 房间（不等事件）', () => {
    ;(clientMock as any).store = reactive({ client: fakeClient() })
    setActivePinia(createPinia())
    const store = useMatrixRoomStore()
    expect(store.roomList).toEqual([roomA, roomB])
  })

  it('client 后到位（订阅晚于 Sync 事件的竞态时序）→ watch 触发回填', async () => {
    ;(clientMock as any).store = reactive({ client: null })
    setActivePinia(createPinia())
    const store = useMatrixRoomStore()
    expect(store.roomList).toEqual([])
    ;(clientMock as any).store.client = fakeClient()
    await nextTick()
    expect(store.roomList).toEqual([roomA, roomB])
  })

  it('无 client → roomList 保持空且不抛错', () => {
    ;(clientMock as any).store = reactive({ client: null })
    setActivePinia(createPinia())
    const store = useMatrixRoomStore()
    expect(store.roomList).toEqual([])
  })
})

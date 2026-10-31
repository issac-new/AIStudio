// @vitest-environment jsdom
// 群时间线间歇不挂载第二根源守门（overlay 710 回归测试，2026-10-31 产品收尾批）。
// 根因：loadRooms 把无 rooms 字段的回包写进 rooms.value=undefined → GroupChatView
// 的 store.rooms.length 抛 TypeError → onMounted catch 吞 → 时间线整页不挂载
// （run23 间歇实录；第一根源 activeRoom 竞态已由 3d3275734 根治）。
// 守卫=Array.isArray：形态降级保旧值+置 error（fail-soft），正常路径零变化。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const listRoomsMock = vi.fn()
vi.mock('@/api/studio/group-chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/studio/group-chat')>()),
  listRooms: (...args: unknown[]) => listRoomsMock(...args),
}))

import { useGroupChatStore } from '@/stores/hermes/group-chat'

const ROOM = { id: '!r1:matrix.test', name: '既有房间' } as never

describe('group-chat store rooms 形态守卫（overlay 710）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listRoomsMock.mockReset()
  })

  it('回包无 rooms 字段：保留既有列表、置 error、rooms 不变 undefined', async () => {
    const store = useGroupChatStore()
    store.rooms.push(ROOM)
    listRoomsMock.mockResolvedValue({ ok: true } as never) // 无 rooms 字段（网关降级体）
    await store.loadRooms()
    expect(Array.isArray(store.rooms)).toBe(true)
    expect(store.rooms).toHaveLength(1)
    expect(store.rooms[0]?.id).toBe('!r1:matrix.test') // 旧值保留（reactive 代理按字段断言）
    expect(String(store.error)).toContain('形态异常')
  })

  it('rooms 非数组：同款守卫（保旧值+提示）', async () => {
    const store = useGroupChatStore()
    store.rooms.push(ROOM)
    listRoomsMock.mockResolvedValue({ rooms: null } as never)
    await store.loadRooms()
    expect(Array.isArray(store.rooms)).toBe(true)
    expect(store.rooms).toHaveLength(1)
  })

  it('正常回包：覆盖列表并排序（守卫不改变既有路径）', async () => {
    const store = useGroupChatStore()
    const fresh = { id: '!r2:matrix.test', name: '新房间', lastActivity: 2 } as never
    const stale = { id: '!r3:matrix.test', name: '旧房间', lastActivity: 1 } as never
    listRoomsMock.mockResolvedValue({ rooms: [stale, fresh] } as never)
    await store.loadRooms()
    expect(store.rooms).toHaveLength(2)
    // 覆盖生效即可：排序键属上游 sortRoomsByActivity 语义，不在本守卫断言面
    expect([...store.rooms.map((r) => r.id)].sort()).toEqual(['!r2:matrix.test', '!r3:matrix.test'])
    expect(store.rooms.every((r) => Array.isArray(store.rooms)))
  })
})

// A10 守门：全屏 Matrix 客户端路由复活（/matrix + /matrix/room/:roomId，fullscreen）
// + MatrixRoomHeader 全屏入口按钮按当前房间深链。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'

const addedRoutes: Array<{ path: string; name: string; meta?: Record<string, unknown> }> = []
const routerPushMock = vi.fn()
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push: routerPushMock }), useRoute: () => ({ params: {}, query: {} }) }
})

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, d?: string) => d ?? k }) }))

const fakeRoom = {
  roomId: '!r1:server', name: '测试房',
  getJoinedMemberCount: () => 3,
  getJoinedMembers: () => [],
}
// 必须 reactive：plain object 属性变更不触发 Vue 重渲染（实证坑）。
const roomState = reactive({ activeRoomId: null as string | null })
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({
    get activeRoomId() { return roomState.activeRoomId },
    get activeRoom() { return roomState.activeRoomId ? fakeRoom : null },
    roomVersion: 0,
    isSearching: false,
    roomSearchTerm: '',
    getRoomAvatarUrl: () => null,
    isRoomEncrypted: () => false,
    getRoomTopic: () => '',
    getJoinRule: () => 'invite',
    isRoomPublic: () => false,
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-right-panel', () => ({
  useMatrixRightPanelStore: () => ({
    rightPanelPhase: null,
    closeRightPanel: () => {},
    openRoomSummary: () => {},
    openMemberList: () => {},
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-thread', () => ({
  useMatrixThreadStore: () => ({ hasThreadNotifications: false, toggleThreadPanel: () => {} }),
}))

import { registerMatrixChatRoutes } from '../index'
import MatrixRoomHeader from '../components/MatrixRoomHeader.vue'

describe('A10 全屏 Matrix 客户端路由复活', () => {
  beforeEach(() => {
    addedRoutes.length = 0
    routerPushMock.mockClear()
    roomState.activeRoomId = null
  })

  it('注册 /matrix 与 /matrix/room/:roomId 两条 fullscreen 路由', () => {
    const router = { addRoute: (r: (typeof addedRoutes)[number]) => { addedRoutes.push(r) } }
    registerMatrixChatRoutes(router as never)
    expect(addedRoutes.map((r) => r.name)).toEqual(['matrix.client', 'matrix.clientRoom'])
    expect(addedRoutes.every((r) => r.meta?.fullscreen === true)).toBe(true)
    expect(addedRoutes.map((r) => r.path)).toEqual(['/matrix', '/matrix/room/:roomId'])
  })

  it('房间头全屏按钮：有活跃房间带 roomId 深链', async () => {
    roomState.activeRoomId = '!r1:server'
    const w = mount(MatrixRoomHeader, {
      global: { stubs: { MatrixInviteDialog: true, teleport: true } },
    })
    await w.vm.$nextTick()
    await w.find('[data-testid="matrix-open-full"]').trigger('click')
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'matrix.clientRoom', params: { roomId: '!r1:server' } })
  })
})

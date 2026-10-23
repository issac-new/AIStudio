// @vitest-environment jsdom
// overlay/custom/client/matrix-chat/__tests__/room-settings-avatar.test.ts
// 更换头像真实现守门（2026-10-24 功能排查批）：原按钮无处理器（假按钮），
// 现走 uploadContent + m.room.avatar state 事件。IAB 无法驱动文件选择器，
// 端到端链路在此以 mock client 单测锁定；活体只验按钮可点与 input 存在。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const uploadContent = vi.fn()
const sendStateEvent = vi.fn()

vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { uploadContent, sendStateEvent, getRoomPushRule: () => undefined } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-right-panel', () => ({
  useMatrixRightPanelStore: () => ({ rightPanelBack: () => {}, closeRightPanel: () => {} }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({
    roomVersion: 1,
    activeRoom: { roomId: '!r1', name: 'room', getJoinedMemberCount: () => 2 },
    getRoomAvatarUrl: () => null,
    getRoomTopic: () => '',
    canEditTopic: () => true,
    isRoomEncrypted: () => false,
    bumpRoomVersion: vi.fn(),
    leaveRoom: vi.fn(),
  }),
}))

import MatrixRoomSettingsPanel from '../components/MatrixRoomSettingsPanel.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  uploadContent.mockReset()
  sendStateEvent.mockReset()
})

function mountPanel() {
  return mount(MatrixRoomSettingsPanel)
}

async function firePick(wr: ReturnType<typeof mountPanel>, mxc: string | { content_uri?: string }) {
  uploadContent.mockResolvedValueOnce(mxc)
  sendStateEvent.mockResolvedValueOnce({ event_id: '$e' })
  const input = wr.find('[data-testid="rs-avatar-input"]')
  Object.defineProperty(input.element, 'files', {
    value: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })],
  })
  await input.trigger('change')
}

describe('MatrixRoomSettingsPanel — 更换头像真实现', () => {
  it('按钮接线：可点（非空处理器）且挂隐藏 file input', () => {
    const wr = mountPanel()
    const btn = wr.find('.rs-avatar-change-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(wr.find('[data-testid="rs-avatar-input"]').exists()).toBe(true)
  })

  it('选图后：uploadContent → m.room.avatar state 事件（新版 string 返回）', async () => {
    const wr = mountPanel()
    await firePick(wr, 'mxc://srv/abc')
    expect(uploadContent).toHaveBeenCalledTimes(1)
    expect(sendStateEvent).toHaveBeenCalledWith('!r1', 'm.room.avatar', { url: 'mxc://srv/abc' }, '')
  })

  it('旧版 { content_uri } 返回形态兼容', async () => {
    const wr = mountPanel()
    await firePick(wr, { content_uri: 'mxc://srv/old' })
    expect(sendStateEvent).toHaveBeenCalledWith('!r1', 'm.room.avatar', { url: 'mxc://srv/old' }, '')
  })

  it('上传失败：显示错误（avatarUploadFailed 词条兜底），不隐瞒', async () => {
    const wr = mountPanel()
    uploadContent.mockRejectedValueOnce(new Error('boom'))
    const input = wr.find('[data-testid="rs-avatar-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    await vi.waitFor(() => {
      expect(wr.find('[data-testid="rs-avatar-error"]').text()).toContain('boom')
    })
    expect(sendStateEvent).not.toHaveBeenCalled()
  })
})

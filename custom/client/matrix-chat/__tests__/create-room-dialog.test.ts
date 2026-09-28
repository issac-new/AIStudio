// @vitest-environment jsdom
// overlay/custom/client/matrix-chat/__tests__/create-room-dialog.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { createRoom } = vi.hoisted(() => ({ createRoom: vi.fn(async () => ({})) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ createRoom }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import MatrixCreateRoomDialog from '../components/MatrixCreateRoomDialog.vue'

describe('MatrixCreateRoomDialog — initialName 预填（弱锚点建群）', () => {
  it('initialName prop 预填群名输入框', () => {
    setActivePinia(createPinia())
    const wrapper = mount(MatrixCreateRoomDialog, { props: { initialName: '[abcdef12] 需求评审' } })
    expect((wrapper.find('.dialog-input').element as HTMLInputElement).value).toBe('[abcdef12] 需求评审')
  })

  it('缺省空串（现状不变）；创建走 createRoom 并 close', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(MatrixCreateRoomDialog, { props: {} })
    const input = wrapper.find('.dialog-input')
    expect((input.element as HTMLInputElement).value).toBe('')
    await input.setValue('[abcdef12] x')
    await wrapper.find('.dialog-btn.primary').trigger('click')
    expect(createRoom).toHaveBeenCalledWith({ name: '[abcdef12] x', isPublic: false })
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

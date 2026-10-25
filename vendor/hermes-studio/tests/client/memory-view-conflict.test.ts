// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const fetchMemoryMock = vi.hoisted(() => vi.fn())
const saveMemoryMock = vi.hoisted(() => vi.fn())
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/hermes/skills', () => ({
  fetchMemory: fetchMemoryMock,
  saveMemory: saveMemoryMock,
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => ({ activeProfileName: 'p', profiles: [{}], fetchProfiles: vi.fn() }),
}))

vi.mock('@/components/hermes/chat/MarkdownRenderer.vue', () => ({
  default: defineComponent({ props: { content: String }, template: '<div class="md-stub" />' }),
}))

vi.mock('naive-ui', () => ({
  NButton: defineComponent({
    props: { disabled: Boolean, loading: Boolean, size: String, quaternary: Boolean, type: String },
    emits: ['click'],
    template: '<button class="n-button-stub" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  }),
  useMessage: () => messageMock,
}))

const freshData = (content: string, mtime: number) => ({
  memory: content,
  user: '',
  soul: '',
  memory_mtime: mtime,
  user_mtime: null,
  soul_mtime: null,
})

async function mountEditing() {
  const MemoryView = (await import('@/views/hermes/MemoryView.vue')).default
  const wrapper = mount(MemoryView)
  await flushPromises()
  // 进入 memory 段编辑：编辑区 = 服务端首载内容
  const editBtn = wrapper.findAll('button.n-button-stub').find(b => b.text() === 'common.edit')!
  await editBtn.trigger('click')
  await nextTick()
  return wrapper
}

describe('MemoryView 冲突重试不得携带陈旧编辑', () => {
  beforeEach(() => {
    fetchMemoryMock.mockReset()
    saveMemoryMock.mockReset()
    messageMock.error.mockClear()
  })

  it('409 后编辑区载入服务端最新内容，重试保存携带新内容与新 mtime', async () => {
    fetchMemoryMock
      .mockResolvedValueOnce(freshData('旧版本内容', 1000))
      .mockResolvedValueOnce(freshData('对方改后的内容', 2000))
    // 与真实 request() 一致：非 2xx 抛出带 status 的 Error
    saveMemoryMock.mockRejectedValueOnce(
      Object.assign(new Error('API Error 409: mtime conflict: file changed since load'), { status: 409 }),
    )
    const wrapper = await mountEditing()
    const ta = wrapper.find('textarea.edit-textarea')
    expect(ta.element.value).toBe('旧版本内容')
    await ta.setValue('我的编辑（旧文）')
    // 首次保存 → 409 冲突
    const buttons = () => wrapper.findAll('button.n-button-stub')
    await buttons().find(b => b.text() === 'common.save')!.trigger('click')
    await flushPromises()
    expect(messageMock.error).toHaveBeenCalled()
    // 关键断言：编辑区旧文被服务端最新内容替换（撤修复即红：此处仍是"我的编辑（旧文）"）
    expect(wrapper.find('textarea.edit-textarea').element.value).toBe('对方改后的内容')
    // 重试保存：不得携带陈旧编辑；expectedMtime 取刷新后的 2000
    saveMemoryMock.mockResolvedValueOnce(undefined)
    await buttons().find(b => b.text() === 'common.save')!.trigger('click')
    await flushPromises()
    expect(saveMemoryMock).toHaveBeenLastCalledWith('memory', '对方改后的内容', 2000)
  })
})

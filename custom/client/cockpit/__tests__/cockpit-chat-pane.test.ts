// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitChatPane from '@/custom/cockpit/components/CockpitChatPane.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitChatPane', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '你'] }]
    s.messages = {
      c1: [
        { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'hello', ts: 1 },
        { id: 'm2', channelId: 'c1', author: '你', isMe: true, text: 'hi', ts: 2 },
      ],
    }
    s.selectChannel('c1')
    return s
  }

  it('renders channel header with label and members', () => {
    seed()
    const w = mount(CockpitChatPane)
    expect(w.text()).toContain('auth-svc 联调')
    expect(w.text()).toContain('张三')
  })

  it('renders messages with author names', () => {
    seed()
    const w = mount(CockpitChatPane)
    expect(w.text()).toContain('hello')
    expect(w.text()).toContain('hi')
  })

  it('my message has is-me class', () => {
    seed()
    const w = mount(CockpitChatPane)
    expect(w.find('[data-message-id="m2"]').classes()).toContain('is-me')
  })

  it('typing and sending appends a message', async () => {
    const s = seed()
    const w = mount(CockpitChatPane)
    const input = w.find('.cockpit-chat-pane__input')
    await input.setValue('new message')
    await w.find('[data-action="send"]').trigger('click')
    expect(s.messagesForActiveChannel.at(-1)?.text).toBe('new message')
  })

  it('shows empty state when no active channel', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitChatPane)
    expect(w.find('.cockpit-chat-pane__empty').exists()).toBe(true)
  })
})

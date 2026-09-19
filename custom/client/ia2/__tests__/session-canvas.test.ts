// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/session-canvas.test.ts
// v12 对话画布守门（2026-09-19 统一视图 Task 6）：链路条（对象→挂接任务→门）
// + 参与方条（👤∪🤖+值守）+ 画布分派（room→MatrixRoomCanvas / chat→ChatView）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/custom/matrix-chat/components/MatrixRoomCanvas.vue', () => ({
  default: { name: 'MatrixRoomCanvas', template: '<div class="room-canvas-stub" data-testid="room-canvas-stub" />' },
}))
vi.mock('@/views/hermes/ChatView.vue', () => ({
  default: { name: 'ChatView', template: '<div class="chat-view-stub" data-testid="chat-view-stub" />' },
}))

import SessionCanvas from '../components/flow/SessionCanvas.vue'
import ChainBar from '../components/flow/ChainBar.vue'
import ParticipantsBar from '../components/flow/ParticipantsBar.vue'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const TASK = (id: string, title: string, status = 'review'): CockpitTask =>
  ({ id, title, priority: 'P1', status, assignee: 'worker-coder', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 0 })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ChainBar — 对象↔任务↔门面包屑', () => {
  it('对象节点 + 挂接任务 chip（可点）+ 门节点 + 时间线/⌨ 动作', async () => {
    const w = mount(ChainBar, {
      props: { objectName: '应急指挥中心', linkedTasks: [TASK('t-402abcd1234', 'v2.28 发布')], gateTitle: '等你验收' },
    })
    expect(w.find('[data-testid="chain-object"]').text()).toContain('应急指挥中心')
    const task = w.find('[data-testid="chain-task"]')
    expect(task.text()).toContain('v2.28 发布')
    await task.trigger('click')
    expect(w.emitted('open-task')![0][0]).toBe('t-402abcd1234')
    expect(w.find('[data-testid="chain-gate"]').text()).toContain('等你验收')
    await w.find('[data-testid="chain-timeline"]').trigger('click')
    expect(w.emitted('open-timeline')).toHaveLength(1)
    await w.find('[data-testid="chain-ide"]').trigger('click')
    expect(w.emitted('open-ide')![0][0]).toBe('t-402abcd1234')
  })
  it('无挂接任务/无门时不渲染对应节点', () => {
    const w = mount(ChainBar, { props: { objectName: 'x', linkedTasks: [], gateTitle: null } })
    expect(w.find('[data-testid="chain-task"]').exists()).toBe(false)
    expect(w.find('[data-testid="chain-gate"]').exists()).toBe(false)
    expect(w.find('[data-testid="chain-ide"]').exists()).toBe(false)
  })
})

describe('ParticipantsBar — 参与方徽章 ∪ 邀请 ∪ 值守', () => {
  it('human/agent 徽章 + 团队后缀 + 值守 chip + 邀请（canInvite）', async () => {
    const w = mount(ParticipantsBar, {
      props: {
        participants: [
          { kind: 'human', name: '你', team: 'swarm' },
          { kind: 'agent', name: 'worker-coder', team: '[已移除]' },
        ],
        dutyName: 'TL',
        canInvite: true,
      },
    })
    expect(w.find('[data-testid="participant-human-你"]').text()).toContain('swarm')
    expect(w.find('[data-testid="participant-agent-worker-coder"]').text()).toContain('🤖')
    expect(w.find('[data-testid="participants-invite"]').exists()).toBe(true)
    await w.find('[data-testid="participants-invite"]').trigger('click')
    expect(w.emitted('invite')).toHaveLength(1)
  })
  it('canInvite=false 时无邀请钮；超 10 人折叠 +N', () => {
    const w = mount(ParticipantsBar, {
      props: { participants: Array.from({ length: 12 }, (_, i) => ({ kind: 'human' as const, name: `m${i}` })), canInvite: false },
    })
    expect(w.find('[data-testid="participants-invite"]').exists()).toBe(false)
    expect(w.text()).toContain('+2')
  })
})

describe('SessionCanvas — 画布分派', () => {
  const base = {
    objectName: '应急指挥中心',
    linkedTasks: [TASK('t-1', '任务一')],
    participants: [{ kind: 'human' as const, name: 'TL' }],
  }
  it('room → MatrixRoomCanvas；chat → ChatView', () => {
    const room = mount(SessionCanvas, { props: { ...base, kind: 'room' } })
    expect(room.find('[data-testid="session-canvas-room"]').exists()).toBe(true)
    expect(room.find('[data-testid="room-canvas-stub"]').exists()).toBe(true)
    const chat = mount(SessionCanvas, { props: { ...base, kind: 'chat', participants: [{ kind: 'agent', name: 'coder' }] } })
    expect(chat.find('[data-testid="session-canvas-chat"]').exists()).toBe(true)
    expect(chat.find('[data-testid="chat-view-stub"]').exists()).toBe(true)
  })
  it('链路条/参与方条在位，open-task 透传', async () => {
    const w = mount(SessionCanvas, { props: { ...base, kind: 'room' } })
    expect(w.find('[data-testid="chain-bar"]').exists()).toBe(true)
    expect(w.find('[data-testid="participants-bar"]').exists()).toBe(true)
    await w.find('[data-testid="chain-task"]').trigger('click')
    expect(w.emitted('open-task')![0][0]).toBe('t-1')
  })
})

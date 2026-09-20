// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/session-canvas.test.ts
// v12 对话画布守门（2026-09-19 统一视图 Task 6）。
// v12.3 R4b（2026-09-20）：会话工作台面板四块（对象/任务簇/参与方/动作——
// 自 ChainBar+ParticipantsBar 收编，ParticipantsBar 退役）+ 画布三聊天合一
// 分派（room→MatrixRoomCanvas / group→GroupChatView / chat→ChatView）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/custom/matrix-chat/components/MatrixRoomCanvas.vue', () => ({
  default: { name: 'MatrixRoomCanvas', template: '<div class="room-canvas-stub" data-testid="room-canvas-stub" />' },
}))
vi.mock('@/views/hermes/GroupChatView.vue', () => ({
  default: { name: 'GroupChatView', template: '<div class="group-view-stub" data-testid="group-view-stub" />' },
}))
vi.mock('@/views/hermes/ChatView.vue', () => ({
  default: { name: 'ChatView', template: '<div class="chat-view-stub" data-testid="chat-view-stub" />' },
}))

import SessionCanvas from '../components/flow/SessionCanvas.vue'
import SessionWorkbenchPanel from '../components/flow/SessionWorkbenchPanel.vue'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const TASK = (id: string, title: string, status = 'review'): CockpitTask =>
  ({ id, title, priority: 'P1', status, assignee: 'worker-coder', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 0 })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('SessionWorkbenchPanel — 会话工作台四块（R4b）', () => {
  it('①对象（名+值守）②任务簇（全量 chip，点击→看板/双击→IDE）+门 ④动作（时间线/⌨）', async () => {
    const w = mount(SessionWorkbenchPanel, {
      props: {
        objectName: '应急指挥中心',
        dutyName: 'TL',
        linkedTasks: [TASK('t-402abcd1234', 'v2.28 发布'), TASK('t-415abcd1234', 'release notes')],
        gateTitle: '等你验收',
        participants: [{ kind: 'human', name: '你' }],
      },
    })
    expect(w.find('[data-testid="chain-object"]').text()).toContain('应急指挥中心')
    expect(w.find('[data-testid="swp-duty"]').text()).toContain('TL')
    // 任务簇全量：首任务保持 chain-task testid，第二任务独立 testid
    const task = w.find('[data-testid="chain-task"]')
    expect(task.text()).toContain('v2.28 发布')
    expect(w.find('[data-testid="chain-task-t-415abcd1234"]').text()).toContain('release notes')
    await task.trigger('click')
    expect(w.emitted('open-task')![0][0]).toBe('t-402abcd1234')
    await task.trigger('dblclick')
    expect(w.emitted('open-ide')![0][0]).toBe('t-402abcd1234')
    expect(w.find('[data-testid="chain-gate"]').text()).toContain('等你验收')
    await w.find('[data-testid="chain-timeline"]').trigger('click')
    expect(w.emitted('open-timeline')).toHaveLength(1)
    await w.find('[data-testid="chain-ide"]').trigger('click')
    expect(w.emitted('open-ide')![1][0]).toBe('t-402abcd1234')
    w.unmount()
  })

  it('③参与方块：human/agent 徽章 + 团队后缀 + 邀请（canInvite）；超 10 人折叠 +N', async () => {
    const w = mount(SessionWorkbenchPanel, {
      props: {
        objectName: 'x', linkedTasks: [],
        participants: [
          { kind: 'human', name: '你', team: 'swarm' },
          { kind: 'agent', name: 'worker-coder', team: '[已移除]' },
        ],
        canInvite: true,
      },
    })
    expect(w.find('[data-testid="participant-human-你"]').text()).toContain('swarm')
    expect(w.find('[data-testid="participant-agent-worker-coder"]').text()).toContain('🤖')
    await w.find('[data-testid="participants-invite"]').trigger('click')
    expect(w.emitted('invite')).toHaveLength(1)
    w.unmount()
    const w2 = mount(SessionWorkbenchPanel, {
      props: {
        objectName: 'x', linkedTasks: [], canInvite: false,
        participants: Array.from({ length: 12 }, (_, i) => ({ kind: 'human' as const, name: `m${i}` })),
      },
    })
    expect(w2.find('[data-testid="participants-invite"]').exists()).toBe(false)
    expect(w2.text()).toContain('+2')
    w2.unmount()
  })

  it('无挂接任务/无门时不渲染对应节点（空任务簇给占位文案）', () => {
    const w = mount(SessionWorkbenchPanel, { props: { objectName: 'x', linkedTasks: [], gateTitle: null, participants: [] } })
    expect(w.find('[data-testid="chain-task"]').exists()).toBe(false)
    expect(w.find('[data-testid="chain-gate"]').exists()).toBe(false)
    expect(w.find('[data-testid="chain-ide"]').exists()).toBe(false)
    expect(w.text()).toContain('ia2.swp.noTasks')
  })
})

describe('SessionCanvas — 画布三聊天合一分派（R4b）', () => {
  const base = {
    objectName: '应急指挥中心',
    linkedTasks: [TASK('t-1', '任务一')],
    participants: [{ kind: 'human' as const, name: 'TL' }],
  }
  it('room → MatrixRoomCanvas；group → GroupChatView；chat → ChatView', () => {
    const room = mount(SessionCanvas, { props: { ...base, kind: 'room' } })
    expect(room.find('[data-testid="session-canvas-room"]').exists()).toBe(true)
    expect(room.find('[data-testid="room-canvas-stub"]').exists()).toBe(true)
    const group = mount(SessionCanvas, { props: { ...base, kind: 'group' } })
    expect(group.find('[data-testid="session-canvas-group"]').exists()).toBe(true)
    expect(group.find('[data-testid="group-view-stub"]').exists()).toBe(true)
    const chat = mount(SessionCanvas, { props: { ...base, kind: 'chat', participants: [{ kind: 'agent', name: 'coder' }] } })
    expect(chat.find('[data-testid="session-canvas-chat"]').exists()).toBe(true)
    expect(chat.find('[data-testid="chat-view-stub"]').exists()).toBe(true)
  })
  it('会话工作台面板在位（四块），open-task 透传', async () => {
    const w = mount(SessionCanvas, { props: { ...base, kind: 'room' } })
    expect(w.find('[data-testid="session-workbench-panel"]').exists()).toBe(true)
    await w.find('[data-testid="chain-task"]').trigger('click')
    expect(w.emitted('open-task')![0][0]).toBe('t-1')
  })
})

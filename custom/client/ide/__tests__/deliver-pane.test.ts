// G4 交付物面板挂载守门：四区渲染、评审本地标记 + 退回消息回流、选段导出入口。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))

const sendMessage = vi.fn(async () => {})
const session = {
  id: 's1',
  messages: [
    { id: 'm1', role: 'user', content: '做一个报告', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: '好的', timestamp: 2,
      taskPlan: { session_id: 's1', run_id: 'r', plan_id: 'p', revision: 1, execution_state: 'running', created_at: 1, updated_at: 2,
        plan: [{ id: '1', step: '写报告', status: 'completed' }, { id: '2', step: '跑测试', status: 'pending' }] } },
    { id: 'm3', role: 'tool', toolName: 'bash', toolArgs: { command: 'vitest run' }, toolStatus: 'done', timestamp: 3 },
  ],
}
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ activeSessionId: 's1', activeSession: session, sendMessage }),
}))
const setSidePaneTab = vi.fn()
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ setSidePaneTab }) }))
vi.mock('../composables/useIdeWorkspace', () => ({ useIdeWorkspace: () => ({ root: { value: '/w' } }) }))
const { changes } = vi.hoisted(() => ({ changes: vi.fn() }))
const changesFixture = ([{
  run_id: 'run-1', change_id: 'c1', session_id: 's1', source: 'run', workspace: '/w', workspace_kind: 'git',
  started_at: 1, finished_at: 2, files_changed: 2, additions: 9, deletions: 1, truncated: false, total_patch_bytes: 10, created_at: 2,
  files: [
    { id: 1, change_id: 'c1', session_id: 's1', path: '/w/report.md', old_path: null, change_type: 'added', additions: 8, deletions: 0, size_before: null, size_after: 8, patch_bytes: 8, truncated: false, binary: false, created_at: 2 },
    { id: 2, change_id: 'c1', session_id: 's1', path: '/w/a.ts', old_path: null, change_type: 'modified', additions: 1, deletions: 1, size_before: 1, size_after: 1, patch_bytes: 2, truncated: false, binary: false, created_at: 2 },
  ],
}])
vi.mock('../api/runs', async () => {
  const actual = await vi.importActual<typeof import('../api/runs')>('../api/runs')
  return { ...actual, ideRunsApi: { changes } }
})

import IdeDeliverPane from '../views/IdeDeliverPane.vue'

describe('IdeDeliverPane', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    vi.clearAllMocks()
    changes.mockResolvedValue(changesFixture)
  })

  it('四区渲染：计划进度/变更/验证/产物', async () => {
    const w = mount(IdeDeliverPane)
    await flushPromises()
    expect(w.find('[data-testid="ide-deliver-plan"]').text()).toContain('1/2')
    expect(w.find('[data-testid="ide-deliver-plan"]').text()).toContain('跑测试')
    expect(w.find('[data-testid="ide-deliver-changes"]').text()).toContain('run-1')
    expect(w.find('[data-testid="ide-deliver-verify"]').text()).toContain('vitest run')
    expect(w.find('[data-testid="ide-deliver-artifacts"]').text()).toContain('/w/report.md')
    expect(w.find('[data-testid="ide-deliver-artifacts"]').text()).not.toContain('/w/a.ts')
  })

  it('通过=本地标记（sessionStorage），不是服务端评审', async () => {
    const w = mount(IdeDeliverPane)
    await flushPromises()
    await w.find('[data-testid="ide-deliver-approve"]').trigger('click')
    expect(sessionStorage.getItem('ide-deliver-review:s1')).toBe('approved')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(w.text()).toContain('已通过（本地标记）')
  })

  it('退回：意见作为真实消息发到会话', async () => {
    const w = mount(IdeDeliverPane)
    await flushPromises()
    await w.find('[data-testid="ide-deliver-reject"]').trigger('click')
    await w.find('[data-testid="ide-deliver-reject-note"]').setValue('验证不充分')
    await w.find('[data-testid="ide-deliver-reject-send"]').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith('[交付退回]\n验证不充分')
    expect(sessionStorage.getItem('ide-deliver-review:s1')).toBe('rejected')
  })

  it('发送摘要：真实消息包含计划/变更/验证', async () => {
    const w = mount(IdeDeliverPane)
    await flushPromises()
    await w.find('[data-testid="ide-deliver-send"]').trigger('click')
    const msg = String(sendMessage.mock.calls[0]?.[0] ?? '')
    expect(msg).toContain('[交付摘要]')
    expect(msg).toContain('计划（1/2')
    expect(msg).toContain('vitest run')
  })

  it('打开审查切页签；选段导出按钮存在', async () => {
    const w = mount(IdeDeliverPane)
    await flushPromises()
    await w.find('[data-testid="ide-deliver-open-review"]').trigger('click')
    expect(setSidePaneTab).toHaveBeenCalledWith('review')
    expect(w.find('[data-testid="ide-deliver-export-md"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-deliver-export-json"]').exists()).toBe(true)
  })
})

// R1 恢复对话框守门（行列表/四档/选点/请求体/关闭）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const state = { activeSessionId: 's1' as string | null }
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => state,
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ workspace: '/w' }) }))
vi.mock('../utils/zcode-fork', () => ({
  fetchEngineRows: vi.fn(async () => [
    { rowId: 1, kind: 'userInput', text: '第一问' },
    { rowId: 2, entityId: 'e2', kind: 'assistantText', state: 'complete', text: '第一答' },
    { rowId: 3, kind: 'userInput', text: '第二问' },
  ]),
  findForkAnchor: () => null,
  forkAtAnchor: vi.fn(),
}))

import IdeRecoveryDialog from '../components/IdeRecoveryDialog.vue'

describe('IdeRecoveryDialog（R1 四恢复选项）', () => {
  beforeEach(() => {
    fetchMock.mockClear()
  })

  it('行列表倒序+四档按钮+选点后发正确请求体', async () => {
    global.fetch = fetchMock
    const w = mount(IdeRecoveryDialog, { props: { open: true } })
    await flushPromises()
    const rows = w.findAll('[data-testid^="ide-recovery-row-"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('第二问') // 倒序最新在上
    // 默认选第一项（最新）
    for (const key of ['code-and-conversation', 'code-only', 'conversation-only', 'summarize-from-here']) {
      expect(w.find(`[data-testid="ide-recovery-mode-${key}"]`).exists()).toBe(true)
    }
    // 选第三行（rowId=1）后点仅对话
    await w.find('[data-testid="ide-recovery-row-1"]').trigger('click')
    await w.find('[data-testid="ide-recovery-mode-conversation-only"]').trigger('click')
    await flushPromises()
    const call = fetchCalls().find((c) => String(c[0]).includes('checkpoint/recover'))
    expect(call).toBeTruthy()
    const body = JSON.parse(String(call![1].body))
    expect(body).toMatchObject({ mode: 'conversation-only', workspacePath: '/w', sessionId: 's1', rowId: 1 })
  })
})

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
const fetchCalls = (): Array<[string, { body: string }]> => fetchMock.mock.calls as never

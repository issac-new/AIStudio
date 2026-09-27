// 工具时间线面板守门（T 批：七类专属归类+摘要语义+倒序）。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const chatState: Record<string, unknown> = { activeSession: null, messages: [] }
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

import IdeToolsPane from '../views/IdeToolsPane.vue'

describe('IdeToolsPane（工具专属卡）', () => {
  it('七类归类+专属摘要（edit±/search 命中/bash 首行）+倒序', () => {
    chatState.activeSession = { messages: [
      { id: 't1', role: 'tool', toolName: 'edit_file', content: 'line\n+new\n-old\n+more' },
      { id: 't2', role: 'tool', toolName: 'bash', content: 'npm test\nok 12 passed' },
      { id: 't3', role: 'tool', toolName: 'grep_search', content: 'hit1\nhit2\nhit3' },
      { id: 't4', role: 'tool', toolName: 'mcp__exa__search', content: 'result' },
      { id: 't5', role: 'tool', toolName: 'web_fetch', content: 'https://example.com page' },
      { id: 't6', role: 'tool', toolName: 'read_file', content: 'src/main.ts line1' },
      { id: 't7', role: 'tool', toolName: 'list_dir', content: 'a.ts\nb.ts' },
    ] }
    const w = mount(IdeToolsPane)
    expect(w.find('[data-testid="ide-tool-t1"]').classes()).toContain('is-edit')
    expect(w.find('[data-testid="ide-tool-t1"]').text()).toContain('+2 −1')
    expect(w.find('[data-testid="ide-tool-t2"]').classes()).toContain('is-bash')
    expect(w.find('[data-testid="ide-tool-t2"]').text()).toContain('npm test')
    expect(w.find('[data-testid="ide-tool-t3"]').text()).toContain('3 行命中')
    expect(w.find('[data-testid="ide-tool-t4"]').classes()).toContain('is-mcp')
    expect(w.find('[data-testid="ide-tool-t5"]').classes()).toContain('is-web')
    expect(w.find('[data-testid="ide-tool-t6"]').classes()).toContain('is-read')
    expect(w.find('[data-testid="ide-tool-t7"]').classes()).toContain('is-glob')
    // 倒序：t7 在最上
    const ids = w.findAll('[data-testid^="ide-tool-t"]').map((x) => x.attributes('data-testid'))
    expect(ids[0]).toBe('ide-tool-t7')
    chatState.activeSession = null
  })
})

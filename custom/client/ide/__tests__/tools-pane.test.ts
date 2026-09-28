// 工具时间线面板守门（T 批：七类专属归类+摘要语义+倒序）。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fb?: string | Record<string, unknown>) => { if (typeof fb === 'string' && fb) return fb; if (fb && typeof fb === 'object') return Object.values(fb).map(String).join(' '); return k } }) }))
const chatState: Record<string, unknown> = { activeSession: null, messages: [] }
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

import IdeToolsPane from '../views/IdeToolsPane.vue'

describe('IdeToolsPane（工具专属卡）', () => {
  it('T2 十类细分归类+专属摘要（todo 进度/workflow/delegate/cua 动作数/git/present/cron/artifact/skill/plan）', () => {
    chatState.activeSession = { messages: [
      { id: 'u1', role: 'tool', toolName: 'todo_write', content: 'pending 实现\nin_progress 测试\ncompleted 文档' },
      { id: 'u2', role: 'tool', toolName: 'create_workflow', content: 'wf-build 启动' },
      { id: 'u3', role: 'tool', toolName: 'task_delegate', content: '目标：修登录 bug' },
      { id: 'u4', role: 'tool', toolName: 'cua_click', content: 'click\ntype\nscroll' },
      { id: 'u5', role: 'tool', toolName: 'git_commit', content: 'feat: 修登录' },
      { id: 'u6', role: 'tool', toolName: 'present_result', content: '交付：报告.md' },
      { id: 'u7', role: 'tool', toolName: 'cron_create', content: '每天 9 点' },
      { id: 'u8', role: 'tool', toolName: 'take_screenshot', content: 'shot-1.png' },
      { id: 'u9', role: 'tool', toolName: 'invoke_skill', content: 'quality-gate' },
      { id: 'u10', role: 'tool', toolName: 'plan_guidance', content: '分三步走' },
    ] }
    const w = mount(IdeToolsPane)
    expect(w.find('[data-testid="ide-tool-u1"] .ide-tools__row').classes()).toContain('is-todo')
    expect(w.find('[data-testid="ide-tool-u1"]').text()).toContain('2/3 项')
    expect(w.find('[data-testid="ide-tool-u2"] .ide-tools__row').classes()).toContain('is-workflow')
    expect(w.find('[data-testid="ide-tool-u3"] .ide-tools__row').classes()).toContain('is-delegate')
    expect(w.find('[data-testid="ide-tool-u4"]').text()).toContain('3 动作')
    expect(w.find('[data-testid="ide-tool-u5"] .ide-tools__row').classes()).toContain('is-git')
    expect(w.find('[data-testid="ide-tool-u6"] .ide-tools__row').classes()).toContain('is-present')
    expect(w.find('[data-testid="ide-tool-u7"] .ide-tools__row').classes()).toContain('is-cron')
    expect(w.find('[data-testid="ide-tool-u8"] .ide-tools__row').classes()).toContain('is-artifact')
    expect(w.find('[data-testid="ide-tool-u9"] .ide-tools__row').classes()).toContain('is-skill')
    expect(w.find('[data-testid="ide-tool-u10"] .ide-tools__row').classes()).toContain('is-plan')
    chatState.activeSession = null
  })

  it('edit 卡点击展开 diff 预览（着色行）', async () => {
    chatState.activeSession = { messages: [
      { id: 'e1', role: 'tool', toolName: 'edit_file', content: 'ctx\n+added line\n-removed line' },
    ] }
    const w = mount(IdeToolsPane)
    expect(w.find('[data-testid="ide-tools-diff-preview"]').exists()).toBe(false)
    await w.find('.ide-tools__row').trigger('click')
    expect(w.find('[data-testid="ide-tools-diff-preview"]').exists()).toBe(true)
    const lines = w.findAll('.ide-tools__dline')
    expect(lines[1].classes()).toContain('is-add')
    expect(lines[2].classes()).toContain('is-del')
    chatState.activeSession = null
  })

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
    expect(w.find('[data-testid="ide-tool-t1"] .ide-tools__row').classes()).toContain('is-edit')
    expect(w.find('[data-testid="ide-tool-t1"]').text()).toContain('+2 −1')
    expect(w.find('[data-testid="ide-tool-t2"] .ide-tools__row').classes()).toContain('is-bash')
    expect(w.find('[data-testid="ide-tool-t2"]').text()).toContain('npm test')
    expect(w.find('[data-testid="ide-tool-t3"]').text()).toContain('3 行命中')
    expect(w.find('[data-testid="ide-tool-t4"] .ide-tools__row').classes()).toContain('is-mcp')
    expect(w.find('[data-testid="ide-tool-t5"] .ide-tools__row').classes()).toContain('is-web')
    expect(w.find('[data-testid="ide-tool-t6"] .ide-tools__row').classes()).toContain('is-read')
    expect(w.find('[data-testid="ide-tool-t7"] .ide-tools__row').classes()).toContain('is-glob')
    // 倒序：t7 在最上
    const ids = w.findAll('[data-testid^="ide-tool-t"]').map((x) => x.attributes('data-testid'))
    expect(ids[0]).toBe('ide-tool-t7')
    chatState.activeSession = null
  })
})

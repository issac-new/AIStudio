// overlay/custom/client/ide/__tests__/memory-pane-isdir.test.ts
// @vitest-environment jsdom
// 守门：IdeMemoryPane 记忆文件发现必须按 FileEntry 真实契约（isDir）判形。
// 背景（2026-09-28 产品实操演示轮实测）：旧代码判 e.type==='file'/'directory'，
// 而 api/studio/workspace-files.ts 的 FileEntry 无 type 字段（只有 isDir）——
// 判断恒 false，记忆面板对真实后端永远显示"无记忆文件"。本测试用真实形状的
// listFiles 桩防复发（测试绿≠产品可用：桩必须长成真后端的样子）。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const listFilesMock = vi.fn()

vi.mock('@/api/studio/files', () => ({
  listFiles: (...args: unknown[]) => listFilesMock(...args),
  readFile: vi.fn(),
}))
vi.mock('naive-ui', () => ({ useMessage: () => ({ error: () => {} }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fb?: string | Record<string, unknown>) => { if (typeof fb === 'string' && fb) return fb; if (fb && typeof fb === 'object') return Object.values(fb).map(String).join(' '); return k } }) }))
vi.mock('@/components/hermes/chat/MarkdownRenderer.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../store/ide', () => ({
  useIdeStore: () => ({ workspace: '/ws/proj' }),
}))

import IdeMemoryPane from '../views/IdeMemoryPane.vue'

/** 真实 FileEntry 形状（isDir，无 type 字段） */
const entry = (name: string, isDir: boolean) => ({ name, path: name, isDir, size: isDir ? 96 : 12, modTime: '2026-09-28T00:00:00Z' })

describe('IdeMemoryPane 记忆文件发现（isDir 契约）', () => {
  beforeEach(() => { listFilesMock.mockReset() })

  it('memory/ 目录与其中 .md 文件被列出（isDir 判断）', async () => {
    listFilesMock
      .mockResolvedValueOnce({ entries: [entry('AGENTS.md', false), entry('memory', true), entry('src', true)] })
      .mockResolvedValueOnce({ entries: [entry('2026-09-28-retro-rfd001.md', false), entry('notes.txt', false)] })
    const wrapper = mount(IdeMemoryPane)
    await flushPromises()
    const items = wrapper.findAll('[data-testid^="ide-memory-item-"]').map(w => w.text())
    expect(items).toContain('AGENTS.md')
    expect(items).toContain('memory/2026-09-28-retro-rfd001.md')
    // 非 .md 文件不入列
    expect(items.some(t => t.includes('notes.txt'))).toBe(false)
    // listFiles 以 workspace 为 root 参数调用
    expect(listFilesMock).toHaveBeenCalledWith('', '/ws/proj')
    expect(listFilesMock).toHaveBeenCalledWith('memory', '/ws/proj')
  })

  it('根 MEMORY.md 被列出；memory 是文件（非目录）时不深挖', async () => {
    listFilesMock.mockResolvedValueOnce({ entries: [entry('MEMORY.md', false), entry('memory', false)] })
    const wrapper = mount(IdeMemoryPane)
    await flushPromises()
    const items = wrapper.findAll('[data-testid^="ide-memory-item-"]').map(w => w.text())
    expect(items).toEqual(['MEMORY.md'])
    expect(listFilesMock).toHaveBeenCalledTimes(1)
  })

  it('无记忆文件时如实显示空态', async () => {
    listFilesMock.mockResolvedValueOnce({ entries: [entry('src', true)] })
    const wrapper = mount(IdeMemoryPane)
    await flushPromises()
    expect(wrapper.text()).not.toContain('AGENTS.md')
    expect(wrapper.find('[data-testid="ide-memory-list"]').exists()).toBe(false)
  })
})

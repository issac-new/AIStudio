// @vitest-environment node
// 辅助页签矩阵守卫：22 个 TABS 键都有模板落点；18 个非高频页签走懒加载。
// 注：真实挂载矩阵由 scripts/regression/ide-smoke.mjs 逐页签点击覆盖。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(__dirname, '../views/IdeSidePane.vue'), 'utf8')
const TABS = ['files', 'review', 'terminal', 'wiki', 'memory', 'ctxarchive', 'context', 'tools', 'trajectory', 'workflow', 'kanban', 'matrix', 'assistant', 'board', 'browser', 'storage', 'mcp', 'hooks', 'slash', 'deliver', 'genui', 'remote', 'plugins']

describe('IdeSidePane 页签矩阵', () => {
  it('22 个页签键全部注册', () => {
    expect(TABS).toHaveLength(22)
    for (const key of TABS) expect(src).toContain(`key: '${key}'`)
  })

  it('除 assistant（v-else 兜底）外每个键都有模板分支', () => {
    for (const key of TABS.filter(k => k !== 'assistant')) {
      expect(src).toContain(`ide.sidePane.tab === '${key}'`)
    }
    expect(src).toContain('ide-sidepane__assistant')
  })

  it('18 个非高频页签懒加载，files/review/terminal 保持同步', () => {
    expect(src).toContain("import IdeFilesPane from './IdeFilesPane.vue'")
    expect(src).toContain("import IdeGitPane from './IdeGitPane.vue'")
    expect(src).toContain("import IdeTerminalDock from './IdeTerminalDock.vue'")
    expect((src.match(/asyncPane\(\(\) => import\(/g) || []).length).toBe(18)
  })
})

// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/devtools-ui.test.ts
// IDE 编程工具启动器 + zcode CLI 会话兼容展示（2026-10-19 用户需求批）守门：
// 工具面板渲染/未安装置灰/点击调 launch；CLI 会话行渲染与「终端继续」动线。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('../api/devtools', () => ({
  fetchDevtools: vi.fn(async () => [
    { key: 'zcode', labelZh: 'zcode', labelEn: 'zcode', available: true },
    { key: 'vscode', labelZh: 'VS Code', labelEn: 'VS Code', available: true },
    { key: 'warp', labelZh: 'Warp', labelEn: 'Warp', available: false },
  ]),
  launchDevtool: vi.fn(async () => undefined),
  fetchCliSessions: vi.fn(async () => ({
    sessions: [
      { id: 'sess_a1', title: '修复构建', directory: '/Users/x/lab/proj', timeUpdated: Date.now() - 3_600_000, timeCreated: 0 },
      { id: 'sess_b2', title: '', directory: '', timeUpdated: Date.now() - 60_000, timeCreated: 0 },
    ],
  })),
}))
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }))
vi.mock('../composables/useIdeWorkspace', () => ({ useIdeWorkspace: () => ({ root: ref('/Users/x/lab/proj') }) }))

import { launchDevtool, fetchCliSessions } from '../api/devtools'
import IdeDevTools from '../components/IdeDevTools.vue'
import IdeCliSessions from '../components/IdeCliSessions.vue'

const mockedLaunch = vi.mocked(launchDevtool)

describe('IdeDevTools — 工具启动器', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('打开面板列出探测结果；未安装工具置灰禁用', async () => {
    const w = mount(IdeDevTools)
    await w.find('[data-testid="ide-devtools-toggle"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ide-devtools-panel"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-devtools-zcode"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="ide-devtools-warp"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('在工作区终端运行 zcode：launch 带 cwd；VS Code 打开当前工作区', async () => {
    const w = mount(IdeDevTools)
    await w.find('[data-testid="ide-devtools-toggle"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="ide-devtools-terminal-zcode"]').trigger('click')
    expect(mockedLaunch).toHaveBeenCalledWith('terminal-zcode', '/Users/x/lab/proj')
    // 启动成功面板收起；重开再点 VS Code
    await w.find('[data-testid="ide-devtools-toggle"]').trigger('click')
    await w.find('[data-testid="ide-devtools-vscode"]').trigger('click')
    expect(mockedLaunch).toHaveBeenCalledWith('vscode', '/Users/x/lab/proj')
    w.unmount()
  })
})

describe('IdeCliSessions — zcode CLI 会话兼容展示', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('列出会话（源徽+标题+工作区短名+相对时间）；终端继续带会话工作区', async () => {
    const w = mount(IdeCliSessions)
    await flushPromises()
    expect(fetchCliSessions).toHaveBeenCalled()
    expect(w.text()).toContain('zcode CLI')
    expect(w.text()).toContain('修复构建')
    expect(w.text()).toContain('lab/proj')
    expect(w.find('[data-testid="ide-cli-session-sess_a1"]').exists()).toBe(true)
    await w.find('[data-testid="ide-cli-resume-sess_a1"]').trigger('click')
    expect(mockedLaunch).toHaveBeenCalledWith('terminal-zcode', '/Users/x/lab/proj')
    w.unmount()
  })
})

describe('IdeCliSessions 侧栏内嵌 — 遮罩回归守门（2026-10-19 左下角遮罩批）', () => {
  it('cli-body 有内滚上限：侧栏无滚动容器，不设上限会画穿侧栏底被状态栏遮住', () => {
    const scss = readFileSync(resolve(__dirname, '../views/IdeTaskSidebar.vue'), 'utf8')
    const block = scss.slice(scss.indexOf('.ide-taskbar__cli-body'))
    expect(block).toContain('max-height')
    expect(block).toContain('overflow-y: auto')
  })
})

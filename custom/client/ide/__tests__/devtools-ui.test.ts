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
    { key: 'deepseek-harness', labelZh: 'DeepSeek Harness', labelEn: 'DeepSeek Harness', available: true },
    { key: 'vscode', labelZh: 'VS Code', labelEn: 'VS Code', available: true },
    { key: 'warp', labelZh: 'Warp', labelEn: 'Warp', available: false },
  ]),
  launchDevtool: vi.fn(async () => undefined),
  fetchCliSessions: vi.fn(async () => ({
    sessions: [
      { id: 'sess_a1', title: '修复构建', directory: '/Users/x/lab/proj', timeUpdated: Date.now() - 3_600_000, timeCreated: 0 },
      { id: 'sess_b2', title: '', directory: '', timeUpdated: Date.now() - 60_000, timeCreated: 0 },
      { id: 'sess_old', title: '上月的会话', directory: '/Users/x/lab/old', timeUpdated: Date.now() - 10 * 24 * 3600_000, timeCreated: 0 },
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
    expect(w.find('[data-testid="ide-devtools-deepseek-harness"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-testid="ide-devtools-warp"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('DeepSeek Harness 按钮直接打开本机 app（不带 cwd）', async () => {
    const w = mount(IdeDevTools)
    await w.find('[data-testid="ide-devtools-toggle"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="ide-devtools-deepseek-harness"]').trigger('click')
    expect(mockedLaunch).toHaveBeenCalledWith('deepseek-harness', undefined)
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

describe('IdeCliSessions — 视图/搜索跟随（2026-10-19 视图语义修正批）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('view=active 只留 24h 内会话并 emit 过滤后计数', async () => {
    const w = mount(IdeCliSessions, { props: { boxed: false, view: 'active' } })
    await flushPromises()
    const ids = w.findAll('[data-testid^="ide-cli-session-"]').map(n => n.attributes('data-testid'))
    expect(ids).toContain('ide-cli-session-sess_a1')
    expect(ids).toContain('ide-cli-session-sess_b2')
    expect(ids).not.toContain('ide-cli-session-sess_old')
    expect(w.emitted('count')?.at(-1)).toEqual([2])
    w.unmount()
  })

  it('view=done 只留超 24h 会话；空态给「更早」指引', async () => {
    const w = mount(IdeCliSessions, { props: { boxed: false, view: 'done' } })
    await flushPromises()
    expect(w.findAll('[data-testid^="ide-cli-session-"]')).toHaveLength(1)
    expect(w.find('[data-testid="ide-cli-session-sess_old"]').exists()).toBe(true)
    w.unmount()
    const empty = mount(IdeCliSessions, { props: { boxed: false, view: 'done', query: '不存在的词' } })
    await flushPromises()
    expect(empty.text()).not.toContain('sess_old')
    empty.unmount()
  })

  it('query 过滤命中标题与目录', async () => {
    const w = mount(IdeCliSessions, { props: { boxed: false, view: 'workspace', query: 'old' } })
    await flushPromises()
    expect(w.findAll('[data-testid^="ide-cli-session-"]')).toHaveLength(1)
    const byTitle = mount(IdeCliSessions, { props: { boxed: false, view: 'workspace', query: '修复' } })
    await flushPromises()
    expect(byTitle.findAll('[data-testid^="ide-cli-session-"]')).toHaveLength(1)
    w.unmount(); byTitle.unmount()
  })
})

describe('侧栏视图语义守门（已完成→更早）', () => {
  it('视图文案为本地 VIEW_TEXT（更早，非已完成）且 title 写明口径', () => {
    const src = readFileSync(resolve(__dirname, '../views/IdeTaskSidebar.vue'), 'utf8')
    expect(src).toContain('VIEW_TEXT')
    expect(src).toContain("done: { zh: '更早'")
    expect(src).toContain('超过 24 小时未活跃的会话（非已完成）')
    // 旧词表直引不再出现在视图文案（organize/其他 t() 用法不受影响）
    expect(src).not.toContain("t('ide.task.view_done')")
  })

  it('工作空间视图计数口径=会话数（注释锚）', () => {
    const src = readFileSync(resolve(__dirname, '../views/IdeTaskSidebar.vue'), 'utf8')
    expect(src).toContain('workspace: all.length')
  })
})

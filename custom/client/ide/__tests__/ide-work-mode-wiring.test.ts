// overlay/custom/client/ide/__tests__/ide-work-mode-wiring.test.ts
// 双模式接线守门（源码级，避免与并行 composer 轮的组件挂载夹具冲突）：
//   界面模式效果表 → 侧栏/命令面板/状态栏/快捷键；任务模式 → 侧栏/聊天列新建。
// 行为断言由 interface-mode/task-mode/side-pane/task-sidebar/command-palette 专测覆盖，
// 本文件只保证"每个消费点都真的接了同一条单一事实源"，防回退成装饰性开关。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8')

describe('界面模式（编程/工作）接线', () => {
  it('侧栏辅助面板消费 interfaceModeEffects，隐藏终端/审查并在模式切换时回落', () => {
    const src = read('views/IdeSidePane.vue')
    expect(src).toContain("import { interfaceModeEffects } from '../utils/interface-mode'")
    expect(src).toContain('interfaceModeEffects(ide.interfaceMode')
    expect(src).toContain("if (key === 'terminal') return modeEffects.value.showTerminal")
    expect(src).toContain("if (key === 'review') return modeEffects.value.showReview")
    expect(src).toMatch(/watch\(\(\) => ide\.interfaceMode[\s\S]{0,200}setSidePaneTab\(modeEffects\.value\.defaultSideTab\)/)
  })

  it('命令面板消费效果表：工作模式隐藏终端/审查直达，并提供模式切换命令', () => {
    const src = read('components/IdeCommandPalette.vue')
    expect(src).toContain('interfaceModeEffects(ide.interfaceMode')
    expect(src).toContain("id: 'cmd:toggle-interface-mode'")
    expect(src).toContain('ide.toggleInterfaceMode()')
    expect(src).toContain("(pane !== 'terminal' || effects.showTerminal)")
    expect(src).toContain("(pane !== 'review' || effects.showReview)")
  })

  it('状态栏常驻模式 chip 且点击切换（单一入口可见）', () => {
    const src = read('views/IdeStatusBar.vue')
    expect(src).toContain('data-testid="ide-mode-chip"')
    expect(src).toContain('ide.toggleInterfaceMode()')
    expect(src).toContain('ide.isWorkMode')
  })

  it('快捷键 Cmd/Ctrl+Shift+U 注册与卸载成对，编辑态不劫持', () => {
    const src = read('views/IdeShell.vue')
    expect(src).toContain("import { isInterfaceModeToggle, isEditableTarget } from '../utils/interface-mode'")
    expect(src).toContain('window.addEventListener(\'keydown\', onInterfaceModeHotkey)')
    expect(src).toContain('window.removeEventListener(\'keydown\', onInterfaceModeHotkey)')
    expect(src).toContain('if (isEditableTarget(event.target)) return')
  })

  it('聊天列按界面模式加 is-ide-work-mode 类（工具卡折叠/代码换行的 CSS 锚）', () => {
    const src = read('views/IdeChatPane.vue')
    expect(src).toContain("'is-ide-work-mode': Boolean(ide.isWorkMode)")
    expect(src).toContain('.ide-chat.is-ide-work-mode :deep(.tool-details)')
    expect(src).toContain('white-space: pre-wrap')
  })
})

describe('任务模式（编程/工作）接线', () => {
  it('侧栏新建任务走 buildNewTaskOptions（不再手写 codingAgent 配方）', () => {
    const src = read('views/IdeTaskSidebar.vue')
    expect(src).toContain("import { buildNewTaskOptions, sessionTaskMode } from '../utils/task-mode'")
    expect(src).toContain('chat.newChat(buildNewTaskOptions({')
    expect(src).toContain("data-testid=\"ide-task-mode-coding\"")
    expect(src).toContain("data-testid=\"ide-task-mode-work\"")
    expect(src).toContain('ide-taskbar__mode-badge')
  })

  it('聊天列 ensureSession 保留工作会话并按任务模式创建', () => {
    const src = read('views/IdeChatPane.vue')
    expect(src).toContain("from '../utils/task-mode'")
    expect(src).toContain('buildNewTaskOptions')
    expect(src).toContain('explicitTaskMode')
    expect(src).toContain("if (active && sessionTaskMode(active) === 'work') return")
    // 工作任务模型取 Hermes 目录，编程任务沿用 Ycode 目录
    expect(src).toContain('const useEngineCatalog = !isWorkSession.value && usingIndependent.value')
  })

  it('工作会话空态四类起步按钮点击即真实发送', () => {
    const src = read('views/IdeChatPane.vue')
    expect(src).toContain('data-testid="ide-work-empty"')
    expect(src).toContain('data-testid="`ide-work-starter-${s.key}`"')
    expect(src).toContain('chatStore.sendMessage(prompt)')
  })
})

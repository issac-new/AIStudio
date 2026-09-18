// overlay/custom/client/ide/store/ide.ts
// IDE 工作台页面状态：workspace、agent 底座选择（默认 codex）、布局偏好。
// 纯客户端状态 + localStorage 持久化，不持有服务端数据。
//
// workspace 语义：
//   null —— 未指定：文件浏览走 filesStore 默认（profile home，服务端
//           /api/studio/files 不带 root，无沙箱问题）；会话 workspace 用
//           服务端默认。
//   非空 —— 指定根目录：文件浏览带 root 参数（服务端沙箱要求落在
//           ~/.hermes 内或已知任务 workspace，越界由 IdeWorkspacePane
//           显示错误态，cockpit 同款行为）；会话与终端 cd 到该目录。
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { CodingAgentId } from '@/api/coding-agents'

const WORKSPACE_KEY = 'hermes_ide_workspace'
const AGENT_KEY = 'hermes_ide_agent'
const LAYOUT_KEY = 'hermes_ide_layout'

/** IDE 会话列的页签 */
export type IdeChatTab = 'messages' | 'subagents' | 'trace'

/** agent 底座默认值——用户指定的 codex 源码底座 */
export const DEFAULT_IDE_AGENT: CodingAgentId = 'codex'

/**
 * coding agent id → chat store 的 agent 值。
 * 抄送 ChatPanel.vue 新建会话处的映射（codex→codex、claude-code→claude …），
 * 供 newChat({ agent }) 使用；抽成纯函数便于守门测试。
 */
export function ideAgentToChatAgent(agentId: CodingAgentId): string {
  switch (agentId) {
    case 'codex':
      return 'codex'
    case 'claude-code':
      return 'claude'
    case 'pi':
      return 'pi'
    case 'grok':
      return 'grok'
    case 'dsh':
      return 'dsh'
    case 'opencode':
      return 'opencode'
    default:
      return 'hermes'
  }
}

export interface IdeLayoutPrefs {
  /** 左侧功能栏：工作区列是否可见 */
  workspaceVisible: boolean
  /** 右侧会话列是否可见 */
  chatVisible: boolean
  /** 底部终端是否展开 */
  terminalOpen: boolean
  /** 终端面板高度（px） */
  terminalHeight: number
  /** 会话列宽度（px） */
  chatWidth: number
}

const DEFAULT_LAYOUT: IdeLayoutPrefs = {
  workspaceVisible: true,
  chatVisible: true,
  terminalOpen: false,
  terminalHeight: 240,
  chatWidth: 440,
}

/** 侧栏任务视图模式（对标 zcode workspaceSidebar.organize：分组/项目/时间线） */
export type IdeTaskView = 'tasks' | 'files'
export type IdeOrganizeMode = 'grouped' | 'project' | 'timeline'

export type IdeSidePaneTab = 'review' | 'browser' | 'wiki' | 'assistant' | 'storage' | 'memory' | 'board'

export interface IdeSidePanePrefs {
  open: boolean
  tab: IdeSidePaneTab
  width: number
}

const SIDEBAR_KEY = 'hermes_ide_sidebar'
const SIDEPANE_KEY = 'hermes_ide_sidepane'

const DEFAULT_SIDEBAR: { view: IdeTaskView; organize: IdeOrganizeMode } = {
  view: 'tasks',
  organize: 'project',
}

const DEFAULT_SIDEPANE: IdeSidePanePrefs = {
  open: false,
  tab: 'wiki',
  width: 380,
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

function loadAgent(): CodingAgentId {
  const saved = localStorage.getItem(AGENT_KEY)
  return saved === 'claude-code' || saved === 'pi' || saved === 'grok'
    || saved === 'dsh' || saved === 'opencode' || saved === 'codex'
    ? saved
    : DEFAULT_IDE_AGENT
}

export const useIdeStore = defineStore('ide', () => {
  const workspace = ref<string | null>(localStorage.getItem(WORKSPACE_KEY) || null)
  const agentId = ref<CodingAgentId>(loadAgent())
  const chatTab = ref<IdeChatTab>('messages')
  const layout = ref<IdeLayoutPrefs>(loadJson<IdeLayoutPrefs>(LAYOUT_KEY, DEFAULT_LAYOUT))
  const sidebar = ref<{ view: IdeTaskView; organize: IdeOrganizeMode }>(
    loadJson(SIDEBAR_KEY, DEFAULT_SIDEBAR),
  )
  const sidePane = ref<IdeSidePanePrefs>(loadJson<IdeSidePanePrefs>(SIDEPANE_KEY, DEFAULT_SIDEPANE))
  /** 命令面板（Cmd/Ctrl+K，对标 zcode quickPick/commandCenter） */
  const paletteOpen = ref(false)

  function setWorkspace(path: string | null): void {
    workspace.value = path?.trim() ? path.trim() : null
    localStorage.setItem(WORKSPACE_KEY, workspace.value ?? '')
  }

  function setAgentId(id: CodingAgentId): void {
    agentId.value = id
    localStorage.setItem(AGENT_KEY, id)
  }

  function setChatTab(tab: IdeChatTab): void {
    chatTab.value = tab
  }

  function openPalette(): void {
    paletteOpen.value = true
  }

  function closePalette(): void {
    paletteOpen.value = false
  }

  function togglePalette(): void {
    paletteOpen.value = !paletteOpen.value
  }

  watch(layout, (value) => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(value))
    } catch { /* 存储满等异常不阻塞 UI */ }
  }, { deep: true })

  watch([sidebar, sidePane], () => {
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebar.value))
      localStorage.setItem(SIDEPANE_KEY, JSON.stringify(sidePane.value))
    } catch { /* 存储满等异常不阻塞 UI */ }
  }, { deep: true })

  function setSidebarView(view: IdeTaskView): void {
    sidebar.value.view = view
  }

  function setOrganize(mode: IdeOrganizeMode): void {
    sidebar.value.organize = mode
  }

  function setSidePaneTab(tab: IdeSidePaneTab): void {
    sidePane.value.tab = tab
    sidePane.value.open = true
  }

  function toggleSidePane(tab?: IdeSidePaneTab): void {
    if (tab && (!sidePane.value.open || sidePane.value.tab !== tab)) {
      setSidePaneTab(tab)
      return
    }
    sidePane.value.open = !sidePane.value.open
  }

  /** 终端默认 cwd（与 CockpitTerminalPane 回退语义一致） */
  const terminalCwd = computed(() => workspace.value ?? '~')

  return {
    workspace,
    agentId,
    chatTab,
    layout,
    sidebar,
    sidePane,
    paletteOpen,
    terminalCwd,
    setWorkspace,
    setAgentId,
    setChatTab,
    setSidebarView,
    setOrganize,
    setSidePaneTab,
    toggleSidePane,
    openPalette,
    closePalette,
    togglePalette,
  }
})

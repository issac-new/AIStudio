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

/** 中栏浮窗键（任务计划/子代理，对标 zcode 浮窗模式） */
export type IdeFloatKey = 'plan' | 'agents'

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

export interface IdePaneState {
  /** 向侧边折叠（缩成把手，点击展开） */
  folded: boolean
  /** 最大化（独占 main 区，其余栏收起） */
  maximized: boolean
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
  /** 任务侧栏折叠/最大化 */
  sidebar: IdePaneState
  /** 工作区列折叠/最大化 */
  workspace: IdePaneState
  /** 会话列折叠/最大化 */
  chat: IdePaneState
  /** 右辅助面板最大化（折叠由 sidePane.open 承载） */
  sidepane: IdePaneState
}

const DEFAULT_LAYOUT: IdeLayoutPrefs = {
  workspaceVisible: true,
  chatVisible: true,
  terminalOpen: false,
  terminalHeight: 240,
  chatWidth: 440,
  sidebar: { folded: false, maximized: false },
  workspace: { folded: false, maximized: false },
  chat: { folded: false, maximized: false },
  sidepane: { folded: false, maximized: false },
}

/** 互斥最大化：某栏最大化时其余栏 maximized 复位 */
function applyMaximized(layout: IdeLayoutPrefs, who: 'sidebar' | 'chat' | 'sidepane'): void {
  const target = layout[who]
  const next = !target.maximized
  for (const key of ['sidebar', 'chat', 'sidepane'] as const) {
    layout[key].maximized = key === who ? next : false
  }
}

/** 侧栏任务组织模式（对标 zcode workspaceSidebar.organize：分组/项目/时间线） */
export type IdeOrganizeMode = 'grouped' | 'project' | 'timeline'

/** v12 工作空间维度（任务/项目/会话）：链路维度已随 09-20 重构退役 */
export type IdeDimension = 'task' | 'project' | 'session'

export type IdeSidePaneTab = 'files' | 'review' | 'browser' | 'wiki' | 'assistant' | 'storage' | 'memory' | 'board' | 'terminal'

export interface IdeSidePanePrefs {
  open: boolean
  tab: IdeSidePaneTab
  width: number
}

const SIDEBAR_KEY = 'hermes_ide_sidebar'
const SIDEPANE_KEY = 'hermes_ide_sidepane'
const DIM_KEY = 'hermes_ide_dim'

const DEFAULT_SIDEBAR: { organize: IdeOrganizeMode } = {
  organize: 'project',
}

const DEFAULT_SIDEPANE: IdeSidePanePrefs = {
  // v12.6 用户裁定：三栏打开时默认显示（此前右侧辅助面板默认收起）
  open: true,
  tab: 'files',
  width: 480,
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

/** 历史残留维度值（如已退役的 'chain'）回落任务维度 */
function loadDimension(): IdeDimension {
  const saved = localStorage.getItem(DIM_KEY)
  return saved === 'task' || saved === 'project' || saved === 'session' ? saved : 'task'
}

export const useIdeStore = defineStore('ide', () => {
  const workspace = ref<string | null>(localStorage.getItem(WORKSPACE_KEY) || null)
  const agentId = ref<CodingAgentId>(loadAgent())
  const layout = ref<IdeLayoutPrefs>(loadJson<IdeLayoutPrefs>(LAYOUT_KEY, DEFAULT_LAYOUT))
  const sidebar = ref<{ organize: IdeOrganizeMode }>(
    loadJson(SIDEBAR_KEY, DEFAULT_SIDEBAR),
  )
  const sidePane = ref<IdeSidePanePrefs>(loadJson<IdeSidePanePrefs>(SIDEPANE_KEY, DEFAULT_SIDEPANE))
  /** 命令面板（Cmd/Ctrl+K，对标 zcode quickPick/commandCenter） */
  const paletteOpen = ref(false)
  /** v12 工作空间维度（默认任务；/ide?task= 深链落任务维度） */
  const dimension = ref<IdeDimension>(loadDimension())
  /** 任务维度绑定的任务 id（工作台 ⌨ / 管理台 ⌨ 深链带入） */
  const activeTaskId = ref<string | null>(null)
  /** 中栏浮窗开关（任务计划/子代理名册；瞬态不持久化，对标 zcode 浮窗） */
  const floats = ref<Record<IdeFloatKey, boolean>>({ plan: false, agents: false })

  function setWorkspace(path: string | null): void {
    workspace.value = path?.trim() ? path.trim() : null
    localStorage.setItem(WORKSPACE_KEY, workspace.value ?? '')
  }

  function setAgentId(id: CodingAgentId): void {
    agentId.value = id
    localStorage.setItem(AGENT_KEY, id)
  }

  function setDimension(dim: IdeDimension): void {
    dimension.value = dim
    try {
      localStorage.setItem(DIM_KEY, dim)
    } catch { /* 存储异常不阻塞 */ }
  }

  /** 任务维度绑定（工作台 ⌨ 深链）；null 清除 */
  function setActiveTask(taskId: string | null): void {
    activeTaskId.value = taskId?.trim() || null
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

  function toggleFloat(key: IdeFloatKey): void {
    floats.value[key] = !floats.value[key]
  }

  /** 中栏聚焦：确保会话列可见（任务/会话维度动线共用） */
  function setChatFocus(): void {
    if (!layout.value.chatVisible) layout.value.chatVisible = true
    if (layout.value.chat.folded) layout.value.chat.folded = false
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

  function toggleFold(who: 'sidebar' | 'chat'): void {
    layout.value[who].folded = !layout.value[who].folded
    if (layout.value[who].folded) layout.value[who].maximized = false
  }

  function toggleMax(who: 'sidebar' | 'chat' | 'sidepane'): void {
    applyMaximized(layout.value, who)
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
    layout,
    sidebar,
    sidePane,
    paletteOpen,
    dimension,
    activeTaskId,
    floats,
    terminalCwd,
    setWorkspace,
    setAgentId,
    setDimension,
    setActiveTask,
    toggleFold,
    toggleMax,
    setOrganize,
    setSidePaneTab,
    toggleSidePane,
    toggleFloat,
    setChatFocus,
    openPalette,
    closePalette,
    togglePalette,
  }
})

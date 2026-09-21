// overlay/custom/client/ide/utils/terminalActions.ts
// 终端 actions（R4，codex-product 项目级一键命令语义）：
// 工作区级命名命令（如 npm start / 测试），一键写入 IDE 终端执行。
// 配置：localStorage per workspace（MVP；团队共享配置归 R5+）。
// 执行通道：IdeTerminalDock 监听 overlay:terminal-action CustomEvent
// （与 R2 审批事件同范式：不新增 props/emit 链路），拿到 command 后写入活动
// 终端（无活动终端时先开新页）。
export interface TerminalAction {
  id: string
  label: string
  command: string
}

const STORAGE_PREFIX = 'ide-terminal-actions:'
const MAX_ACTIONS = 12

function storageKey(workspace: string): string {
  return `${STORAGE_PREFIX}${workspace || 'default'}`
}

export function loadTerminalActions(workspace: string): TerminalAction[] {
  try {
    const raw = localStorage.getItem(storageKey(workspace))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a): a is TerminalAction =>
        Boolean(a) && typeof a.id === 'string' && typeof a.label === 'string' && typeof a.command === 'string',
    ).slice(0, MAX_ACTIONS)
  } catch {
    return []
  }
}

export function saveTerminalActions(workspace: string, actions: TerminalAction[]): void {
  try {
    localStorage.setItem(storageKey(workspace), JSON.stringify(actions.slice(0, MAX_ACTIONS)))
  } catch { /* 配额满静默 */ }
}

export function addTerminalAction(workspace: string, label: string, command: string): TerminalAction[] {
  const trimmed = { label: label.trim(), command: command.trim() }
  if (!trimmed.label || !trimmed.command) return loadTerminalActions(workspace)
  const actions = loadTerminalActions(workspace).filter((a) => a.label !== trimmed.label)
  actions.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, ...trimmed })
  saveTerminalActions(workspace, actions)
  return actions
}

export function removeTerminalAction(workspace: string, id: string): TerminalAction[] {
  const actions = loadTerminalActions(workspace).filter((a) => a.id !== id)
  saveTerminalActions(workspace, actions)
  return actions
}

/** 触发执行：打开终端并向 dock 派发命令（dock 侧写入活动终端） */
export const TERMINAL_ACTION_EVENT = 'overlay:terminal-action'

export function fireTerminalAction(command: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TERMINAL_ACTION_EVENT, { detail: { command } }))
  }
}

// overlay/custom/client/ide/utils/interface-mode.ts
// 编程/工作双界面模式——zcode 3.15.1 同款语义（office/coding），呈现层降噪，
// 不改引擎、协议与权限（锚点：upstream/zcode/packages/ui/src/lib/interfaceMode.ts:1-8；
// App.tsx:997-998 隐藏终端/审查；ToolCallBlocks/renderers/execute-group.tsx:55 工具卡折叠；
// shortcutCommands.ts:98 默认 CmdOrCtrl+Shift+u）。
//
// 单一事实源：模式效果一律经 interfaceModeEffects() 取，组件不各写判断（D-3）。
export type IdeInterfaceMode = 'coding' | 'work'

/** 模式持久化键（独立于 zcode 的 zcode-interface-mode，避免两个产品的偏好互串） */
export const INTERFACE_MODE_KEY = 'hermes_ide_interface_mode'

/**
 * 归一化：接受用户词 work 与 zcode 历史词 office/general/concise；
 * 其余（含空值/损坏值）一律回落 coding（安全默认=显示全部能力）。
 */
export function normalizeInterfaceMode(value: unknown): IdeInterfaceMode {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return v === 'work' || v === 'office' || v === 'general' || v === 'concise' ? 'work' : 'coding'
}

export interface InterfaceModeEffects {
  /** 右侧辅助栏是否显示终端页签 */
  showTerminal: boolean
  /** 右侧辅助栏是否显示审查（Git diff）页签 */
  showReview: boolean
  /** 工具卡是否只保留摘要（不展开参数/输出/diff 计数） */
  collapseToolDetails: boolean
  /** 代码块是否强制换行（不横向滚动） */
  wrapCode: boolean
  /** 进入该模式时若当前页签被隐藏，回落的目标页签 */
  defaultSideTab: 'files' | 'memory'
}

/** 模式效果表：工作模式=降噪；编程模式=全量能力（zcode coding）。 */
export function interfaceModeEffects(mode: IdeInterfaceMode): InterfaceModeEffects {
  if (mode === 'work') {
    return {
      showTerminal: false,
      showReview: false,
      collapseToolDetails: true,
      wrapCode: true,
      defaultSideTab: 'files',
    }
  }
  return {
    showTerminal: true,
    showReview: true,
    collapseToolDetails: false,
    wrapCode: false,
    defaultSideTab: 'files',
  }
}

/** 快捷键匹配：Cmd/Ctrl+Shift+U（与 zcode 默认绑定一致）。编辑态过滤由调用方负责。 */
export function isInterfaceModeToggle(event: {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  key?: string
}): boolean {
  return Boolean((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey
    && String(event.key || '').toLowerCase() === 'u')
}

/** 当前目标是否是可编辑控件（快捷键在编辑态不劫持，避免吞字母/输入法）。 */
export function isEditableTarget(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = String(el.tagName || '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

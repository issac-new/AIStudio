// overlay/custom/client/ide/utils/capabilityPack.ts
// 项目能力包（B1，2026-09-29，Manus 2.0 Cascade「项目保持轻量、按需拉入专项
// 能力」语义吸收）：工作区级声明侧栏页签允许集（allow-list），未声明的页签
// 不渲染；未配置 = 全量默认（既有行为零变化）。
// 配置：localStorage per workspace（MVP，与 terminalActions 同范式；团队共享
// 配置归后续——落服务端 workspace 配置面）。
import type { IdeSidePaneTab } from '../store/ide'

/** 页签词表（单一事实源：与 IdeSidePane TABS 键集一致；新页签须两处同步）。 */
export const CAPABILITY_TABS: IdeSidePaneTab[] = [
  'files', 'review', 'browser', 'wiki', 'assistant', 'storage', 'memory',
  'board', 'kanban', 'tools', 'workflow', 'mcp', 'terminal', 'hooks',
  'slash', 'automations',
]

const STORAGE_PREFIX = 'ide-capability-pack:'

function storageKey(workspace: string): string {
  return `${STORAGE_PREFIX}${workspace || 'default'}`
}

/**
 * 读工作区能力包。null = 未声明（全量默认）。坏档静默回退 null（不炸 UI）。
 * 词表外的历史键过滤掉（页签退役不留僵尸）。
 */
export function loadCapabilityPack(workspace: string): IdeSidePaneTab[] | null {
  try {
    const raw = localStorage.getItem(storageKey(workspace))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const valid = parsed.filter((t): t is IdeSidePaneTab =>
      typeof t === 'string' && (CAPABILITY_TABS as string[]).includes(t))
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

/**
 * 写工作区能力包。tabs 为空或清洗后为空 = 删除声明（回全量默认）。
 * 至少保留一个页签（全隐会让侧栏失去落点）。
 */
export function saveCapabilityPack(workspace: string, tabs: IdeSidePaneTab[]): void {
  try {
    const valid = tabs.filter((t) => (CAPABILITY_TABS as string[]).includes(t))
    if (valid.length === 0) {
      localStorage.removeItem(storageKey(workspace))
      return
    }
    localStorage.setItem(storageKey(workspace), JSON.stringify(valid))
  } catch { /* 配额满静默 */ }
}

/** 能力包判定：null=允许（默认全量）；否则必须在列表内。 */
export function packAllows(pack: IdeSidePaneTab[] | null, tab: IdeSidePaneTab): boolean {
  if (pack === null) return true
  return pack.includes(tab)
}

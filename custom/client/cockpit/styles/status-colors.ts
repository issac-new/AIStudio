// overlay/custom/client/cockpit/styles/status-colors.ts
// 语义色统一映射 — 所有 cockpit 组件共用，杜绝各处硬编码
//
// 设计原则（Pure Ink 教义扩展）：
// - 颜色只从 CSS 变量取，不写死 hex
// - 同一语义（blocked/triage/review/todo）在所有组件中颜色一致
// - dark/comic 主题自动适配（变量随主题切换）

export type SemanticStatus =
  | 'blocked' | 'triage' | 'review' | 'todo'
  | 'ok' | 'warning' | 'error' | 'info' | 'muted'

export const STATUS_COLORS: Record<SemanticStatus, string> = {
  blocked: 'var(--error)',
  triage: 'var(--accent-info, #4a90d9)',
  review: 'var(--warning)',
  todo: 'var(--accent-primary)',
  ok: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  info: 'var(--accent-info, #4a90d9)',
  muted: 'var(--text-muted)',
}

export const STATUS_BG: Record<SemanticStatus, string> = {
  blocked: 'rgba(var(--error-rgb, 198, 40, 40), 0.08)',
  triage: 'rgba(var(--accent-info-rgb, 74, 144, 217), 0.08)',
  review: 'rgba(var(--warning-rgb, 245, 127, 23), 0.08)',
  todo: 'rgba(var(--accent-primary-rgb, 51, 51, 51), 0.06)',
  ok: 'rgba(var(--success-rgb, 46, 125, 50), 0.08)',
  warning: 'rgba(var(--warning-rgb, 245, 127, 23), 0.08)',
  error: 'rgba(var(--error-rgb, 198, 40, 40), 0.08)',
  info: 'rgba(var(--accent-info-rgb, 74, 144, 217), 0.08)',
  muted: 'var(--bg-secondary)',
}

/** ECharts 场景下需要计算色（ECharts 不接受 var()，但接受 CSS 变量字符串在 canvas 中解析 — 不支持）。
 *  因此为 ECharts 提供 resolve 函数，从 getComputedStyle 读取实际值。 */
let resolvedCache: Record<string, string> | null = null

export function resolveStatusColors(): Record<SemanticStatus, string> {
  if (resolvedCache) return resolvedCache
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback

  resolvedCache = {
    blocked: get('--error', '#c62828'),
    triage: get('--accent-info', '#4a90d9'),
    review: get('--warning', '#f57f17'),
    todo: get('--accent-primary', '#333333'),
    ok: get('--success', '#2e7d32'),
    warning: get('--warning', '#f57f17'),
    error: get('--error', '#c62828'),
    info: get('--accent-info', '#4a90d9'),
    muted: get('--text-muted', '#999999'),
  }
  return resolvedCache
}

export function resolveStatusBg(status: SemanticStatus, alpha = 0.08): string {
  const style = getComputedStyle(document.documentElement)
  const c = resolveStatusColors()[status]
  // 将 hex 转 rgba
  const hex = c.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(153,153,153,${alpha})`
  return `rgba(${r},${g},${b},${alpha})`
}

/** 主题切换时调用，清除缓存 */
export function invalidateStatusColorCache(): void {
  resolvedCache = null
}

/** 中性色（节点填充/边框）— ECharts 用，也从主题变量 resolve */
export function resolveNeutrals() {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    ink: get('--text-primary', '#1a1a1a'),
    inkSecondary: get('--text-secondary', '#666666'),
    muted: get('--text-muted', '#999999'),
    border: get('--border-color', '#e0e0e0'),
    bgCard: get('--bg-card', '#ffffff'),
    bgSecondary: get('--bg-secondary', '#f0f0f0'),
    accent: get('--accent-primary', '#333333'),
  }
}

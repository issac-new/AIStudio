// overlay/custom/client/ide/utils/time.ts
// IDE 侧栏相对时间格式化：秒/毫秒自适应、i18n 驱动、纯函数便于测试。

export type TFunc = (key: string, named?: Record<string, unknown>) => string

/** 入参可能是秒（服务端）或毫秒（chat store），统一转毫秒 */
function toMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000
}

/**
 * 相对时间：刚刚 / n 分钟前 / n 小时前 / n 天前 / MM-DD / YYYY-MM-DD。
 * 对齐 ZCode taskList 展示粒度（刚刚/分/时/天，跨日给日期）。
 */
export function formatRelativeTime(t: TFunc, ts: number, now = Date.now()): string {
  if (!ts) return ''
  const ms = toMs(ts)
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000))
  if (diffSec < 60) return t('ide.task.justNow')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return t('ide.task.minutesAgo', { count: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('ide.task.hoursAgo', { count: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return t('ide.task.daysAgo', { count: diffDay })
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}-${md}`
}

/** workspace 显示名：取路径末段；空值回退「默认」 */
export function workspaceLabel(t: TFunc, workspace?: string | null): string {
  const w = (workspace || '').trim()
  if (!w) return t('ide.task.defaultGroup')
  const seg = w.replace(/\/+$/, '').split('/').filter(Boolean)
  return seg.length ? seg[seg.length - 1] : w
}

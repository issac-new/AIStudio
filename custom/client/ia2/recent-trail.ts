// overlay/custom/client/ia2/recent-trail.ts
// 最近轨迹纯逻辑核（2026-10-23 用户需求：「常用」里加「最近」，保留页面操作
// 轨迹便于回溯）。状态与 localStorage 持久化在 composables/useRecentTrail，
// 这里只放可单测的无副作用操作：入栈去重/置顶/截断、持久化编解码容错、
// 页面名解析（2026-10-27 Task 8 起委托 page-presentation 共享解析器——与
// 面包屑/浏览器标签页同源，回落链语义不变）、相对时间格式化。
import { pageTitle } from './page-presentation'

/** 轨迹上限：超过丢最旧（用户可感知的回溯窗口，再长成噪音） */
export const RECENT_TRAIL_LIMIT = 20
/** localStorage 键（v1 后缀留 schema 演进余地；脏数据整体丢弃重建） */
export const RECENT_TRAIL_STORAGE_KEY = 'swarm.recentTrail.v1'

export type RecentLocale = 'zh' | 'en'

/** 一条访问记录：title 在记录时按当时 locale 解析固化（重访即刷新） */
export interface RecentEntry {
  fullPath: string
  routeName: string
  title: string
  ts: number
}

/** 记录时所需的最小路由形状（vue-router route 的结构子集，纯测可直接造） */
export interface RecentRouteLike {
  fullPath: string
  path: string
  name?: unknown
  query?: Record<string, unknown>
}

/**
 * 入栈核：新条目置顶；同 fullPath 已存在则剔除旧条目后置顶（栈顶同页即
 * 等价于「仅刷新 ts」，不重复入栈）；超过上限丢最旧。返回新数组不改入参。
 */
export function pushRecent(
  entries: readonly RecentEntry[],
  next: RecentEntry,
  limit: number = RECENT_TRAIL_LIMIT,
): RecentEntry[] {
  const rest = entries.filter(e => e.fullPath !== next.fullPath)
  return [next, ...rest].slice(0, limit)
}

/**
 * 解析持久化串：null/脏 JSON/非数组整体丢弃（轨迹可由后续导航重建，不值得
 * 半量抢救）；字段类型不全的元素剔除；超上限截断。任何输入都返回安全数组。
 */
export function parseRecentTrail(raw: string | null): RecentEntry[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: RecentEntry[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    if (typeof e.fullPath !== 'string' || !e.fullPath) continue
    if (typeof e.routeName !== 'string') continue
    if (typeof e.title !== 'string') continue
    if (typeof e.ts !== 'number' || !Number.isFinite(e.ts)) continue
    out.push({ fullPath: e.fullPath, routeName: e.routeName, title: e.title, ts: e.ts })
  }
  return out.slice(0, RECENT_TRAIL_LIMIT)
}

/**
 * 页面名解析（尽力而为，不猜）：2026-10-27 Task 8 起薄委托共享解析器
 * page-presentation.pageTitle（推演签/常用入口/工作台兄弟/阶段·页签/旧深链/
 * 岛屿/末端词典 → 路由名 → fullPath，回落链与标签源逐字不变）。
 */
export function recentTitle(route: RecentRouteLike, locale: RecentLocale): string {
  return pageTitle(route, locale)
}

/** 相对时间：<1 分钟（含时钟偏移的未来值）刚刚；<1 小时 N 分钟前；<24 小时
 *  N 小时前；超过 24 小时用绝对时间——落在昨天（日历日）标「昨天 HH:MM」，
 *  更早 M/D HH:MM，跨年带年份。 */
export function formatRecentTime(ts: number, now: number, locale: RecentLocale): string {
  const diff = now - ts
  const zh = locale === 'zh'
  if (diff < 60_000) return zh ? '刚刚' : 'just now'
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000)
    return zh ? `${m} 分钟前` : `${m} min ago`
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000)
    return zh ? `${h} 小时前` : `${h} h ago`
  }
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const nowDate = new Date(now)
  const yesterday = new Date(nowDate)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return zh ? `昨天 ${hm}` : `Yesterday ${hm}`
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  return d.getFullYear() === nowDate.getFullYear() ? `${md} ${hm}` : `${d.getFullYear()}/${md} ${hm}`
}

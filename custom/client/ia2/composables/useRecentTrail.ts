// overlay/custom/client/ia2/composables/useRecentTrail.ts
// 最近轨迹状态与持久化（2026-10-23「常用 · 最近」批）：纯逻辑在 recent-trail.ts
// （可单测），本 composable 只持响应式栈 + localStorage 读写容错。路由 watch 由
// 挂载方（IaSideNav）安装——本模块不 import @/router（模块级
// createWebHashHistory 在 node 测试环境即炸，2026-10-18 已知坑同源）。
// 每次调用各持一份栈（挂载时自 localStorage 重建）：侧栏同屏只挂一份，无共享
// 必要；跨挂载一致性由持久化保证，也免去单例带来的测试隔离负担。
import { ref, type Ref } from 'vue'
import {
  RECENT_TRAIL_STORAGE_KEY,
  parseRecentTrail,
  pushRecent,
  recentTitle,
  type RecentEntry,
  type RecentLocale,
  type RecentRouteLike,
} from '../recent-trail'

function readStored(): RecentEntry[] {
  // jsdom/SSR 等无 localStorage 环境安全降级为仅内存
  if (typeof localStorage === 'undefined') return []
  try {
    return parseRecentTrail(localStorage.getItem(RECENT_TRAIL_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeStored(entries: readonly RecentEntry[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(RECENT_TRAIL_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // 隐私模式/配额等写失败：轨迹仅保内存，不因持久化炸导航
  }
}

export function useRecentTrail() {
  const entries: Ref<RecentEntry[]> = ref(readStored())

  /** 记一次导航：标题按当时 locale 解析固化；去重/置顶/截断在纯函数核 */
  function record(route: RecentRouteLike, locale: RecentLocale): void {
    // 弹窗深链不是新页面；背景页仍按不含检索参数的地址记录。
    if (route.query?.search === '1') return
    entries.value = pushRecent(entries.value, {
      fullPath: route.fullPath,
      routeName: String(route.name ?? ''),
      title: recentTitle(route, locale),
      ts: Date.now(),
    })
    writeStored(entries.value)
  }

  /** 清空轨迹（面板「清空」）：栈与 localStorage 一起清 */
  function clear(): void {
    entries.value = []
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(RECENT_TRAIL_STORAGE_KEY)
      } catch {
        // 读不到比写不进更罕见，同样静默：内存栈已清即达成交互语义
      }
    }
  }

  return { entries, record, clear }
}

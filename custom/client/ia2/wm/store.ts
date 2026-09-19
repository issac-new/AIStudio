// overlay/custom/client/ia2/wm/store.ts
// 窗口管理 store（2026-09-18 统一导航 /goal 追加）：最小化任务栏（dock）状态。
// 每个「独立操作页」= 一个面板（含其子路由/tab 态），最小化即收进
// 底部任务栏（记录完整路径），点击 chip 恢复导航；同路径去重。
// 2026-09-19 v12：area 投影收敛单视图 collab。
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { areaForPath, type IaAreaKey } from '../routes'

export interface MinimizedPanel {
  /** 完整路径（含 query，恢复导航用） */
  path: string
  /** 所属视图（chip 标签取视图词表） */
  area: IaAreaKey
  /** 入列时间（去重保序用） */
  at: number
}

export const useWmStore = defineStore('ia2-wm', () => {
  const minimized = ref<MinimizedPanel[]>([])

  /** 最小化当前页：同路径去重（刷新时间戳），新条目插队首 */
  function minimize(path: string): void {
    // path 含 query（route.fullPath），视图投影前剥掉（v12：/app 家族统一 collab）
    const area = areaForPath(path.split('?')[0]) ?? 'collab'
    const rest = minimized.value.filter(p => p.path !== path)
    minimized.value = [{ path, area, at: Date.now() }, ...rest]
  }

  /** 恢复（点击 chip）：出列并返回该面板（调用方负责导航） */
  function restore(path: string): MinimizedPanel | null {
    const hit = minimized.value.find(p => p.path === path) ?? null
    minimized.value = minimized.value.filter(p => p.path !== path)
    return hit
  }

  /** 直接丢弃（chip × 按钮），不导航 */
  function dismiss(path: string): void {
    minimized.value = minimized.value.filter(p => p.path !== path)
  }

  function clear(): void {
    minimized.value = []
  }

  return { minimized, minimize, restore, dismiss, clear }
})

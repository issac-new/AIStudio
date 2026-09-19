// overlay/custom/client/ia2/store/ia.ts
// 驾驶舱单页全局状态：当前视图。
// 当前视图由 IaShell 以 areaForPath 投影（routes.ts 纯函数为唯一事实源），
// store 只持有结果，不自算。2026-09-19 v12 统一视图：/app 家族唯一视图 collab。
// 2026-09-18 统一导航 Task 5：RETRO 回退开关随兼容守卫退役删除（零消费确认）。
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Router } from 'vue-router'
import { IA_AREAS, areaForPath, type IaAreaKey } from '../routes'

export const useIaStore = defineStore('ia2', () => {
  /** 当前视图（场景条高亮依据；v12 双视图——/app 侧唯一场景） */
  const currentArea = ref<IaAreaKey>('collab')

  /** 由路径投影当前区域（IaShell watch route.path 驱动） */
  function syncFromPath(path: string): void {
    const area = areaForPath(path)
    if (area) currentArea.value = area
  }

  /** 跳转到区域（IaNav 点击 / g+数字键盘共用入口） */
  function goToArea(router: Router, key: IaAreaKey): void {
    const area = IA_AREAS.find(a => a.key === key)
    if (area) void router.push(area.path)
  }

  return { currentArea, syncFromPath, goToArea }
})

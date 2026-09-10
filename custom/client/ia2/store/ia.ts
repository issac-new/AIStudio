// overlay/custom/client/ia2/store/ia.ts
// P3 Task 3 — 新 IA 全局状态：当前区域 + RETRO 回退开关。
// 当前区域由 IaShell 以 areaForPath 投影（routes.ts 纯函数为唯一事实源），
// store 只持有结果，不自算；IaNav 读 store 高亮、经 goToArea 跳转。
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Router } from 'vue-router'
import { features } from '../../../../config/features'
import { IA_AREAS, areaForPath, type IaAreaKey } from '../routes'

export const useIaStore = defineStore('ia2', () => {
  /** 回退开关（VITE_IA_RETRO=1 时为 true，侧栏双入口、兼容守卫放行） */
  const retro = features.iaRetro

  /** 当前区域（IaNav 高亮依据；默认总览） */
  const currentArea = ref<IaAreaKey>('overview')

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

  return { retro, currentArea, syncFromPath, goToArea }
})

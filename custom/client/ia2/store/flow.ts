// overlay/custom/client/ia2/store/flow.ts
// v12 工作台全局状态（2026-09-19 统一视图）：对象选择 + 三栏布局。
// 2026-10-21 治理面收口：⚙管理台覆盖层（GovOverlay）退役——原七区能力的
// 唯一归属为 ⑥治理/①搭建/④看板/设置，入口直接路由过去，store 不再持有覆盖层态。
// 纪律：store 只持有选择/UI 态，派生数据一律走 adapters/flow.ts 纯函数
// （可测）；选择与路由子路径的同步由 WorkbenchView 负责（路由是选择的
// 唯一持久载体，store 只做内存投影，刷新/深链直达时不失真）。
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { StreamSelection } from '../adapters/flow'

/** 工作台三栏布局态（v12.3 用户裁定：窗控改栏控——左右折叠/中栏最大化） */
export interface FlowLayout {
  leftFolded: boolean
  rightFolded: boolean
}

export const useFlowStore = defineStore('ia2-flow', () => {
  /** 当前选中对象（null=未选；WorkbenchView 以路由参数为准双向同步） */
  const selected = ref<StreamSelection | null>(null)

  /** 三栏布局（v12.3：栏控；中栏最大化=两侧齐折派生态，不再独占布尔） */
  const layout = ref<FlowLayout>({ leftFolded: false, rightFolded: false })

  /** 中栏最大化 = 左右两栏同时折叠（派生态，单一事实源是两个折叠位） */
  const centerMaximized = computed(() => layout.value.leftFolded && layout.value.rightFolded)

  function toggleFold(side: 'left' | 'right'): void {
    // 键是 <side>Folded（非 side 本身——后者会新增错键而折叠位恒 false）
    const key = side === 'left' ? 'leftFolded' : 'rightFolded'
    layout.value = { ...layout.value, [key]: !layout.value[key] }
  }

  /** 中栏最大化/还原：开=两侧齐折；关=两侧齐展（不记忆中间态，语义直白） */
  function toggleCenterMax(): void {
    const target = !centerMaximized.value
    layout.value = { leftFolded: target, rightFolded: target }
  }

  function select(sel: StreamSelection | null): void {
    selected.value = sel
  }

  return {
    selected,
    layout, centerMaximized, toggleFold, toggleCenterMax,
    select,
  }
})

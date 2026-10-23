// overlay/custom/client/ia2/store/flow.ts
// v12 工作台全局状态（2026-09-19 统一视图）：对象选择 + 三栏布局。
// 2026-10-21 治理面收口：⚙管理台覆盖层（GovOverlay）退役——原七区能力的
// 唯一归属为 ⑥治理/①搭建/④看板/设置，入口直接路由过去，store 不再持有覆盖层态。
// 2026-10-23 栏控统一轮（用户裁定）：三栏一致「最小化（折叠本栏）+ 最大化
// （本栏独占）」窗口语义——布局仍只有三个折叠位布尔，独占栏纯派生，无独立状态。
// 纪律：store 只持有选择/UI 态，派生数据一律走 adapters/flow.ts 纯函数
// （可测）；选择与路由子路径的同步由 WorkbenchView 负责（路由是选择的
// 唯一持久载体，store 只做内存投影，刷新/深链直达时不失真）。
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { StreamSelection } from '../adapters/flow'

export type FlowColumn = 'left' | 'center' | 'right'

/** 工作台三栏布局态（折叠位是唯一事实源；独占=派生） */
export interface FlowLayout {
  leftFolded: boolean
  centerFolded: boolean
  rightFolded: boolean
}

/** 由折叠位派生独占栏：恰有一栏展开时该栏独占（全展/多展/全折=none） */
export function maximizedColumn(l: FlowLayout): FlowColumn | 'none' {
  const unfolded = ([['left', !l.leftFolded], ['center', !l.centerFolded], ['right', !l.rightFolded]] as Array<[FlowColumn, boolean]>)
    .filter(([, open]) => open)
  return unfolded.length === 1 ? unfolded[0][0] : 'none'
}

export const useFlowStore = defineStore('ia2-flow', () => {
  /** 当前选中对象（null=未选；WorkbenchView 以路由参数为准双向同步） */
  const selected = ref<StreamSelection | null>(null)

  /** 三栏布局：三个折叠位（centerFolded 2026-10-23 新增；旧数据缺省中栏展开） */
  const layout = ref<FlowLayout>({ leftFolded: false, centerFolded: false, rightFolded: false })

  /** 当前独占栏（派生态；'none'=常规三栏/多栏视图） */
  const maximized = computed(() => maximizedColumn(layout.value))

  /** 兼容保留：中栏最大化 = 左右齐折（历史消费方与测试口径不变） */
  const centerMaximized = computed(() => maximized.value === 'center')

  function toggleFold(side: FlowColumn): void {
    // 键是 <side>Folded（非 side 本身——后者会新增错键而折叠位恒 false）
    const key = `${side}Folded` as keyof FlowLayout
    layout.value = { ...layout.value, [key]: !layout.value[key] }
  }

  /** 最大化/还原某栏：已独占→三栏齐展（还原）；否则→只展该栏（其余齐折）。
   *  不记忆中间态：从独占还原回到标准三栏，语义直白。 */
  function toggleMax(side: FlowColumn): void {
    if (maximized.value === side) {
      layout.value = { leftFolded: false, centerFolded: false, rightFolded: false }
    } else {
      layout.value = { leftFolded: side !== 'left', centerFolded: side !== 'center', rightFolded: side !== 'right' }
    }
  }

  /** 兼容保留：原中栏最大化语义（toggleMax('center') 等价） */
  function toggleCenterMax(): void {
    toggleMax('center')
  }

  function select(sel: StreamSelection | null): void {
    selected.value = sel
  }

  return {
    selected,
    layout, maximized, centerMaximized, toggleFold, toggleMax, toggleCenterMax,
    select,
  }
})

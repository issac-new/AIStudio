import { defineStore } from 'pinia'
import { ref } from 'vue'

// Right-panel phase store, split out of the former god-store.
// Reference: element-web RightPanelStorePhases (ThreadPanel / ThreadView / RoomSummary ...).
export type RightPanelPhase =
  | 'RoomSummary'
  | 'MemberList'
  | 'MemberInfo'
  | 'ThreadPanel' // 列表(对应上游 RightPanelPhases.ThreadPanel)
  | 'ThreadView' // 单个 thread 详情(对应上游 RightPanelPhases.ThreadView)
  | null

export type ThreadFilterType = 'all' | 'my'

interface PhaseHistoryEntry {
  phase?: RightPanelPhase
  memberId?: string
  threadRootId?: string
}

export const useMatrixRightPanelStore = defineStore('matrix-right-panel', () => {
  const rightPanelPhase = ref<RightPanelPhase>(null)
  const rightPanelMemberUserId = ref<string | null>(null)
  const rightPanelThreadRootId = ref<string | null>(null)
  const rightPanelThreadFilter = ref<ThreadFilterType>('all')
  const rightPanelPhaseHistory = ref<PhaseHistoryEntry[]>([])

  function snapshot(): PhaseHistoryEntry {
    return {
      phase: rightPanelPhase.value ?? undefined,
      memberId: rightPanelMemberUserId.value ?? undefined,
      threadRootId: rightPanelThreadRootId.value ?? undefined,
    }
  }

  function restore(entry: PhaseHistoryEntry): void {
    rightPanelPhase.value = entry.phase ?? null
    rightPanelMemberUserId.value = entry.memberId ?? null
    rightPanelThreadRootId.value = entry.threadRootId ?? null
  }

  function pushHistory(): void {
    rightPanelPhaseHistory.value.push(snapshot())
  }

  function openRoomSummary() {
    pushHistory()
    rightPanelPhase.value = 'RoomSummary'
    rightPanelMemberUserId.value = null
    rightPanelThreadRootId.value = null
  }

  function openMemberList() {
    pushHistory()
    rightPanelPhase.value = 'MemberList'
    rightPanelMemberUserId.value = null
    rightPanelThreadRootId.value = null
  }

  function openMemberInfo(userId: string) {
    pushHistory()
    rightPanelPhase.value = 'MemberInfo'
    rightPanelMemberUserId.value = userId
    rightPanelThreadRootId.value = null
  }

  /** 打开话题列表(对应上游 ThreadPanel phase) */
  function openThreadPanel() {
    pushHistory()
    rightPanelPhase.value = 'ThreadPanel'
    rightPanelThreadRootId.value = null
    rightPanelMemberUserId.value = null
  }

  /** 打开单个话题详情(对应上游 ThreadView phase) */
  function openThreadView(rootEventId: string) {
    pushHistory()
    rightPanelPhase.value = 'ThreadView'
    rightPanelThreadRootId.value = rootEventId
    rightPanelMemberUserId.value = null
  }

  /** 切换话题列表的 All/My 过滤 */
  function setThreadFilter(filter: ThreadFilterType) {
    rightPanelThreadFilter.value = filter
  }

  /**
   * 决策规则(对齐 spec §3.1):
   *   当前 phase === 'ThreadView' → 回到 'ThreadPanel'
   *   否则(从 ThreadPanel 调)→ 关闭 panel
   */
  function clearThreadView() {
    if (rightPanelPhase.value === 'ThreadView') {
      rightPanelPhase.value = 'ThreadPanel'
      rightPanelThreadRootId.value = null
    } else {
      closeRightPanel()
    }
  }

  function closeRightPanel() {
    rightPanelPhase.value = null
    rightPanelMemberUserId.value = null
    rightPanelThreadRootId.value = null
    rightPanelThreadFilter.value = 'all'
    rightPanelPhaseHistory.value = []
  }

  function rightPanelBack() {
    const history = rightPanelPhaseHistory.value
    if (history.length > 0) {
      restore(history[history.length - 1])
      rightPanelPhaseHistory.value = history.slice(0, -1)
    } else {
      closeRightPanel()
    }
  }

  return {
    rightPanelPhase,
    rightPanelMemberUserId,
    rightPanelThreadRootId,
    rightPanelThreadFilter,
    openRoomSummary,
    openMemberList,
    openMemberInfo,
    openThreadPanel,
    openThreadView,
    setThreadFilter,
    clearThreadView,
    closeRightPanel,
    rightPanelBack,
  }
})

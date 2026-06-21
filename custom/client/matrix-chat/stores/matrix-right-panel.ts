import { defineStore } from 'pinia'
import { ref } from 'vue'

// Right-panel phase store, split out of the former god-store.
// Reference: element-web RightPanelStorePhases.
// The god-store (matrix.ts) composes this and exposes its members via the
// useMatrixStore() facade so existing call-sites keep working until S3
// migrates them to this granular store.
export type RightPanelPhase = 'RoomSummary' | 'MemberList' | 'MemberInfo' | null

export const useMatrixRightPanelStore = defineStore('matrix-right-panel', () => {
  const rightPanelPhase = ref<RightPanelPhase>(null)
  const rightPanelMemberUserId = ref<string | null>(null)
  const rightPanelPhaseHistory = ref<Array<{ phase?: RightPanelPhase; memberId?: string }>>([])

  function openRoomSummary() {
    rightPanelPhaseHistory.value.push({ phase: rightPanelPhase.value ?? undefined, memberId: rightPanelMemberUserId.value ?? undefined })
    rightPanelPhase.value = 'RoomSummary'
    rightPanelMemberUserId.value = null
  }

  function openMemberList() {
    rightPanelPhaseHistory.value.push({ phase: rightPanelPhase.value ?? undefined, memberId: rightPanelMemberUserId.value ?? undefined })
    rightPanelPhase.value = 'MemberList'
    rightPanelMemberUserId.value = null
  }

  function openMemberInfo(userId: string) {
    rightPanelPhaseHistory.value.push({ phase: rightPanelPhase.value ?? undefined, memberId: rightPanelMemberUserId.value ?? undefined })
    rightPanelPhase.value = 'MemberInfo'
    rightPanelMemberUserId.value = userId
  }

  function closeRightPanel() {
    rightPanelPhase.value = null
    rightPanelMemberUserId.value = null
    rightPanelPhaseHistory.value = []
  }

  function rightPanelBack() {
    const history = rightPanelPhaseHistory.value
    if (history.length > 0) {
      const prev = history[history.length - 1]
      rightPanelPhase.value = prev.phase ?? null
      rightPanelMemberUserId.value = prev.memberId ?? null
      rightPanelPhaseHistory.value = history.slice(0, -1)
    } else {
      closeRightPanel()
    }
  }

  // toggleRightPanel lives in the god-store for now because it coordinates with
  // the thread store (clearThreadView). It will move once the thread store exists.

  return {
    rightPanelPhase,
    rightPanelMemberUserId,
    openRoomSummary,
    openMemberList,
    openMemberInfo,
    closeRightPanel,
    rightPanelBack,
  }
})

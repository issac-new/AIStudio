// overlay/custom/client/ia2/composables/useSitCounts.ts
// v12.3 态势计数单一聚合（自 WorkbenchView.vue 抽出，页头 chips 与工作台共用）。
// 数据源全走既有 store：workspace.tasks / buildWaiting / loopStore.loops /
// chatStore.sessions ∪ matrixRoom.sortedRooms / teamRegistry.accounts /
// cockpit.fleetSessions。pinia 单例——多处 useStore 无重复成本。
import { computed } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useChatStore } from '@/stores/hermes/chat'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { buildWaiting, formatWaitAge } from '../adapters/waiting'
import { buildLoopRows } from '../adapters/flow'
import { useNowTick } from './useNowTick'

export function useSitCounts() {
  const workspace = useWorkspaceStore()
  const runsStore = useRunCenterStore()
  const cockpit = useCockpitStore()
  const loopStore = useLoopStore()
  const chatStore = useChatStore()
  const matrixRoom = useMatrixRoomStore()
  const groupChat = useGroupChatStore()
  const teamRegistry = useTeamRegistryStore()
  const now = useNowTick()

  const waitItems = computed(() => buildWaiting(
    workspace.tasks.map(x => ({ id: x.id, title: x.title, status: x.status, assignee: x.assignee, createdAt: x.createdAt })),
    runsStore.runs ?? [],
    cockpit.fleetSessions ?? [],
    now.value,
  ))

  /** 跨板开放态任务（未完成未归档）——v12.4 任务 chip/面板口径单一来源 */
  const openTasks = computed(() =>
    workspace.tasks.filter(x => x.status !== 'done' && x.status !== 'archived'))

  /** 任务统计：开放态总数 + 分状态计数（9 值词表按序呈现，零计数不进） */
  const tasks = computed(() => {
    const list = openTasks.value
    const byStatus: Record<string, number> = {}
    for (const x of list) byStatus[x.status] = (byStatus[x.status] ?? 0) + 1
    return {
      total: list.length,
      byStatus,
      running: byStatus['running'] ?? 0,
      review: byStatus['review'] ?? 0,
    }
  })

  const sessionCount = computed(() =>
    ((chatStore.sessions ?? []).length) + ((matrixRoom.sortedRooms ?? []).length) + ((groupChat.rooms ?? []).length))

  const loopRows = computed(() => buildLoopRows(loopStore.loops ?? [], now.value))
  const loopBlocked = computed(() => loopRows.value.filter(l => l.blocked).length)

  const accounts = computed(() => teamRegistry.accounts ?? [])

  const online = computed(() => ({
    people: accounts.value.length,
    agents: accounts.value.reduce((n, a) => n + (a.agentTeams?.reduce((m, at) => m + at.profiles.length, 0) ?? 0), 0),
    machines: (cockpit.fleetSessions ?? []).length,
  }))

  /** 最久等待人类可读标签（3h / 2d；空=无等待项） */
  const oldestWaitLabel = computed(() => {
    const oldest = waitItems.value.reduce((acc, w) => Math.min(acc, w.ts), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) return ''
    return formatWaitAge(now.value - oldest)
  })

  return { waitItems, tasks, openTasks, sessionCount, loopTotal: computed(() => loopRows.value.length), loopBlocked, loopRows, accounts, online, oldestWaitLabel }
}

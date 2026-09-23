// overlay/custom/client/ia2/composables/useSitCounts.ts
// v12.3 态势计数单一聚合（自 WorkbenchView.vue 抽出，页头 chips 与工作台共用）。
// 数据源全走既有 store：workspace.tasks / buildWaiting / loopStore.loops /
// chatStore.sessions ∪ matrixRoom.sortedRooms / teamRegistry.accounts /
// cockpit.fleetSessions。pinia 单例——多处 useStore 无重复成本。
import { computed, ref, watch } from 'vue'
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
import { loopRest } from '@/custom/loop/api/loop-rest'
import type { TaskContract } from '@/custom/loop/types'
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

  const loopContracts = ref<TaskContract[]>([])
  watch(
    () => (loopStore.loops ?? []).map(l => l.id).join(','),
    async (ids) => {
      if (!ids) {
        loopContracts.value = []
        return
      }
      // R6-A reason chip 数据源：拉各 loop contracts（并发，失败单 loop 不阻塞）
      const list = ids.split(',').filter(Boolean)
      const settled = await Promise.allSettled(list.map(id => loopRest.getContracts(id)))
      loopContracts.value = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []))
    },
    { immediate: true },
  )
  const loopRows = computed(() => buildLoopRows(loopStore.loops ?? [], now.value, loopContracts.value))
  const loopBlocked = computed(() => loopRows.value.filter(l => l.blocked).length)

  const accounts = computed(() => teamRegistry.accounts ?? [])

  /** v12.5 在线级联：看板行（slug/name/开放任务数；任务里出现而板清单缺失的
   *  slug 兜底补行）+ 团队（profiles↔boards 关联，cockpit.bootstrap 装载） */
  const boardRows = computed(() => {
    const openByBoard = new Map<string, number>()
    for (const t of openTasks.value) openByBoard.set(t.boardSlug, (openByBoard.get(t.boardSlug) ?? 0) + 1)
    const known = new Set((workspace.boards ?? []).map(b => b.slug))
    const rows = (workspace.boards ?? []).map(b => ({ slug: b.slug, name: b.name, open: openByBoard.get(b.slug) ?? 0 }))
    for (const [slug, open] of openByBoard) {
      if (!known.has(slug)) rows.push({ slug, name: slug, open })
    }
    return rows
  })

  const teams = computed(() => (cockpit.teams ?? []).map(t => ({
    name: t.name, profiles: t.profiles ?? [], boards: t.boards ?? [],
  })))

  /** v12.5 在线级联。口径（aipaydev 推演实锤 cockpit-online-zero）：
   *  - machines：fleetSessions 快照数（跨 profile 活跃会话，1.5s tick，永远反映真实在线）。
   *  - people/agents：team-registry 注册流（Matrix 注册房 state 事件）——registry 空
   *    （未登录 Matrix / 团队未注册，如 aipaydev sim 各机独立部署）时恒 0，UI 显
   *    0 people · 0 agents 误导。此时以 fleetSessions 聚合兜底：people=活跃 profile
   *    去重数、agents=活跃会话去重数（每会话一个 agent runner）。registry 有数据
   *    时维持原口径（注册面是权威）。 */
  const online = computed(() => {
    const fleet = cockpit.fleetSessions ?? []
    const registryPeople = accounts.value.length
    const registryAgents = accounts.value.reduce((n, a) => n + (a.agentTeams?.reduce((m, at) => m + at.profiles.length, 0) ?? 0), 0)
    if (registryPeople > 0 || registryAgents > 0) {
      return { people: registryPeople, agents: registryAgents, machines: fleet.length }
    }
    const profiles = new Set(fleet.map(s => s.profile || 'default'))
    return { people: profiles.size, agents: fleet.length, machines: fleet.length }
  })

  /** 最久等待人类可读标签（3h / 2d；空=无等待项） */
  const oldestWaitLabel = computed(() => {
    const oldest = waitItems.value.reduce((acc, w) => Math.min(acc, w.ts), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) return ''
    return formatWaitAge(now.value - oldest)
  })

  return { waitItems, tasks, openTasks, sessionCount, loopTotal: computed(() => loopRows.value.length), loopBlocked, loopRows, accounts, online, oldestWaitLabel, boardRows, teams }
}

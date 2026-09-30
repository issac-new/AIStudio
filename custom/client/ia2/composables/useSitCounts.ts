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
import { useKanbanStore } from '@/stores/hermes/kanban'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { buildWaiting, formatWaitAge } from '../adapters/waiting'
import { buildLoopRows } from '../adapters/flow'
import { loopRest } from '@/custom/loop/api/loop-rest'
import type { TaskContract } from '@/custom/loop/types'
import { useNowTick } from './useNowTick'
import { usePlatformsStore } from '../store/platforms'

export function useSitCounts() {
  const workspace = useWorkspaceStore()
  const runsStore = useRunCenterStore()
  const cockpit = useCockpitStore()
  const loopStore = useLoopStore()
  const chatStore = useChatStore()
  const matrixRoom = useMatrixRoomStore()
  const groupChat = useGroupChatStore()
  const teamRegistry = useTeamRegistryStore()
  const kanbanStore = useKanbanStore()
  const platformsStore = usePlatformsStore()
  // 网关探测轮询随首个态势消费方启动（retain 引用计数，shell 生命周期内常驻）
  platformsStore.retain()
  const now = useNowTick()

  /** matrix 客户端已建立连接=本人在线（在线三数里「人」的底线真值） */
  function matrixConnected(): boolean {
    try { return !!useMatrixClientStore().client?.isLoggedIn?.() } catch { return false }
  }

  /** aipaydev cockpit-online-zero 动态兜底：活跃房间 joined 成员 presence=online
   *  的 Matrix 账号去重（matrix-sdk 自动维护 presence，非响应式——由 now tick
   *  驱动重算）。连接未建立/无房间时为空集。 */
  function collectPresencePeople(): Set<string> {
    const out = new Set<string>()
    try {
      const client = useMatrixClientStore().client
      if (!client) return out
      for (const room of matrixRoom.sortedRooms ?? []) {
        const members = client.getRoom(room.roomId)?.getJoinedMembers() ?? []
        for (const member of members) {
          if (member.presence === 'online' && member.userId) out.add(member.userId)
        }
      }
    } catch { /* presence 探测失败按 0 处理 */ }
    return out
  }

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

  /** v12.5 在线级联。口径（aipaydev 推演实锤 cockpit-online-zero；2026-09-23
   *  用户裁决：动态探测优先，不依赖静态注册表）：
   *  - machines：fleetSessions 快照数（跨 profile 活跃会话，1.5s tick，永远反映真实在线）。
   *  - people：registry（注册面权威）→ Matrix presence（活跃房间 joined 成员
   *    presence=online 的账号去重，随连接动态维护）→ fleetSessions profile 去重兜底。
   *  - agents：registry → max(fleetSessions 会话数, 看板 running 任务 assignee 去重
   *    （看板运行态真值，覆盖 gateway 跑任务但非 studio 会话的场景）。
   *  presence 读取经 now tick 驱动重算（matrix-sdk 内部状态非响应式）。 */
  const online = computed(() => {
    void now.value
    const fleet = cockpit.fleetSessions ?? []
    // 网关真值（cockpit-online-zero 根治 2026-09-30）：fleetSessions=studio 会话面，
    // agent 走网关通道时不在此列——机器/智能体以 ia2-platforms 网关探测为准：
    // 机器=网关实例（running 即 ≥1），智能体=网关连通通道的去重档案数。
    const gwState = platformsStore.gatewayState
    const gw = (gwState?.value ?? gwState) === 'running'  // mock 工厂可能返回 ref 未解包，双态兼容
    const gwPlatforms = (platformsStore.platforms?.value ?? platformsStore.platforms ?? []) as Array<{ state?: string; profile?: string }>
    const gwAgents = new Set(
      gwPlatforms
        .filter(p => p.state === 'connected' && p.profile)
        .map(p => p.profile as string),
    ).size
    const registryPeople = accounts.value.length
    const registryAgents = accounts.value.reduce((n, a) => n + (a.agentTeams?.reduce((m, at) => m + at.profiles.length, 0) ?? 0), 0)
    if (registryPeople > 0 || registryAgents > 0) {
      return { people: registryPeople, agents: Math.max(registryAgents, gwAgents), machines: Math.max(fleet.length, gw ? 1 : 0) }
    }
    const profiles = new Set(fleet.map(s => s.profile || 'default'))
    const people = collectPresencePeople()
    const runningAssignees = new Set(
      (kanbanStore.tasks ?? [])
        .filter((t: { status: string; assignee?: string | null }) => t.status === 'running' && t.assignee)
        .map((t: { assignee?: string | null }) => t.assignee as string),
    )
    // 本人已登录即在线（人≥登录本人，run5 口径补齐）：matrix client 只在聊天视图
    // initClient 建连，驾驶舱首屏 client 未起时仅认 isLoggedIn 会把已登录本人漏成 0
    // ——补 cockpit 会话名兜底（有会话名=已登录本人在场）。
    const selfOnline = matrixConnected() || !!cockpit.currentUserName ? 1 : 0
    return {
      people: Math.max(people.size, profiles.size, selfOnline),
      agents: Math.max(fleet.length, runningAssignees.size, gwAgents),
      machines: Math.max(fleet.length, gw ? 1 : 0),
    }
  })

  /** 最久等待人类可读标签（3h / 2d；空=无等待项） */
  const oldestWaitLabel = computed(() => {
    const oldest = waitItems.value.reduce((acc, w) => Math.min(acc, w.ts), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(oldest) || oldest <= 0) return ''
    return formatWaitAge(now.value - oldest)
  })

  return { waitItems, tasks, openTasks, sessionCount, loopTotal: computed(() => loopRows.value.length), loopBlocked, loopRows, accounts, online, oldestWaitLabel, boardRows, teams }
}

// overlay/custom/client/ia2/composables/useSitCounts.ts
// v12.3 态势计数单一聚合（自 WorkbenchView.vue 抽出，页头 chips 与工作台共用）。
// 数据源全走既有 store：workspace.dailyTasks / buildWaiting / loopStore.loops /
// chatStore.sessions ∪ matrixRoom.sortedRooms / teamRegistry.accounts /
// cockpit.fleetSessions。pinia 单例——多处 useStore 无重复成本。
import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useChatStore } from '@/stores/hermes/chat'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { stripHomeserver } from '@/custom/ui/mxid-display'
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
  // 网关探测轮询随首个态势消费方启动（retain 引用计数）。retain 必须与 release 配对：
  // 本组合式函数每次调用 +1，消费方（SitDetailPanel 等）随面板反复挂载，只增不减会
  // 让计数单调累积、末客卸载后轮询永不停止（与 useSharedArm 的平衡语义对齐）。
  platformsStore.retain()
  if (getCurrentScope()) onScopeDispose(() => platformsStore.release(), true)
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

  /** 日常态势只读 daily ref；旧 workspace 适配器仅回退到非 sim 投影，不把同 ID 的 sim 再算一次。 */
  const dailyTaskModels = computed(() => {
    if (Array.isArray(workspace.dailyTasks)) return workspace.dailyTasks.map(ref => ref.task)
    return (workspace.tasks ?? []).filter(task => task.source !== 'sim')
  })

  const waitItems = computed(() => buildWaiting(
    dailyTaskModels.value.map(x => ({ id: x.id, title: x.title, status: x.status, assignee: x.assignee, createdAt: x.createdAt })),
    runsStore.runs ?? [],
    cockpit.fleetSessions ?? [],
    now.value,
  ))

  /** 跨板开放态任务（未完成未归档）——v12.4 任务 chip/面板口径单一来源 */
  const openTasks = computed(() =>
    dailyTaskModels.value.filter(x => x.status !== 'done' && x.status !== 'archived'))

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
    const dailyBoards = (workspace.boards ?? []).filter(b => b.source !== 'sim')
    const known = new Set(dailyBoards.map(b => b.slug))
    const rows = dailyBoards.map(b => ({ slug: b.slug, name: b.name, open: openByBoard.get(b.slug) ?? 0 }))
    for (const [slug, open] of openByBoard) {
      if (!known.has(slug)) rows.push({ slug, name: slug, open })
    }
    return rows
  })

  const teams = computed(() => (cockpit.teams ?? []).map(t => ({
    name: t.name, profiles: t.profiles ?? [], boards: t.boards ?? [],
  })))

  /** v12.5 在线级联 → Task 6 收敛（2026-10-27 产品一致性）。口径沿用户裁决链
   *  （2026-09-23 动态探测优先 / cockpit-online-zero 兜底 / 2026-09-30 网关真值）：
   *  - people = Matrix presence 在线集 ∪ 登录本人（union：本人不在 presence 集时
   *    不被 max 吞掉）。presence 可观测（client 建连且有房间）时注册面不顶替真值
   *    ——注册≠在线；不可观测时以注册账号数兜底取大（全零比错报更糟）。
   *    fleet 会话的 profile 是智能体档案而非人，不进 people（Task 6 失真②：单个
   *    FleetSession 不再给人/智能体/机器各加一）。
   *  - agents = max(网关连通 channel 去重档案, 看板 running assignee 去重, fleet
   *    会话数；presence 不可观测时并入注册档案兜底)。计数=各源量级取大（裁决
   *    口径），identities=同源身份并集（明细不隐藏任一真实在线来源）。
   *  - machines = max(fleet 会话数, 网关 running?1:0)；identities=fleet 会话行
   *    +网关伪实例（fleet 空而网关在跑时），与计数同长。
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
    const gwAgentProfiles = gwPlatforms
      .filter(p => p.state === 'connected' && p.profile)
      .map(p => String(p.profile))
    const gwAgents = new Set(gwAgentProfiles).size

    // presence 可观测性：client 建连且有已加入房间 → presence 是「人在线」真值；
    // 否则探测面缺失（未建连/无房间），注册面兜底（注册≠在线的观测边界）
    let clientOnline = false
    try { clientOnline = !!useMatrixClientStore().client } catch { /* store 未就绪按不可观测 */ }
    const presenceKnown = clientOnline && (matrixRoom.sortedRooms ?? []).length > 0
    const presencePeople = presenceKnown ? collectPresencePeople() : new Set<string>()
    // 本人已登录即在线（人≥登录本人底线）：matrix client 只在聊天视图 initClient
    // 建连，工作台首屏 client 未起时仅认 isLoggedIn 会把已登录本人漏成 0——补
    // cockpit 会话名兜底（有会话名=已登录本人在场）。本人已在 presence 集（mxid
    // 短名同源比对）则不重复计。
    const selfOnline = matrixConnected() || !!cockpit.currentUserName
    const selfName = cockpit.currentUserName || 'self'
    const samePerson = (a: string, b: string): boolean =>
      stripHomeserver(a).toLowerCase() === stripHomeserver(b).toLowerCase()
    const peopleSet = new Set(presencePeople)
    if (selfOnline && ![...peopleSet].some(p => samePerson(p, selfName))) peopleSet.add(selfName)
    const registryPeople = accounts.value.length
    const registryAgentProfiles = [...new Set(
      accounts.value.flatMap(a => (a.agentTeams ?? []).flatMap(at => at.profiles.map(String))))]
    const people = Math.max(peopleSet.size, presenceKnown ? 0 : registryPeople)

    const runningAssignees = [...new Set(
      (kanbanStore.tasks ?? [])
        .filter((t: { status: string; assignee?: string | null }) => t.status === 'running' && t.assignee)
        .map((t: { assignee?: string | null }) => t.assignee as string),
    )]
    const agents = Math.max(
      gwAgents, runningAssignees.length, fleet.length,
      presenceKnown ? 0 : registryAgentProfiles.length,
    )

    // identities 与计数同源（SitDetailPanel 在线树消费；计数与列表零割裂）：
    // people 取大基面为注册兜底时列注册账号（displayName 空时兜底短显），否则列
    // presence∪本人；agents=各源档案并集（计数是取大口径，明细不隐藏在线者）；
    // machines=fleet 会话行+网关伪实例，长度与计数一致。
    const peopleIdentities = !presenceKnown && registryPeople > peopleSet.size
      ? accounts.value.map(a => a.displayName || (String(a.userId ?? '').startsWith('@') ? stripHomeserver(a.userId) : String(a.userId ?? '')))
      : [...peopleSet]
    const agentIdentities: string[] = []
    const seenAgent = new Set<string>()
    for (const p of [
      ...gwAgentProfiles, ...runningAssignees,
      ...fleet.map(s => String(s.profile || 'default')),
      ...(presenceKnown ? [] : registryAgentProfiles),
    ]) {
      if (p && !seenAgent.has(p)) { seenAgent.add(p); agentIdentities.push(p) }
    }
    const machineIdentities: Array<{ id: string; label: string; profile: string; status: string }> =
      fleet.map(s => ({ id: s.id, label: s.title || s.profile || s.id, profile: s.profile || 'default', status: s.status }))
    if (gw && fleet.length === 0) {
      machineIdentities.push({ id: 'gateway', label: 'gateway', profile: 'gateway', status: 'running' })
    }
    return {
      people, agents,
      machines: Math.max(fleet.length, gw ? 1 : 0),
      identities: { people: peopleIdentities, agents: agentIdentities, machines: machineIdentities },
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

// 文件职责：cockpit store 的指挥中心切片（舰队/MCP 健康/团队注册表/收件箱/频道）。
// 拆分纪律：纯移动，无行为变更；外部依赖以 getter/ref 注入。
import { computed, ref } from 'vue'
import { fetchMcpServers } from '@/api/hermes/mcp'
import * as kv from '@/custom/shared/store/cockpit-kv'
import * as fleetAdapter from '@/custom/shared/adapters/fleet-adapter'
import type { FleetSession } from '@/custom/shared/adapters/fleet-adapter'
import * as teamsApi from '@/custom/shared/adapters/teams-adapter'
import type { TeamRecord } from '@/custom/shared/adapters/teams-adapter'
import * as inboxAdapter from '@/custom/shared/adapters/inbox-adapter'
import type { InboxItem, McpHealthSource } from '@/custom/shared/adapters/inbox-adapter'
import type { CollabChannel } from '@/custom/shared/store/cockpit'
import type { AttentionItem } from '@/custom/shared/adapters/attention-adapter'
import type { NotifyItem } from '@/custom/shared/adapters/notify-adapter'
import { parseTenant } from '@/custom/kanban/utils/tenant-parser'

export interface CommandSliceDeps {
  getAttention: () => AttentionItem[]
  getChatUnreadItems: () => NotifyItem[]
  getNotifyItems: () => NotifyItem[]
  getSelectedTask: () => any
  activeChannelId: { value: string | null }
}

export function createCockpitCommandSlice(deps: CommandSliceDeps) {
  const { getAttention, getChatUnreadItems, getNotifyItems, getSelectedTask, activeChannelId } = deps
  // ── 2.13 指挥中心：舰队（跨 profile 会话实时快照）──
  const fleetSessions = ref<FleetSession[]>([])
  const fleetConnected = ref(false)
  let _fleetStream: fleetAdapter.FleetStreamHandle | null = null
  let _fleetFp = ''

  /** 快照指纹守卫：会话级关键字段（状态/审批/澄清/队列）无变化时跳过赋值——
   *  服务端 1.5s tick 的快照总是新数组新身份，直接赋值会令 waitItems/online/
   *  inboxItems 等全量重算重渲染（身份抖动）。子代理明细不在 /app 消费面，不进指纹。 */
  function applyFleetSnapshot(sessions: FleetSession[]) {
    const fp = sessions
      .map(s => [s.id, s.status, s.isAborting, s.queueLength,
        s.approvals.map(a => a.approval_id).join(','), s.clarifies.map(c => c.clarify_id).join(',')]
        .join('|'))
      .join(';')
    if (fp === _fleetFp) return
    _fleetFp = fp
    fleetSessions.value = sessions
  }

  function initFleetStream() {
    if (_fleetStream) return
    _fleetStream = fleetAdapter.connectFleetStream({
      onSnapshot: snapshot => { applyFleetSnapshot(snapshot.sessions) },
      onStatus: connected => { fleetConnected.value = connected },
    })
    // v12 性能收敛（2026-09-21）：不再开第二条看板聚合 overview WS——该事件流
    // 由 workspace store 单点持有（useSharedArm 武装），双连接=每个 board 事件双份
    // 强制刷新 + 双份聚合请求。本 store 的 cockpitTasks 经 tasks computed 读 workspace。
  }

  function stopFleetStream() {
    _fleetStream?.close()
    _fleetStream = null
    fleetConnected.value = false
  }

  // ── MCP 连接健康（0.21.1 profile 级健康；60s 轮询，降级项进收件箱）──
  const mcpHealth = ref<McpHealthSource[]>([])
  let _mcpHealthTimer: ReturnType<typeof setInterval> | undefined

  async function refreshMcpHealth() {
    try {
      const resp = await fetchMcpServers()
      if (!resp || !Array.isArray(resp.servers)) return
      const checkedAt = Date.now()
      if (!resp.ok && resp.error) {
        // 运行时侧 MCP 模块不可用等整体故障 → 单条合成信号
        mcpHealth.value = [{ name: 'runtime', connected: false, error: resp.error, checkedAt }]
        return
      }
      mcpHealth.value = resp.servers.map(server => ({
        name: server.name,
        connected: server.connected === true,
        error: server.error ?? null,
        checkedAt,
      }))
    } catch {
      // 网络失败/接口不可达：保持上次状态，不产生误报
    }
  }

  function initMcpHealthPoll() {
    if (_mcpHealthTimer) return
    void refreshMcpHealth()
    _mcpHealthTimer = setInterval(() => { void refreshMcpHealth() }, 60_000)
  }

  function stopMcpHealthPoll() {
    if (_mcpHealthTimer) {
      clearInterval(_mcpHealthTimer)
      _mcpHealthTimer = undefined
    }
    mcpHealth.value = []
  }

  const fleetSessionsFiltered = computed(() => {
    const profiles = teamProfileFilter.value
    if (!profiles) return fleetSessions.value
    const allow = new Set(profiles)
    return fleetSessions.value.filter(s => allow.has(s.profile || 'default'))
  })

  /** 就地审批（跨 profile，2.13）：成功后本地摘除该审批，等下一拍快照对齐 */
  async function respondFleetApproval(sessionId: string, approvalId: string, choice: 'once' | 'session' | 'always' | 'deny') {
    try {
      const result = await teamsApi.respondFleetApproval(sessionId, approvalId, choice)
      if (result.resolved) {
        fleetSessions.value = fleetSessions.value.map(s => s.id === sessionId
          ? { ...s, approvals: s.approvals.filter(a => a.approval_id !== approvalId) }
          : s)
      }
      return result
    } catch (err) {
      return { resolved: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async function respondFleetClarify(sessionId: string, clarifyId: string, answer: string) {
    try {
      const result = await teamsApi.respondFleetClarify(sessionId, clarifyId, answer)
      if (result.resolved) {
        fleetSessions.value = fleetSessions.value.map(s => s.id === sessionId
          ? { ...s, clarifies: s.clarifies.filter(c => c.clarify_id !== clarifyId) }
          : s)
      }
      return result
    } catch (err) {
      return { resolved: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── 2.13 指挥中心：团队注册表 ──
  const teams = ref<TeamRecord[]>([])
  const activeTeamId = ref<string | null>(kv.getActiveTeam())
  const activeTeam = computed(() => teams.value.find(t => t.id === activeTeamId.value) || null)
  const teamProfileFilter = computed<string[] | null>(() => {
    const team = activeTeam.value
    if (!team || !team.profiles.length) return null
    return team.profiles
  })
  const _teamBoardSet = computed<Set<string> | null>(() => {
    const team = activeTeam.value
    if (!team || !team.boards.length) return null
    return new Set(team.boards)
  })

  async function loadTeams() {
    try {
      teams.value = await teamsApi.listTeams()
    } catch {
      teams.value = []
    }
  }

  function setActiveTeam(id: string | null) {
    activeTeamId.value = id
    kv.setActiveTeam(id)
  }

  async function saveTeam(input: { id: string | null; name: string; description?: string; color?: string; profiles?: string[]; boards?: string[] }) {
    const { id, ...body } = input
    const team = id
      ? await teamsApi.updateTeam(id, body)
      : await teamsApi.createTeam(body as teamsApi.TeamInput)
    await loadTeams()
    if (activeTeamId.value === team.id) setActiveTeam(team.id) // 触发过滤重算
    return team
  }

  async function deleteTeam(id: string) {
    await teamsApi.removeTeam(id)
    if (activeTeamId.value === id) setActiveTeam(null)
    await loadTeams()
  }

  // ── 2.13 指挥中心：统一注意力收件箱 ──
  const inboxItems = computed<InboxItem[]>(() => inboxAdapter.buildInboxItems({
    attention: getAttention(),
    fleet: fleetSessionsFiltered.value,
    chatUnreads: getChatUnreadItems(),
    notifyItems: getNotifyItems(),
    mcpHealth: mcpHealth.value,
  }))
  const inboxCount = computed(() => inboxItems.value.length)

  // ── 频道（按 kanban tenant 解析规则展示 room/session，点击跳转 matrix 房间）──
  const channels = computed<CollabChannel[]>(() => {
    const t = getSelectedTask()
    if (!t?.tenant) return []

    // Legacy channel formats used by cockpit tests and older kanban tasks:
    // matrix:<room_id_with_colons>:<label>
    // session:<session_id>@<agent>:<label>
    // group:<room_id_with_colons>:<label>
    if (t.tenant.startsWith('matrix:')) {
      const parts = t.tenant.split(':')
      if (parts.length >= 4) {
        const label = parts[parts.length - 1] || t.tenant
        const roomId = parts.slice(1, -1).join(':')
        return [{
          id: `ch-${t.id}`,
          taskId: t.id,
          kind: 'matrix',
          label,
          // 2026-09-18 统一导航 Task 3：matrixChat 家族随 cockpit 退役 → 沟通场景房间
          routeTarget: { name: 'ia2.commsRoom', params: { roomId } },
        }]
      }
      return []
    }
    if (t.tenant.startsWith('session:')) {
      const parts = t.tenant.split(':')
      return [{ id: `ch-${t.id}`, taskId: t.id, kind: 'chat', label: parts.slice(2).join(':') || parts[1] || t.tenant }]
    }
    if (t.tenant.startsWith('group:')) {
      const parts = t.tenant.split(':')
      return [{ id: `ch-${t.id}`, taskId: t.id, kind: 'group', label: parts[parts.length - 1] || t.tenant }]
    }

    const parsed = parseTenant(t.tenant)
    // 解析失败或普通 tenant 不展示为协作频道
    if (parsed.isLegacy || !parsed.roomId) return []

    // Matrix 聊天室（按 roomId + sessionId 拼装跳转）
    const label = parsed.topic
      ? `${parsed.groupChat}:${parsed.topic} @${parsed.userId}`
      : `${parsed.groupChat} @${parsed.userId}`
    return [{
      id: `ch-${t.id}`, taskId: t.id, kind: 'matrix',
      label,
      routeTarget: {
        name: 'ia2.commsRoom',
        params: { roomId: parsed.roomId },
        query: parsed.sessionId ? { session: parsed.sessionId } : {},
      },
    }]
  })
  const channelsForSelectedTask = computed(() => channels.value)
  const activeChannel = computed(() => channels.value.find(c => c.id === activeChannelId.value) ?? null)

  return {
    fleetSessions, fleetConnected, applyFleetSnapshot, initFleetStream, stopFleetStream, mcpHealth, refreshMcpHealth, initMcpHealthPoll, stopMcpHealthPoll, fleetSessionsFiltered, respondFleetApproval, respondFleetClarify, teams, activeTeamId, activeTeam, teamProfileFilter, _teamBoardSet, loadTeams, setActiveTeam, saveTeam, deleteTeam, inboxItems, inboxCount, channels, channelsForSelectedTask, activeChannel,
  }
}

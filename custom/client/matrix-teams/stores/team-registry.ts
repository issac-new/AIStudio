// overlay/custom/client/matrix-teams/stores/team-registry.ts
// 注册房间 store：发现（account data + 候选兜底）、建房（PL 矩阵）、写 account/leaders、
// Timeline 监听 → 全量 rebuild（房间事件低频，整房重投影换取无增量一致性漏洞）。
// 注意：不占用 matrixEventBus（单槽 ref，属 matrix-chat 模块内部），自挂 SDK 监听。
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { RoomEvent, type MatrixClient, type Room } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import {
  TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, REGISTRY_ROOM_POWER_LEVELS,
  isSwarmStudioEventType, parseLeadersContent, parseDutyContent,
  type AgentTeam, type DutyContent,
} from '../protocol'
import { projectAccounts, undeclaredMembers, type TeamAccountView, type RawStateEvent } from '../adapters/accounts'

/** 需要从房间 state 枚举的团队事件类型（协议中全部 state 型事件）。
 *  真实 SDK（v41 实测）RoomState.getStateEvents 必须带 eventType，无参调用恒返回 []；
 *  故按类型枚举而非无参全量拉取。 */
const TEAM_STATE_QUERY_TYPES: readonly string[] = [
  TEAM_EVENT_TYPES.account, TEAM_EVENT_TYPES.leaders, TEAM_EVENT_TYPES.duty,
]

/** 房间 state 事件归一化为 RawStateEvent。
 *  兼容两种形态：SDK MatrixEvent（getType/getStateKey/getContent + sender.userId）
 *  与测试 mock 的裸对象（type/stateKey/sender/content）。缺字段或 sender 缺失的条目丢弃。 */
function extractStateEvents(room: { currentState: { getStateEvents(type?: string): unknown[] } }): RawStateEvent[] {
  const out: RawStateEvent[] = []
  for (const type of TEAM_STATE_QUERY_TYPES) {
    for (const ev of room.currentState.getStateEvents(type) as Array<Record<string, unknown>>) {
      let stateKey: unknown
      let sender: unknown
      let content: unknown
      if (typeof ev.getType === 'function' && typeof ev.getStateKey === 'function' && typeof ev.getContent === 'function') {
        stateKey = (ev.getStateKey as () => string | undefined)()
        content = (ev.getContent as () => unknown)()
        sender = (ev.sender as { userId?: string } | undefined)?.userId ?? null
      } else {
        stateKey = ev.stateKey
        sender = ev.sender
        content = ev.content
      }
      if (typeof stateKey !== 'string' || typeof sender !== 'string') continue
      out.push({ type, stateKey, sender, content })
    }
  }
  return out
}

export const useTeamRegistryStore = defineStore('matrix-team-registry', () => {
  const matrixClientStore = useMatrixClientStore()
  const registryRoomId = ref<string | null>(null)
  const accounts = ref<TeamAccountView[]>([])
  const leaders = ref<string[]>([])
  const undeclared = ref<string[]>([])
  const duties = ref<Record<string, DutyContent>>({}) // P2 填充，本任务先建投影骨架
  const ready = ref(false)
  const lastError = ref<string | null>(null)

  // matrix-client store 字段经 pinia 代理读取时是已解包值；测试 mock 的是 setup 原始返回
  // （ref 形态 { value }）。raw?.value ?? raw 同时覆盖两种形态（真实 MatrixClient 无 .value 属性）。
  const clientRef = computed<MatrixClient | null>(() => {
    const raw = (matrixClientStore as unknown as { client?: unknown }).client
    return ((raw as { value?: unknown } | null | undefined)?.value ?? raw) as MatrixClient | null
  })
  const userIdRef = computed<string | null>(() => {
    const raw = (matrixClientStore as unknown as { userId?: unknown }).userId
    return ((raw as { value?: unknown } | null | undefined)?.value ?? raw) as string | null
  })

  const isLeader = computed(() => !!userIdRef.value && leaders.value.includes(userIdRef.value))

  function currentRoom(): Room | null {
    const client = clientRef.value
    if (!client || !registryRoomId.value) return null
    return client.getRoom(registryRoomId.value) ?? null
  }

  async function rebuild(): Promise<void> {
    const room = currentRoom()
    if (!room) { ready.value = false; return }
    const events = extractStateEvents(room)
    const leadersEv = events.find(e => e.type === TEAM_EVENT_TYPES.leaders && e.stateKey === '')
    const parsedLeaders = parseLeadersContent(leadersEv?.content)?.leaders ?? []
    leaders.value = parsedLeaders
    accounts.value = projectAccounts(events, parsedLeaders)
    const members = (room.getJoinedMembers?.() as Array<{ userId: string }> | undefined)?.map(m => m.userId) ?? []
    undeclared.value = undeclaredMembers(events, parsedLeaders, members)
    const dutyMap: Record<string, DutyContent> = {}
    for (const ev of events) {
      if (ev.type !== TEAM_EVENT_TYPES.duty) continue
      const duty = parseDutyContent(ev.content)
      if (duty) dutyMap[ev.stateKey] = duty
    }
    duties.value = dutyMap
    ready.value = true
  }

  // ── 发现 ──
  /** 「房间可见」= 客户端房间列表中存在（已加入/同步到）。
   *  不用 getRoom() 真值判断：mock 对任意 roomId 都返回对象，真实 SDK 对 leave 后的房间
   *  也可能仍返回 Room；房间列表才是客户端实际可见口径。 */
  function roomVisible(client: MatrixClient, roomId: string): boolean {
    return client.getRooms().some(r => (r as { roomId: string }).roomId === roomId)
  }

  async function detectRegistry(): Promise<void> {
    const client = clientRef.value
    if (!client) return
    const content = client.getAccountData(REGISTRY_ACCOUNT_DATA_TYPE)?.content as { roomId?: unknown } | undefined
    if (!content) return // 无记录：不覆盖已挂定/手动选择的注册房间
    const rid = typeof content.roomId === 'string' ? content.roomId : null
    if (rid && roomVisible(client, rid)) {
      registryRoomId.value = rid
      await rebuild()
    } else {
      registryRoomId.value = null // 指向不可见房间：显式失效，可走候选兜底
    }
  }

  function registryCandidateRooms(): Array<{ roomId: string; name: string }> {
    const client = clientRef.value
    if (!client) return []
    const out: Array<{ roomId: string; name: string }> = []
    for (const room of client.getRooms() as Array<{ roomId: string; name?: string }>) {
      const full = client.getRoom(room.roomId)
      if (!full) continue
      if (extractStateEvents(full).some(e => e.type === TEAM_EVENT_TYPES.account || e.type === TEAM_EVENT_TYPES.leaders)) {
        out.push({ roomId: room.roomId, name: room.name ?? room.roomId })
      }
    }
    return out
  }

  async function setRegistryRoom(roomId: string): Promise<void> {
    const client = clientRef.value
    if (!client) return
    registryRoomId.value = roomId
    await client.setAccountData(REGISTRY_ACCOUNT_DATA_TYPE, { roomId })
    await rebuild()
  }

  // ── 建房（leader）──
  async function createRegistryRoom(name: string, invitees: string[]): Promise<string | null> {
    const client = clientRef.value
    if (!client) { lastError.value = 'matrix offline'; return null }
    try {
      const result = await client.createRoom({
        visibility: 'private',
        name,
        invite: invitees,
        power_level_content_override: REGISTRY_ROOM_POWER_LEVELS,
      })
      registryRoomId.value = result.room_id
      await client.setAccountData(REGISTRY_ACCOUNT_DATA_TYPE, { roomId: result.room_id })
      const selfId = userIdRef.value ?? client.getUserId() ?? ''
      await client.sendStateEvent(result.room_id, TEAM_EVENT_TYPES.leaders, { leaders: [selfId] }, '')
      await rebuild()
      return result.room_id
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return null
    }
  }

  // ── 写 ──
  async function writeSelfAccount(agentTeams: AgentTeam[]): Promise<boolean> {
    const client = clientRef.value
    const selfId = userIdRef.value
    if (!client || !selfId || !registryRoomId.value) return false
    const displayName = selfId.split(':')[0].replace(/^@/, '')
    try {
      await client.sendStateEvent(
        registryRoomId.value, TEAM_EVENT_TYPES.account,
        { displayName, agentTeams, updatedAt: Date.now() }, selfId,
      )
      await rebuild()
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  async function writeLeaders(list: string[]): Promise<boolean> {
    const client = clientRef.value
    if (!client || !registryRoomId.value) return false
    try {
      await client.sendStateEvent(registryRoomId.value, TEAM_EVENT_TYPES.leaders, { leaders: list }, '')
      await rebuild()
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  async function inviteMember(userId: string): Promise<boolean> {
    const client = clientRef.value
    if (!client || !registryRoomId.value) return false
    try {
      await client.invite(registryRoomId.value, userId)
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    }
  }

  // ── 监听 ──
  let listening = false
  /** 测试钩子：直接指定房间（绕过 account data 发现），并立即投影一次。 */
  function attachRoom(roomId: string): void {
    registryRoomId.value = roomId
    void rebuild()
  }

  function ensureListening(): void {
    if (listening) return
    listening = true
    watch(clientRef, (client, prev) => {
      if (prev) prev.off(RoomEvent.Timeline, onTimeline)
      if (!client) return
      client.on(RoomEvent.Timeline, onTimeline)
      void detectRegistry()
    }, { immediate: true })
  }

  // Task 3 评审迁移：store setup 顶层即挂监听——watcher 落在 pinia 实例的 effect scope，
  // 不随组件卸载销毁。此前由组件 onMounted 调用时 watcher 绑组件作用域，tab 切换卸载后
  // listening 旗标仍 true 但 watcher 已死，二次进入 store 不再监听。组件侧不再调用。
  ensureListening()

  function onTimeline(event: unknown, room: unknown): void {
    const ev = event as { getType?: () => string }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !r?.roomId) return
    if (r.roomId !== registryRoomId.value) return
    if (!isSwarmStudioEventType(ev.getType())) return
    void rebuild()
  }

  return {
    registryRoomId, accounts, leaders, undeclared, duties, ready, lastError, isLeader,
    ensureListening, rebuild, detectRegistry, registryCandidateRooms, setRegistryRoom,
    createRegistryRoom, writeSelfAccount, writeLeaders, inviteMember, attachRoom,
  }
})

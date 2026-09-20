// overlay/custom/client/ia2/composables/useSessionRows.ts
// v12.3 会话行装配单一实现（自 WorkbenchView.vue 抽出，工作台/页头态势面板共用）。
// 会话源 = matrix 房间 ∪ hermes 群聊 ∪ hermes agent 会话（R4b 三聊天合一，
// 同列经 buildSessionRows 统一重排，左栏按类型聚类展示）；任务挂接优先 kanban
// 原始任务（带 session_id），退化 workspace 聚合行；群聊无挂接通道（tenant/
// session_id 均不指向群聊房间，taskIds 自然为空）。
import { computed } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useChatStore } from '@/stores/hermes/chat'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import {
  buildSessionRows, linkedTaskIdsOfSession,
  type SessionSourceRow,
} from '../adapters/flow'

export function useSessionRows() {
  const workspace = useWorkspaceStore()
  const chatStore = useChatStore()
  const matrixRoom = useMatrixRoomStore()
  const teamRegistry = useTeamRegistryStore()
  const kanban = useKanbanStore()
  const groupChat = useGroupChatStore()

  const chatSessions = computed(() => chatStore.sessions ?? [])

  const sessionSources = computed<SessionSourceRow[]>(() => {
    // 房间侧 sortedRooms 已按最近消息倒序——用 rank 时戳保序（SDK Room 形状
    // 不直耦合进纯函数）；会话侧 updatedAt 真值。两路经 buildSessionRows 统一重排。
    const now = Date.now()
    const rooms = (matrixRoom.sortedRooms ?? []) as Array<{ roomId: string; name?: string }>
    const roomRows: SessionSourceRow[] = rooms.map((r, i) => ({
      kind: 'room', id: r.roomId, name: r.name || r.roomId, lastActivityAt: now - i * 1000,
    }))
    const chatRowList: SessionSourceRow[] = chatSessions.value.map(s => ({
      kind: 'chat', id: s.id, name: s.title || s.id, lastActivityAt: s.updatedAt ?? null,
    }))
    // 群聊（R4b）：store.rooms 已按最近活跃倒序（joinRoom/loadRooms 维护），
    // rank 保序与会话侧一致
    const groupRows: SessionSourceRow[] = ((groupChat.rooms ?? []) as Array<{ id: string; name: string; lastActiveAt?: number }>)
      .map((r, i) => ({ kind: 'group' as const, id: r.id, name: r.name || r.id, lastActivityAt: r.lastActiveAt ?? now - i * 1000 }))
    return [...roomRows, ...groupRows, ...chatRowList]
  })

  const tasksForLink = computed(() => {
    const raw = kanban.tasks ?? []
    if (raw.length) {
      return raw.map(t => ({ id: t.id, tenant: t.tenant ?? null, session_id: t.session_id ?? null }))
    }
    return workspace.tasks.map(t => ({ id: t.id, tenant: t.tenant ?? null, session_id: null }))
  })

  const duties = computed(() => teamRegistry.duties ?? {})
  const accounts = computed(() => teamRegistry.accounts ?? [])

  function assigneeLabelOf(roomId: string): { dutyName: string | null; teamTag: string } {
    const duty = duties.value[roomId]
    if (!duty) return { dutyName: null, teamTag: '' }
    const account = accounts.value.find(a =>
      duty.assigneeKind === 'account' ? a.userId === duty.assigneeId
        : a.agentTeams.some(at => `${a.userId}/${at.slug}` === duty.assigneeId))
    const teamTag = account?.agentTeams[0]?.slug ?? ''
    return { dutyName: account?.displayName ?? duty.roomName ?? null, teamTag }
  }

  const sessionRows = computed(() => buildSessionRows(sessionSources.value, {
    unreadOf(id, kind) {
      if (kind === 'chat') return chatStore.unreadMessages?.get(id)?.count ?? 0
      const room = (matrixRoom.sortedRooms ?? []).find((r: { roomId: string }) => r.roomId === id)
      return room ? matrixRoom.getRoomUnreadCount(room) : 0
    },
    taskIdsOf(id, kind) {
      return linkedTaskIdsOfSession({ kind, id }, tasksForLink.value)
    },
    // group：未读走 store 自有计数（无则 0）；挂接无通道自然空——见头注
    teamTagOf(id) {
      return assigneeLabelOf(id).teamTag
    },
    dutyNameOf(id) {
      return assigneeLabelOf(id).dutyName
    },
  }))

  return { sessionRows, chatSessions, sessionSources, tasksForLink, duties, accounts, assigneeLabelOf }
}

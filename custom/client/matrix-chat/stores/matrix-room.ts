import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  Room,
  MatrixEvent,
  KnownMembership,
  NotificationCountType,
  RelationType,
  EventType,
  Visibility,
} from 'matrix-js-sdk'
import { matrixEventBus } from './matrix-events'
import { useMatrixClientStore } from './matrix-client'

export type RoomNotificationLevel = 'highlight' | 'total' | 'none'
export type TimelineLayout = 'group' | 'bubble' | 'irc'

export const useMatrixRoomStore = defineStore('matrix-room', () => {
  const clientStore = useMatrixClientStore()

  // ── Room data ──
  // Snapshot refs (not computed) because matrix-js-sdk returns the same internal
  // array reference — Vue can't see mutations. We re-snapshot on SDK events.
  const roomList = ref<any[]>([])
  const activeRoomId = ref<string | null>(null)
  const messageList = ref<MatrixEvent[]>([])

  // ── Layout settings (timeline-rendering concern) ──
  const timelineLayout = ref<TimelineLayout>('group')
  const alwaysShowTimestamps = ref(false)
  const useCompactLayout = ref(false)
  function setTimelineLayout(layout: TimelineLayout) { timelineLayout.value = layout }
  function toggleAlwaysShowTimestamps() { alwaysShowTimestamps.value = !alwaysShowTimestamps.value }
  function toggleCompactLayout() { useCompactLayout.value = !useCompactLayout.value }

  // ── Read marker (timeline concern) ──
  const readMarkerEventId = ref<string | null>(null)
  const readMarkerVisible = ref(true)
  function setReadMarker(eventId: string | null) {
    readMarkerEventId.value = eventId
    readMarkerVisible.value = true
  }
  function hideReadMarker() { readMarkerVisible.value = false }

  // ── Typing / selection ──
  const typingUsers = ref<string[]>([])
  function setTypingUsers(users: string[]) { typingUsers.value = users }
  const selectedEventId = ref<string | null>(null)
  function selectEvent(eventId: string | null) { selectedEventId.value = eventId }

  // ── Computeds ──
  const activeRoom = computed<Room | null>(() => {
    if (!activeRoomId.value) return null
    // Access client through Pinia store without direct import (avoid cycles)
    const clientStore = useMatrixClientStore()
    if (!clientStore.client) return null
    return clientStore.client.getRoom(activeRoomId.value) ?? null
  })

  const sortedRooms = computed(() => {
    return [...roomList.value]
      .filter((r: any) => r.getMyMembership() === KnownMembership.Join)
      .sort((a: any, b: any) => {
        const aTs = getLastMessageTimestamp(a)
        const bTs = getLastMessageTimestamp(b)
        return bTs - aTs
      })
  })

  const activeRoomMessages = computed(() => messageList.value)

  const activeRoomUnreadCount = computed<number>(() => {
    if (!activeRoom.value) return 0
    const room = activeRoom.value
    return room.getUnreadNotificationCount(NotificationCountType.Total) +
      room.getUnreadNotificationCount(NotificationCountType.Highlight)
  })

  // ── Helpers ──
  function getLastMessageTimestamp(room: any): number {
    const timeline = room.timeline
    for (let i = timeline.length - 1; i >= 0; i--) {
      const evt = timeline[i]
      if (evt.getType() === 'm.room.message') {
        return evt.getTs() || 0
      }
    }
    return 0
  }

  /** Snapshot the current room list from the client into the reactive ref. */
  function refreshRoomList() {
    if (!clientStore.client) {
      roomList.value = []
      return
    }
    // Create a new array so Vue detects the change
    roomList.value = [...clientStore.client.getRooms()]
  }

  function refreshMessages() {
    if (!activeRoom.value) {
      messageList.value = []
      return
    }
    messageList.value = [...activeRoom.value.timeline.filter(
      (evt) => evt.getType() === 'm.room.message' && !evt.isRedacted() && !evt.isRelation(RelationType.Replace),
    )]
  }

  function selectRoom(roomId: string | null) {
    activeRoomId.value = roomId
    refreshMessages()
    matrixEventBus.onSelectRoom.value?.()
  }

  // ── Room member helpers ──
  /** Get sorted member list for a room, grouped by role */
  function getRoomMemberList(roomId: string): { admins: any[]; mods: any[]; defaults: any[]; invited: any[] } {
    const room = clientStore.client?.getRoom(roomId)
    if (!room) return { admins: [], mods: [], defaults: [], invited: [] }

    const members = room.getJoinedMembers()
    const admins: any[] = []
    const mods: any[] = []
    const defaults: any[] = []
    const invited: any[] = []

    for (const member of members) {
      const powerLevel = member.powerLevel ?? 0
      if (powerLevel >= 100) admins.push(member)
      else if (powerLevel >= 50) mods.push(member)
      else defaults.push(member)
    }

    // Also include invited members
    const state = room.currentState
    if (state) {
      state.getMembers().forEach((m: any) => {
        if (m.membership === KnownMembership.Invite) {
          invited.push(m)
        }
      })
    }

    return { admins, mods, defaults, invited }
  }

  /** Get the power level (role) of a member */
  function getMemberPowerLevel(roomId: string, userId: string): number {
    const room = clientStore.client?.getRoom(roomId)
    if (!room) return 0
    const member = room.getMember(userId)
    return member?.powerLevel ?? 0
  }

  /** Check if the current user can kick/ban in a room */
  function canKickInRoom(roomId: string): boolean {
    const room = clientStore.client?.getRoom(roomId)
    if (!room) return false
    const myUserId = clientStore.userId
    if (!myUserId) return false
    const me = room.getMember(myUserId)
    return (me?.powerLevel ?? 0) >= 50 // Need mod or admin level
  }

  // ── Member management actions ──
  async function inviteUser(roomId: string, userIdToInvite: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.invite(roomId, userIdToInvite)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to invite user'
      throw err
    }
  }

  async function kickUser(roomId: string, userIdToKick: string, reason?: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.kick(roomId, userIdToKick, reason ?? '')
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to kick user'
      throw err
    }
  }

  async function setIgnoreUser(userIdToIgnore: string, ignore: boolean) {
    if (!clientStore.client) return
    try {
      if (ignore) {
        await clientStore.client.setIgnoredUsers([userIdToIgnore])
      } else {
        const currentIgnored = await clientStore.client.getIgnoredUsers()
        const newIgnored = currentIgnored.filter((id: string) => id !== userIdToIgnore)
        await clientStore.client.setIgnoredUsers(newIgnored)
      }
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to update ignore list'
      throw err
    }
  }

  /** Start a 1:1 DM with a user */
  async function startDmWithUser(otherUserId: string) {
    if (!clientStore.client) return
    try {
      const result = await clientStore.client.createRoom({
        visibility: Visibility.Private,
        is_direct: true,
        invite: [otherUserId],
      })
      selectRoom(result.room_id)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to start DM'
      throw err
    }
  }

  // ── Room readers ──
  /** Get room avatar URL (mxc -> http) */
  function getRoomAvatarUrl(room: any, size = 96): string | null {
    if (!clientStore.client) return null
    const mxcUrl = room.getMxcAvatarUrl()
    if (!mxcUrl) return null
    return clientStore.client.mxcUrlToHttp(mxcUrl, size, size, 'crop') ?? null
  }

  /** Get user avatar URL */
  function getUserAvatarUrl(memberOrUserId: any, size = 64): string | null {
    if (!clientStore.client) return null
    const mxcUrl = typeof memberOrUserId === 'string'
      ? clientStore.client.getUser(memberOrUserId)?.avatarUrl
      : memberOrUserId?.getMxcAvatarUrl?.() ?? memberOrUserId?.avatarUrl
    if (!mxcUrl) return null
    return clientStore.client.mxcUrlToHttp(mxcUrl, size, size, 'crop') ?? null
  }

  /** Get room topic */
  function getRoomTopic(room: any): string {
    if (!room) return ''
    const state = room.currentState
    if (!state) return ''
    const topicEvent = state.getStateEvents('m.room.topic', '')
    if (!topicEvent) return ''
    return topicEvent.getContent()?.topic ?? ''
  }

  /** Check if a room is encrypted */
  function isRoomEncrypted(roomId: string): boolean {
    const room = clientStore.client?.getRoom(roomId)
    if (!room) return false
    return room.hasEncryptionStateEvent()
  }

  /** Check if a room is public (join_rule = public) */
  function isRoomPublic(room: any): boolean {
    if (!room) return false
    const state = room.currentState
    if (!state) return false
    const joinRuleEvent = state.getStateEvents('m.room.join_rules', '')
    const joinRule = joinRuleEvent?.getContent()?.join_rule
    return joinRule === 'public'
  }

  /** Get room alias (canonical alias or first alt alias) */
  function getRoomAlias(room: Room | null): string {
    if (!room) return ''
    return room.getCanonicalAlias() || room.getAltAliases()?.[0] || ''
  }

  /** Check if current room is marked as favorite */
  function isRoomFavorite(): boolean {
    if (!activeRoom.value) return false
    const tags = (activeRoom.value as any).tags as Record<string, Record<string, any>> | undefined
    return !!tags?.['m.favourite']
  }

  /** Toggle favorite tag on current room */
  async function toggleRoomFavorite(): Promise<void> {
    if (!clientStore.client || !activeRoom.value) return
    const fav = isRoomFavorite()
    try {
      if (fav) {
        await clientStore.client.deleteRoomTag(activeRoom.value.roomId, 'm.favourite')
      } else {
        await clientStore.client.setRoomTag(activeRoom.value.roomId, 'm.favourite', { order: 0 })
      }
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to toggle favorite'
      throw err
    }
  }

  /** Check if the current user can edit the room topic */
  function canEditTopic(): boolean {
    if (!activeRoom.value || !clientStore.client) return false
    const uid = clientStore.client.getUserId()
    if (!uid) return false
    try {
      return activeRoom.value.currentState.maySendStateEvent(EventType.RoomTopic, uid)
    } catch {
      return false
    }
  }

  /** Set room topic */
  async function setRoomTopic(topicText: string): Promise<void> {
    if (!clientStore.client || !activeRoomId.value) return
    try {
      await clientStore.client.setRoomTopic(activeRoomId.value, topicText)
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to set room topic'
      throw err
    }
  }

  /** Search the user directory for matching users */
  async function searchUserDirectory(query: string): Promise<Array<{ userId: string; displayName: string | null; avatarUrl: string | null }>> {
    if (!clientStore.client || !query.trim()) return []
    try {
      const result = await clientStore.client.searchUserDirectory({ term: query.trim(), limit: 20 })
      return (result.results || []).map((u: any) => ({
        userId: u.user_id,
        displayName: u.display_name || null,
        avatarUrl: u.avatar_url || null,
      }))
    } catch {
      return []
    }
  }

  /** Get presence status of a user */
  function getUserPresence(userIdToCheck: string): { status: string; lastActive?: number } {
    if (!clientStore.client) return { status: 'offline' }
    const user = clientStore.client.getUser(userIdToCheck)
    if (!user) return { status: 'offline' }
    const presence = user.presence ?? 'offline'
    const lastActiveAgo = user.lastActiveAgo ?? undefined
    const lastActive = lastActiveAgo != null ? Date.now() - lastActiveAgo : undefined
    return { status: presence, lastActive }
  }

  // ── Room actions ──
  async function createRoom(options: {
    name?: string
    isPublic?: boolean
    isEncrypted?: boolean
  }) {
    if (!clientStore.client) return
    const opts: Record<string, unknown> = {
      visibility: options.isPublic ? 'public' : 'private',
      name: options.name,
      initial_state: [],
    }
    if (options.isEncrypted) {
      opts.initial_state = [
        {
          type: 'm.room.encryption',
          state_key: '',
          content: {
            algorithm: 'm.megolm.v1.aes-sha2',
          },
        },
      ]
    }
    try {
      const result = await clientStore.client.createRoom(opts)
      selectRoom(result.room_id)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to create room'
      throw err
    }
  }

  async function joinRoom(roomIdOrAlias: string) {
    if (!clientStore.client) return
    try {
      const result = await clientStore.client.joinRoom(roomIdOrAlias)
      selectRoom(result.roomId)
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to join room'
      throw err
    }
  }

  async function leaveRoom(roomId: string) {
    if (!clientStore.client) return
    try {
      await clientStore.client.leave(roomId)
      if (activeRoomId.value === roomId) {
        activeRoomId.value = null
      }
      refreshRoomList()
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to leave room'
      throw err
    }
  }

  async function paginateMessages() {
    if (!activeRoom.value || !clientStore.client) return false
    const timeline = activeRoom.value.getLiveTimeline()
    try {
      const canPaginateMore = await clientStore.client.paginateEventTimeline(timeline, {
        backwards: true,
        limit: 30,
      })
      return canPaginateMore
    } catch {
      return false
    }
  }

  function getRoomUnreadCount(room: any): number {
    return room.getUnreadNotificationCount(NotificationCountType.Total) +
      room.getUnreadNotificationCount(NotificationCountType.Highlight)
  }

  /**
   * Read receipts for a specific event, as { userId, ts } pairs.
   * Wraps matrix-js-sdk Room.getEventReadReceipts. Excludes the local user.
   */
  function getEventReadReceipts(eventId: string | null): Array<{ userId: string; ts: number }> {
    const room = activeRoom.value
    if (!room || !eventId) return []
    const me = clientStore.client?.getUserId() ?? ''
    try {
      const raw = (room as any).getEventReadReceipts?.(eventId) ?? []
      return raw
        .map((r: any) => ({ userId: String(r?.userId ?? ''), ts: Number(r?.ts ?? 0) }))
        .filter((r: { userId: string }) => r.userId && r.userId !== me)
    } catch {
      return []
    }
  }

  /**
   * Notification level for a room: 'highlight' if any highlight notifications,
   * else 'total' if any total notifications, else 'none'.
   */
  function getRoomNotificationLevel(room: any): RoomNotificationLevel {
    if (!room) return 'none'
    try {
      const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight)
      if (highlight && highlight > 0) return 'highlight'
      const total = room.getUnreadNotificationCount(NotificationCountType.Total)
      if (total && total > 0) return 'total'
      return 'none'
    } catch {
      return 'none'
    }
  }

  return {
    roomList, activeRoomId, messageList,
    timelineLayout, alwaysShowTimestamps, useCompactLayout,
    readMarkerEventId, readMarkerVisible, typingUsers, selectedEventId,
    activeRoom, sortedRooms, activeRoomMessages, activeRoomUnreadCount,
    setTimelineLayout, toggleAlwaysShowTimestamps, toggleCompactLayout,
    setReadMarker, hideReadMarker, setTypingUsers, selectEvent,
    refreshRoomList, refreshMessages, selectRoom,
    getRoomMemberList, getMemberPowerLevel, canKickInRoom,
    inviteUser, kickUser, setIgnoreUser, startDmWithUser,
    getRoomAvatarUrl, getUserAvatarUrl, getRoomTopic,
    isRoomEncrypted, isRoomPublic, getRoomAlias, isRoomFavorite,
    toggleRoomFavorite, canEditTopic, setRoomTopic,
    searchUserDirectory, getUserPresence,
    createRoom, joinRoom, leaveRoom, paginateMessages,
    getRoomUnreadCount, getRoomNotificationLevel, getEventReadReceipts,
  }
})

// Register room store handlers on the event bus (outside store definition to
// avoid circular imports between stores). These are called by matrix-client
// when SDK events fire.
// Lazily initialize the store reference to avoid "no active Pinia" errors during
// module load in test environments.
let _roomStore: ReturnType<typeof useMatrixRoomStore> | null = null
function getRoomStore() {
  if (!_roomStore) _roomStore = useMatrixRoomStore()
  return _roomStore
}
matrixEventBus.onRoomListChange.value = () => getRoomStore().refreshRoomList()
matrixEventBus.onTimeline.value = () => getRoomStore().refreshMessages()

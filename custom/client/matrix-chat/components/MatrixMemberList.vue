<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixInviteDialog from './MatrixInviteDialog.vue'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const showInviteDialog = ref(false)
const searchQuery = ref('')
const room = computed(() => roomStore.activeRoom)
const roomId = computed(() => room.value?.roomId ?? '')

const totalMemberCount = computed(() => {
  void roomStore.roomVersion
  if (!room.value) return 0
  return room.value.getJoinedMemberCount() + (room.value.getInvitedMembers?.()?.length ?? 0)
})

const canInvite = computed(() => {
  void roomStore.roomVersion
  return roomStore.canInviteToRoom(room.value)
})

const memberGroups = computed(() => {
  void roomStore.roomVersion
  if (!roomId.value) return { admins: [], mods: [], defaults: [], invited: [] }
  return roomStore.getRoomMemberList(roomId.value)
})

const filteredAdmins = computed(() => filterMembers(memberGroups.value.admins))
const filteredMods = computed(() => filterMembers(memberGroups.value.mods))
const filteredDefaults = computed(() => filterMembers(memberGroups.value.defaults))
const filteredInvited = computed(() => filterMembers(memberGroups.value.invited))

function filterMembers(members: any[]): any[] {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return members
  return members.filter((m: any) => {
    const name = m.name?.toLowerCase() ?? ''
    const userId = m.userId?.toLowerCase() ?? ''
    return name.includes(q) || userId.includes(q)
  })
}

function getMemberAvatarUrl(member: any): string | null {
  return roomStore.getUserAvatarUrl(member, 36)
}

function getInitial(nameOrId: string): string {
  return (nameOrId || '?').charAt(0).toUpperCase()
}

function getPresenceDotClass(member: any): string {
  const presence = roomStore.getUserPresence(member.userId)
  switch (presence.status) {
    case 'online': return 'presence-dot--online'
    case 'unavailable': return 'presence-dot--unavailable'
    default: return 'presence-dot--offline'
  }
}

function getRoleLabel(powerLevel: number): string {
  if (powerLevel >= 100) return t('matrixChat.memberAdmin')
  if (powerLevel >= 50) return t('matrixChat.memberMod')
  return t('matrixChat.memberDefault')
}

function getRoleClass(powerLevel: number): string {
  if (powerLevel >= 100) return 'role-label--admin'
  if (powerLevel >= 50) return 'role-label--mod'
  return 'role-label--default'
}

function handleMemberClick(member: any) {
  rightPanelStore.openMemberInfo(member.userId)
}

const hasAnyMembers = computed(() =>
  filteredAdmins.value.length + filteredMods.value.length + filteredDefaults.value.length + filteredInvited.value.length > 0
)
</script>

<template>
  <div class="member-list-panel">
    <!-- Search + Invite header -->
    <div class="member-search-row">
      <div class="member-search">
        <input
          v-model="searchQuery"
          class="member-search-input"
          :placeholder="t('matrixChat.memberSearch')"
        />
      </div>
      <button v-if="canInvite" class="member-invite-btn" @click="showInviteDialog = true" :title="t('matrixChat.inviteUser')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>

    <!-- Member count -->
    <div class="member-count-bar">
      <span class="member-count-text">{{ t('matrixChat.memberCount', { count: totalMemberCount }) }}</span>
    </div>

    <!-- Empty -->
    <div v-if="!hasAnyMembers" class="member-empty">
      {{ t('matrixChat.noMembersFound') }}
    </div>

    <!-- Groups -->
    <div class="member-groups">
      <!-- Admins -->
      <template v-if="filteredAdmins.length > 0">
        <div class="member-group-label">{{ t('matrixChat.memberAdmin') }} ({{ filteredAdmins.length }})</div>
        <div
          v-for="member in filteredAdmins"
          :key="member.userId"
          class="member-item"
          @click="handleMemberClick(member)"
        >
          <div class="member-avatar">
            <img v-if="getMemberAvatarUrl(member)" :src="getMemberAvatarUrl(member)!" alt="" class="member-avatar-img" />
            <div v-else class="member-avatar-placeholder">{{ getInitial(member.name ?? member.userId) }}</div>
            <span :class="['presence-dot', getPresenceDotClass(member)]" />
          </div>
          <div class="member-info">
            <span class="member-name">{{ member.name ?? member.userId }}</span>
            <span :class="['role-label', getRoleClass(member.powerLevel ?? 0)]">{{ getRoleLabel(member.powerLevel ?? 0) }}</span>
          </div>
        </div>
      </template>

      <!-- Mods -->
      <template v-if="filteredMods.length > 0">
        <div class="member-group-label">{{ t('matrixChat.memberMod') }} ({{ filteredMods.length }})</div>
        <div
          v-for="member in filteredMods"
          :key="member.userId"
          class="member-item"
          @click="handleMemberClick(member)"
        >
          <div class="member-avatar">
            <img v-if="getMemberAvatarUrl(member)" :src="getMemberAvatarUrl(member)!" alt="" class="member-avatar-img" />
            <div v-else class="member-avatar-placeholder">{{ getInitial(member.name ?? member.userId) }}</div>
            <span :class="['presence-dot', getPresenceDotClass(member)]" />
          </div>
          <div class="member-info">
            <span class="member-name">{{ member.name ?? member.userId }}</span>
            <span :class="['role-label', getRoleClass(member.powerLevel ?? 0)]">{{ getRoleLabel(member.powerLevel ?? 0) }}</span>
          </div>
        </div>
      </template>

      <!-- Default -->
      <template v-if="filteredDefaults.length > 0">
        <div class="member-group-label">{{ t('matrixChat.memberDefault') }} ({{ filteredDefaults.length }})</div>
        <div
          v-for="member in filteredDefaults"
          :key="member.userId"
          class="member-item"
          @click="handleMemberClick(member)"
        >
          <div class="member-avatar">
            <img v-if="getMemberAvatarUrl(member)" :src="getMemberAvatarUrl(member)!" alt="" class="member-avatar-img" />
            <div v-else class="member-avatar-placeholder">{{ getInitial(member.name ?? member.userId) }}</div>
            <span :class="['presence-dot', getPresenceDotClass(member)]" />
          </div>
          <div class="member-info">
            <span class="member-name">{{ member.name ?? member.userId }}</span>
          </div>
        </div>
      </template>

      <!-- Invited -->
      <template v-if="filteredInvited.length > 0">
        <div class="member-group-label">{{ t('matrixChat.memberInvited') }} ({{ filteredInvited.length }})</div>
        <div
          v-for="member in filteredInvited"
          :key="member.userId"
          class="member-item member-item--invited"
          @click="handleMemberClick(member)"
        >
          <div class="member-avatar">
            <div class="member-avatar-placeholder">{{ getInitial(member.name ?? member.userId) }}</div>
          </div>
          <div class="member-info">
            <span class="member-name">{{ member.name ?? member.userId }}</span>
            <span class="role-label role-label--invited">{{ t('matrixChat.memberInvited') }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Invite dialog -->
    <MatrixInviteDialog v-if="showInviteDialog" @close="showInviteDialog = false" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.member-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.member-search-row {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.member-search {
  flex: 1;
  min-width: 0;
}

/* keep old .member-search styles but remove standalone padding */
.member-search {
  padding: 0;
  border-bottom: none;
}

.member-search-input {
  width: 100%;
  height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: $radius-sm;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-input);
  outline: none;

  &::placeholder { color: var(--text-muted); }
  &:focus { border-color: var(--accent-primary); }
}

.member-invite-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: $radius-sm;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); color: var(--accent-primary); }
}

.member-count-bar {
  padding: 6px 16px;
  border-bottom: 1px solid var(--border-color);
}

.member-count-text {
  font-size: 12px;
  color: var(--text-muted);
}

.member-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.member-groups {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.member-group-label {
  padding: 8px 16px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); }
}

.member-item--invited {
  opacity: 0.7;
}

.member-avatar {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.member-avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.member-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.presence-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--bg-card);
}

.presence-dot--online { background: var(--success); }
.presence-dot--unavailable { background: var(--warning); }
.presence-dot--offline { background: var(--text-muted); }

.member-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-label {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.role-label--admin {
  background: rgba(var(--accent-info-rgb), 0.1);
  color: var(--accent-info);
}

.role-label--mod {
  background: rgba(var(--success-rgb), 0.1);
  color: var(--success);
}

.role-label--default {
  color: var(--text-muted);
}

.role-label--invited {
  background: rgba(var(--warning-rgb), 0.1);
  color: var(--warning);
}
</style>

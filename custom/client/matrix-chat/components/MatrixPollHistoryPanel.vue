<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import type { MatrixEvent } from 'matrix-js-sdk'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

const room = computed(() => {
  void roomStore.roomVersion
  return roomStore.activeRoom
})
const isLoading = ref(false)

interface PollInfo {
  eventId: string
  question: string
  options: { id: string; text: string; count: number }[]
  totalVotes: number
  isEnded: boolean
  sender: string
  timestamp: number
  winnerId?: string
}

const polls = ref<PollInfo[]>([])

function loadPolls() {
  if (!room.value) return
  isLoading.value = true
  try {
    const timeline = room.value.getLiveTimeline()
    const events = timeline.getEvents()
    const result: PollInfo[] = []

    for (const ev of events) {
      if (ev.isRedacted?.()) continue
      if (ev.getType() !== 'm.room.message') continue
      const msgtype = ev.getContent()?.msgtype
      if (msgtype !== 'm.poll') continue
      const pollStart = ev.getContent()?.['m.poll.start']
      if (!pollStart) continue

      const question = pollStart.question?.body?.trim() || t('matrixChat.untitledPoll')
      const optionDefs = pollStart.answers || []
      const maxSelections = pollStart.max_selections || 1

      // Tally responses
      const optionCounts: Record<string, number> = {}
      for (const opt of optionDefs) {
        optionCounts[opt.id] = 0
      }

      // Find related response events
      const pollId = ev.getId()
      const endEvent = room.value.findEventById(pollId + '_end') 
        ?? timeline.getEvents().find((e: MatrixEvent) =>
          e.getType() === 'm.poll.end' && e.getContent()?.['m.relates_to']?.event_id === pollId
        )

      const isEnded = !!endEvent || (Date.now() - (ev.getTs() ?? 0) > 7 * 24 * 3600 * 1000) // older than 7 days

      // Count responses
      for (const re of timeline.getEvents()) {
        if (re.getType() !== 'm.poll.response') continue
        const relatesTo = re.getContent()?.['m.relates_to']?.event_id
        if (relatesTo !== pollId) continue
        const selections = re.getContent()?.['m.selections'] || []
        for (const sel of selections) {
          optionCounts[sel] = (optionCounts[sel] || 0) + 1
        }
      }

      let totalVotes = 0
      const options = optionDefs.map((opt: any) => {
        const count = optionCounts[opt.id] || 0
        totalVotes += count
        return { id: opt.id, text: opt['org.matrix.msc1767.text'] || opt.text || opt.id, count }
      })

      const maxCount = Math.max(...options.map(o => o.count), 0)
      const winners = options.filter(o => o.count === maxCount && maxCount > 0)

      result.push({
        eventId: pollId,
        question: question || t('matrixChat.untitledPoll'),
        options,
        totalVotes,
        isEnded,
        sender: ev.getSender() || '',
        timestamp: ev.getTs() || 0,
        winnerId: winners.length === 1 ? winners[0].id : undefined,
      })
    }

    // Most recent first
    result.sort((a, b) => b.timestamp - a.timestamp)
    polls.value = result
  } catch {
    // ignore
  } finally {
    isLoading.value = false
  }
}

watch(room, () => { if (room.value) loadPolls() }, { immediate: true })
onMounted(() => { if (room.value) loadPolls() })

function handleBack() {
  rightPanelStore.rightPanelBack()
}

function getSenderName(senderId: string): string {
  if (!room.value) return senderId
  const member = room.value.getMember(senderId)
  return member?.name ?? senderId
}

function getTimeString(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

function getPercent(count: number, total: number): string {
  if (total === 0) return '0%'
  return Math.round((count / total) * 100) + '%'
}
</script>

<template>
  <div class="poll-panel">
    <div class="pp-header">
      <button class="pp-back-btn" @click="handleBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h3 class="pp-title">{{ t('matrixChat.pollsMenu') }}</h3>
    </div>

    <div class="pp-content">
      <div v-if="isLoading" class="pp-loading">
        <span class="pp-spinner" />
        {{ t('matrixChat.loading') }}
      </div>

      <div v-else-if="polls.length === 0" class="pp-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 3H3v7h7V3z" /><path d="M21 3h-7v7h7V3z" /><path d="M21 14h-7v7h7v-7z" /><path d="M10 14H3v7h7v-7z" />
        </svg>
        <p>{{ t('matrixChat.noPolls') }}</p>
      </div>

      <div v-else class="pp-list">
        <div
          v-for="poll in polls"
          :key="poll.eventId"
          class="pp-item"
          :class="{ 'pp-item--ended': poll.isEnded }"
        >
          <div class="pp-item-header">
            <span class="pp-item-sender">{{ getSenderName(poll.sender) }}</span>
            <span class="pp-item-time">{{ getTimeString(poll.timestamp) }}</span>
          </div>
          <h4 class="pp-item-question">{{ poll.question }}</h4>
          <div class="pp-item-status">
            <span v-if="poll.isEnded" class="pp-status-ended">{{ t('matrixChat.pollEnded') }}</span>
            <span v-else class="pp-status-active">{{ t('matrixChat.pollActive') }}</span>
            <span class="pp-status-votes">{{ poll.totalVotes }} {{ t('matrixChat.votes') }}</span>
          </div>
          <!-- Options with bars -->
          <div class="pp-options">
            <div
              v-for="opt in poll.options"
              :key="opt.id"
              class="pp-option"
              :class="{ 'pp-option--winner': opt.id === poll.winnerId }"
            >
              <div class="pp-option-bar" :style="{ width: getPercent(opt.count, poll.totalVotes) }" />
              <span class="pp-option-text">{{ opt.text }}</span>
              <span class="pp-option-votes">{{ opt.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.poll-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
  min-height: 44px;
}

.pp-back-btn {
  width: 28px; height: 28px;
  border: none; background: none;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $radius-sm;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  &:hover { background: rgba(var(--accent-primary-rgb), 0.04); color: $text-primary; }
}

.pp-title {
  flex: 1;
  font-size: 14px; font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.pp-content {
  flex: 1; overflow-y: auto; min-height: 0;
}

.pp-loading, .pp-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 32px 16px; color: $text-muted; font-size: 13px;
}

.pp-spinner {
  width: 20px; height: 20px;
  border: 2px solid $border-color;
  border-top-color: $accent-primary;
  border-radius: 50%;
  display: inline-block;
  animation: pp-spin 0.6s linear infinite;
}
@keyframes pp-spin { to { transform: rotate(360deg); } }

.pp-list { display: flex; flex-direction: column; }

.pp-item {
  padding: 12px;
  border-bottom: 1px solid rgba(var(--text-muted-rgb), 0.08);

  &--ended { opacity: 0.75; }
}

.pp-item-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;
}

.pp-item-sender { font-size: 12px; font-weight: 600; color: $text-primary; }
.pp-item-time { font-size: 11px; color: $text-muted; }

.pp-item-question {
  font-size: 14px; font-weight: 600;
  color: $text-primary;
  margin: 4px 0 6px;
}

.pp-item-status {
  display: flex; gap: 10px; margin-bottom: 8px;
}

.pp-status-ended { font-size: 11px; color: $text-muted; background: $bg-secondary; padding: 1px 6px; border-radius: 3px; }
.pp-status-active { font-size: 11px; color: var(--success, #22c55e); background: rgba(var(--success-rgb, 34 197 94), 0.1); padding: 1px 6px; border-radius: 3px; }
.pp-status-votes { font-size: 11px; color: $text-muted; }

.pp-options { display: flex; flex-direction: column; gap: 3px; }

.pp-option {
  position: relative;
  display: flex; align-items: center;
  height: 26px;
  padding: 0 8px;
  border-radius: 4px;
  overflow: hidden;
  background: $bg-secondary;

  &--winner { background: rgba(var(--success-rgb, 34 197 94), 0.08); }
}

.pp-option-bar {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: rgba(var(--accent-primary-rgb), 0.12);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.pp-option-text {
  position: relative; z-index: 1;
  font-size: 12px; color: $text-primary;
  flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.pp-option-votes {
  position: relative; z-index: 1;
  font-size: 11px; color: $text-muted;
  font-weight: 500;
  flex-shrink: 0;
}
</style>

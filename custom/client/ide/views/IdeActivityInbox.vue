<script setup lang="ts">
// IdeActivityInbox — 活动收件箱（R4，claude-code 通知耗时 + codex-product
// Activity 收件箱三态语义）：运行中/待我/完成 三态聚合当前会话的可感事件。
// 数据面全只读投影：chatStore.isRunActive（运行中）+ activePendingApproval/
// activePendingClarify（待我）+ runStartedAt/updatedAt 推导的最近完成（完成+耗时）。
// 纯前端、无持久化（会话内记忆即可，跨会话通知归 R5+）。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { formatRelativeTime } from '../utils/time'

type ActivityState = 'running' | 'waiting' | 'done'

interface ActivityItem {
  id: string
  state: ActivityState
  label: string
  at: number
  /** 完成态耗时（秒） */
  durationSeconds?: number
}

const { t } = useI18n()
const chatStore = useChatStore()

const open = ref(false)

// 完成事件流水（运行翻转 false 时记录一条；保留最近 20 条）
const doneLog = ref<ActivityItem[]>([])
watch(
  () => chatStore.isRunActive,
  (active, prev) => {
    if (active || !prev) return
    const sid = chatStore.activeSessionId ?? ''
    const startedAt = (chatStore.runStartedAt as unknown as Map<string, number>).get(sid) ?? 0
    const finishedAt = chatStore.activeSession?.updatedAt ?? Date.now()
    const duration = startedAt > 0 ? Math.max(0, Math.floor((finishedAt - startedAt) / 1000)) : undefined
    doneLog.value = [
      {
        id: `done-${finishedAt}-${Math.random().toString(36).slice(2, 6)}`,
        state: 'done',
        label: t('ide.inbox.runDone'),
        at: finishedAt,
        durationSeconds: duration,
      },
      ...doneLog.value,
    ].slice(0, 20)
  },
)

const items = computed<ActivityItem[]>(() => {
  const out: ActivityItem[] = []
  const sid = chatStore.activeSessionId
  if (chatStore.isRunActive) {
    out.push({ id: 'running', state: 'running', label: t('ide.inbox.running'), at: Date.now() })
  }
  if (chatStore.activePendingApproval) {
    out.push({
      id: `approval-${chatStore.activePendingApproval.approvalId}`,
      state: 'waiting',
      label: t('ide.inbox.waitingApproval'),
      at: chatStore.activePendingApproval.requestedAt ?? Date.now(),
    })
  }
  if (chatStore.activePendingClarify) {
    out.push({ id: 'clarify', state: 'waiting', label: t('ide.inbox.waitingClarify'), at: Date.now() })
  }
  out.push(...doneLog.value.filter((d) => !sid || d.id.startsWith('done-')))
  return out.sort((a, b) => b.at - a.at)
})

// 未读 = 待我数 + 未点开的完成数；打开收件箱即清零完成未读
const unreadDone = ref(0)
watch(
  () => doneLog.value.length,
  (len, prev) => {
    if (!open.value && len > (prev ?? 0)) unreadDone.value += len - (prev ?? 0)
  },
)
const waitingCount = computed(() => (chatStore.activePendingApproval ? 1 : 0) + (chatStore.activePendingClarify ? 1 : 0))
const badge = computed(() => waitingCount.value + unreadDone.value)

function toggle(): void {
  open.value = !open.value
  if (open.value) unreadDone.value = 0
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}${t('ide.min')}${s}${t('ide.sec')}` : `${s}${t('ide.sec')}`
}
</script>

<template>
  <div class="ide-inbox">
    <button
      type="button"
      class="ide-inbox__bell"
      data-testid="ide-inbox-bell"
      :title="t('ide.inbox.title')"
      @click="toggle"
    >
      🔔
      <span v-if="badge > 0" class="ide-inbox__badge" data-testid="ide-inbox-badge">{{ badge }}</span>
    </button>

    <div v-if="open" class="ide-inbox__panel" data-testid="ide-inbox-panel">
      <div class="ide-inbox__head">{{ t('ide.inbox.title') }}</div>
      <p v-if="items.length === 0" class="ide-inbox__empty">{{ t('ide.inbox.empty') }}</p>
      <ul v-else class="ide-inbox__list">
        <li v-for="item in items" :key="item.id" class="ide-inbox__item" :data-state="item.state">
          <span class="ide-inbox__dot" :class="`is-${item.state}`" />
          <span class="ide-inbox__label">{{ item.label }}</span>
          <span v-if="item.durationSeconds != null" class="ide-inbox__duration">{{ formatDuration(item.durationSeconds) }}</span>
          <span class="ide-inbox__time">{{ formatRelativeTime(t, item.at) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-inbox {
  position: relative;
}

.ide-inbox__bell {
  position: relative;
  border: none;
  background: none;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.ide-inbox__badge {
  position: absolute;
  top: -5px;
  right: -7px;
  min-width: 13px;
  height: 13px;
  padding: 0 3px;
  border-radius: 7px;
  font-size: 9px;
  line-height: 13px;
  text-align: center;
  color: #fff;
  background: #e06c75;
}

.ide-inbox__panel {
  position: absolute;
  right: 0;
  bottom: 26px;
  width: 280px;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 320;
}

.ide-inbox__head {
  font-weight: 600;
  margin-bottom: 6px;
}

.ide-inbox__empty {
  color: var(--text-muted, #9aa0aa);
}

.ide-inbox__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ide-inbox__item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}

.ide-inbox__dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;

  &.is-running { background: #4cc9f0; }
  &.is-waiting { background: #f0a44c; }
  &.is-done { background: var(--success-color, #98c379); }
}

.ide-inbox__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-inbox__duration {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, #9aa0aa);
}

.ide-inbox__time {
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}
</style>

<script setup lang="ts">
// CockpitNotifyModal.vue —— 统一注意力收件箱（2.13 升级）
//
// 原"仅 Matrix 未读"面板升级为全源收件箱：审批/澄清（舰队）> 阻塞 > 待审 >
// 待分类（看板）> 会话未读 > Matrix 未读/群聊 > 待办提醒。
// 审批可就地批准/拒绝；任务类点击后选中对应看板任务。
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import type { InboxItem } from '@/custom/cockpit/adapters/inbox-adapter'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

const KIND_ICON: Record<string, string> = {
  approval: '✔',
  blocked: '⛔',
  clarify: '?',
  review: '👁',
  triage: '⬇',
  chat: '💬',
  matrix: 'M',
  group: 'G',
  reminder: '⏰',
}

function timeStr(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function onItemClick(item: InboxItem) {
  store.closeNotify()
  if (item.taskId) store.selectTask(item.taskId)
  router.push(item.routeTarget)
}

async function approveNow(item: InboxItem, choice: 'once' | 'deny') {
  if (!item.approval) return
  await store.respondFleetApproval(item.approval.sessionId, item.approval.approvalId, choice)
}

async function clarifyNow(item: InboxItem) {
  if (!item.clarify) return
  const answer = window.prompt(t('cockpit.fleetClarifyPrompt'), '')
  if (answer === null) return
  await store.respondFleetClarify(item.clarify.sessionId, item.clarify.clarifyId, answer.trim() || '继续')
}
</script>

<template>
  <div class="cockpit-notify-panel">
    <div class="cockpit-notify-panel__head">
      <span class="cockpit-notify-panel__title">
        {{ t('cockpit.inboxTitle') }}
        <span class="cockpit-notify-panel__sub">· {{ store.inboxItems.length }} {{ t('cockpit.inboxPending') }}</span>
      </span>
      <button type="button" class="cockpit-notify-panel__close" @click="store.closeNotify()">✕</button>
    </div>
    <div class="cockpit-notify-panel__list">
      <div
        v-for="item in store.inboxItems"
        :key="item.id"
        class="cockpit-notify-panel__item"
        :class="`is-${item.kind}`"
        role="button"
        tabindex="0"
        @click="onItemClick(item)"
        @keydown.enter="onItemClick(item)"
      >
        <span class="cockpit-notify-panel__avatar" :class="`is-${item.severity}`">{{ KIND_ICON[item.kind] || '·' }}</span>
        <div class="cockpit-notify-panel__body">
          <div class="cockpit-notify-panel__row1">
            <span class="cockpit-notify-panel__kind">{{ t(`cockpit.inboxKind_${item.kind}`) }}</span>
            <span class="cockpit-notify-panel__name">{{ item.title }}</span>
            <span class="cockpit-notify-panel__when">{{ timeStr(item.ts) }}</span>
          </div>
          <div v-if="item.preview" class="cockpit-notify-panel__preview">{{ item.preview }}</div>
          <div v-if="item.approval" class="cockpit-notify-panel__quick" @click.stop>
            <button type="button" class="is-ok" @click="approveNow(item, 'once')">{{ t('cockpit.fleetApprove') }}</button>
            <button type="button" class="is-no" @click="approveNow(item, 'deny')">{{ t('cockpit.fleetDeny') }}</button>
          </div>
          <div v-else-if="item.clarify" class="cockpit-notify-panel__quick" @click.stop>
            <button type="button" class="is-ok" @click="clarifyNow(item)">{{ t('cockpit.fleetAnswer') }}</button>
          </div>
        </div>
        <span v-if="item.count > 1" class="cockpit-notify-panel__count">{{ item.count }}</span>
      </div>
      <div v-if="!store.inboxItems.length" class="cockpit-notify-panel__empty">
        {{ t('cockpit.inboxClear') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 统一收件箱：贴顶栏右侧，固定定位（沿用 Pure Ink 样式） */
.cockpit-notify-panel {
  position: fixed; top: 48px; right: 16px; z-index: 1001;
  width: 400px; max-width: calc(100vw - 32px); max-height: 72vh;
  display: flex; flex-direction: column;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,.18); overflow: hidden;
}
.cockpit-notify-panel__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border-color);
}
.cockpit-notify-panel__title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cockpit-notify-panel__sub { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.cockpit-notify-panel__close {
  cursor: pointer; color: var(--text-muted); font-size: 14px; width: 22px; height: 22px;
  border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 3px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-notify-panel__list { flex: 1; overflow-y: auto; }
.cockpit-notify-panel__item {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 14px; cursor: pointer;
  width: 100%; text-align: left; font: inherit;
  border: none; border-bottom: 1px solid var(--border-color); background: none; color: var(--text-primary);
  &:hover { background: var(--bg-secondary); }
  &.is-approval, &.is-clarify { background: rgba(239, 68, 68, .05); }
}
.cockpit-notify-panel__avatar {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--text-on-accent); background: var(--text-muted);
  &.is-high { background: var(--error); }
  &.is-medium { background: var(--accent-primary); }
}
.cockpit-notify-panel__body { flex: 1; min-width: 0; }
.cockpit-notify-panel__row1 { display: flex; align-items: center; gap: 6px; }
.cockpit-notify-panel__kind {
  flex-shrink: 0; font-size: 9px; font-weight: 700; letter-spacing: .03em;
  color: var(--text-muted); background: var(--bg-secondary); border-radius: 4px; padding: 1px 5px;
}
.cockpit-notify-panel__name {
  font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cockpit-notify-panel__when { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; flex-shrink: 0; }
.cockpit-notify-panel__preview {
  font-size: 11px; color: var(--text-secondary); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cockpit-notify-panel__quick { display: flex; gap: 6px; margin-top: 5px;
  button {
    font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; border-radius: 4px;
    border: 1px solid transparent; padding: 2px 9px;
    &.is-ok { background: #10b981; color: #fff; }
    &.is-no { background: transparent; border-color: var(--error); color: var(--error); }
  }
}
.cockpit-notify-panel__count {
  flex-shrink: 0; background: var(--error); color: var(--text-on-accent);
  font-size: 10px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px; margin-top: 3px;
}
.cockpit-notify-panel__empty { padding: 28px 14px; text-align: center; font-size: 12px; color: var(--text-muted); }
</style>

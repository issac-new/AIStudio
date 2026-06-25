<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import type { NotifyItem } from '@/custom/cockpit/adapters/notify-adapter'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

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

// 点击聊天室记录 → 进入 matrix 聊天页面
function onItemClick(item: NotifyItem) {
  store.closeNotify()
  router.push(item.routeTarget)
}
</script>

<template>
  <div class="cockpit-notify-panel">
    <div class="cockpit-notify-panel__head">
      <span class="cockpit-notify-panel__title">
        {{ t('cockpit.notifyTitle') }}
        <span class="cockpit-notify-panel__sub">· {{ store.notifyCount }} {{ t('cockpit.notifyUnread') }}</span>
      </span>
      <button type="button" class="cockpit-notify-panel__close" @click="store.closeNotify()">✕</button>
    </div>
    <div class="cockpit-notify-panel__list">
      <button
        v-for="item in store.notifyItems"
        :key="item.id"
        type="button"
        class="cockpit-notify-panel__item"
        :data-notify-id="item.id"
        @click="onItemClick(item)"
      >
        <span class="cockpit-notify-panel__avatar">M</span>
        <div class="cockpit-notify-panel__body">
          <div class="cockpit-notify-panel__row1">
            <span class="cockpit-notify-panel__name">{{ item.title }}</span>
            <span class="cockpit-notify-panel__when">{{ timeStr(item.ts) }}</span>
          </div>
          <div class="cockpit-notify-panel__preview">{{ item.preview }}</div>
        </div>
        <span class="cockpit-notify-panel__count">{{ item.count }}</span>
      </button>
      <div v-if="!store.notifyItems.length" class="cockpit-notify-panel__empty">
        {{ t('cockpit.notifyEmpty') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 下拉面板：贴顶栏右侧，固定定位（Pure Ink 样式） */
.cockpit-notify-panel {
  position: fixed; top: 48px; right: 16px; z-index: 1001;
  width: 360px; max-width: calc(100vw - 32px); max-height: 70vh;
  display: flex; flex-direction: column;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.18); overflow: hidden;
}
.cockpit-notify-panel__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border-color);
}
.cockpit-notify-panel__title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cockpit-notify-panel__sub { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.cockpit-notify-panel__close {
  cursor: pointer; color: var(--text-muted); font-size: 14px; width: 22px; height: 22px;
  border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-notify-panel__list { flex: 1; overflow-y: auto; }
.cockpit-notify-panel__item {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 14px; cursor: pointer;
  border: none; background: none; width: 100%; text-align: left; font: inherit;
  border-bottom: 1px solid var(--border-color); color: var(--text-primary);
  &:hover { background: var(--bg-secondary); }
}
.cockpit-notify-panel__avatar {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--text-on-accent); background: var(--text-primary);
}
.cockpit-notify-panel__body { flex: 1; min-width: 0; }
.cockpit-notify-panel__row1 { display: flex; align-items: center; gap: 6px; }
.cockpit-notify-panel__name {
  font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cockpit-notify-panel__when { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; flex-shrink: 0; }
.cockpit-notify-panel__preview {
  font-size: 11px; color: var(--text-secondary); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cockpit-notify-panel__count {
  flex-shrink: 0; background: var(--error); color: var(--text-on-accent);
  font-size: 10px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}
.cockpit-notify-panel__empty { padding: 28px 14px; text-align: center; font-size: 12px; color: var(--text-muted); }
</style>

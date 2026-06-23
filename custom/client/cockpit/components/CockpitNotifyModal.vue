<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import type { NotifyKind, NotifyItem } from '@/custom/cockpit/adapters/notify-adapter'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

const SOURCES: { key: NotifyKind | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'cockpit.notifyAll' },
  { key: 'matrix', labelKey: 'cockpit.notifyMatrix' },
  { key: 'chat', labelKey: 'cockpit.notifyChat' },
  { key: 'group', labelKey: 'cockpit.notifyGroup' },
]

const items = computed(() => store.filteredNotifyItems)
const KIND_ICON: Record<NotifyKind, string> = { matrix: 'M', chat: 'A', group: 'G' }
const KIND_LABEL: Record<NotifyKind, string> = { matrix: 'matrix', chat: '单聊', group: '群聊' }

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

function onItemClick(item: NotifyItem) {
  store.clearNotifyItemUnread(item)
  store.closeNotify()
  router.push(item.routeTarget)
}
</script>

<template>
  <div class="cockpit-notify-modal">
    <div class="cockpit-notify-modal__head">
      <span class="cockpit-notify-modal__title">
        🔔 {{ t('cockpit.notifyTitle') }}
        <span class="cockpit-notify-modal__sub">· {{ store.notifyCount }} {{ t('cockpit.notifyUnread') }}</span>
      </span>
      <button type="button" class="cockpit-notify-modal__close" @click="store.closeNotify()">✕</button>
    </div>
    <div class="cockpit-notify-modal__filters">
      <span class="cockpit-notify-modal__flabel">{{ t('cockpit.notifySource') }}</span>
      <button
        v-for="s in SOURCES"
        :key="s.key"
        type="button"
        class="cockpit-notify-modal__chip"
        :class="{ 'is-on': store.notifySourceFilter === s.key }"
        @click="store.setNotifySourceFilter(s.key)"
      >{{ t(s.labelKey) }}</button>
    </div>
    <div class="cockpit-notify-modal__list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="cockpit-notify-modal__item"
        :data-notify-id="item.id"
        @click="onItemClick(item)"
      >
        <span class="cockpit-notify-modal__avatar" :class="'is-' + item.kind">{{ KIND_ICON[item.kind] }}</span>
        <div class="cockpit-notify-modal__body">
          <div class="cockpit-notify-modal__row1">
            <span class="cockpit-notify-modal__kind">{{ KIND_LABEL[item.kind] }}</span>
            <span class="cockpit-notify-modal__name">{{ item.title }}</span>
            <span class="cockpit-notify-modal__when">{{ timeStr(item.ts) }}</span>
          </div>
          <div class="cockpit-notify-modal__preview">{{ item.preview }}</div>
        </div>
        <span class="cockpit-notify-modal__count">{{ item.count }}</span>
      </button>
      <div v-if="!items.length" class="cockpit-notify-modal__empty">
        {{ t('cockpit.notifyEmpty') }}
      </div>
    </div>
    <div class="cockpit-notify-modal__foot">
      <span class="cockpit-notify-modal__hint">{{ t('cockpit.notifyClickHint') }}</span>
      <button v-if="items.length" type="button" class="cockpit-notify-modal__readall" @click="store.clearAllNotify()">
        {{ t('cockpit.notifyReadAll') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 复用 HistoryModal 样式语言（Pure Ink CSS 变量，无新色值） */
.cockpit-notify-modal { display: flex; flex-direction: column; width: 480px; max-width: 92vw; max-height: 78vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.cockpit-notify-modal__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-notify-modal__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-notify-modal__sub { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.cockpit-notify-modal__close { cursor: pointer; color: var(--text-muted); font-size: 16px; width: 24px; height: 24px; border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-notify-modal__filters { padding: 12px 18px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cockpit-notify-modal__flabel { font-size: 10px; color: var(--text-muted); width: 44px; flex-shrink: 0; font-weight: 600; }
.cockpit-notify-modal__chip { font-size: 10px; padding: 2px 9px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-notify-modal__list { flex: 1; overflow-y: auto; padding: 4px 0; }
.cockpit-notify-modal__item { display: flex; align-items: flex-start; gap: 11px; padding: 10px 18px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font: inherit; border-bottom: 1px solid var(--border-light); color: var(--text-primary);
  &:hover { background: var(--bg-secondary); }
}
.cockpit-notify-modal__avatar { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: var(--text-on-accent); }
.cockpit-notify-modal__avatar.is-matrix { background: var(--text-primary); }
.cockpit-notify-modal__avatar.is-chat { background: var(--text-secondary); }
.cockpit-notify-modal__avatar.is-group { background: var(--text-muted); }
.cockpit-notify-modal__body { flex: 1; min-width: 0; }
.cockpit-notify-modal__row1 { display: flex; align-items: center; gap: 6px; }
.cockpit-notify-modal__kind { font-size: 9px; padding: 0 5px; border-radius: 2px; background: var(--bg-secondary); color: var(--text-secondary); font-family: ui-monospace, monospace; }
.cockpit-notify-modal__name { font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cockpit-notify-modal__when { font-size: 9px; color: var(--text-muted); font-family: ui-monospace, monospace; flex-shrink: 0; }
.cockpit-notify-modal__preview { font-size: 11px; color: var(--text-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cockpit-notify-modal__count { flex-shrink: 0; background: var(--error); color: var(--text-on-accent); font-size: 9px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.cockpit-notify-modal__empty { padding: 32px 18px; text-align: center; font-size: 12px; color: var(--text-muted); }
.cockpit-notify-modal__foot { padding: 10px 18px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); }
.cockpit-notify-modal__hint { font-size: 10px; color: var(--text-muted); }
.cockpit-notify-modal__readall { font-size: 11px; padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); color: var(--text-primary); }
}
</style>

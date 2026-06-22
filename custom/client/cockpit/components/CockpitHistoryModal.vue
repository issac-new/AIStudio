<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const ACTIONS = ['审批', '决策', '补充', '评估', '委派']
const ARCHIVE_OPTS: { key: 'all' | 'only' | 'exclude'; labelKey: string }[] = [
  { key: 'all', labelKey: 'cockpit.historyAll' },
  { key: 'only', labelKey: 'cockpit.historyArchivedOnly' },
  { key: 'exclude', labelKey: 'cockpit.historyActiveOnly' },
]

const items = computed(() => store.filteredHistory)
</script>

<template>
  <div class="cockpit-history-modal">
    <div class="cockpit-history-modal__head">
      <span class="cockpit-history-modal__title">🕘 {{ t('cockpit.historyTitle') }}</span>
      <button type="button" data-action="close" class="cockpit-history-modal__close" @click="store.closeHistory()">✕</button>
    </div>
    <div class="cockpit-history-modal__filters">
      <div class="cockpit-history-modal__frow">
        <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyAction') }}</span>
        <button v-for="a in ACTIONS" :key="a" type="button" :data-action-filter="a"
          class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.actions.includes(a) }"
          @click="store.toggleHistoryAction(a)">{{ a }}</button>
      </div>
      <div class="cockpit-history-modal__frow">
        <span class="cockpit-history-modal__flabel">{{ t('cockpit.historyStatus') }}</span>
        <button v-for="o in ARCHIVE_OPTS" :key="o.key" type="button"
          class="cockpit-history-modal__chip" :class="{ 'is-on': store.historyFilters.archived === o.key }"
          @click="store.setHistoryArchivedFilter(o.key)">{{ t(o.labelKey) }}</button>
      </div>
    </div>
    <div class="cockpit-history-modal__list">
      <button v-for="h in items" :key="h.id" type="button" :data-history-id="h.id"
        class="cockpit-history-modal__item" :class="{ 'is-archived': h.archived }"
        @click="store.recallHistoryItem(h.id)">
        <span class="cockpit-history-modal__when">{{ h.when }}</span>
        <span class="cockpit-history-modal__dot" />
        <span class="cockpit-history-modal__text">{{ h.title }}</span>
        <span class="cockpit-history-modal__action">{{ h.action }}</span>
        <span v-if="h.archived" class="cockpit-history-modal__archtag">{{ t('cockpit.historyArchived') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-history-modal { display: flex; flex-direction: column; width: 540px; max-width: 92vw; max-height: 78vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.cockpit-history-modal__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-history-modal__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-history-modal__close { cursor: pointer; color: var(--text-muted); font-size: 16px; width: 24px; height: 24px; border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px; font: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-history-modal__filters { padding: 12px 18px; border-bottom: 1px solid var(--border-light); display: flex; flex-direction: column; gap: 8px; }
.cockpit-history-modal__frow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cockpit-history-modal__flabel { font-size: 10px; color: var(--text-muted); width: 44px; flex-shrink: 0; font-weight: 600; }
.cockpit-history-modal__chip { font-size: 10px; padding: 2px 9px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-history-modal__list { flex: 1; overflow-y: auto; padding: 4px 0; }
.cockpit-history-modal__item { display: flex; align-items: center; gap: 11px; padding: 10px 18px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font: inherit; border-bottom: 1px solid var(--border-light); color: var(--text-primary);
  &:hover { background: var(--bg-secondary); }
  &.is-archived { opacity: 0.55; }
  &.is-archived .cockpit-history-modal__text { color: var(--text-muted); }
}
.cockpit-history-modal__when { flex-shrink: 0; width: 70px; font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.cockpit-history-modal__dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.is-archived .cockpit-history-modal__dot { background: var(--border-color); }
.cockpit-history-modal__text { flex: 1; font-size: 12px; font-weight: 500; }
.cockpit-history-modal__action { font-size: 9px; padding: 0 5px; border: 1px solid var(--border-light); border-radius: 3px; background: var(--bg-card); color: var(--text-muted); }
.cockpit-history-modal__archtag { font-size: 9px; color: var(--text-muted); background: var(--bg-secondary); border-radius: 3px; padding: 0 5px; border: 1px solid var(--border-light); }
</style>

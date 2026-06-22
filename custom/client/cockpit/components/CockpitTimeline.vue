<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const THRESHOLD = 4
const expanded = ref(false)

const recent = computed(() => store.recentEventsForTimeline(THRESHOLD))
const visibleEvents = computed(() =>
  expanded.value ? [...recent.value.folded, ...recent.value.visible] : recent.value.visible,
)
const hasTask = computed(() => !!store.selectedTask)
// 节点级时序源：显示被聚焦节点的 label 作为来源提示；任务级则不显示。
const timelineSourceLabel = computed(() => {
  const nid = store.focusedGraphNodeId
  if (!nid) return null
  return store.topologyForSelectedTask.nodes.find((n) => n.id === nid)?.label ?? null
})
</script>

<template>
  <div class="cockpit-timeline">
    <div class="cockpit-timeline__head">
      <span class="cockpit-timeline__title">{{ t('cockpit.timeline') }}</span>
      <span v-if="timelineSourceLabel" class="cockpit-timeline__source">· {{ timelineSourceLabel }}</span>
    </div>
    <div v-if="hasTask" class="cockpit-timeline__body">
      <button
        v-if="!expanded && recent.folded.length > 0"
        type="button"
        class="cockpit-timeline__fold"
        @click="expanded = true"
      >▸ {{ t('cockpit.olderHistory', { n: recent.folded.length }) }}</button>
      <div class="cockpit-timeline__line">
        <button
          v-for="ev in visibleEvents"
          :key="ev.id"
          type="button"
          :data-event-id="ev.id"
          class="cockpit-timeline__event"
          :class="{
            'is-selected': store.selectedTimelineNodeId === ev.id,
            'is-pending': ev.pending,
          }"
          @click="store.focusOnTimelineNode(ev.id)"
        >
          <span class="cockpit-timeline__event-head">
            <span class="cockpit-timeline__actor">{{ ev.actor }}</span>
            <span class="cockpit-timeline__kind">{{ ev.kind }}</span>
            <span class="cockpit-timeline__when">{{ ev.when }}</span>
          </span>
          <span class="cockpit-timeline__what">{{ ev.what }}</span>
          <span class="cockpit-timeline__state">{{ ev.pending ? t('cockpit.pending') : t('cockpit.done') }}</span>
        </button>
      </div>
    </div>
    <div v-else class="cockpit-timeline__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-timeline { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cockpit-timeline__head { padding: 8px 16px; }
.cockpit-timeline__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-timeline__source { font-size: 10px; color: var(--text-muted); margin-left: 6px; }
.cockpit-timeline__body { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
.cockpit-timeline__fold {
  display: block; width: 100%; text-align: left; padding: 5px 9px; margin: 4px 0 6px 18px;
  border: 1px dashed var(--border-color); border-radius: 6px; background: var(--bg-card);
  font-size: 10px; color: var(--text-muted); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); color: var(--text-secondary); }
}
.cockpit-timeline__line { position: relative; padding-left: 20px; }
.cockpit-timeline__line::before {
  content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 1px; background: var(--border-color);
}
.cockpit-timeline__event {
  position: relative; display: flex; flex-direction: column; gap: 1px;
  width: 100%; text-align: left; padding: 6px 9px; margin-bottom: 10px;
  border: 1px solid transparent; border-radius: 6px; background: none;
  cursor: pointer; font-family: inherit; color: var(--text-primary);
  &::before {
    content: ''; position: absolute; left: -19px; top: 9px; width: 9px; height: 9px;
    border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--text-muted);
  }
  &:hover { background: var(--bg-card-hover); }
  &.is-selected { background: var(--bg-secondary); &::before { background: var(--accent-primary); border-color: var(--accent-primary); } }
  &.is-pending::before { background: var(--warning); border-color: var(--warning); }
}
.cockpit-timeline__event-head { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--text-secondary); }
.cockpit-timeline__actor { font-weight: 500; }
.cockpit-timeline__kind { font-size: 8px; padding: 0 5px; border-radius: 2px; background: var(--bg-secondary); }
.cockpit-timeline__when { margin-left: auto; font-size: 9px; color: var(--text-muted); }
.cockpit-timeline__what { font-size: 12px; color: var(--text-primary); }
.cockpit-timeline__state { font-size: 9px; color: var(--text-muted); }
.cockpit-timeline__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>

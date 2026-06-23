<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const THRESHOLD = 4
const expanded = ref(false)

// 组件层直接读 store 的原始数据 + 本地 filter 计算（避免 Pinia 代理响应式断裂）
const allFilteredEvents = computed(() => {
  const all = store.eventsForSelectedTask ?? []
  const f = store.timelineActorFilter
  if (!f || f.length === 0) return all
  return all.filter(e => f.includes(e.actor))
})
const recent = computed(() => {
  const all = allFilteredEvents.value
  if (all.length <= THRESHOLD) return { visible: all, folded: [] as any[] }
  return { visible: all.slice(0, THRESHOLD), folded: all.slice(THRESHOLD) }
})
const visibleEvents = computed(() =>
  expanded.value ? [...recent.value.folded, ...recent.value.visible] : recent.value.visible,
)
const hasTask = computed(() => !!store.selectedTask)

// 双击事件节点：按 source 类型弹窗显示完整内容
function onEventDblClick(ev: { taskId: string; fullText: string; source: string; actor: string }) {
  const titleMap: Record<string, string> = {
    event: '事件详情',
    run: '执行记录',
    comment: '评论',
    log: 'Worker Log',
    message: '对话消息',
  }
  const title = titleMap[ev.source] ?? '事件详情'
  store.openTitleDetail(ev.taskId, ev.fullText, title)
}
</script>

<template>
  <div class="cockpit-timeline">
    <div class="cockpit-timeline__head">
      <span class="cockpit-timeline__title">{{ t('cockpit.timeline') }}</span>
    </div>
    <!-- actor 标签过滤（多选） -->
    <div v-if="hasTask && store.timelineActorOptions.length" class="cockpit-timeline__actors">
      <button
        v-for="actor in store.timelineActorOptions"
        :key="actor"
        type="button"
        class="cockpit-timeline__actor-chip"
        :class="{ 'is-on': store.timelineActorFilter.includes(actor) }"
        :data-actor-filter="actor"
        @click="store.toggleTimelineActor(actor)"
      >{{ actor }}</button>
    </div>
    <div v-if="hasTask" class="cockpit-timeline__body">
      <div class="cockpit-timeline__line">
        <button
          v-for="ev in visibleEvents"
          :key="ev.id"
          type="button"
          :data-event-id="ev.id"
          class="cockpit-timeline__event"
          :class="{ 'is-pending': ev.pending }"
          @click="store.focusOnTimelineNode(ev.id)"
          @dblclick.stop="onEventDblClick(ev)"
        >
          <span class="cockpit-timeline__event-head">
            <span class="cockpit-timeline__actor">{{ ev.actor }}</span>
            <span class="cockpit-timeline__kind">{{ ev.kind }}</span>
            <span class="cockpit-timeline__source" :data-source="ev.source">{{ ev.source }}</span>
            <span v-if="store.selectedTask?.assignee" class="cockpit-timeline__assignee" :data-assignee="store.selectedTask.assignee">@{{ store.selectedTask.assignee }}</span>
            <span class="cockpit-timeline__when">{{ ev.when }}</span>
          </span>
          <span class="cockpit-timeline__what">{{ ev.what }}</span>
          <span class="cockpit-timeline__state">{{ ev.pending ? t('cockpit.pending') : t('cockpit.done') }}</span>
        </button>
      </div>
      <button
        v-if="!expanded && recent.folded.length > 0"
        type="button"
        class="cockpit-timeline__fold"
        @click="expanded = true"
      >▾ {{ t('cockpit.olderHistory', { n: recent.folded.length }) }}</button>
    </div>
    <div v-else class="cockpit-timeline__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-timeline { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cockpit-timeline__head { padding: 8px 16px; }
.cockpit-timeline__actors { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 16px 6px; }
.cockpit-timeline__actor-chip {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-timeline__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-timeline__body { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
.cockpit-timeline__fold {
  display: block; width: 100%; text-align: left; padding: 5px 9px; margin: 6px 0 4px 18px;
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
  &.is-pending::before { background: var(--warning); border-color: var(--warning); }
}
.cockpit-timeline__event-head { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--text-secondary); }
.cockpit-timeline__actor { font-weight: 500; }
.cockpit-timeline__kind { font-size: 8px; padding: 0 5px; border-radius: 2px; background: var(--bg-secondary); }
.cockpit-timeline__source { font-size: 8px; padding: 0 4px; border-radius: 2px; border: 1px solid var(--border-light); color: var(--text-muted); text-transform: uppercase; }
.cockpit-timeline__assignee { font-size: 9px; color: var(--text-muted); font-family: monospace; }
.cockpit-timeline__when { margin-left: auto; font-size: 9px; color: var(--text-muted); }
.cockpit-timeline__what { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.cockpit-timeline__state { font-size: 9px; color: var(--text-muted); }
.cockpit-timeline__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>

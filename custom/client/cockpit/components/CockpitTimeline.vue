<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const THRESHOLD = 4
const expanded = ref(false)

// 本地内容搜索
const contentSearch = ref('')

// 本地 actor filter（完全脱离 store 响应式，纯组件内控制）
const localActorFilter = ref<string[]>([])

// actor 选项（从事件去重）
const actorOptions = computed(() => {
  const set = new Set<string>()
  for (const e of (store.eventsForSelectedTask ?? [])) set.add(e.actor)
  return [...set].sort()
})

function toggleActor(actor: string) {
  const i = localActorFilter.value.indexOf(actor)
  if (i >= 0) {
    localActorFilter.value = localActorFilter.value.filter(a => a !== actor)
  } else {
    localActorFilter.value = [...localActorFilter.value, actor]
  }
}

// 事件内容搜索匹配（what / actor / kind / source / when）
function matchEvent(e: any, q: string): boolean {
  const fields = [e.what, e.actor, e.kind, e.source, e.when].filter(Boolean)
  return fields.some(f => String(f).toLowerCase().includes(q))
}

// 组件内 filter 计算（依赖 localActorFilter + contentSearch + store.eventsForSelectedTask）
const allFilteredEvents = computed(() => {
  const all = store.eventsForSelectedTask ?? []
  const f = localActorFilter.value
  const q = contentSearch.value.trim().toLowerCase()
  return all.filter(e => {
    if (f.length > 0 && !f.includes(e.actor)) return false
    if (q && !matchEvent(e, q)) return false
    return true
  })
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

// 切任务时清空 filter
watch(() => store.selectedTaskId, () => {
  localActorFilter.value = []
  expanded.value = false
})

// 双击事件节点：按 source 类型弹窗显示完整内容
function onEventDblClick(ev: { taskId: string; fullText: string; source: string; actor: string; id?: string }) {
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
      <div class="cockpit-timeline__search">
        <span class="cockpit-timeline__search-icon">🔍</span>
        <input
          type="text"
          class="cockpit-timeline__search-input"
          v-model="contentSearch"
          :placeholder="t('cockpit.searchEvents')"
          data-timeline-search
        />
        <button v-if="contentSearch" type="button" class="cockpit-timeline__search-clear" @click="contentSearch = ''">×</button>
      </div>
    </div>
    <!-- actor 标签过滤（多选） -->
    <div v-if="hasTask && actorOptions.length" class="cockpit-timeline__actors">
      <button
        v-for="actor in actorOptions"
        :key="actor"
        type="button"
        class="cockpit-timeline__actor-chip"
        :class="{ 'is-on': localActorFilter.includes(actor) }"
        :data-actor-filter="actor"
        @click="toggleActor(actor)"
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
.cockpit-timeline__head { padding: 10px 16px 8px; display: flex; align-items: center; gap: 10px; }
.cockpit-timeline__search { position: relative; display: flex; align-items: center; flex: 1; min-width: 0; }
.cockpit-timeline__search-icon {
  position: absolute; left: 6px; font-size: 10px; color: var(--text-muted); pointer-events: none; line-height: 1;
}
.cockpit-timeline__search-input {
  width: 100%; font-size: 11px; padding: 3px 22px 3px 22px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-card); color: var(--text-secondary); font-family: inherit; outline: none;
  &::placeholder { color: var(--text-muted); opacity: 0.6; }
  &:focus { border-color: var(--accent-primary); }
}
.cockpit-timeline__search-clear {
  position: absolute; right: 4px; width: 16px; height: 16px; padding: 0;
  border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1;
  &:hover { color: var(--text-primary); }
}
.cockpit-timeline__actors { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 16px 6px; }
.cockpit-timeline__actor-chip {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  border: 1px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-timeline__title { font-size: 13px; font-weight: 700; color: var(--text-primary); flex-shrink: 0; }
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
  position: relative; display: flex; flex-direction: column; gap: 2px;
  width: 100%; text-align: left; padding: 8px 10px; margin-bottom: 8px;
  border: 1px solid transparent; border-radius: 6px; background: none;
  cursor: pointer; font-family: inherit; color: var(--text-primary);
  transition: background 0.12s, border-color 0.12s;
  &::before {
    content: ''; position: absolute; left: -19px; top: 11px; width: 9px; height: 9px;
    border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--text-muted);
  }
  &:hover { background: var(--bg-card-hover); }
  &.is-pending::before { background: var(--warning); border-color: var(--warning); }
}
.cockpit-timeline__event-head { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--text-secondary); }
.cockpit-timeline__actor { font-weight: 500; }
.cockpit-timeline__kind { font-size: 10px; padding: 0 5px; border-radius: 2px; background: var(--bg-secondary); }
.cockpit-timeline__source { font-size: 10px; padding: 0 4px; border-radius: 2px; border: 1px solid var(--border-color); color: var(--text-muted); text-transform: uppercase; }
.cockpit-timeline__assignee { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.cockpit-timeline__when { margin-left: auto; font-size: 10px; color: var(--text-muted); }
.cockpit-timeline__what { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.cockpit-timeline__state { font-size: 10px; color: var(--text-muted); }
.cockpit-timeline__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; padding: 40px 16px; text-align: center; }
</style>

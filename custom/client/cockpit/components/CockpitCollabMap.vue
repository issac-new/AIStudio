<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCockpitStore, type TopologyLevel } from '@/custom/cockpit/store/cockpit'
import CockpitGraphNode from './CockpitGraphNode.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const levels: { key: TopologyLevel; labelKey: string }[] = [
  { key: 'project', labelKey: 'cockpit.levelProject' },
  { key: 'req', labelKey: 'cockpit.levelRequirement' },
  { key: 'app', labelKey: 'cockpit.levelApp' },
]

const LAYOUT = [
  { left: 14, top: 20 }, { left: 124, top: 20 }, { left: 234, top: 20 },
  { left: 124, top: 74 }, { left: 14, top: 74 }, { left: 234, top: 74 },
]
const positions = ref<Record<string, { left: number; top: number }>>({})
function posFor(id: string, index: number) {
  return positions.value[id] ?? LAYOUT[index % LAYOUT.length]
}
function onDrag(id: string, p: { left: number; top: number }) {
  positions.value = { ...positions.value, [id]: p }
}
// 切换任务时清空旧节点位置，避免上一个任务的拖拽位置残留
watch(
  () => store.selectedTaskId,
  () => { positions.value = {} },
)

const nodes = computed(() => store.topologyForSelectedTask.nodes)
const links = computed(() => {
  const out: { from: string; to: string }[] = []
  for (const n of nodes.value) for (const to of n.links ?? []) out.push({ from: n.id, to })
  return out
})
const hasTask = computed(() => !!store.selectedTask)
const relations = computed(() => store.relationsForSelectedTask)
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <div class="cockpit-map__levels">
        <button
          v-for="lv in levels"
          :key="lv.key"
          type="button"
          :data-level="lv.key"
          class="cockpit-map__level"
          :class="{ 'is-on': store.topologyLevel === lv.key }"
          @click="store.setTopologyLevel(lv.key)"
        >{{ t(lv.labelKey) }}</button>
      </div>
    </div>
    <div v-if="hasTask" class="cockpit-map__canvas">
      <svg class="cockpit-map__svg" viewBox="0 0 320 120" preserveAspectRatio="none">
        <line
          v-for="(l, i) in links"
          :key="i"
          :x1="posFor(l.from, 0).left + 32"
          :y1="posFor(l.from, 0).top + 12"
          :x2="posFor(l.to, 1).left + 32"
          :y2="posFor(l.to, 1).top + 12"
          stroke="var(--text-muted)"
          stroke-width="1.5"
        />
        <g v-for="r in relations" :key="r.id">
          <line
            :x1="posFor(r.from, 0).left + 32" :y1="posFor(r.from, 0).top + 12"
            :x2="posFor(r.to, 1).left + 32" :y2="posFor(r.to, 1).top + 12"
            stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="3,2"
          />
          <text
            :x="(posFor(r.from, 0).left + posFor(r.to, 1).left) / 2 + 32"
            :y="(posFor(r.from, 0).top + posFor(r.to, 1).top) / 2 + 6"
            font-size="8" fill="var(--text-muted)" text-anchor="middle"
          >{{ r.label }}</text>
        </g>
      </svg>
      <span class="cockpit-map__hint">拖拽节点 · 点节点切时序源</span>
      <CockpitGraphNode
        v-for="(n, i) in nodes"
        :key="n.id"
        :node="n"
        :task-id="store.selectedTaskId!"
        :left="posFor(n.id, i).left"
        :top="posFor(n.id, i).top"
        @drag="(p: { left: number; top: number }) => onDrag(n.id, p)"
      />
    </div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.cockpit-map__head { display: flex; align-items: center; gap: 8px; padding: 8px 16px 4px; }
.cockpit-map__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-map__levels { display: flex; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); padding: 2px; margin-left: auto; }
.cockpit-map__level {
  font-size: 10px; padding: 3px 9px; border-radius: 4px; cursor: pointer; color: var(--text-muted);
  border: none; background: transparent; font-family: inherit;
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); }
}
.cockpit-map__canvas {
  position: relative; height: 120px;
  background: var(--bg-secondary);
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 14px 14px;
  overflow: hidden;
}
.cockpit-map__svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>

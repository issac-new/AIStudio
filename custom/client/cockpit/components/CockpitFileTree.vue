<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import CockpitFileNode from './CockpitFileNode.vue'

const store = useCockpitStore()
const { t } = useI18n()
const filter = ref('')

const rootFiles = computed(() => store.filesForSelectedTask)
const workspace = computed(() => store.selectedTask?.workspace ?? '')
const hasTask = computed(() => !!store.selectedTask)
</script>

<template>
  <div class="cockpit-file-tree">
    <div class="cockpit-file-tree__head">
      <span class="cockpit-file-tree__title">{{ t('cockpit.taskFiles') }}</span>
      <span class="cockpit-file-tree__sub">{{ t('cockpit.currentTaskWorkspace') }}</span>
      <code v-if="hasTask" class="cockpit-file-tree__root">{{ workspace }}</code>
      <input v-model="filter" class="cockpit-file-tree__filter" :placeholder="t('cockpit.filterFiles')">
    </div>
    <div class="cockpit-file-tree__list">
      <template v-if="hasTask">
        <CockpitFileNode
          v-for="node in rootFiles"
          :key="node.id"
          :node="node"
          :depth="0"
          :filter="filter"
        />
      </template>
      <div v-else class="cockpit-file-tree__empty">{{ t('cockpit.noTaskSelected') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-file-tree { display: flex; flex-direction: column; flex: 0 0 240px; border-left: 1px solid var(--border-color); background: var(--bg-sidebar); min-height: 0; }
.cockpit-file-tree__head { flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--border-light); background: var(--bg-card); display: flex; flex-direction: column; gap: 4px; }
.cockpit-file-tree__title { font-size: 11px; font-weight: 700; color: var(--text-primary); }
.cockpit-file-tree__sub { font-size: 9px; color: var(--text-muted); }
.cockpit-file-tree__root { font-family: ui-monospace, monospace; font-size: 9px; color: var(--text-secondary); background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; word-break: break-all; }
.cockpit-file-tree__filter { font-family: inherit; font-size: 10px; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); }
.cockpit-file-tree__list { flex: 1; overflow-y: auto; padding: 6px 0; }
.cockpit-file-tree__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>

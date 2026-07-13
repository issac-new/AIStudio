<!-- overlay/custom/client/loop/components/LoopTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import { toLoopTableRow } from '@/custom/loop/adapters/loop-adapter'
import type { LoopStatus } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'select', id: string): void }>()

// C7: 接收父组件传入的 status 筛选(undefined 表示全部)。
const props = defineProps<{ filter?: LoopStatus | undefined }>()

// C7: 根据 filter 筛选 store.loops,再做表格行映射。
const rows = computed(() => {
  const loops = props.filter
    ? store.loops.filter(l => l.status === props.filter)
    : store.loops
  return loops.map(toLoopTableRow)
})
</script>

<template>
  <div class="loop-table">
    <div class="loop-table__header">
      <span class="loop-table__col loop-table__col--status">{{ t('loop.table.status') }}</span>
      <span class="loop-table__col loop-table__col--name">{{ t('loop.table.name') }}</span>
      <span class="loop-table__col">{{ t('loop.table.stage') }}</span>
      <span class="loop-table__col">{{ t('loop.table.nextTick') }}</span>
      <span class="loop-table__col">{{ t('loop.table.progress') }}</span>
      <span class="loop-table__col">{{ t('loop.table.cost') }}</span>
      <span class="loop-table__col">{{ t('loop.table.actions') }}</span>
    </div>
    <div class="loop-table__row" v-for="row in rows" :key="row.id"
      :class="`loop-table__row--${row.status}`"
      @click="emit('select', row.id)">
      <span class="loop-table__col loop-table__col--status">{{ row.statusIcon }}</span>
      <span class="loop-table__col loop-table__col--name">{{ row.name }}</span>
      <span class="loop-table__col">{{ row.stage }}</span>
      <span class="loop-table__col">{{ row.nextTick }}</span>
      <span class="loop-table__col">{{ row.progress }}</span>
      <span class="loop-table__col" :class="{ 'loop-table__cost--warning': row.costWarning }">{{ row.cost }}</span>
      <span class="loop-table__col loop-table__actions">
        <button @click.stop="store.tickLoop(row.id).catch(() => {})">▶</button>
        <button @click.stop="store.pauseLoop(row.id).catch(() => {})">⏸</button>
        <button @click.stop="store.deleteLoop(row.id).catch(() => {})">🗑</button>
      </span>
    </div>
  </div>
</template>

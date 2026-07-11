<!-- overlay/custom/client/loop/components/LoopTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'
import { toLoopTableRow } from '@/custom/loop/adapters/loop-adapter'

const store = useLoopStore()
const emit = defineEmits<{ (e: 'select', id: string): void }>()

const rows = computed(() => store.loops.map(toLoopTableRow))
</script>

<template>
  <div class="loop-table">
    <div class="loop-table__header">
      <span class="loop-table__col loop-table__col--status">状态</span>
      <span class="loop-table__col loop-table__col--name">Loop 名称</span>
      <span class="loop-table__col">阶段</span>
      <span class="loop-table__col">下次tick</span>
      <span class="loop-table__col">进度</span>
      <span class="loop-table__col">费用</span>
      <span class="loop-table__col">操作</span>
    </div>
    <div class="loop-table__row" v-for="row in rows" :key="row.id"
      :style="{ color: row.statusColor }"
      @click="emit('select', row.id)">
      <span class="loop-table__col loop-table__col--status">{{ row.statusIcon }}</span>
      <span class="loop-table__col loop-table__col--name">{{ row.name }}</span>
      <span class="loop-table__col">{{ row.stage }}</span>
      <span class="loop-table__col">{{ row.nextTick }}</span>
      <span class="loop-table__col">{{ row.progress }}</span>
      <span class="loop-table__col" :class="{ 'loop-table__cost--warning': row.costWarning }">{{ row.cost }}</span>
      <span class="loop-table__col loop-table__actions">
        <button @click.stop="store.tickLoop(row.id)">▶</button>
        <button @click.stop="store.pauseLoop(row.id)">⏸</button>
        <button @click.stop="store.deleteLoop(row.id)">🗑</button>
      </span>
    </div>
  </div>
</template>

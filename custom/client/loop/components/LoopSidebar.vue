<!-- overlay/custom/client/loop/components/LoopSidebar.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLoopStore } from '@/custom/loop/store/loop'

const store = useLoopStore()

const groups = computed(() => [
  { label: '全部', count: store.loops.length, status: undefined, icon: '📋' },
  { label: '运行中', count: store.activeLoops.length, status: 'running' as const, icon: '●' },
  { label: '待审批', count: store.awaitingReviewLoops.length, status: 'awaiting-review' as const, icon: '⚠' },
  { label: '阻塞', count: store.blockedLoops.length, status: 'blocked' as const, icon: '▣' },
  { label: '已归档', count: store.archivedLoops.length, status: 'completed' as const, icon: '✓' },
])

const activeFilter = ref<string | undefined>(undefined)

function selectGroup(status?: string) {
  activeFilter.value = status
}
</script>

<template>
  <div class="loop-sidebar">
    <div class="loop-sidebar__group"
      v-for="g in groups" :key="g.label"
      :class="{ 'loop-sidebar__group--active': activeFilter === g.status }"
      @click="selectGroup(g.status)">
      <span class="loop-sidebar__icon">{{ g.icon }}</span>
      <span class="loop-sidebar__label">{{ g.label }}</span>
      <span class="loop-sidebar__count">{{ g.count }}</span>
    </div>
  </div>
</template>

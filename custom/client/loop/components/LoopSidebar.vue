<!-- overlay/custom/client/loop/components/LoopSidebar.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'

const store = useLoopStore()
const { t } = useI18n()

// C7: emit filter-change 给父组件,父组件再传给 LoopTable。
const emit = defineEmits<{ (e: 'filter-change', status?: string): void }>()

const groups = computed(() => [
  { label: t('loop.sidebar.all'), count: store.loops.length, status: undefined, icon: '📋' },
  { label: t('loop.sidebar.running'), count: store.activeLoops.length, status: 'running' as const, icon: '●' },
  { label: t('loop.sidebar.awaitingReview'), count: store.awaitingReviewLoops.length, status: 'awaiting-review' as const, icon: '⚠' },
  { label: t('loop.sidebar.blocked'), count: store.blockedLoops.length, status: 'blocked' as const, icon: '▣' },
  { label: t('loop.sidebar.archived'), count: store.archivedLoops.length, status: 'completed' as const, icon: '✓' },
])

const activeFilter = ref<string | undefined>(undefined)

function selectGroup(status?: string) {
  activeFilter.value = status
  // C7: 通知父组件当前选中的 status(undefined 表示 "全部")。
  emit('filter-change', status)
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

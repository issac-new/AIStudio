<!-- overlay/custom/client/loop/views/LoopSpineView.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopSidebar from '@/custom/loop/components/LoopSidebar.vue'
import LoopTable from '@/custom/loop/components/LoopTable.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'
import type { LoopStatus } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()
const showWizard = ref(false)
// C7: 从 LoopSidebar 接收筛选状态,传递给 LoopTable。
const activeFilter = ref<LoopStatus | undefined>(undefined)

onMounted(() => { store.fetchLoops() })

function onSelect(id: string) {
  // 路由跳转保留原有行为。
  void id
}

function onFilterChange(status?: string) {
  activeFilter.value = status as LoopStatus | undefined
}
</script>

<template>
  <div class="loop-spine">
    <div class="loop-spine__sidebar">
      <LoopSidebar @filter-change="onFilterChange" />
      <button class="loop-spine__new" @click="showWizard = true">{{ t('loop.newLoop') }}</button>
    </div>
    <div class="loop-spine__main">
      <h2 class="loop-spine__title">{{ t('loop.title') }}</h2>
      <!-- I8: 加载/错误态 -->
      <div v-if="store.loading" class="loop-spine__spinner" />
      <div v-else-if="store.error" class="loop-spine__error">{{ store.error }}</div>
      <LoopTable v-else :filter="activeFilter" @select="onSelect" />
    </div>
    <LoopCreateWizard v-if="showWizard" @close="showWizard = false" />
  </div>
</template>

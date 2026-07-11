<!-- overlay/custom/client/loop/views/LoopDetailView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLoopStore } from '@/custom/loop/store/loop'
import StageRing from '@/custom/loop/components/StageRing.vue'
import VerifierPanel from '@/custom/loop/components/VerifierPanel.vue'

const store = useLoopStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref<'history' | 'workers' | 'relations' | 'todo'>('history')
const granularity = ref(2)

onMounted(() => {
  const id = route.params.id as string
  store.fetchLoop(id)
  store.connectSocket(id)
})
onUnmounted(() => { store.disconnectSocket() })

const loop = computed(() => store.currentLoop)
const events = computed(() => store.currentEvents)
</script>

<template>
  <div class="loop-detail" v-if="loop">
    <div class="loop-detail__header">
      <button @click="router.back()">← 返回</button>
      <span class="loop-detail__name">{{ loop.name }}</span>
      <button @click="store.tickLoop(loop.id)">▶ 运行</button>
      <button @click="store.pauseLoop(loop.id)">⏸ 暂停</button>
    </div>
    <div class="loop-detail__meta">
      <span>pattern: {{ loop.pattern }}</span>
      <span>level: {{ loop.autonomyLevel }}</span>
      <span>goal: {{ loop.goal }}</span>
      <span>stop: {{ loop.stopCondition }}</span>
    </div>
    <StageRing :current-stage="loop.stage" :events="events" />
    <div class="loop-detail__budget">
      ${{ loop.stats.totalCost.toFixed(2) }} / ${{ loop.budget.maxCostTotal.toFixed(2) }}
    </div>
    <div class="loop-detail__tabs">
      <button v-for="tab in ['history','workers','relations','todo']" :key="tab"
        :class="{ active: activeTab === tab }" @click="activeTab = tab as any">{{ tab }}</button>
    </div>
    <div class="loop-detail__tab-content" v-if="activeTab === 'history'">
      <input type="range" min="0" max="3" v-model="granularity" />
      <div v-for="event in events.slice(-20 * granularity)" :key="(event as any).ts" class="loop-detail__event">
        <span class="loop-detail__event-ts">{{ (event as any).ts?.slice(11, 19) }}</span>
        <span class="loop-detail__event-type">{{ event.type }}</span>
      </div>
    </div>
  </div>
</template>

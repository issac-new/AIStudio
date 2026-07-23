<!-- overlay/custom/client/loop/views/LoopSpineView.vue -->
<!-- LoopSpineView — 循环工程总览（统一入口，含迷你图 + 待办区 + 引导） -->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopSidebar from '@/custom/loop/components/LoopSidebar.vue'
import LoopTable from '@/custom/loop/components/LoopTable.vue'
import LoopGraph from '@/custom/loop/components/LoopGraph.vue'
import LoopOnboarding from '@/custom/loop/components/LoopOnboarding.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'
import type { LoopStatus } from '@/custom/loop/types'

const store = useLoopStore()
const { t } = useI18n()
const router = useRouter()
const showWizard = ref(false)
const activeFilter = ref<LoopStatus | undefined>(undefined)

onMounted(() => { store.fetchLoops() })

// 待办区：需要人工关注的 loop
const attentionLoops = computed(() =>
  store.loops.filter(l =>
    l.status === 'awaiting-review' || l.status === 'blocked',
  ),
)

const filteredLoops = computed(() => {
  if (!activeFilter.value) return store.loops
  return store.loops.filter(l => l.status === activeFilter.value)
})

function onFilterChange(status?: string) {
  activeFilter.value = status as LoopStatus | undefined
}

function onSelect(id: string) {
  router.push({ name: 'hermes.loopDetail', params: { id } })
}

async function onTick(id: string) {
  await store.tickLoop(id).catch(() => {})
}

async function onPause(id: string) {
  await store.pauseLoop(id).catch(() => {})
}

async function onDelete(id: string) {
  await store.deleteLoop(id).catch(() => {})
}

function onCreate() {
  showWizard.value = true
}

// 创建成功后跳转到详情页
async function onWizardClose() {
  showWizard.value = false
  // 如果刚创建了 loop，跳转到它的详情页
  if (store.currentLoop) {
    router.push({ name: 'hermes.loopDetail', params: { id: store.currentLoop.id } })
  }
}

function stageCount(status: LoopStatus): number {
  return store.loops.filter(l => l.status === status).length
}
</script>

<template>
  <div class="loop-spine">
    <div class="loop-spine__sidebar">
      <LoopSidebar @filter-change="onFilterChange" />
      <button class="loop-spine__new" @click="onCreate">{{ t('loop.newLoop') }}</button>
    </div>

    <div class="loop-spine__main">
      <h2 class="loop-spine__title">{{ t('loop.title') }}</h2>

      <div v-if="store.loading" class="loop-spine__spinner" />
      <div v-else-if="store.error" class="loop-spine__error">{{ store.error }}</div>

      <!-- 空状态引导 -->
      <LoopOnboarding v-else-if="store.loops.length === 0" @create="onCreate" />

      <template v-else>
        <!-- 待办区：需要人工关注的 loop 突出显示 -->
        <div v-if="attentionLoops.length > 0" class="loop-spine__attention">
          <h4>{{ t('loop.attention.title') }} ({{ attentionLoops.length }})</h4>
          <div v-for="loop in attentionLoops" :key="loop.id"
            class="loop-spine__attention-item" @click="onSelect(loop.id)">
            <span class="loop-spine__attention-icon">{{ loop.status === 'awaiting-review' ? '⚠' : '▣' }}</span>
            <span class="loop-spine__attention-name">{{ loop.name }}</span>
            <span class="loop-spine__attention-status">{{ loop.status === 'awaiting-review' ? t('loop.attention.needsReview') : t('loop.attention.blocked') }}</span>
            <LoopGraph :current-stage="loop.stage" :status="loop.status" :events="[]" compact />
          </div>
        </div>

        <!-- 主表格：带迷你图缩略图 -->
        <div class="loop-spine__table">
          <div class="loop-spine__header">
            <span class="loop-spine__col--status"></span>
            <span class="loop-spine__col--name">{{ t('loop.table.name') }}</span>
            <span>{{ t('loop.table.stage') }}</span>
            <span>{{ t('loop.table.graph') }}</span>
            <span>{{ t('loop.table.progress') }}</span>
            <span>{{ t('loop.table.cost') }}</span>
            <span>{{ t('loop.table.actions') }}</span>
          </div>
          <div v-for="loop in filteredLoops" :key="loop.id"
            class="loop-spine__row" @click="onSelect(loop.id)">
            <span class="loop-spine__col--status" :class="`loop-spine__status--${loop.status}`">●</span>
            <span class="loop-spine__col--name">{{ loop.name }}</span>
            <span>{{ t(`loop.stages.${loop.stage}`) }}</span>
            <span class="loop-spine__col--graph">
              <LoopGraph :current-stage="loop.stage" :status="loop.status" :events="[]" compact />
            </span>
            <span>{{ loop.stats.tasksCompleted }}/{{ loop.stats.tasksDiscovered || 0 }}</span>
            <span :class="{ 'loop-spine__cost--warning': loop.stats.totalCost / loop.budget.maxCostTotal > 0.8 }">
              ${{ loop.stats.totalCost.toFixed(2) }}
            </span>
            <span class="loop-spine__actions">
              <button @click.stop="onTick(loop.id)" :title="t('graph.actions.run')">▶</button>
              <button @click.stop="onPause(loop.id)" :title="t('graph.actions.pause')">⏸</button>
              <button @click.stop="onDelete(loop.id)" :title="t('graph.actions.delete')">🗑</button>
            </span>
          </div>
        </div>
      </template>
    </div>

    <LoopCreateWizard v-if="showWizard" @close="onWizardClose" />
  </div>
</template>

<style scoped>
.loop-spine { display: flex; height: 100%; }
.loop-spine__sidebar { width: 200px; padding: 1rem; border-right: 1px solid var(--border-color); }
.loop-spine__new { margin-top: 1rem; width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; background: var(--color-primary, #3b82f6); color: white; border: none; }
.loop-spine__main { flex: 1; padding: 1rem; overflow: auto; }
.loop-spine__title { margin: 0 0 1rem; }
.loop-spine__spinner { padding: 2rem; text-align: center; }
.loop-spine__error { padding: 1rem; color: var(--color-danger, #e11d48); }

.loop-spine__attention {
  margin-bottom: 1rem; padding: 0.75rem;
  border: 1px solid var(--color-warning, #f59e0b); border-radius: 6px;
  background: rgba(245, 158, 11, 0.05);
}
.loop-spine__attention h4 { margin: 0 0 0.5rem; color: var(--color-warning, #f59e0b); }
.loop-spine__attention-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem;
  cursor: pointer; border-radius: 4px;
}
.loop-spine__attention-item:hover { background: var(--hover-bg); }
.loop-spine__attention-name { flex: 1; font-weight: 500; }
.loop-spine__attention-status { font-size: 0.85rem; color: var(--color-warning, #f59e0b); }

.loop-spine__table { border: 1px solid var(--border-color); border-radius: 4px; }
.loop-spine__header, .loop-spine__row { display: flex; align-items: center; padding: 0.5rem 0.75rem; gap: 0.75rem; }
.loop-spine__header { font-weight: bold; border-bottom: 2px solid var(--border-color); font-size: 0.85rem; opacity: 0.7; }
.loop-spine__row { border-bottom: 1px solid var(--border-color); cursor: pointer; }
.loop-spine__row:hover { background: var(--hover-bg); }
.loop-spine__col--status { flex: 0 0 1rem; }
.loop-spine__col--name { flex: 2; font-weight: 500; }
.loop-spine__col--graph { flex: 0 0 200px; }
.loop-spine__status--running { color: var(--color-primary, #3b82f6); }
.loop-spine__status--awaiting-review { color: var(--color-warning, #f59e0b); }
.loop-spine__status--blocked { color: var(--color-danger, #e11d48); }
.loop-spine__status--completed { color: var(--color-success, #28bf5c); }
.loop-spine__status--failed { color: var(--color-danger, #e11d48); }
.loop-spine__status--idle, .loop-spine__status--paused { color: var(--color-text-secondary, #878c99); }
.loop-spine__cost--warning { color: var(--color-danger, #e11d48); }
.loop-spine__actions { display: flex; gap: 0.25rem; }
.loop-spine__actions button { padding: 0.2rem 0.4rem; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; cursor: pointer; font-size: 0.8rem; }
.loop-spine__actions button:hover { background: var(--hover-bg); }
</style>

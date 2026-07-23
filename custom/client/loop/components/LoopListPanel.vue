<!-- overlay/custom/client/loop/components/LoopListPanel.vue -->
<!-- LoopListPanel — 循环工程列表面板（弹窗内总览） -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopGraph from '@/custom/loop/components/LoopGraph.vue'
import LoopOnboarding from '@/custom/loop/components/LoopOnboarding.vue'
import type { LoopEvent } from '@/custom/loop/types'

const emit = defineEmits<{ (e: 'select', id: string): void; (e: 'create'): void }>()
const { t } = useI18n()
const store = useLoopStore()

const attentionLoops = computed(() =>
  store.loops.filter(l => l.status === 'awaiting-review' || l.status === 'blocked'),
)

// 从最近事件提取每个 loop 的最近产出摘要
function lastOutcome(loop: { id: string }): string | null {
  // 简化：用 stats 显示进度，实际产出摘要需要后端事件数据
  return null
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

function statusLabel(status: string): string {
  switch (status) {
    case 'running': return t('loop.status.running')
    case 'awaiting-review': return t('loop.status.awaitingReview')
    case 'blocked': return t('loop.status.blocked')
    case 'completed': return t('loop.status.completed')
    case 'failed': return t('loop.status.failed')
    case 'paused': return t('loop.status.paused')
    default: return t('loop.status.idle')
  }
}
</script>

<template>
  <div class="loop-list">
    <!-- 待办区：需要审批/阻塞的突出显示 -->
    <div v-if="attentionLoops.length > 0" class="loop-list__attention">
      <div v-for="loop in attentionLoops" :key="loop.id"
        class="loop-list__attention-item" @click="emit('select', loop.id)">
        <span class="loop-list__attention-icon">{{ loop.status === 'awaiting-review' ? '⚠' : '▣' }}</span>
        <span class="loop-list__attention-name">{{ loop.name }}</span>
        <span class="loop-list__attention-status">
          {{ loop.status === 'awaiting-review' ? t('loop.attention.needsReview') : t('loop.attention.blocked') }}
        </span>
      </div>
    </div>

    <!-- 空状态引导 -->
    <LoopOnboarding v-if="store.loops.length === 0 && !store.loading" @create="emit('create')" />

    <!-- 列表 -->
    <div v-else class="loop-list__items">
      <div v-for="loop in store.loops" :key="loop.id"
        class="loop-list__item" @click="emit('select', loop.id)">
        <div class="loop-list__item-graph">
          <LoopGraph :current-stage="loop.stage" :status="loop.status" :events="[]" compact />
        </div>
        <div class="loop-list__item-info">
          <div class="loop-list__item-name">{{ loop.name }}</div>
          <div class="loop-list__item-meta">
            <span :class="`loop-list__status--${loop.status}`">{{ statusLabel(loop.status) }}</span>
            <span>{{ t(`loop.stages.${loop.stage}`) }}</span>
            <span>{{ loop.stats.tasksCompleted }}/{{ loop.stats.tasksDiscovered || 0 }} {{ t('loop.tasks') }}</span>
            <span>${{ loop.stats.totalCost.toFixed(2) }}</span>
          </div>
          <div v-if="loop.nextTickAt" class="loop-list__item-next">
            {{ t('loop.nextTickAt') }}: {{ loop.nextTickAt.slice(5, 16).replace('T', ' ') }}
          </div>
        </div>
        <div class="loop-list__item-actions" @click.stop>
          <button @click="onTick(loop.id)" :title="t('graph.actions.run')">▶</button>
          <button @click="onPause(loop.id)" :title="t('graph.actions.pause')">⏸</button>
          <button @click="onDelete(loop.id)" :title="t('graph.actions.delete')">🗑</button>
        </div>
      </div>
    </div>

    <div class="loop-list__footer">
      <button class="loop-list__new" @click="emit('create')">+ {{ t('loop.newLoop') }}</button>
    </div>
  </div>
</template>

<style scoped>
.loop-list { display: flex; flex-direction: column; height: 100%; overflow: auto; }

.loop-list__attention { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); background: rgba(245, 158, 11, 0.05); }
.loop-list__attention-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem; cursor: pointer; border-radius: 4px; }
.loop-list__attention-item:hover { background: var(--hover-bg); }
.loop-list__attention-name { flex: 1; font-weight: 500; }
.loop-list__attention-status { font-size: 0.85rem; color: var(--color-warning, #f59e0b); }

.loop-list__items { flex: 1; overflow: auto; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
.loop-list__item {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;
  cursor: pointer;
}
.loop-list__item:hover { background: var(--hover-bg); border-color: var(--color-primary, #3b82f6); }
.loop-list__item-graph { flex: 0 0 200px; }
.loop-list__item-info { flex: 1; min-width: 0; }
.loop-list__item-name { font-weight: 600; margin-bottom: 0.25rem; }
.loop-list__item-meta { display: flex; gap: 1rem; font-size: 0.85rem; opacity: 0.8; }
.loop-list__item-next { font-size: 0.8rem; opacity: 0.6; margin-top: 0.25rem; }
.loop-list__status--running { color: var(--color-primary, #3b82f6); }
.loop-list__status--awaiting-review { color: var(--color-warning, #f59e0b); }
.loop-list__status--blocked { color: var(--color-danger, #e11d48); }
.loop-list__status--completed { color: var(--color-success, #28bf5c); }
.loop-list__status--failed { color: var(--color-danger, #e11d48); }
.loop-list__status--idle, .loop-list__status--paused { color: var(--color-text-secondary, #878c99); }
.loop-list__item-actions { display: flex; gap: 0.25rem; }
.loop-list__item-actions button { padding: 0.3rem 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; cursor: pointer; }
.loop-list__item-actions button:hover { background: var(--hover-bg); }

.loop-list__footer { padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); }
.loop-list__new { width: 100%; padding: 0.5rem; border: 1px dashed var(--border-color); border-radius: 6px; background: transparent; cursor: pointer; font-size: 0.9rem; }
.loop-list__new:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
</style>

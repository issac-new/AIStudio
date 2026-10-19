<!-- 全流程推演·运行选择器（2026-10-18 推演区批）：
     一个下拉统一「本轮看哪次运行」，不再让每个面板各打一遍运行目录名。
     数据来自 runcenter 既有运行列表；当前运行不在列表时补进选项。
     选择写 ?run=，刷新/分享保持；面板经 useRunContext 跟随。
     2026-10-19 产品走查批：选项只显示可读日期；目录名留在 title 供排查反查。 -->
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunContext, LAST_RUN_KEY } from '../../composables/useRunContext'
import { buildRunOptions } from '../../utils/run-options'
import { runDisplayName } from '../../run-display'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const runsStore = useRunCenterStore()
const { run } = useRunContext()

const current = computed(() => run.value.trim())
/** 选项构造抽成纯函数（utils/run-options）：空列表且加载完不再把 localStorage
 *  里的旧运行补回选项——清场重建后它会显示成一个不存在的运行（2026-10-19 实测）。 */
const options = computed(() => buildRunOptions(
  (runsStore.sortedRuns ?? []).map(r => r.runId),
  current.value,
  Boolean(runsStore.loading),
))

function selectRun(value: string): void {
  const query = { ...route.query }
  if (value) query.run = value
  else delete query.run
  void router.replace({ query })
}

function onChange(e: Event): void {
  selectRun((e.target as HTMLSelectElement).value)
}

// 无选中 run 时自动落到最新一轮（2026-10-19 走查：运行总览曾停在「选择运行…」
// 空态，而运行记录实际存在；用户看到的应是最近一轮的进度）。
onMounted(() => {
  const fetchRuns = (runsStore as { fetchRuns?: () => Promise<void> }).fetchRuns
  const isTest = typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test'
  if (!isTest && typeof fetchRuns === 'function' && !(runsStore.sortedRuns ?? []).length) void fetchRuns.call(runsStore)
})
watch(options, (list) => {
  if (!current.value && list.length) { selectRun(list[0]); return }
  // 运行记录已被清场：丢掉记忆值与 ?run，面板回到「暂无历史运行」而不是打 404
  if (!list.length && current.value && !runsStore.loading) {
    try { localStorage.removeItem(LAST_RUN_KEY) } catch { /* 隐私模式 */ }
    selectRun('')
  }
}, { immediate: true })
</script>

<template>
  <label class="rs" data-testid="sim-run-selector">
    <span class="rs__label">{{ zh ? '运行记录' : 'Run' }}</span>
    <select
      v-if="options.length"
      class="rs__select"
      :value="current"
      :aria-label="zh ? '选择查看哪次运行' : 'Select a run'"
      @change="onChange"
    >
      <option v-if="!current" value="">{{ zh ? '选择运行…' : 'Select a run…' }}</option>
      <option v-for="r in options" :key="r" :value="r" :title="r">{{ runDisplayName(r) }}</option>
    </select>
    <span v-else class="rs__empty">{{ zh ? '暂无历史运行' : 'No runs yet' }}</span>
  </label>
</template>

<style scoped>
.rs { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.rs__label { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.rs__select {
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 3px 8px;
  max-width: 220px;
}
.rs__select:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.rs__empty { color: var(--text-muted); font-size: 11px; }
</style>

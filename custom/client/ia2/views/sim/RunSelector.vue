<!-- 全流程推演·运行选择器（2026-10-18 推演区批）：
     一个下拉统一「本轮看哪次运行」，不再让每个面板各打一遍运行目录名。
     数据来自 runcenter 既有运行列表；当前运行不在列表时补进选项。
     选择写 ?run=，刷新/分享保持；面板经 useRunContext 跟随。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunContext } from '../../composables/useRunContext'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const runsStore = useRunCenterStore()
const { run } = useRunContext()

const current = computed(() => run.value.trim())
const options = computed(() => {
  const list = (runsStore.sortedRuns ?? []).map(r => r.runId).filter(Boolean)
  if (current.value && !list.includes(current.value)) list.unshift(current.value)
  return list.slice(0, 40)
})

function onChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value
  const query = { ...route.query }
  if (value) query.run = value
  else delete query.run
  void router.replace({ query })
}
</script>

<template>
  <label class="rs" data-testid="sim-run-selector">
    <span class="rs__label">{{ zh ? '本轮运行' : 'Run' }}</span>
    <select
      v-if="options.length"
      class="rs__select"
      :value="current"
      :aria-label="zh ? '选择本轮运行' : 'Select run'"
      @change="onChange"
    >
      <option v-if="!current" value="">{{ zh ? '选择运行…' : 'Select a run…' }}</option>
      <option v-for="r in options" :key="r" :value="r">{{ r }}</option>
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

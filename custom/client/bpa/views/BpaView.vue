<!-- overlay/custom/client/bpa/views/BpaView.vue -->
<!-- 流程架构工作台主视图：四页签（架构清单/流程地图/治理体检/成熟度评估）。
     全局状态在此持有（config/nodes/report 一拉全量），各页签组件自行调 API、
     emit('updated', dto) 回传新快照。文案单一事实源=本模块 i18n.ts。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { bpaApi, type BpaArchitectureDto } from '@/custom/bpa/api'
import { bpaMessages } from '@/custom/bpa/i18n'
import BpaTreePanel from '../components/BpaTreePanel.vue'
import BpaMapPanel from '../components/BpaMapPanel.vue'
import BpaLinkPanel from '../components/BpaLinkPanel.vue'
import BpaPcfPanel from '../components/BpaPcfPanel.vue'
import BpaGovernancePanel from '../components/BpaGovernancePanel.vue'
import BpaMaturityPanel from '../components/BpaMaturityPanel.vue'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? bpaMessages.zh.bpa : bpaMessages.en.bpa
})

const tab = ref<'registry' | 'map' | 'link' | 'pcf' | 'governance' | 'maturity'>('registry')
const dto = ref<BpaArchitectureDto | null>(null)
const busy = ref(false)
const error = ref('')

async function load(): Promise<void> {
  error.value = ''
  try {
    dto.value = await bpaApi.architecture()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function seed(): Promise<void> {
  if (dto.value?.nodes.length && !window.confirm(L.value.seedHint)) return
  busy.value = true
  error.value = ''
  try {
    dto.value = await bpaApi.seed()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function onUpdated(next: BpaArchitectureDto): void {
  dto.value = next
}

onMounted(() => void load())
</script>

<template>
  <section class="bpa-view" data-testid="bpa-view">
    <header class="bpa-view__head">
      <div>
        <h1 class="bpa-view__title">{{ L.navTitle }}</h1>
        <p class="bpa-view__tag">{{ L.tagline }}</p>
      </div>
      <div class="bpa-view__meta" v-if="dto">
        <span class="muted">{{ L.nodes }}：{{ dto.nodes.length }}</span>
        <span class="muted">{{ L.l3Count }}：{{ dto.report.l3Count }}</span>
        <span class="muted mono">{{ L.storeAt }}：{{ dto.store }}</span>
      </div>
    </header>

    <p v-if="error" class="bpa-view__error">{{ L.loadFailed }}：{{ error }}</p>

    <div v-if="dto && dto.nodes.length === 0 && tab === 'registry'" class="ui-empty-state">
      <p class="muted">{{ L.empty }}</p>
      <button type="button" class="primary" :disabled="busy" data-testid="bpa-seed-btn" @click="seed">{{ L.seedBtn }}</button>
      <p class="muted small">{{ L.seedHint }}</p>
    </div>

    <template v-else-if="dto">
      <nav class="bpa-view__tabs" data-testid="bpa-tabs">
        <button v-for="t in (['registry','map','link','pcf','governance','maturity'] as const)" :key="t"
          type="button" :class="{ active: tab === t }" :data-testid="`bpa-tab-${t}`" @click="tab = t">
          {{ L.tabs[t] }}
          <span v-if="t === 'governance' && dto.report.bySeverity.high > 0" class="badge badge-high">{{ dto.report.bySeverity.high }}</span>
        </button>
      </nav>

      <BpaTreePanel v-show="tab === 'registry'" :L="L" :dto="dto" @updated="onUpdated" />
      <BpaMapPanel v-show="tab === 'map'" :L="L" :dto="dto" @updated="onUpdated" />
      <BpaLinkPanel v-show="tab === 'link'" :L="L" :dto="dto" />
      <BpaPcfPanel v-show="tab === 'pcf'" :L="L" :dto="dto" @goto="t => tab = t" />
      <BpaGovernancePanel v-show="tab === 'governance'" :L="L" :dto="dto" :active="tab === 'governance'" @updated="onUpdated" />
      <BpaMaturityPanel v-show="tab === 'maturity'" :L="L" />
    </template>
    <p v-else-if="!error" class="muted">…</p>
  </section>
</template>

<style scoped lang="scss">
.bpa-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px;
  max-width: 1180px;
  margin: 0 auto;
}
.bpa-view__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.bpa-view__head h1 { font-size: 20px; margin: 0; }
.bpa-view__tag { margin: 4px 0 0; font-size: 12px; opacity: 0.7; }
.bpa-view__meta { display: flex; gap: 14px; flex-wrap: wrap; }
.bpa-view__error { color: var(--danger); font-size: 13px; }
.bpa-view__tabs { display: flex; gap: 6px; flex-wrap: wrap;
  button { border: 1px solid var(--border-color); background: var(--bg-secondary, rgba(255,255,255,0.55)); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 13px; color: inherit;
    &.active { border-color: var(--accent-primary); color: var(--accent-primary); font-weight: 600; }
    .badge { margin-left: 6px; border-radius: 8px; padding: 0 6px; font-size: 11px; color: var(--text-on-accent); }
    .badge-high { background: var(--danger); } } }
button.primary { background: var(--accent-primary); color: var(--text-on-accent); border: none; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-size: 13px;
  &:disabled { opacity: 0.6; cursor: wait; } }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono); font-size: 11px; }
</style>

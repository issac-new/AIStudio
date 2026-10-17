<!-- overlay/custom/client/ia2/views/gov/GovOntologySection.vue -->
<!-- 语义体检（本体 × 看板治理整合面，2026-10-10 本体轮二阶段）：
     上=本体统计卡 + 数据契约健康度；中=看板摄取（源概览+一键摄取+最近结果，
     替换语义幂等）；下=全量违规表（error/warning/info 三档，violation code 稳定
     可编程消费）。深链跳本体工作台（/app/ontology）编辑字典/导出。
     文案=ontology/i18n.ts gov 节（模块内事实源）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ontologyApi, type Health, type IngestResultDto, type OntologyStats, type Violation,
} from '@/custom/ontology/api'
import { ontologyMessages } from '@/custom/ontology/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? ontologyMessages.zh.onto.gov : ontologyMessages.en.onto.gov
})
const router = useRouter()

const stats = ref<OntologyStats | null>(null)
const health = ref<Health | null>(null)
const loadError = ref('')
const busy = ref(false)
const sources = ref<Array<{ slug: string; exists: boolean }>>([])
const lastIngest = ref<IngestResultDto | null>(null)
const ingestError = ref('')
const violations = ref<Violation[]>([])
const validating = ref(false)

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    const [spec, ov] = await Promise.all([
      ontologyApi.getSpec(),
      ontologyApi.kanbanOverview().catch(() => ({ ok: false, sources: [] as Array<{ slug: string; exists: boolean }> })),
    ])
    stats.value = spec.stats
    health.value = spec.health
    sources.value = ov.sources
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
onMounted(() => void refresh())

async function runIngest(): Promise<void> {
  ingestError.value = ''
  lastIngest.value = null
  busy.value = true
  try {
    const r = await ontologyApi.ingest()
    lastIngest.value = r.ingest
    await refresh()
    await runValidate()
  } catch (e) {
    ingestError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function runValidate(): Promise<void> {
  validating.value = true
  try {
    const r = await ontologyApi.validate()
    violations.value = r.violations
    health.value = r.summary
  } finally {
    validating.value = false
  }
}

function sevClass(s: string): string {
  return s === 'error' ? 'ogov-sev ogov-sev--error' : s === 'warning' ? 'ogov-sev ogov-sev--warning' : 'ogov-sev ogov-sev--info'
}
const violationTop = computed(() => violations.value.slice(0, 50))
</script>

<template>
  <div class="ogov" data-testid="gov-ontology-panel">
    <header class="ogov__head">
      <div>
        <h1 class="ogov__title">{{ L.title }}</h1>
        <p class="ogov__sub">{{ L.sub }}</p>
      </div>
      <div class="ogov__ops">
        <button type="button" class="ogov__btn" :disabled="busy || validating" @click="runValidate()">{{ validating ? L.validating : L.recheck }}</button>
        <button type="button" class="ogov__btn ogov__btn--primary" data-testid="gov-ontology-ingest" :disabled="busy" @click="runIngest()">{{ L.ingestBtn }}</button>
        <button type="button" class="ogov__btn" data-testid="gov-ontology-open-studio" @click="router.push({ name: 'ia2.ontology' })">{{ L.openStudio }}</button>
      </div>
    </header>

    <p v-if="loadError" class="ogov__error">{{ L.loadError }}：{{ loadError }}</p>

    <div class="ogov__cards">
      <div class="ogov-card"><div class="ogov-card__num">{{ stats?.typeCount ?? '—' }}</div><div class="ogov-card__label">{{ L.types }}</div></div>
      <div class="ogov-card"><div class="ogov-card__num">{{ stats?.instanceCount ?? '—' }}</div><div class="ogov-card__label">{{ L.instances }}</div></div>
      <div class="ogov-card"><div class="ogov-card__num">{{ health?.error ?? '—' }}</div><div class="ogov-card__label">{{ L.errors }}</div></div>
      <div class="ogov-card"><div class="ogov-card__num">{{ health?.warning ?? '—' }}</div><div class="ogov-card__label">{{ L.warnings }}</div></div>
      <div class="ogov-card"><div class="ogov-card__num">{{ sources.length }}</div><div class="ogov-card__label">{{ L.sources }}</div></div>
    </div>

    <section class="ogov__block">
      <h2>{{ L.ingestTitle }}</h2>
      <p class="ogov__hint">{{ L.ingestHint }}</p>
      <p v-if="sources.length" class="ogov__srcs">{{ sources.map(s => s.slug).join(' · ') }}</p>
      <div v-if="lastIngest" class="ogov__result" data-testid="gov-ontology-ingest-result">
        <span>{{ L.lastIngest }}：{{ lastIngest.ingested.tasks }} {{ L.tasksUnit }} · {{ lastIngest.ingested.agents }} {{ L.agentsUnit }} · {{ lastIngest.ingested.runs }} {{ L.runsUnit }} · {{ lastIngest.ingested.relations }} {{ L.relationsUnit }}</span>
        <span v-if="lastIngest.skipped.length" class="ogov-sev ogov-sev--error">{{ L.skipped }} {{ lastIngest.skipped.length }}</span>
        <span v-else class="ogov-sev ogov-sev--info">{{ L.skippedNone }}</span>
        <span v-if="lastIngest.inboxPushed > 0" class="ogov-sev ogov-sev--error" data-testid="gov-ontology-inbox-pushed">{{ L.inboxPushed }} {{ lastIngest.inboxPushed }}</span>
      </div>
      <div v-for="(s, i) in lastIngest?.skipped.slice(0, 5) ?? []" :key="i" class="ogov__skip">
        <code>{{ s.code }}</code> {{ s.subject }}：{{ s.detail }}
      </div>
      <p v-if="ingestError" class="ogov__error">{{ ingestError }}</p>
    </section>

    <section class="ogov__block">
      <h2>{{ L.violationsTitle }}</h2>
      <p v-if="health && health.error === 0 && health.warning === 0 && health.info === 0" class="ogov__clean" data-testid="gov-ontology-clean">✓ {{ L.clean }}</p>
      <table v-else-if="violationTop.length" class="ogov-table" data-testid="gov-ontology-violations">
        <thead><tr><th>{{ L.sev }}</th><th>{{ L.code }}</th><th>{{ L.subject }}</th><th>{{ L.detail }}</th></tr></thead>
        <tbody>
          <tr v-for="(v, i) in violationTop" :key="i">
            <td><span :class="sevClass(v.severity)">{{ v.severity }}</span></td>
            <td><code>{{ v.code }}</code></td>
            <td class="ogov-table__mono">{{ v.subject }}{{ v.path ? ` · ${v.path}` : '' }}</td>
            <td>{{ v.detail }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="ogov__hint">{{ L.runFirst }}</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ogov {
  --ogov-border: var(--border-color);
  display: flex; flex-direction: column; gap: 14px; padding: 16px 18px;
  max-width: 1080px; margin: 0 auto; overflow-y: auto; height: 100%;
  &__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  &__title { margin: 0; font-size: 18px; }
  &__sub { margin: 3px 0 0; font-size: 12.5px; opacity: 0.75; }
  &__ops { display: flex; gap: 8px; flex-wrap: wrap; }
  &__btn {
    border: 1px solid var(--ogov-border); background: var(--bg-secondary); border-radius: 8px;
    padding: 6px 14px; cursor: pointer; font-size: 13px; color: inherit;
    &:disabled { opacity: 0.5; cursor: wait; }
    &--primary { background: var(--accent-primary); border-color: var(--accent-info); color: var(--text-on-accent); }
  }
  &__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
  &__block { border: 1px solid var(--ogov-border); border-radius: 12px; padding: 12px 14px; h2 { margin: 0 0 8px; font-size: 14.5px; } }
  &__hint { font-size: 12px; opacity: 0.7; margin: 0 0 6px; }
  &__srcs { font-size: 12px; opacity: 0.85; margin: 0 0 8px; word-break: break-all; }
  &__result { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 13px; }
  &__skip { font-size: 12px; margin-top: 4px; opacity: 0.85; }
  &__clean { color: var(--success); font-size: 13px; margin: 0; }
  &__error { color: var(--error); font-size: 13px; margin: 0; }
}
.ogov-card {
  border: 1px solid var(--ogov-border); border-radius: 12px; padding: 10px 14px; text-align: center;
  &__num { font-size: 22px; font-weight: 700; }
  &__label { font-size: 11.5px; opacity: 0.7; margin-top: 2px; }
}
.ogov-sev {
  display: inline-block; border-radius: 6px; padding: 1px 8px; font-size: 11px; font-weight: 600;
  &--error { background: rgba(var(--error-rgb), 0.08); color: var(--error); }
  &--warning { background: rgba(var(--warning-rgb), 0.12); color: var(--ia-stale); }
  &--info { background: rgba(var(--accent-info-rgb), 0.1); color: var(--accent-info); }
}
.ogov-table {
  width: 100%; border-collapse: collapse; font-size: 12.5px;
  th, td { border-bottom: 1px solid var(--ogov-border); text-align: left; padding: 6px 8px; vertical-align: top; }
  th { font-weight: 600; opacity: 0.8; }
  &__mono { font-family: ui-monospace, monospace; font-size: 11.5px; word-break: break-all; max-width: 300px; }
}
</style>

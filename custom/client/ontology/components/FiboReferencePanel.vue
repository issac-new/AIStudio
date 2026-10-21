<!-- FIBO 官方只读参照：域导航与 EXMP/Schema 场景；不写入可导入 T-Box。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueFlow } from '@vue-flow/core'
import type { FiboReference } from '@/custom/ontology/api'
import { ontologyMessages } from '@/custom/ontology/i18n'

const props = defineProps<{ reference: FiboReference }>()
const i18nCtx = useI18n()
const isZh = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh')
})
const L = computed(() => isZh.value ? ontologyMessages.zh.onto.fibo : ontologyMessages.en.onto.fibo)

const selectedId = ref('')
const scenario = computed(() => props.reference.scenarios.find((s) => s.id === selectedId.value)
  ?? props.reference.scenarios[0]
  ?? null)
const compactGraph = typeof window !== 'undefined' && window.innerWidth < 720
const graphViewport = { x: compactGraph ? 6 : 10, y: 12, zoom: compactGraph ? 0.55 : 0.65 }
const levelGap = compactGraph ? 100 : 300
const rowGap = compactGraph ? 100 : 130

const DOMAIN_COLORS: Record<string, string> = {
  FND: 'var(--text-muted)', BE: 'var(--accent-primary)', FBC: 'var(--accent-info)', LOAN: 'var(--warning)',
  SEC: 'var(--success)', DER: 'var(--error)', IND: 'var(--accent-secondary)', MD: 'var(--ia-stale)', EXMP: 'var(--text-secondary)',
}
const graphNodes = computed(() => {
  const rows = new Map<number, number>()
  return (scenario.value?.nodes ?? []).map((node) => {
    const row = rows.get(node.level) ?? 0
    rows.set(node.level, row + 1)
    const label = isZh.value
      ? `${node.labelZh}\n${node.id}${node.typeLabel ? `\n${node.typeLabel}` : ''}`
      : `${node.id}${node.typeLabel ? `\n${node.typeLabel}` : ''}`
    return {
      id: node.id,
      position: { x: node.level * levelGap, y: row * rowGap },
      data: { label },
      style: {
        borderColor: DOMAIN_COLORS[node.domain] ?? 'var(--text-muted)',
        borderRadius: '10px',
        padding: '7px 10px',
        fontSize: '11px',
        whiteSpace: 'pre-line',
        maxWidth: '240px',
      },
    }
  })
})
const graphEdges = computed(() => (scenario.value?.edges ?? []).map((edge) => ({
  id: `${edge.source}-${edge.property}-${edge.target}`,
  source: edge.source,
  target: edge.target,
  label: edge.property,
  animated: false,
  style: { stroke: 'var(--border-color)', strokeWidth: 1.2 },
  labelStyle: { fontSize: '10px' },
})))
</script>

<template>
  <div class="fibo-ref" data-testid="ontology-fibo-reference">
    <section class="fibo-ref__block">
      <h2>{{ L.domainsTitle }}</h2>
      <p class="fibo-ref__hint">{{ L.domainsIntro }}</p>
      <div class="fibo-ref__domains">
        <article v-for="domain in reference.domains" :key="domain.code" class="fibo-ref__domain" :data-testid="`ontology-fibo-domain-${domain.code}`">
          <div class="fibo-ref__domain-head">
            <strong>{{ domain.code }}</strong>
            <span>{{ isZh ? domain.nameZh : domain.nameEn }}</span>
            <a :href="domain.sourceUrl" target="_blank" rel="noreferrer">{{ L.sourceLink }}</a>
          </div>
          <p>{{ isZh ? domain.summaryZh : domain.summaryEn }}</p>
          <div class="fibo-ref__modules" :aria-label="L.modules">
            <span v-if="domain.modules.length === 0" class="fibo-ref__hint">{{ L.noModules }}</span>
            <code v-for="module in domain.modules" :key="module">{{ module }}</code>
          </div>
          <p v-if="domain.maturityNote" class="fibo-ref__warning">{{ isZh ? domain.maturityNote : domain.maturityNoteEn }}</p>
        </article>
      </div>
    </section>

    <section class="fibo-ref__block">
      <h2>{{ L.scenariosTitle }}</h2>
      <div class="fibo-ref__scenario-tabs" :aria-label="L.scenario">
        <button v-for="item in reference.scenarios" :key="item.id" type="button"
          class="fibo-ref__scenario-tab" :class="{ 'fibo-ref__scenario-tab--on': scenario?.id === item.id }"
          :aria-pressed="scenario?.id === item.id" :data-testid="`ontology-fibo-scenario-${item.id}`"
          @click="selectedId = item.id">{{ isZh ? item.titleZh : item.titleEn }}</button>
      </div>

      <div v-if="scenario" class="fibo-ref__scenario" data-testid="ontology-fibo-scenario-detail">
        <div>
          <h3>{{ isZh ? scenario.titleZh : scenario.titleEn }}</h3>
          <p class="fibo-ref__hint">{{ isZh ? scenario.summaryZh : scenario.summaryEn }}</p>
          <div class="fibo-ref__domains-used"><span v-for="code in scenario.domains" :key="code">{{ code }}</span></div>
        </div>
        <div class="fibo-ref__graph" aria-hidden="true">
          <VueFlow :key="scenario.id" :nodes="graphNodes" :edges="graphEdges" :default-viewport="graphViewport" :min-zoom="0.15" :zoom-on-scroll="true" :pan-on-scroll="true" />
        </div>
        <p v-if="scenario.caveat" class="fibo-ref__warning">{{ isZh ? scenario.caveat : scenario.caveatEn }}</p>

        <h3>{{ L.relationsTitle }}</h3>
        <ol class="fibo-ref__relations" data-testid="ontology-fibo-relations">
          <li v-for="(edge, idx) in scenario.edges" :key="`${edge.source}-${edge.property}-${edge.target}`">
            <div>
              <code>{{ edge.source }}</code>
              <span class="fibo-ref__relation-label">{{ isZh ? edge.labelZh : edge.labelEn }}</span>
              <code>{{ edge.target }}</code>
            </div>
            <div class="fibo-ref__relation-meta">
              <code>{{ edge.property }}</code>
              <a :href="edge.sourceUrl" target="_blank" rel="noreferrer" :data-testid="`ontology-fibo-edge-source-${idx}`">{{ L.sourceRdf }}</a>
            </div>
          </li>
        </ol>

        <h3>{{ L.factsTitle }}</h3>
        <ul class="fibo-ref__facts">
          <li v-for="fact in scenario.facts" :key="fact.textEn">
            <span>{{ isZh ? fact.textZh : fact.textEn }}</span>
            <a :href="fact.sourceUrl" target="_blank" rel="noreferrer">{{ L.sourceRdf }}</a>
          </li>
        </ul>
        <p class="fibo-ref__hint">{{ L.openWorldNote }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.fibo-ref {
  display: flex;
  flex-direction: column;
  gap: 18px;
  &__block {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 14px 16px;
    h2 { margin: 0 0 10px; font-size: 15px; }
    h3 { margin: 12px 0 8px; font-size: 13px; }
  }
  &__hint { margin: 4px 0; font-size: 12px; line-height: 1.6; opacity: 0.72; }
  &__warning { color: var(--ia-stale); font-size: 12px; line-height: 1.6; }
  &__domains { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 10px; margin-top: 12px; }
  &__domain {
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 10px 12px;
    min-width: 0;
    p { font-size: 12px; line-height: 1.55; }
  }
  &__domain-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    strong { font-size: 15px; }
    span { font-size: 12px; flex: 1; }
    a { font-size: 11px; }
  }
  &__modules { display: flex; flex-wrap: wrap; gap: 4px; code { font-size: 10px; background: var(--bg-tertiary); border-radius: 5px; padding: 2px 5px; } }
  &__scenario-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  &__scenario-tab {
    border: 1px solid var(--border-color);
    background: transparent;
    color: inherit;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    &--on { background: var(--bg-tertiary); font-weight: 600; }
  }
  &__scenario { margin-top: 12px; }
  &__domains-used { display: flex; gap: 5px; flex-wrap: wrap; span { border-radius: 5px; padding: 1px 6px; background: var(--bg-tertiary); font-size: 10px; } }
  &__graph { height: 400px; border: 1px solid var(--border-color); border-radius: 10px; margin-top: 12px; overflow: hidden; }
  &__relations {
    margin: 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    li { padding-left: 3px; }
    code { word-break: break-all; }
  }
  &__relation-label { margin: 0 8px; color: var(--accent-info); }
  &__relation-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 3px; font-size: 11px; opacity: 0.78; }
  &__facts {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 12px;
    line-height: 1.55;
    li a { margin-left: 8px; white-space: nowrap; }
  }
  a { color: var(--accent-info); text-decoration: none; &:hover { text-decoration: underline; } }
}
@media (max-width: 720px) {
  .fibo-ref {
    &__block { padding: 12px; }
    &__domains { grid-template-columns: 1fr; }
    &__graph { height: 330px; }
    &__relation-label { display: block; margin: 3px 0; }
  }
}
</style>

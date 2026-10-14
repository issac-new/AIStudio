<!-- overlay/custom/client/ontology/views/OntologyView.vue -->
<!-- 本体工作台主视图（GB/T 48000.3 方法论产品化）：七页签——概览/模式/图谱/
     实例/校验/版本/导出。文案单一事实源=custom/client/ontology/i18n.ts。
     路由：/app/ontology（ia2.ontology），features.ontology 门控（默认开）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import {
  ontologyApi, type EntityType, type Health, type OntologyInstance, type OntologySpec,
  type SpecSnapshotMeta, type OntologyStats, type Violation,
} from '@/custom/ontology/api'
import { ontologyMessages } from '@/custom/ontology/i18n'
import ConstraintsPanel from '@/custom/ontology/components/ConstraintsPanel.vue'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? ontologyMessages.zh.onto : ontologyMessages.en.onto
})

type Tab = 'overview' | 'schema' | 'graph' | 'instances' | 'validate' | 'versions' | 'export' | 'constraints'
const tab = ref<Tab>('overview')
// 模板表达式禁 TS 语法（as 断言）——页签选择经此函数（模板只传 string）
function selectTab(key: string): void {
  tab.value = key as Tab
}
const EXPORT_FORMATS: Array<'jsonld' | 'shacl' | 'turtle'> = ['jsonld', 'shacl', 'turtle']
const spec = ref<OntologySpec | null>(null)
const stats = ref<OntologyStats | null>(null)
const health = ref<Health | null>(null)
const loadError = ref('')
const busy = ref(false)

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    const r = await ontologyApi.getSpec()
    spec.value = r.spec
    stats.value = r.stats
    health.value = r.health
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
onMounted(() => void refresh())

// —— 模式页 ——
// 注意：SFC 编译链里 computed<泛型> 会被拆成比较表达式（本机实锤：groupedTypes
// 曾写 computed<Array<…>> 产出 "computed < Array(() =>"，v-for 恒空）——SFC 内
// computed 一律无泛型写法（graphNodes 同款先例）
const groupedTypes = computed(() => {
  const by = new Map<string, EntityType[]>()
  for (const t of spec.value?.entityTypes ?? []) {
    const c = t.category ?? '未分组'
    if (!by.has(c)) by.set(c, [])
    by.get(c)!.push(t)
  }
  return [...by.entries()].map(([category, types]) => ({ category, types }))
})

// —— 图谱页（类层级 + 对象属性边；分组配色）——
const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b']
function categoryColor(t: EntityType): string {
  const cats = [...new Set((spec.value?.entityTypes ?? []).map((x) => x.category ?? '未分组'))]
  return CATEGORY_COLORS[cats.indexOf(t.category ?? '未分组') % CATEGORY_COLORS.length]
}
const graphNodes = computed<Node[]>(() => {
  const out: Node[] = []
  const byCat = new Map<string, EntityType[]>()
  for (const t of spec.value?.entityTypes ?? []) {
    const c = t.category ?? '未分组'
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c)!.push(t)
  }
  const cats = [...byCat.entries()]
  cats.forEach(([cat, types], col) => {
    types.forEach((t, row) => {
      out.push({
        id: t.id,
        position: { x: col * 300, y: row * 110 },
        data: { label: `${t.label}\n${t.id}${t.parent ? ` ⊑ ${t.parent}` : ''}` },
        style: { borderColor: categoryColor(t), borderRadius: '10px', padding: '6px 10px', fontSize: '12px', whiteSpace: 'pre-line' },
      })
    })
  })
  return out
})
const graphEdges = computed<Edge[]>(() => {
  const out: Edge[] = []
  for (const p of spec.value?.objectProperties ?? []) {
    for (const d of p.domain) {
      for (const r of p.range) {
        out.push({ id: `${p.id}-${d}-${r}`, source: d, target: r, label: p.id, animated: false, style: { stroke: '#94a3b8', strokeWidth: 1.2 }, labelStyle: { fontSize: '10px' } })
      }
    }
  }
  return out
})

// —— 实例页 ——
const instances = ref<OntologyInstance[]>([])
const instFilter = ref('')
async function refreshInstances(): Promise<void> {
  const r = await ontologyApi.listInstances(instFilter.value || undefined)
  instances.value = r.instances
}
watch(() => tab.value, (t) => { if (t === 'instances' || t === 'versions' || t === 'export') void (t === 'instances' ? refreshInstances() : t === 'versions' ? refreshVersions() : loadExport()) })

const showEditor = ref(false)
const editing = ref<OntologyInstance | null>(null)
const editorViolations = ref<Violation[]>([])
const relationTargets = ref<string[]>([])
async function openEditor(inst?: OntologyInstance): Promise<void> {
  const types = spec.value?.entityTypes ?? []
  editing.value = inst
    ? JSON.parse(JSON.stringify(inst))
    : { id: '', type: types[0]?.id ?? '', label: '', data: defaultDataFor(types[0]?.id ?? ''), relations: [], updatedAt: 0 }
  editorViolations.value = []
  showEditor.value = true
  relationTargets.value = (await ontologyApi.listInstances().catch(() => ({ instances: [] as OntologyInstance[] }))).instances.map((x) => x.id)
}
const editingType = computed<EntityType | null>(() => (spec.value?.entityTypes ?? []).find((t) => t.id === editing.value?.type) ?? null)
/** 类型可用属性（含继承链；seen 守卫防 parent 环） */
function propsForType(typeId: string) {
  const chain: string[] = []
  const seen = new Set<string>()
  let cur = (spec.value?.entityTypes ?? []).find((t) => t.id === typeId) ?? null
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur.id); cur = (spec.value?.entityTypes ?? []).find((t) => t.id === cur!.parent) ?? null }
  return chain.flatMap((tid) => (spec.value?.entityTypes ?? []).find((t) => t.id === tid)?.dataProperties ?? [])
}
const editingProps = computed(() => (editing.value ? propsForType(editing.value.type) : []))
/** 编辑器初始 data：枚举属性落第一项——select 显示态 ≠ v-model 绑定值（undefined
 *  会让"看着选了"的必填枚举在提交时缺失，UI 数据契约预检误报 field:required） */
function defaultDataFor(typeId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of propsForType(typeId)) {
    if (p.enum && p.enum.length > 0) out[p.id] = p.enum[0]
  }
  return out
}
const domainProps = computed(() => (spec.value?.objectProperties ?? []).filter((p) => editing.value && p.domain.includes(editing.value.type)))

async function precheck(): Promise<boolean> {
  editorViolations.value = []
  if (!editing.value) return false
  const r = await ontologyApi.validate([editing.value])
  editorViolations.value = r.violations
  return !r.summary.error
}
async function saveInstance(): Promise<void> {
  if (!editing.value) return
  const ok = await precheck()
  if (!ok) return
  try {
    const isReplace = instances.value.some((x) => x.id === editing.value!.id)
    const r = isReplace ? await ontologyApi.replaceInstance(editing.value) : await ontologyApi.createInstance(editing.value)
    editorViolations.value = r.violations ?? []
    showEditor.value = false
    await refreshInstances()
    await refresh()
  } catch (e) {
    editorViolations.value = [{ severity: 'error', code: 'write', subject: editing.value.id, detail: (e as Error).message }]
  }
}
async function removeInstance(id: string): Promise<void> {
  if (!window.confirm(L.value.instances.delConfirm)) return
  await ontologyApi.deleteInstance(id)
  await refreshInstances()
  await refresh()
}
function propInputType(dt: string): string {
  return dt === 'number' || dt === 'integer' ? 'number' : dt === 'date' ? 'date' : 'text'
}

// —— 校验页 ——
const violations = ref<Violation[]>([])
const validating = ref(false)
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
function sevClass(s: string): string { return s === 'error' ? 'onto-sev onto-sev--error' : s === 'warning' ? 'onto-sev onto-sev--warning' : 'onto-sev onto-sev--info' }

// —— 版本页 ——
const versions = ref<SpecSnapshotMeta[]>([])
async function refreshVersions(): Promise<void> {
  const r = await ontologyApi.listVersions()
  versions.value = r.versions
}
async function doRollback(ts: number): Promise<void> {
  if (!window.confirm(L.value.versions.rollbackConfirm)) return
  await ontologyApi.rollback(ts)
  await refreshVersions()
  await refresh()
}
async function doResetSeed(): Promise<void> {
  if (!window.confirm(L.value.versions.seedConfirm)) return
  await ontologyApi.resetSeed()
  await refreshVersions()
  await refresh()
}

// —— 导出页 ——
const exportFormat = ref<'jsonld' | 'shacl' | 'turtle'>('jsonld')
const exportText = ref('')
const copied = ref(false)
async function loadExport(): Promise<void> {
  try {
    exportText.value = await ontologyApi.exportText(exportFormat.value)
  } catch (e) {
    exportText.value = `导出失败：${(e as Error).message}`
  }
}
watch(exportFormat, () => void loadExport())
async function copyExport(): Promise<void> {
  await navigator.clipboard.writeText(exportText.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
function downloadExport(): void {
  const ext = exportFormat.value === 'turtle' ? 'ttl' : 'jsonld'
  const blob = new Blob([exportText.value], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ontology-v${spec.value?.version ?? 0}.${ext}`
  a.click()
  URL.revokeObjectURL(a.href)
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
function fmtBytes(b: number): string {
  return b > 1024 ? `${(b / 1024).toFixed(1)}K` : `${b}B`
}
</script>

<template>
  <div class="onto" data-testid="ontology-view">
    <header class="onto__head">
      <div>
        <h1 class="onto__title">{{ L.navTitle }}</h1>
        <p class="onto__tagline">{{ L.tagline }}</p>
      </div>
      <button type="button" class="onto__btn" :disabled="busy" @click="refresh()">{{ L.overview.reload }}</button>
    </header>
    <p class="onto__note">{{ L.standardNote }}</p>

    <nav class="onto__tabs" data-testid="ontology-tabs">
      <button v-for="(label, key) in L.tabs" :key="key" type="button"
        class="onto__tab" :class="{ 'onto__tab--on': tab === key }" :data-testid="`onto-tab-${key}`"
        @click="selectTab(key)">{{ label }}</button>
    </nav>

    <p v-if="loadError" class="onto__error" data-testid="ontology-load-error">{{ L.loadError }}：{{ loadError }}</p>

    <!-- 概览 -->
    <section v-if="tab === 'overview'" class="onto__section">
      <div class="onto__cards">
        <div class="onto-card"><div class="onto-card__num">{{ stats?.typeCount ?? '—' }}</div><div class="onto-card__label">{{ L.overview.types }}</div></div>
        <div class="onto-card"><div class="onto-card__num">{{ stats?.dataPropCount ?? '—' }}</div><div class="onto-card__label">{{ L.overview.dataProps }}</div></div>
        <div class="onto-card"><div class="onto-card__num">{{ stats?.objPropCount ?? '—' }}</div><div class="onto-card__label">{{ L.overview.objProps }}</div></div>
        <div class="onto-card"><div class="onto-card__num">{{ stats?.axiomCount ?? '—' }}</div><div class="onto-card__label">{{ L.overview.axioms }}</div></div>
        <div class="onto-card"><div class="onto-card__num">{{ stats?.instanceCount ?? '—' }}</div><div class="onto-card__label">{{ L.overview.instances }}</div></div>
      </div>
      <div class="onto__block">
        <h2>{{ L.overview.healthTitle }}</h2>
        <p v-if="health && health.error === 0 && health.warning === 0 && health.info === 0" class="onto__clean" data-testid="ontology-health-clean">✓ {{ L.overview.clean }}</p>
        <div v-else class="onto__sevs">
          <span class="onto-sev onto-sev--error">{{ L.overview.error }} {{ health?.error ?? '—' }}</span>
          <span class="onto-sev onto-sev--warning">{{ L.overview.warning }} {{ health?.warning ?? '—' }}</span>
          <span class="onto-sev onto-sev--info">{{ L.overview.info }} {{ health?.info ?? '—' }}</span>
        </div>
      </div>
      <div class="onto__block">
        <h2>{{ L.overview.versionNow }} v{{ spec?.version ?? '—' }}</h2>
        <dl class="onto__meta">
          <dt>{{ L.overview.namespace }}</dt><dd><code>{{ spec?.namespace }}</code></dd>
          <dt>{{ L.overview.versionIri }}</dt><dd><code>{{ spec?.versionIri }}</code></dd>
        </dl>
      </div>
    </section>

    <!-- 模式 -->
    <section v-else-if="tab === 'schema'" class="onto__section">
      <div class="onto__block">
        <h2>{{ L.schema.typesTitle }}</h2>
        <div v-for="g in groupedTypes" :key="g.category" class="onto-group">
          <div class="onto-group__head" :style="{ borderColor: CATEGORY_COLORS[groupedTypes.indexOf(g) % CATEGORY_COLORS.length] }">{{ g.category }}</div>
          <div class="onto-group__body">
            <div v-for="t in g.types" :key="t.id" class="onto-type" :data-testid="`onto-type-${t.id}`">
              <div class="onto-type__head">
                <strong>{{ t.label }}</strong><code>{{ t.id }}</code>
                <span class="onto-sev onto-sev--info">{{ t.modality }}</span>
                <span v-if="t.parent" class="onto-type__parent">⊑ {{ t.parent }}</span>
              </div>
              <div v-if="t.disjointWith?.length" class="onto-type__row">⊥ {{ t.disjointWith.join(' ⊥ ') }}</div>
              <div v-for="p in t.dataProperties" :key="p.id" class="onto-type__prop">
                <code>{{ p.id }}</code>:{{ p.datatype }}
                <span v-if="p.required" class="onto-sev onto-sev--error">{{ L.schema.required }}</span>
                <span v-if="p.enum" class="onto-type__enum">{{ p.enum.join('|') }}</span>
                <span v-if="p.pattern" class="onto-type__enum">/{{ p.pattern }}/</span>
                <span v-if="p.min !== undefined || p.max !== undefined" class="onto-type__enum">[{{ p.min ?? '-∞' }}, {{ p.max ?? '+∞' }}]</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="onto__block">
        <h2>{{ L.schema.propsTitle }}</h2>
        <table class="onto-table">
          <thead><tr><th>id</th><th>{{ L.schema.domain }}</th><th>{{ L.schema.range }}</th><th>{{ L.schema.cardinality }}</th><th>{{ L.schema.modality }}</th></tr></thead>
          <tbody>
            <tr v-for="p in spec?.objectProperties ?? []" :key="p.id">
              <td><code>{{ p.id }}</code></td>
              <td>{{ p.domain.join(' | ') }}</td>
              <td>{{ p.range.join(' | ') }}</td>
              <td>{{ p.cardinality ? `${p.cardinality.min ?? 0}..${p.cardinality.max ?? 'n'}` : '—' }}</td>
              <td><span class="onto-sev onto-sev--info">{{ p.modality }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="onto__block">
        <h2>{{ L.schema.axiomsTitle }}</h2>
        <table class="onto-table">
          <thead><tr><th>id</th><th>{{ L.schema.kind }}</th><th>{{ L.schema.constraint }}</th><th>{{ L.schema.message }}</th></tr></thead>
          <tbody>
            <tr v-for="a in spec?.axioms ?? []" :key="a.id">
              <td><code>{{ a.id }}</code></td>
              <td>{{ a.kind }}</td>
              <td><code>{{ JSON.stringify(a.constraint) }}</code></td>
              <td>{{ a.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 图谱 -->
    <section v-else-if="tab === 'graph'" class="onto__section">
      <div class="onto__block">
        <h2>{{ L.graph.title }}</h2>
        <p class="onto__hint">{{ L.graph.nodeLegend }}</p>
        <div class="onto-graph" data-testid="ontology-graph">
          <VueFlow :nodes="graphNodes" :edges="graphEdges" :fit-view-on-init="true" :zoom-on-scroll="true" :pan-on-scroll="true" />
        </div>
      </div>
    </section>

    <!-- 实例 -->
    <section v-else-if="tab === 'instances'" class="onto__section">
      <div class="onto__toolbar">
        <select v-model="instFilter" class="onto__select" data-testid="ontology-inst-filter" @change="refreshInstances()">
          <option value="">{{ L.instances.filterAll }}</option>
          <option v-for="t in spec?.entityTypes ?? []" :key="t.id" :value="t.id">{{ t.label }}（{{ t.id }}）</option>
        </select>
        <button type="button" class="onto__btn onto__btn--primary" data-testid="ontology-inst-new" @click="openEditor()">{{ L.instances.newBtn }}</button>
      </div>
      <table class="onto-table" data-testid="ontology-inst-table">
        <thead><tr><th>{{ L.instances.id }}</th><th>{{ L.instances.type }}</th><th>{{ L.instances.label }}</th><th>{{ L.instances.data }}</th><th>{{ L.instances.relations }}</th><th></th></tr></thead>
        <tbody>
          <tr v-for="i in instances" :key="i.id">
            <td><code>{{ i.id }}</code></td>
            <td><span class="onto-chip">{{ i.type }}</span></td>
            <td>{{ i.label }}</td>
            <td class="onto-table__mono">{{ JSON.stringify(i.data).slice(0, 90) }}</td>
            <td class="onto-table__mono">{{ i.relations.map((r) => `${r.property}→${r.target}`).join('; ') || '—' }}</td>
            <td class="onto-table__ops">
              <button type="button" class="onto__btn" @click="openEditor(i)">{{ L.instances.editBtn }}</button>
              <button type="button" class="onto__btn onto__btn--danger" @click="removeInstance(i.id)">{{ L.instances.delBtn }}</button>
            </td>
          </tr>
          <tr v-if="instances.length === 0"><td colspan="6" class="onto-table__empty">{{ L.instances.empty }}</td></tr>
        </tbody>
      </table>

      <!-- 编辑抽屉 -->
      <div v-if="showEditor && editing" class="onto-modal" data-testid="ontology-inst-editor">
        <div class="onto-modal__card">
          <h2>{{ L.instances.newBtn }}</h2>
          <div class="onto-form__row">
            <label>{{ L.instances.id }}</label>
            <input v-model="editing.id" class="onto__input" :disabled="instances.some((x) => x.id === editing.id)" />
            <label>{{ L.instances.type }}</label>
            <select v-model="editing.type" class="onto__select" @change="editing.data = defaultDataFor(editing.type); editing.relations = []">
              <option v-for="t in spec?.entityTypes ?? []" :key="t.id" :value="t.id">{{ t.label }}（{{ t.id }}）</option>
            </select>
            <label>{{ L.instances.label }}</label>
            <input v-model="editing.label" class="onto__input" />
          </div>
          <div class="onto-form__row" v-for="p in editingProps" :key="p.id">
            <label><code>{{ p.id }}</code><span v-if="p.required" class="onto-sev onto-sev--error">*</span> <span class="onto-form__dt">{{ p.datatype }}/{{ p.modality }}</span></label>
            <select v-if="p.enum" v-model="editing.data[p.id]" class="onto__select">
              <option v-for="e in p.enum" :key="e" :value="e">{{ e }}</option>
            </select>
            <input v-else :type="propInputType(p.datatype)" v-model="editing.data[p.id]" class="onto__input" />
          </div>
          <div class="onto-form__row">
            <label>{{ L.instances.relations }}</label>
            <div class="onto-form__rels">
              <div v-for="(r, idx) in editing.relations" :key="idx" class="onto-form__rel">
                <select v-model="r.property" class="onto__select">
                  <option v-for="p in domainProps" :key="p.id" :value="p.id">{{ p.id }} → {{ p.range.join('|') }}</option>
                </select>
                <select v-model="r.target" class="onto__select">
                  <option v-for="i in relationTargets" :key="i" :value="i">{{ i }}</option>
                </select>
                <button type="button" class="onto__btn onto__btn--danger" @click="editing.relations.splice(idx, 1)">{{ L.instances.removeRelation }}</button>
              </div>
              <button type="button" class="onto__btn" @click="editing.relations.push({ property: domainProps[0]?.id ?? '', target: '' })">{{ L.instances.addRelation }}</button>
            </div>
          </div>
          <div v-if="editorViolations.length" class="onto-form__violations" data-testid="ontology-editor-violations">
            <div v-for="(v, i) in editorViolations" :key="i" :class="sevClass(v.severity)">
              <code>{{ v.code }}</code> {{ v.subject }}{{ v.path ? ` · ${v.path}` : '' }}：{{ v.detail }}
            </div>
          </div>
          <div class="onto-modal__ops">
            <button type="button" class="onto__btn" @click="precheck()">{{ L.instances.precheckBtn }}</button>
            <button type="button" class="onto__btn onto__btn--primary" data-testid="ontology-inst-save" @click="saveInstance()">{{ L.instances.save }}</button>
            <button type="button" class="onto__btn" @click="showEditor = false">{{ L.instances.cancel }}</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 校验 -->
    <section v-else-if="tab === 'validate'" class="onto__section">
      <div class="onto__toolbar">
        <button type="button" class="onto__btn onto__btn--primary" data-testid="ontology-validate-run" :disabled="validating" @click="runValidate()">{{ validating ? L.validate.running : L.validate.run }}</button>
        <span v-if="health" class="onto__sevs">
          <span class="onto-sev onto-sev--error">{{ L.overview.error }} {{ health.error }}</span>
          <span class="onto-sev onto-sev--warning">{{ L.overview.warning }} {{ health.warning }}</span>
          <span class="onto-sev onto-sev--info">{{ L.overview.info }} {{ health.info }}</span>
        </span>
      </div>
      <p class="onto__hint">{{ L.validate.contractNote }}</p>
      <table v-if="violations.length" class="onto-table" data-testid="ontology-violations">
        <thead><tr><th>{{ L.validate.severity }}</th><th>{{ L.validate.code }}</th><th>{{ L.validate.subject }}</th><th>{{ L.validate.path }}</th><th>{{ L.validate.detail }}</th></tr></thead>
        <tbody>
          <tr v-for="(v, i) in violations" :key="i">
            <td><span :class="sevClass(v.severity)">{{ v.severity }}</span></td>
            <td><code>{{ v.code }}</code></td>
            <td>{{ v.subject }}</td>
            <td>{{ v.path ?? '—' }}</td>
            <td>{{ v.detail }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!validating" class="onto__clean">✓ {{ L.validate.clean }}</p>
    </section>

    <!-- 版本 -->
    <section v-else-if="tab === 'versions'" class="onto__section">
      <div class="onto__toolbar">
        <h2>{{ L.versions.title }}</h2>
        <button type="button" class="onto__btn onto__btn--danger" data-testid="ontology-seed" @click="doResetSeed()">{{ L.versions.seedBtn }}</button>
      </div>
      <table class="onto-table">
        <thead><tr><th>{{ L.versions.ts }}</th><th>{{ L.versions.version }}</th><th>{{ L.versions.label }}</th><th>{{ L.versions.types }}</th><th>{{ L.versions.size }}</th><th></th></tr></thead>
        <tbody>
          <tr v-for="v in versions" :key="v.ts">
            <td>{{ fmtTime(v.ts) }}</td>
            <td>v{{ v.version }}</td>
            <td>{{ v.label }}</td>
            <td>{{ v.typeCount }}</td>
            <td>{{ fmtBytes(v.bytes) }}</td>
            <td><button type="button" class="onto__btn" @click="doRollback(v.ts)">{{ L.versions.rollback }}</button></td>
          </tr>
          <tr v-if="versions.length === 0"><td colspan="6" class="onto-table__empty">{{ L.versions.empty }}</td></tr>
        </tbody>
      </table>
    </section>

    <!-- 导出 -->
    <section v-else-if="tab === 'export'" class="onto__section">
      <div class="onto__toolbar">
        <div class="onto__seg" data-testid="ontology-export-fmt">
          <button v-for="f in EXPORT_FORMATS" :key="f" type="button"
            class="onto__tab" :class="{ 'onto__tab--on': exportFormat === f }" @click="exportFormat = f">
            {{ f === 'jsonld' ? L.export.jsonld : f === 'shacl' ? L.export.shacl : L.export.turtle }}
          </button>
        </div>
        <button type="button" class="onto__btn" @click="copyExport()">{{ copied ? L.export.copied : L.export.copy }}</button>
        <button type="button" class="onto__btn" @click="downloadExport()">{{ L.export.download }}</button>
      </div>
      <p class="onto__hint">{{ L.export.note }}</p>
      <pre class="onto__pre" data-testid="ontology-export-preview">{{ exportText.slice(0, 20000) }}</pre>
    </section>
    <section v-else-if="tab === 'constraints'" class="onto__section">
      <ConstraintsPanel />
    </section>
  </div>
</template>

<style scoped lang="scss">
.onto {
  --onto-border: #e2e8f0;
  padding: 20px 24px;
  max-width: 1200px;
  margin: 0 auto;
  color: inherit;
  &__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  &__title { margin: 0; font-size: 20px; }
  &__tagline { margin: 4px 0 0; font-size: 13px; opacity: 0.75; }
  &__note { margin: 10px 0 0; font-size: 12px; line-height: 1.6; opacity: 0.72; border-left: 3px solid var(--onto-border); padding-left: 10px; }
  &__tabs { display: flex; gap: 6px; margin: 16px 0 12px; flex-wrap: wrap; }
  &__tab {
    border: 1px solid var(--onto-border); background: transparent; border-radius: 8px;
    padding: 6px 14px; cursor: pointer; font-size: 13px;
    &--on { background: var(--bg-tertiary, #eef2f7); font-weight: 600; }
  }
  &__section { display: flex; flex-direction: column; gap: 18px; }
  &__error { color: #dc2626; font-size: 13px; }
  &__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  &__block {
    border: 1px solid var(--onto-border); border-radius: 12px; padding: 14px 16px;
    h2 { margin: 0 0 10px; font-size: 15px; }
  }
  &__clean { color: #059669; font-size: 13px; }
  &__sevs { display: flex; gap: 8px; flex-wrap: wrap; }
  &__meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; margin: 0; dd { margin: 0; word-break: break-all; } }
  &__toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; h2 { margin: 0; font-size: 15px; } }
  &__btn {
    border: 1px solid var(--onto-border); background: var(--bg-secondary, #fff); border-radius: 8px;
    padding: 6px 14px; cursor: pointer; font-size: 13px;
    &:disabled { opacity: 0.5; cursor: wait; }
    &--primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    &--danger { border-color: #fca5a5; color: #dc2626; }
  }
  &__select, &__input { border: 1px solid var(--onto-border); border-radius: 8px; padding: 6px 10px; font-size: 13px; min-width: 140px; background: var(--bg-secondary, #fff); color: inherit; }
  &__hint { font-size: 12px; opacity: 0.7; margin: 0; }
  &__pre {
    border: 1px solid var(--onto-border); border-radius: 12px; padding: 12px;
    font-size: 11.5px; line-height: 1.5; max-height: 520px; overflow: auto; margin: 0;
    white-space: pre-wrap; word-break: break-all; background: var(--bg-secondary, #fafafa);
  }
  &__graph { height: 560px; border: 1px solid var(--onto-border); border-radius: 12px; }
}
.onto-card {
  border: 1px solid var(--onto-border); border-radius: 12px; padding: 12px 16px; text-align: center;
  &__num { font-size: 24px; font-weight: 700; }
  &__label { font-size: 12px; opacity: 0.7; margin-top: 2px; }
}
.onto-sev {
  display: inline-block; border-radius: 6px; padding: 1px 8px; font-size: 11px; font-weight: 600;
  &--error { background: #fee2e2; color: #b91c1c; }
  &--warning { background: #fef3c7; color: #b45309; }
  &--info { background: #e0f2fe; color: #0369a1; }
}
.onto-group {
  margin-bottom: 12px;
  &__head { font-size: 13px; font-weight: 600; border-left: 4px solid var(--onto-border); padding-left: 8px; margin-bottom: 8px; }
  &__body { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 8px; }
}
.onto-type {
  border: 1px solid var(--onto-border); border-radius: 10px; padding: 8px 10px; font-size: 12px;
  &__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; code { font-size: 11px; opacity: 0.7; } }
  &__parent { font-size: 11px; opacity: 0.7; }
  &__row { font-size: 11px; color: #b91c1c; margin-top: 2px; }
  &__prop { margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  &__enum { font-size: 10.5px; opacity: 0.65; }
}
.onto-chip { display: inline-block; border-radius: 6px; padding: 1px 8px; font-size: 11px; background: var(--bg-tertiary, #eef2f7); }
.onto-table {
  width: 100%; border-collapse: collapse; font-size: 12.5px;
  th, td { border-bottom: 1px solid var(--onto-border); text-align: left; padding: 7px 8px; vertical-align: top; }
  th { font-weight: 600; opacity: 0.8; }
  &__mono { font-family: ui-monospace, monospace; font-size: 11.5px; word-break: break-all; max-width: 320px; }
  &__ops { white-space: nowrap; display: flex; gap: 6px; }
  &__empty { text-align: center; opacity: 0.6; padding: 18px; }
}
.onto-modal {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 60;
  display: flex; align-items: center; justify-content: center;
  &__card {
    background: var(--bg-primary, #fff); border-radius: 14px; padding: 18px 20px; width: min(720px, 92vw);
    max-height: 86vh; overflow: auto; color: inherit;
    h2 { margin: 0 0 12px; font-size: 16px; }
  }
  &__ops { display: flex; gap: 8px; margin-top: 14px; }
}
.onto-form {
  &__row { display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; align-items: center; margin-bottom: 8px; font-size: 13px; label { font-size: 12.5px; } }
  &__dt { font-size: 10.5px; opacity: 0.6; margin-left: 4px; }
  &__rels { display: flex; flex-direction: column; gap: 6px; }
  &__rel { display: flex; gap: 6px; }
  &__violations { border: 1px solid #fca5a5; border-radius: 10px; padding: 8px 10px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
}
</style>

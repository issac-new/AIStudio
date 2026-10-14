// overlay[constraints] 约束卡维护面板（本体工作台「约束卡」页签，2026-10-14 阿里调研轮 D）。
// 列表 + 建卡表单 + 启停/删除 + 派单预演（列/specialist/关键词 → 命中卡与简报行）。
// 自取 ontologyMessages 词条（与 OntologyView 同款 locale 选择），样式贴合 onto-* 既有类。
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { constraintsApi, parseList } from '@/custom/ontology/api'
import type { ConstraintCardDto, ConstraintPreviewDto } from '@/custom/ontology/api'
import { ontologyMessages } from '@/custom/ontology/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? ontologyMessages.zh.onto.constraints : ontologyMessages.en.onto.constraints
})

const cards = ref<ConstraintCardDto[]>([])
const busy = ref(false)
const error = ref('')
const form = ref({
  statement: '', columns: '', specialists: '', keywords: '', sourceAnchor: '', effectiveRun: '',
})
const previewTarget = ref({ column: '', specialist: '', title: '' })
const preview = ref<ConstraintPreviewDto | null>(null)
const previewBusy = ref(false)

async function load(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const res = await constraintsApi.list()
    cards.value = res.cards ?? []
  } catch (e) {
    error.value = String((e as Error).message || e)
  } finally {
    busy.value = false
  }
}
onMounted(load)

async function create(): Promise<void> {
  error.value = ''
  if (!form.value.statement.trim() || !form.value.sourceAnchor.trim()) {
    error.value = L.value.errRequired
    return
  }
  const scope: { columns?: string[]; specialists?: string[]; keywords?: string[] } = {}
  const cols = parseList(form.value.columns)
  const specs = parseList(form.value.specialists)
  const kws = parseList(form.value.keywords)
  if (cols.length) scope.columns = cols
  if (specs.length) scope.specialists = specs
  if (kws.length) scope.keywords = kws
  if (!cols.length && !specs.length && !kws.length) {
    error.value = L.value.errScope
    return
  }
  try {
    await constraintsApi.create({
      statement: form.value.statement.trim(),
      sourceAnchor: form.value.sourceAnchor.trim(),
      scope,
      ...(form.value.effectiveRun.trim() ? { effectiveRun: form.value.effectiveRun.trim() } : {}),
    })
    form.value = { statement: '', columns: '', specialists: '', keywords: '', sourceAnchor: '', effectiveRun: '' }
    await load()
  } catch (e) {
    error.value = String((e as Error).message || e)
  }
}

async function toggle(c: ConstraintCardDto): Promise<void> {
  try {
    await constraintsApi.update(c.id, {
      statement: c.statement, sourceAnchor: c.sourceAnchor, scope: c.scope,
      ...(c.effectiveRun ? { effectiveRun: c.effectiveRun } : {}), enabled: !c.enabled,
    })
    await load()
  } catch (e) {
    error.value = String((e as Error).message || e)
  }
}

async function remove(c: ConstraintCardDto): Promise<void> {
  try {
    await constraintsApi.remove(c.id)
    await load()
  } catch (e) {
    error.value = String((e as Error).message || e)
  }
}

async function runPreview(): Promise<void> {
  previewBusy.value = true
  preview.value = null
  try {
    preview.value = await constraintsApi.preview({
      ...(previewTarget.value.column.trim() ? { column: previewTarget.value.column.trim() } : {}),
      ...(previewTarget.value.specialist.trim() ? { specialist: previewTarget.value.specialist.trim() } : {}),
      ...(previewTarget.value.title.trim() ? { title: previewTarget.value.title.trim() } : {}),
    })
  } catch (e) {
    error.value = String((e as Error).message || e)
  } finally {
    previewBusy.value = false
  }
}

function scopeText(c: ConstraintCardDto): string {
  const parts: string[] = []
  if (c.scope.columns?.length) parts.push(`${L.value.colColumns}: ${c.scope.columns.join('/')}`)
  if (c.scope.specialists?.length) parts.push(`${L.value.colSpecialists}: ${c.scope.specialists.join('/')}`)
  if (c.scope.keywords?.length) parts.push(`${L.value.colKeywords}: ${c.scope.keywords.join('/')}`)
  return parts.join(' · ')
}
</script>

<template>
  <div data-testid="ontology-constraints">
    <h3 class="onto__subtitle">{{ L.title }}</h3>
    <p class="onto__hint">{{ L.note }}</p>
    <p v-if="error" class="onto__error" data-testid="ontology-constraints-error">{{ error }}</p>

    <table class="onto-table" v-if="cards.length">
      <thead>
        <tr>
          <th>{{ L.colId }}</th><th>{{ L.colStatement }}</th><th>{{ L.colScope }}</th>
          <th>{{ L.colSource }}</th><th>{{ L.colRun }}</th><th>{{ L.colEnabled }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in cards" :key="c.id" :data-testid="`ontology-ctr-row-${c.id}`">
          <td>{{ c.id }}</td>
          <td>{{ c.statement }}</td>
          <td>{{ scopeText(c) }}</td>
          <td>{{ c.sourceAnchor }}</td>
          <td>{{ c.effectiveRun || '—' }}</td>
          <td>{{ c.enabled ? L.on : L.off }}</td>
          <td>
            <button type="button" class="onto__btn" @click="toggle(c)">{{ c.enabled ? L.disable : L.enable }}</button>
            <button type="button" class="onto__btn" @click="remove(c)">{{ L.remove }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!busy" class="onto__hint">{{ L.empty }}</p>

    <h4 class="onto__subtitle">{{ L.formTitle }}</h4>
    <div class="ctr-form">
      <textarea v-model="form.statement" rows="2" :placeholder="L.phStatement" data-testid="ontology-ctr-statement" />
      <input v-model="form.columns" :placeholder="L.phColumns" />
      <input v-model="form.specialists" :placeholder="L.phSpecialists" />
      <input v-model="form.keywords" :placeholder="L.phKeywords" />
      <input v-model="form.sourceAnchor" :placeholder="L.phSource" />
      <input v-model="form.effectiveRun" :placeholder="L.phRun" />
      <button type="button" class="onto__btn" data-testid="ontology-ctr-create" @click="create">{{ L.create }}</button>
    </div>

    <h4 class="onto__subtitle">{{ L.previewTitle }}</h4>
    <div class="ctr-form">
      <input v-model="previewTarget.column" :placeholder="L.phPreviewColumn" />
      <input v-model="previewTarget.specialist" :placeholder="L.phPreviewSpecialist" />
      <input v-model="previewTarget.title" :placeholder="L.phPreviewTitle" />
      <button type="button" class="onto__btn" data-testid="ontology-ctr-preview" :disabled="previewBusy" @click="runPreview">{{ L.preview }}</button>
    </div>
    <pre v-if="preview" class="onto__pre" data-testid="ontology-ctr-preview-out">{{ preview.briefLine || L.previewNone }}</pre>
  </div>
</template>

<style scoped lang="scss">
.ctr-form {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px; margin: 8px 0 16px;
  textarea { grid-column: 1 / -1; }
  input, textarea { padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font: inherit; }
}
</style>

<!-- overlay/custom/client/bpa/components/BpaTreePanel.vue -->
<!-- 架构清单：L1-L6 层级树表 + 节点编辑器（Owner/KPI/输入输出/驱动支撑/分解逻辑）。
     编号即字典（段数=层级），建议编号自动顺延；驱动/支撑引用支持 L3 编号补全。 -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { bpaApi, type BpaArchitectureDto, type BpaNode, type BpaLevel, type BpaSection, type BpaDecomposition } from '@/custom/bpa/api'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages; dto: BpaArchitectureDto }>()
const emit = defineEmits<{ (e: 'updated', dto: BpaArchitectureDto): void }>()

const busy = ref(false)
const error = ref('')
const editing = ref(false)
const creating = ref(false)
const l3Ids = computed(() => props.dto.nodes.filter((n) => n.level === 3).map((n) => n.id))

/** 树序=编号字典序（段零填充，父恒在子前）。 */
const rows = computed(() => [...props.dto.nodes].sort((a, b) => a.id.localeCompare(b.id)))

const form = reactive({
  id: '', name: '', level: 1 as BpaLevel, parentId: null as string | null,
  section: 'OPERATING' as BpaSection, pcfRef: '', owner: '', decomposition: '' as '' | BpaDecomposition, note: '',
  kpis: [] as Array<{ name: string; target: string; unit?: string }>,
  inputsText: '', outputsText: '', driversText: '', supportsText: '',
})

function resetForm(): void {
  form.id = ''; form.name = ''; form.level = 1; form.parentId = null
  form.section = 'OPERATING'; form.pcfRef = ''; form.owner = ''; form.decomposition = ''; form.note = ''
  form.kpis = []; form.inputsText = ''; form.outputsText = ''; form.driversText = ''; form.supportsText = ''
}

/** 建议编号：同级兄弟末段顺延（段数=层级，如 L3-01-02-03）。 */
const suggestedId = computed(() => {
  const level = form.level
  const siblings = props.dto.nodes.filter((n) => n.level === level && (level === 1 ? true : n.parentId === form.parentId))
  let max = 0
  for (const s of siblings) {
    const last = Number(s.id.split('-').pop())
    if (Number.isFinite(last) && last > max) max = last
  }
  const next = String(Math.min(max + 1, 99)).padStart(2, '0')
  if (level === 1) return `L1-${next}`
  const parent = props.dto.nodes.find((n) => n.id === form.parentId)
  return parent ? `${parent.id}-${next}` : ''
})

function startCreate(): void {
  resetForm()
  creating.value = true; editing.value = true
  form.id = suggestedId.value
}

function startAddChild(parent: BpaNode): void {
  resetForm()
  creating.value = true; editing.value = true
  form.level = (parent.level + 1) as BpaLevel
  form.parentId = parent.id
  form.id = suggestedId.value
}

function startEdit(node: BpaNode): void {
  resetForm()
  creating.value = false; editing.value = true
  form.id = node.id; form.name = node.name; form.level = node.level; form.parentId = node.parentId
  form.section = node.section ?? 'OPERATING'; form.pcfRef = node.pcfRef ?? ''
  form.owner = node.owner ?? ''
  form.decomposition = node.decomposition ?? ''; form.note = node.note ?? ''
  form.kpis = (node.kpis ?? []).map((k) => ({ ...k }))
  form.inputsText = (node.inputs ?? []).join('，')
  form.outputsText = (node.outputs ?? []).join('，')
  form.driversText = (node.drivers ?? []).join('，')
  form.supportsText = (node.supports ?? []).join('，')
}

function cancelEdit(): void {
  editing.value = false; creating.value = false; error.value = ''
}

const parseList = (s: string): string[] =>
  s.split(/[,，;；、]/).map((x) => x.trim()).filter(Boolean)

async function save(): Promise<void> {
  busy.value = true; error.value = ''
  const node: BpaNode = {
    id: form.id.trim(),
    name: form.name.trim(),
    level: form.level,
    parentId: form.level === 1 ? null : form.parentId,
    ...(form.level === 1 ? { section: form.section } : {}),
    ...(form.level === 1 && form.pcfRef.trim() ? { pcfRef: form.pcfRef.trim() } : {}),
    ...(form.owner.trim() ? { owner: form.owner.trim() } : {}),
    ...(form.level === 3 && form.kpis.filter((k) => k.name.trim()).length ? { kpis: form.kpis.filter((k) => k.name.trim()).map((k) => ({ name: k.name.trim(), target: k.target.trim(), ...(k.unit?.trim() ? { unit: k.unit.trim() } : {}) })) } : {}),
    ...(form.inputsText.trim() ? { inputs: parseList(form.inputsText) } : {}),
    ...(form.outputsText.trim() ? { outputs: parseList(form.outputsText) } : {}),
    ...(form.driversText.trim() ? { drivers: parseList(form.driversText) } : {}),
    ...(form.supportsText.trim() ? { supports: parseList(form.supportsText) } : {}),
    ...(form.decomposition ? { decomposition: form.decomposition } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
    updatedAt: Date.now(),
  }
  try {
    const next = await bpaApi.upsertNode(node)
    emit('updated', next)
    cancelEdit()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  if (!window.confirm(`${form.id} ${form.name}？`)) return
  busy.value = true; error.value = ''
  try {
    const next = await bpaApi.deleteNode(form.id)
    emit('updated', next)
    cancelEdit()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const parentOptions = computed(() => props.dto.nodes.filter((n) => n.level === form.level - 1))
const levelOptions: BpaLevel[] = [1, 2, 3, 4, 5, 6]
const sectionOptions: BpaSection[] = ['OPERATING', 'ENABLING', 'SUPPORTING', 'MANAGING']
const decompositionOptions: BpaDecomposition[] = ['lifecycle', 'pdca', 'functional', 'scenario']

function levelBadgeClass(level: number): string {
  return level <= 2 ? 'lv-classify' : level === 3 ? 'lv-process' : 'lv-decompose'
}
function linkCount(n: BpaNode): number {
  return (n.inputs?.length ?? 0) + (n.outputs?.length ?? 0) + (n.drivers?.length ?? 0) + (n.supports?.length ?? 0)
}
</script>

<template>
  <div class="bpa-tree" data-testid="bpa-tree-panel">
    <div class="bpa-tree__bar">
      <p class="muted hint">{{ L.registry.hint }}</p>
      <button type="button" class="primary" data-testid="bpa-add-node" @click="startCreate">{{ L.registry.addNode }}</button>
    </div>

    <div v-if="editing" class="bpa-tree__editor" data-testid="bpa-editor">
      <h3>{{ creating ? L.registry.creating : L.registry.editing }} · {{ L.levelNames[form.level] }}</h3>
      <p class="muted small">{{ L.levelHints[form.level] }}</p>

      <div class="grid">
        <label>{{ L.registry.level }}
          <select v-model.number="form.level" :disabled="!creating" @change="form.id = suggestedId; form.parentId = null">
            <option v-for="lv in levelOptions" :key="lv" :value="lv">L{{ lv }} · {{ L.levelNames[lv] }}</option>
          </select>
        </label>
        <label>{{ L.registry.id }}
          <input v-model="form.id" class="mono" :placeholder="suggestedId" />
          <span v-if="creating && suggestedId" class="muted small">{{ L.registry.suggested }}：{{ suggestedId }}</span>
        </label>
        <label v-if="form.level > 1">{{ L.registry.parent }}
          <select v-model="form.parentId" @change="form.id = suggestedId">
            <option v-for="p in parentOptions" :key="p.id" :value="p.id">{{ p.id }} · {{ p.name }}</option>
          </select>
        </label>
        <label v-if="form.level === 1">{{ L.registry.section }}
          <select v-model="form.section">
            <option v-for="s in sectionOptions" :key="s" :value="s">{{ L.sectionLetters[s] }} · {{ L.sectionNames[s] }}</option>
          </select>
        </label>
        <label v-if="form.level === 1">{{ L.registry.pcfRef }}
          <input v-model="form.pcfRef" class="mono" list="bpa-pcf-codes" placeholder="4.0" />
          <span class="muted small">{{ L.registry.pcfRefHint }}</span>
          <datalist id="bpa-pcf-codes">
            <option v-for="c in ['1.0','2.0','3.0','4.0','5.0','6.0','7.0','8.0','9.0','10.0','11.0','12.0']" :key="c" :value="c" />
          </datalist>
        </label>
        <label class="span2">{{ L.registry.name }}
          <input v-model="form.name" />
        </label>
        <label>{{ L.registry.owner }}
          <input v-model="form.owner" />
        </label>
        <label>{{ L.registry.decomposition }}
          <select v-model="form.decomposition">
            <option value="">{{ L.registry.none }}</option>
            <option v-for="d in decompositionOptions" :key="d" :value="d">{{ L.decompositionNames[d] }}</option>
          </select>
        </label>
      </div>

      <fieldset v-if="form.level === 3" class="kpis">
        <legend>{{ L.registry.kpis }}<span class="muted small">（{{ L.registry.l3only }}）</span></legend>
        <div v-for="(k, i) in form.kpis" :key="i" class="kpi-row">
          <input v-model="k.name" :placeholder="L.registry.kpiName" />
          <input v-model="k.target" :placeholder="L.registry.kpiTarget" />
          <input v-model="k.unit" :placeholder="L.registry.kpiUnit" />
          <button type="button" class="ghost" @click="form.kpis.splice(i, 1)">✕</button>
        </div>
        <button type="button" class="ghost" @click="form.kpis.push({ name: '', target: '' })">{{ L.registry.addKpi }}</button>
      </fieldset>

      <div class="grid" v-if="form.level === 3">
        <label>{{ L.registry.inputs }}<input v-model="form.inputsText" placeholder="AC 清单，工单" /></label>
        <label>{{ L.registry.outputs }}<input v-model="form.outputsText" placeholder="PR，验收报告" /></label>
        <label>{{ L.registry.drivers }}<input v-model="form.driversText" class="mono" list="bpa-l3-ids" placeholder="L3-01-01-01" /></label>
        <label>{{ L.registry.supports }}<input v-model="form.supportsText" class="mono" list="bpa-l3-ids" placeholder="L3-01-02-01" /></label>
        <datalist id="bpa-l3-ids">
          <option v-for="id in l3Ids" :key="id" :value="id" />
        </datalist>
        <label class="span2">{{ L.registry.note }}<input v-model="form.note" /></label>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <div class="bpa-tree__editor-actions">
        <button type="button" class="primary" :disabled="busy || !form.id || !form.name" data-testid="bpa-save-node" @click="save">{{ L.registry.save }}</button>
        <button type="button" class="ghost" @click="cancelEdit">{{ L.registry.cancel }}</button>
        <button v-if="!creating" type="button" class="danger" :disabled="busy" data-testid="bpa-delete-node" @click="remove">{{ L.registry.delete }}</button>
      </div>
    </div>

    <table class="bpa-tree__table" data-testid="bpa-tree-table">
      <thead>
        <tr>
          <th>{{ L.registry.id }}</th>
          <th>{{ L.registry.name }}</th>
          <th>{{ L.registry.owner }}</th>
          <th>{{ L.registry.kpis }}</th>
          <th>IO</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="n in rows" :key="n.id" :data-testid="`bpa-row-${n.id}`" @click="startEdit(n)">
          <td class="mono" :style="{ paddingLeft: `${(n.level - 1) * 16 + 8}px` }">
            <span class="lvl" :class="levelBadgeClass(n.level)">L{{ n.level }}</span>
            {{ n.id }}
            <span v-if="n.level === 1 && n.section" class="sec">{{ L.sectionLetters[n.section] }}</span>
            <span v-if="n.pcfRef" class="sec pcf">{{ n.pcfRef }}</span>
            <span v-else-if="n.level === 1" class="sec pcf-miss" :title="L.registry.pcfUnmappedTip">未映射 PCF</span>
          </td>
          <td>
            {{ n.name }}
            <span v-if="n.decomposition" class="muted small">· {{ L.decompositionNames[n.decomposition] }}</span>
          </td>
          <td>{{ n.owner || '—' }}</td>
          <td>{{ n.kpis?.length || 0 }}</td>
          <td class="muted">{{ linkCount(n) }}</td>
          <td class="row-actions">
            <button v-if="n.level < 6" type="button" class="ghost" :title="L.registry.addNode" @click.stop="startAddChild(n)">＋</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
.bpa-tree { display: flex; flex-direction: column; gap: 10px; }
.bpa-tree__bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;
  .hint { margin: 0; flex: 1; min-width: 260px; } }
.bpa-tree__editor { border: 1px solid var(--accent-primary); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px;
  h3 { margin: 0; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;
    label { display: flex; flex-direction: column; gap: 3px; font-size: 12px;
      &.span2 { grid-column: span 2; } }
    input, select { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 13px; background: var(--bg-primary, #fff); color: inherit; } }
  .kpis { border: 1px dashed var(--border-color, #e5e7eb); border-radius: 8px; padding: 10px;
    legend { font-size: 12px; padding: 0 4px; }
    .kpi-row { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 6px; margin-bottom: 6px;
      input { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 5px 8px; font-size: 12px; background: var(--bg-primary, #fff); color: inherit; } } } }
.bpa-tree__editor-actions { display: flex; gap: 8px; }
button.primary { background: var(--accent-primary); color: var(--text-on-accent, #fff); border: none; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-size: 13px;
  &:disabled { opacity: 0.6; cursor: wait; } }
button.ghost { background: transparent; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 5px 12px; cursor: pointer; font-size: 12px; color: inherit; }
button.danger { background: transparent; border: 1px solid var(--danger, #dc2626); color: var(--danger, #dc2626); border-radius: 8px; padding: 5px 12px; cursor: pointer; font-size: 12px; margin-left: auto; }
.bpa-tree__table { width: 100%; border-collapse: collapse; font-size: 13px;
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
  th { font-weight: 600; opacity: 0.75; }
  tbody tr { cursor: pointer; &:hover { background: var(--bg-tertiary, rgba(0,0,0,0.04)); } } }
.lvl { border-radius: 6px; padding: 0 5px; font-size: 10px; margin-right: 6px; color: #fff; }
.lv-classify { background: #6b7280; }
.lv-process { background: var(--accent-primary); }
.lv-decompose { background: #9ca3af; }
.sec { margin-left: 6px; font-size: 10px; border: 1px solid currentColor; border-radius: 6px; padding: 0 4px; opacity: 0.75; }
.sec.pcf { color: var(--accent-primary); opacity: 1; }
.sec.pcf-miss { color: var(--warning, #b45309); opacity: 1; border-style: dashed; }
.row-actions button { padding: 2px 8px; }
.err { color: var(--danger, #dc2626); font-size: 12px; margin: 0; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
</style>

<!-- overlay/custom/client/loop/orchestrator/views/SpecEditorView.vue -->
<!-- P4 T6/T7 —— 可视化编排器主视图。顶部工具栏（返回/名称/描述/导入/导出/
     校验汇总/保存/试跑）+ 左侧节点面板（点击/拖入画布）+ 中间编辑画布 +
     右侧配置面板。编辑守卫：画布变更即跑 validateEditorDoc（validateGraphSpec
     + analyzeGraphSpec + 结构镜像），validate 失败禁用保存；entryNode 缺失
     序列化兜底取首节点并黄条提示。试跑：保存成功后可点，成功跳运行详情。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { runRest } from '@/custom/loop/runcenter/api'
import EditorCanvas from '../components/EditorCanvas.vue'
import NodeConfigPanel from '../components/NodeConfigPanel.vue'
import { EDITOR_NODE_TYPES, type EditorNodeType, type GraphSpec } from '../spec'
import {
  emptySpec, addToSpec, removeNode, addEdge, removeEdge, moveNode, updateNodeConfig,
  wrapNodesInContainer, unwrapContainer, canvasToSpec, specToCanvas, importSpec, parseSpecJson,
  validateEditorDoc, edgeId, type CanvasDoc, type EditorIssue,
} from '../adapters/editor'

const props = defineProps<{
  /** 编辑既有 spec（编辑卡入口传入；缺省 = 新建空白图） */
  initialSpec?: GraphSpec | null
  /** 既有 spec 摘要（导入版本仲裁：同 id 取最大版本 +1） */
  existingSpecs?: Array<{ id: string; version?: number }>
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'saved', spec: GraphSpec): void
}>()

const router = useRouter()
const { t } = useI18n()

// ── 文档与选中态 ──
// initialSpec 经 specToCanvas 进画布（隔离 prop 引用，后续编辑不再依赖父层）
const doc = ref<CanvasDoc>(props.initialSpec ? specToCanvas(props.initialSpec) : emptySpec())
const selection = ref<string[]>([])
const selectedEdgeId = ref<string | null>(null)
const dirty = ref(false)
const savedId = ref<string | null>(null)

/** 统一变更口：纯函数产出新 doc，标脏（试跑门禁依据） */
function mutate(next: CanvasDoc): void {
  doc.value = next
  dirty.value = true
}

/** 工具栏输入走 mutate（换 doc 对象触发校验 computed 重算；直接 v-model 改字段不触发） */
function onNameInput(ev: Event): void {
  mutate({ ...doc.value, id: (ev.target as HTMLInputElement).value })
}
function onDescInput(ev: Event): void {
  mutate({ ...doc.value, description: (ev.target as HTMLInputElement).value })
}

// ── 编辑守卫（实时校验）──
const validation = computed(() => validateEditorDoc(doc.value))
const canSave = computed(() => validation.value.issue === null && !saving.value)
const canTryRun = computed(() => !dirty.value && savedId.value !== null && validation.value.issue === null)

const invalidEdgeKeys = computed<string[]>(() => {
  const keys: string[] = []
  for (const w of validation.value.warnings) {
    if (w.edgeIndex === undefined) continue
    const e = doc.value.edges[w.edgeIndex]
    if (e) keys.push(edgeId(e.from, e.to))
  }
  return keys
})
const warningNodeIds = computed<string[]>(() =>
  validation.value.warnings.filter(w => w.nodeId !== undefined).map(w => w.nodeId!))

function issueText(issue: EditorIssue): string {
  switch (issue.kind) {
    case 'idInvalid': return t('ia2.orchestrate.editor.err.idInvalid')
    case 'empty': return t('ia2.orchestrate.editor.err.empty')
    case 'validate': return issue.message
    case 'structure': return issue.message
  }
}

/** 警告/错误定位：nodeId → 选中节点；edgeIndex → 选中边 */
function locate(target: { nodeId?: string; edgeIndex?: number }): void {
  if (target.nodeId !== undefined) {
    selection.value = [target.nodeId]
    selectedEdgeId.value = null
    return
  }
  if (target.edgeIndex !== undefined) {
    const e = doc.value.edges[target.edgeIndex]
    if (e) selectedEdgeId.value = edgeId(e.from, e.to)
  }
}

// ── 画布交互 ──
function onAddNode(type: EditorNodeType): void {
  mutate(addToSpec(doc.value, type))
}
function onDropNode(at: { type: string; x: number; y: number }): void {
  if (!(EDITOR_NODE_TYPES as string[]).includes(at.type)) return
  mutate(addToSpec(doc.value, at.type as EditorNodeType, { x: at.x, y: at.y }))
}
function onCardClick(id: string, multi: boolean): void {
  selectedEdgeId.value = null
  if (multi) {
    selection.value = selection.value.includes(id)
      ? selection.value.filter(x => x !== id)
      : [...selection.value, id]
  } else {
    selection.value = [id]
  }
}
function onConnect(pair: { from: string; to: string }): void {
  mutate(addEdge(doc.value, pair.from, pair.to))
}
function onMoveNode(pos: { id: string; x: number; y: number }): void {
  mutate(moveNode(doc.value, pos.id, pos.x, pos.y))
}
function onRemoveSelected(): void {
  let next = doc.value
  for (const id of selection.value) next = removeNode(next, id)
  if (selectedEdgeId.value) {
    const [from, to] = selectedEdgeId.value.split('->')
    next = removeEdge(next, from, to)
  }
  selection.value = selection.value.filter(id => next.nodes.some(n => n.id === id))
  selectedEdgeId.value = null
  mutate(next)
}
/** 配置面板"删除节点"：清空选中后走统一删除口 */
function onRemoveNodeViaPanel(nodeId: string): void {
  selection.value = [nodeId]
  onRemoveSelected()
}
function onWrapContainer(): void {
  if (selection.value.length < 2) return
  mutate(wrapNodesInContainer(doc.value, selection.value))
}
function onUnwrapContainer(containerId: string): void {
  mutate(unwrapContainer(doc.value, containerId))
}
function onUpdateConfig(nodeId: string, config: Record<string, unknown>): void {
  mutate(updateNodeConfig(doc.value, nodeId, config))
}
function onSetEntry(nodeId: string): void {
  mutate({ ...doc.value, entryNode: nodeId })
}

const selectedNode = computed(() =>
  selection.value.length === 1 ? doc.value.nodes.find(n => n.id === selection.value[0]) ?? null : null)

// ── 导入 / 导出 ──
const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)

function onImportClick(): void {
  importError.value = null
  fileInput.value?.click()
}
function onImportFile(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 同文件可重复导入
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const spec = parseSpecJson(String(reader.result ?? ''))
      doc.value = importSpec(spec, props.existingSpecs ?? [])
      selection.value = []
      selectedEdgeId.value = null
      dirty.value = true
    } catch (err) {
      importError.value = err instanceof Error ? err.message : String(err)
    }
  }
  reader.onerror = () => { importError.value = 'read error' }
  reader.readAsText(file)
}

function onExport(): void {
  const { spec } = canvasToSpec(doc.value)
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spec-${doc.value.id || 'untitled'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 保存 / 试跑 ──
const saving = ref(false)
const saveError = ref<string | null>(null)
const runStarting = ref(false)
const runError = ref<string | null>(null)

async function onSave(): Promise<void> {
  if (!canSave.value || saving.value) return
  saving.value = true
  saveError.value = null
  try {
    const spec = validation.value.spec
    await runRest.saveSpec(spec)
    savedId.value = spec.id
    dirty.value = false
    emit('saved', spec)
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onTryRun(): Promise<void> {
  if (!canTryRun.value || runStarting.value) return
  runStarting.value = true
  runError.value = null
  try {
    const { runId } = await runRest.startSpecRun(savedId.value!)
    await router.push(`/app/runs/${runId}`)
  } catch (err) {
    // 501=引擎未开 / 400=spec 校验失败：服务端 message 一针见血，直显
    runError.value = err instanceof Error ? err.message : String(err)
  } finally {
    runStarting.value = false
  }
}
</script>

<template>
  <div class="sev" data-spec-editor>
    <!-- 工具栏：返回 | 名称/描述 | 导入/导出 | 校验汇总 | 保存 | 试跑 -->
    <header class="sev__toolbar" data-editor-toolbar>
      <button class="sev__btn" data-editor-back @click="emit('back')">
        {{ t('ia2.orchestrate.editor.toolbar.back') }}
      </button>
      <input
        :value="doc.id"
        class="sev__name"
        data-editor-name
        :placeholder="t('ia2.orchestrate.editor.toolbar.namePlaceholder')"
        @input="onNameInput"
      >
      <input
        :value="doc.description"
        class="sev__desc"
        data-editor-desc
        :placeholder="t('ia2.orchestrate.editor.toolbar.descPlaceholder')"
        @input="onDescInput"
      >
      <span class="sev__version">v{{ doc.version }}</span>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="sev__file"
        data-editor-file
        @change="onImportFile"
      >
      <button class="sev__btn" data-editor-import @click="onImportClick">
        {{ t('ia2.orchestrate.editor.toolbar.importJson') }}
      </button>
      <button class="sev__btn" data-editor-export @click="onExport">
        {{ t('ia2.orchestrate.editor.toolbar.exportJson') }}
      </button>
      <span
        class="sev__validation-chip"
        :class="validation.issue ? 'is-error' : validation.warnings.length > 0 ? 'is-warn' : 'is-ok'"
        data-validation-chip
      >
        {{ validation.issue
          ? `${t('ia2.orchestrate.editor.validation.errorsLabel')} 1`
          : validation.warnings.length > 0
            ? `${t('ia2.orchestrate.editor.validation.warningsLabel')} ${validation.warnings.length}`
            : t('ia2.orchestrate.editor.validation.ok') }}
      </span>
      <button
        class="sev__btn sev__btn--primary"
        data-editor-save
        :disabled="!canSave"
        @click="onSave"
      >
        {{ saving ? t('ia2.orchestrate.editor.toolbar.saving') : t('ia2.orchestrate.editor.toolbar.save') }}
      </button>
      <button
        class="sev__btn"
        data-editor-tryrun
        :disabled="!canTryRun"
        :title="t('ia2.orchestrate.editor.toolbar.tryRunDisabledTip')"
        @click="onTryRun"
      >
        {{ runStarting ? t('ia2.orchestrate.editor.toolbar.runStarting') : t('ia2.orchestrate.editor.toolbar.tryRun') }}
      </button>
    </header>

    <!-- 错误横幅（保存/试跑/导入失败；服务端 message 直显） -->
    <p v-if="saveError" class="sev__banner is-error" data-save-error>
      {{ t('ia2.orchestrate.editor.err.saveFailed') }}<code>{{ saveError }}</code>
    </p>
    <p v-if="runError" class="sev__banner is-error" data-run-error>
      {{ t('ia2.orchestrate.editor.err.runFailed') }}<code>{{ runError }}</code>
    </p>
    <p v-if="importError" class="sev__banner is-error" data-import-error>
      {{ t('ia2.orchestrate.editor.err.importFailed') }}<code>{{ importError }}</code>
    </p>
    <p v-if="validation.entryFallback" class="sev__banner is-warn" data-entry-fallback>
      {{ t('ia2.orchestrate.editor.validation.entryFallback') }}
    </p>

    <!-- 校验面板：错误/警告列表，点击定位节点/边 -->
    <section
      v-if="validation.issue || validation.warnings.length > 0"
      class="sev__validation"
      data-validation-panel
    >
      <p v-if="validation.issue" class="sev__issue is-error" data-validation-issue>
        <span class="sev__issue-tag">{{ t('ia2.orchestrate.editor.validation.errorsLabel') }}</span>
        {{ issueText(validation.issue) }}
      </p>
      <button
        v-for="(w, i) in validation.warnings"
        :key="`${w.code}-${i}`"
        class="sev__issue is-warn"
        :data-validation-warning="w.code"
        @click="locate(w)"
      >
        <span class="sev__issue-tag">{{ t('ia2.orchestrate.editor.validation.warningsLabel') }}</span>
        {{ w.message }}
      </button>
    </section>

    <div class="sev__body">
      <!-- 左侧节点面板 -->
      <aside class="sev__palette" data-palette>
        <h4 class="sev__side-title">{{ t('ia2.orchestrate.editor.palette.title') }}</h4>
        <p class="sev__side-hint">{{ t('ia2.orchestrate.editor.palette.hint') }}</p>
        <button
          v-for="type in EDITOR_NODE_TYPES"
          :key="type"
          class="sev__palette-item"
          :data-palette-item="type"
          draggable="true"
          @dragstart="(ev: DragEvent) => ev.dataTransfer?.setData('application/x-node-type', type)"
          @click="onAddNode(type)"
        >
          <span class="sev__palette-name">{{ t(`ia2.orchestrate.editor.node.${type}.name`) }}</span>
          <span class="sev__palette-desc">{{ t(`ia2.orchestrate.editor.node.${type}.desc`) }}</span>
        </button>
      </aside>

      <!-- 中间画布 + 画布动作条 -->
      <section class="sev__center">
        <div class="sev__canvas-actions">
          <button
            class="sev__btn"
            data-delete-selected
            :disabled="selection.length === 0 && selectedEdgeId === null"
            @click="onRemoveSelected"
          >
            {{ t('ia2.orchestrate.editor.canvas.deleteSelected') }}
          </button>
          <button
            class="sev__btn"
            data-wrap-container
            :disabled="selection.length < 2"
            @click="onWrapContainer"
          >
            {{ t('ia2.orchestrate.editor.canvas.wrapContainer') }}
          </button>
        </div>
        <EditorCanvas
          :doc="doc"
          :selected-node-ids="selection"
          :selected-edge-id="selectedEdgeId"
          :invalid-edge-ids="invalidEdgeKeys"
          :warning-node-ids="warningNodeIds"
          @card-click="onCardClick"
          @connect="onConnect"
          @move-node="onMoveNode"
          @drop-node="onDropNode"
          @edge-click="selectedEdgeId = $event"
        />
      </section>

      <!-- 右侧：配置面板 + 容器 + 通道 -->
      <aside class="sev__side">
        <NodeConfigPanel
          :node="selectedNode"
          :entry-node="doc.entryNode"
          @update="(cfg) => selectedNode && onUpdateConfig(selectedNode.id, cfg)"
          @remove="onRemoveNodeViaPanel"
          @set-entry="onSetEntry"
        />

        <section class="sev__side-card" data-containers-card>
          <h4 class="sev__side-title">{{ t('ia2.orchestrate.editor.containers.title') }}</h4>
          <p v-if="doc.containers.length === 0" class="sev__side-hint">
            {{ t('ia2.orchestrate.editor.containers.empty') }}
          </p>
          <div v-for="c in doc.containers" :key="c.id" class="sev__container-row" :data-container="c.id">
            <span class="sev__container-label">{{ c.label || c.id }} · {{ c.nodeIds.length }}</span>
            <button class="sev__btn sev__btn--mini" :data-unwrap="c.id" @click="onUnwrapContainer(c.id)">
              {{ t('ia2.orchestrate.editor.containers.unwrap') }}
            </button>
          </div>
        </section>

        <section class="sev__side-card" data-channels-card>
          <h4 class="sev__side-title">{{ t('ia2.orchestrate.editor.channels.title') }}</h4>
          <p class="sev__side-hint">{{ t('ia2.orchestrate.editor.channels.auto') }}</p>
          <div v-for="(def, name) in doc.channels" :key="name" class="sev__channel-row">
            <code class="sev__channel-name">{{ name }}</code>
            <span class="sev__channel-reducer">{{ def.reducer }}</span>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script lang="ts">
// 组件名（keep-alive / devtools 标识）
export default { name: 'SpecEditorView' }
</script>

<style scoped>
.sev {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}
.sev__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sev__btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.sev__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sev__btn--primary {
  border: none;
  background: var(--accent-primary, var(--color-primary, #3b82f6));
  color: var(--color-on-accent, #fff);
}
.sev__btn--mini { padding: 1px 6px; font-size: 10px; }
.sev__name { width: 160px; }
.sev__desc { width: 200px; }
.sev__name, .sev__desc {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--color-bg-input, transparent);
  color: inherit;
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
}
.sev__version {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.sev__file { display: none; }
.sev__validation-chip {
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
  white-space: nowrap;
}
.sev__validation-chip.is-ok { background: rgba(40, 191, 92, 0.12); color: var(--color-success, #28bf5c); }
.sev__validation-chip.is-warn { background: rgba(245, 158, 11, 0.12); color: var(--color-warning, #f59e0b); }
.sev__validation-chip.is-error { background: rgba(225, 29, 72, 0.12); color: var(--error, var(--color-danger, #e11d48)); }

.sev__banner {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-standard, 6px);
  font-size: 12px;
}
.sev__banner code { font-size: 11px; word-break: break-all; }
.sev__banner.is-error {
  background: rgba(225, 29, 72, 0.08);
  color: var(--error, var(--color-danger, #e11d48));
}
.sev__banner.is-warn {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning, #f59e0b);
}

.sev__validation {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 110px;
  overflow: auto;
}
.sev__issue {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 3px 8px;
  border: none;
  border-radius: var(--radius-micro, 3px);
  font-size: 11px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.sev__issue-tag {
  flex: none;
  padding: 0 5px;
  border-radius: var(--radius-pill, 999px);
  font-size: 10px;
  color: #fff;
}
.sev__issue.is-error { background: rgba(225, 29, 72, 0.08); color: var(--error, var(--color-danger, #e11d48)); }
.sev__issue.is-error .sev__issue-tag { background: var(--error, var(--color-danger, #e11d48)); }
.sev__issue.is-warn { background: rgba(245, 158, 11, 0.1); color: var(--color-warning, #f59e0b); }
.sev__issue.is-warn .sev__issue-tag { background: var(--color-warning, #f59e0b); }

.sev__body {
  display: grid;
  grid-template-columns: 170px 1fr 260px;
  gap: 8px;
  min-height: 0;
  flex: 1;
}
.sev__palette {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card);
  overflow: auto;
}
.sev__palette-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: grab;
}
.sev__palette-item:hover { border-color: var(--accent-primary, var(--color-primary, #3b82f6)); }
.sev__palette-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.sev__palette-desc {
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  line-height: 1.4;
}
.sev__center {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.sev__center > :deep(.ed-canvas) { flex: 1; min-height: 0; }
.sev__canvas-actions { display: flex; gap: 6px; }
.sev__side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}
.sev__side-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card);
  font-size: 12px;
}
.sev__side-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-primary); }
.sev__side-hint {
  margin: 0;
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  line-height: 1.4;
}
.sev__container-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.sev__container-label { font-size: 11px; color: var(--text-secondary); }
.sev__channel-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}
.sev__channel-name {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--text-primary);
  word-break: break-all;
}
.sev__channel-reducer { font-size: 10px; color: var(--text-muted, #878c99); }
</style>

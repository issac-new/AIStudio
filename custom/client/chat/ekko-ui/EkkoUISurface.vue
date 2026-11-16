<script setup lang="ts">
/**
 * 一块声明式 Surface 的宿主壳：校验、状态、必填检查、提交/取消边界。
 * 组件树本身由 EkkoUINode 渲染；Agent 无法提交 HTML/CSS/脚本。
 */
import { computed, provide, reactive, ref, watch } from 'vue'
import EkkoUINode from './EkkoUINode.vue'
import { EKKO_UI_SURFACE_CONTEXT, type EkkoUISurfaceContext } from './context'
import {
  applyActions,
  cloneJson,
  getStateValue,
  truthy as truthfulValue,
  validateSpec,
  type EkkoUIActionOutcome,
  type EkkoUIJsonValue,
  type EkkoUINode as EkkoUINodeData,
  type EkkoUISpec,
  type EkkoUIState,
} from './protocol'

const props = withDefaults(defineProps<{
  spec: unknown
  interactive?: boolean
  submission?: EkkoUIJsonValue
  title?: string
  surfaceId?: string
}>(), {
  interactive: true,
  submission: undefined,
  title: '',
  surfaceId: '',
})

const emit = defineEmits<{
  (event: 'submit', value: { actionId: string; payload: EkkoUIJsonValue }): void
  (event: 'cancel', value: { actionId: string }): void
}>()

const validation = computed(() => validateSpec(props.spec))
const validSpec = computed<EkkoUISpec | null>(() => validation.value.ok ? (validation.value.spec ?? null) : null)
const fallbackText = computed(() => {
  const raw = props.spec as Record<string, unknown> | null
  const fallback = raw && typeof raw.fallbackText === 'string' ? raw.fallbackText : ''
  return fallback || '此界面无法在当前客户端显示。'
})
const validationMessages = computed(() => validation.value.errors.slice(0, 6))

const state = reactive<EkkoUIState>({})
const submitError = ref('')

function resetState(spec: EkkoUISpec | null, submission: EkkoUIJsonValue | undefined): void {
  const base: EkkoUIState = spec?.state ? cloneJson(spec.state) : {}
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(state, base)
  if (submission && typeof submission === 'object' && !Array.isArray(submission)) {
    Object.assign(state, cloneJson(submission as Record<string, EkkoUIJsonValue>))
  }
}

watch(() => [validSpec.value, props.submission] as const, ([spec, submission]) => {
  resetState(spec, submission)
}, { immediate: true, deep: false })

const errors = reactive(new Map<string, string>())

function setValue(path: string, value: EkkoUIJsonValue): void {
  if (!props.interactive || !path) return
  const segments = path.split('.')
  let cursor: Record<string, EkkoUIJsonValue> = state
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    const next = cursor[key]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) cursor[key] = {}
    cursor = cursor[key] as Record<string, EkkoUIJsonValue>
  }
  cursor[segments[segments.length - 1]] = value
  const nodeId = requiredByPath.value.get(path)
  if (nodeId && errors.has(nodeId) && truthfulValue(value)) errors.delete(nodeId)
}

interface RequiredField { nodeId: string; path: string; label: string }
const requiredByPath = computed<Map<string, string>>(() => {
  const map = new Map<string, string>()
  for (const field of requiredFields.value) map.set(field.path, field.nodeId)
  return map
})
const requiredFields = computed<RequiredField[]>(() => {
  const found: RequiredField[] = []
  const seen = new Set<string>()
  const walk = (node: EkkoUINodeData, inheritedLabel: string, inheritedRequired: boolean): void => {
    if (!node || typeof node !== 'object' || seen.has(node.id)) return
    seen.add(node.id)
    let label = inheritedLabel
    let required = inheritedRequired
    if (node.type === 'field') {
      label = String((node.props?.label as string) || '')
      required = node.props?.required === true
    }
    if (node.props?.required === true) required = true
    if (node.bind && required) found.push({ nodeId: node.id, path: node.bind, label: label || '此项' })
    for (const child of node.children || []) walk(child, label, required)
  }
  if (validSpec.value) walk(validSpec.value.root, '', false)
  return found
})

function checkRequired(): boolean {
  errors.clear()
  if (!validSpec.value) return false
  for (const field of requiredFields.value) {
    const value = getStateValue(state, field.path)
    if (!truthfulValue(value)) errors.set(field.nodeId, `请填写${field.label}`)
  }
  submitError.value = errors.size ? `还有 ${errors.size} 个必填项未填写` : ''
  return errors.size === 0
}

const submitAction = computed<{ actionId: string } | null>(() => {
  if (!validSpec.value) return null
  let actionId = ''
  const seen = new Set<string>()
  const walk = (node: EkkoUINodeData): void => {
    if (!node || actionId || seen.has(node.id)) return
    seen.add(node.id)
    for (const actions of Object.values(node.events || {})) {
      const list = Array.isArray(actions) ? actions : [actions]
      for (const action of list) {
        if (action && (action as { type?: string }).type === 'surface.submit') {
          actionId = String((action as { actionId?: string }).actionId || 'submit')
          return
        }
      }
    }
    for (const child of node.children || []) walk(child)
  }
  walk(validSpec.value.root)
  return actionId ? { actionId } : null
})

const hasCancelAction = computed<boolean>(() => {
  if (!validSpec.value) return false
  let found = false
  const seen = new Set<string>()
  const walk = (node: EkkoUINodeData): void => {
    if (!node || found || seen.has(node.id)) return
    seen.add(node.id)
    for (const actions of Object.values(node.events || {})) {
      const list = Array.isArray(actions) ? actions : [actions]
      if (list.some(action => (action as { type?: string }).type === 'surface.cancel')) found = true
    }
    for (const child of node.children || []) walk(child)
  }
  walk(validSpec.value.root)
  return found
})

const showFooterSubmit = computed(() => props.interactive && !submitAction.value)
const showFooterCancel = computed(() => props.interactive && !hasCancelAction.value)

function handleOutcome(outcome: EkkoUIActionOutcome): void {
  if (outcome.cancel) {
    emit('cancel', { actionId: outcome.cancel.actionId })
    return
  }
  if (outcome.submit) {
    if (!checkRequired()) return
    emit('submit', { actionId: outcome.submit.actionId, payload: outcome.submit.payload })
    return
  }
  if (outcome.close) {
    emit('cancel', { actionId: 'close' })
  }
}

function runEvent(node: EkkoUINodeData, eventName: string): void {
  if (!props.interactive) return
  const actions = node.events?.[eventName]
  if (!actions) return
  handleOutcome(applyActions(actions, state, { nodeId: node.id, type: eventName }))
}

function submitFromFooter(): void {
  if (!props.interactive) return
  if (!checkRequired()) return
  emit('submit', { actionId: 'submit', payload: cloneJson(state) })
}

function cancelFromFooter(): void {
  if (!props.interactive) return
  emit('cancel', { actionId: 'cancel' })
}

const context: EkkoUISurfaceContext = {
  state,
  errors,
  get interactive() { return props.interactive },
  setValue,
  runEvent,
}
provide(EKKO_UI_SURFACE_CONTEXT, context)

const displayTitle = computed(() => props.title || validSpec.value?.title || '')

defineExpose({
  getState: () => cloneJson(state),
  validate: () => checkRequired(),
})
</script>

<template>
  <div class="ekko-surface" :data-surface-id="surfaceId || validSpec?.surfaceId || ''">
    <header v-if="displayTitle" class="ekko-surface-head">
      <span class="ekko-surface-title">{{ displayTitle }}</span>
    </header>

    <template v-if="validSpec">
      <EkkoUINode :node="validSpec.root" />
      <p v-if="submitError" class="ekko-surface-error" role="alert">{{ submitError }}</p>
      <footer v-if="showFooterSubmit || showFooterCancel" class="ekko-surface-actions">
        <button
          v-if="showFooterCancel"
          type="button"
          class="ekko-surface-btn ghost"
          @click="cancelFromFooter"
        >取消</button>
        <button
          v-if="showFooterSubmit"
          type="button"
          class="ekko-surface-btn primary"
          @click="submitFromFooter"
        >提交</button>
      </footer>
    </template>

    <template v-else>
      <p class="ekko-surface-fallback">{{ fallbackText }}</p>
      <ul v-if="validationMessages.length" class="ekko-surface-issues">
        <li v-for="issue in validationMessages" :key="`${issue.path}:${issue.code}`">
          <code>{{ issue.path || 'spec' }}</code> {{ issue.message }}
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.ekko-surface {
  --ekko-space-xs: calc(4px * var(--spacing-scale));
  --ekko-space-sm: calc(8px * var(--spacing-scale));
  --ekko-space-md: calc(12px * var(--spacing-scale));
  --ekko-space-lg: calc(16px * var(--spacing-scale));
  --ekko-space-xl: calc(24px * var(--spacing-scale));
  display: flex;
  flex-direction: column;
  gap: var(--ekko-space-sm);
  color: var(--text-primary);
  min-width: 0;
}
.ekko-surface-head { display: flex; align-items: center; justify-content: space-between; }
.ekko-surface-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.02em; }
.ekko-surface-actions { display: flex; justify-content: flex-end; gap: var(--ekko-space-sm); padding-top: var(--ekko-space-xs); }
.ekko-surface-btn {
  padding: 6px 14px;
  border-radius: var(--radius-standard, 6px);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.ekko-surface-btn.primary { background: var(--accent-primary); border-color: var(--accent-primary); color: var(--text-on-accent); }
.ekko-surface-btn.ghost { background: transparent; color: var(--text-secondary); }
.ekko-surface-btn:hover { background: var(--bg-card-hover); }
.ekko-surface-btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.ekko-surface-error { margin: 0; color: var(--error); font-size: 12px; }
.ekko-surface-fallback { margin: 0; white-space: pre-wrap; color: var(--text-secondary); }
.ekko-surface-issues { margin: 0; padding-left: 18px; color: var(--text-muted); font-size: 11px; }
.ekko-surface-issues code { font-family: var(--font-mono, monospace); }
</style>

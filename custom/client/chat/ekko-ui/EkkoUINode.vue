<script setup lang="ts">
/**
 * 递归渲染 ekko-ui/v1 组件树。
 *
 * 组件与属性已经在 protocol.validateSpec 阶段过白名单；本组件只负责把
 * 已校验的声明映射到原生 HTML + Pure Ink token，不接收任意 CSS/HTML。
 * 输入通过 bind 两向绑定到 surface state；只有 submit/cancel 会跨边界。
 */
import { computed, inject } from 'vue'
import { EKKO_UI_SURFACE_CONTEXT } from './context'
import {
  evaluateExpression,
  getStateValue,
  type EkkoUIJsonValue,
  type EkkoUINode,
  type EkkoUIStyle,
} from './protocol'

const props = defineProps<{ node: EkkoUINode }>()

const ctx = inject(EKKO_UI_SURFACE_CONTEXT, null)
if (!ctx) throw new Error('EkkoUINode 必须在 EkkoUISurface 内使用')

const SPACING: Record<string, string> = { none: '0', xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' }

const def = computed(() => props.node.type)
const children = computed(() => props.node.children || [])

const visible = computed(() => {
  if (!props.node.visibleWhen) return true
  return truthy(evaluateExpression(props.node.visibleWhen, { state: ctx.state }))
})

function truthy(value: EkkoUIJsonValue | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  return Object.keys(value).length > 0
}

/** 支持 { $state: 'path' } 与 { $template: '…{path}…' } 两种声明式取值。 */
function resolveValue(value: EkkoUIJsonValue | undefined, depth = 0): EkkoUIJsonValue | undefined {
  if (depth > 6 || value === undefined || value === null) return value
  if (Array.isArray(value)) return value.map(item => resolveValue(item, depth + 1) as EkkoUIJsonValue)
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === '$state') {
      const path = (value as Record<string, unknown>).$state
      return typeof path === 'string' ? getStateValue(ctx.state, path) : undefined
    }
    if (keys.length === 1 && keys[0] === '$template') {
      const template = (value as Record<string, unknown>).$template
      if (typeof template !== 'string') return ''
      return template.replace(/\{([A-Za-z_][A-Za-z0-9_.]{0,63})\}/g, (_m, path: string) => {
        const found = getStateValue(ctx.state, path)
        return found === undefined || found === null ? '' : String(found)
      })
    }
    const out: Record<string, EkkoUIJsonValue> = {}
    for (const [key, item] of Object.entries(value)) out[key] = resolveValue(item, depth + 1) as EkkoUIJsonValue
    return out
  }
  return value
}

function prop(name: string): EkkoUIJsonValue | undefined {
  return resolveValue((props.node.props || {})[name])
}

const text = computed(() => String(prop('text') ?? ''))
const options = computed(() => {
  const raw = prop('options')
  if (!Array.isArray(raw)) return []
  return raw.map(item => {
    if (typeof item === 'string') return { label: item, value: item }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, EkkoUIJsonValue>
      const label = String(record.label ?? record.value ?? '')
      return { label, value: record.value ?? label }
    }
    return { label: String(item), value: String(item) }
  })
})

const boundValue = computed(() => {
  const path = props.node.bind
  return path ? getStateValue(ctx.state, path) : undefined
})

function updateValue(value: EkkoUIJsonValue): void {
  if (!ctx.interactive) return
  const path = props.node.bind
  if (path) ctx.setValue(path, value)
}

function onInput(event: Event): void {
  updateValue((event.target as HTMLInputElement | HTMLTextAreaElement).value)
}
function onNumberInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  updateValue(raw === '' ? null : Number(raw))
}
function onCheckbox(event: Event): void {
  updateValue((event.target as HTMLInputElement).checked)
}
function onSelect(event: Event): void {
  updateValue((event.target as HTMLSelectElement).value)
}
function onRadio(value: EkkoUIJsonValue): void {
  updateValue(value)
}
function onRange(event: Event): void {
  updateValue(Number((event.target as HTMLInputElement).value))
}

const fieldError = computed(() => ctx.errors.get(props.node.id) || '')

const inputValue = computed(() => {
  const value = boundValue.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
})

function runEvent(eventName: string): void {
  if (!ctx.interactive) return
  ctx.runEvent(props.node, eventName)
}

const styleVars = computed(() => {
  const style = props.node.style || {}
  const out: Record<string, string> = {}
  if (style.gap) out.gap = SPACING[style.gap] || SPACING.md
  if (style.padding) out.padding = SPACING[style.padding] || SPACING.md
  if (style.direction) out.flexDirection = style.direction
  if (style.columns) out.gridTemplateColumns = `repeat(${Math.max(1, Math.min(6, style.columns))}, minmax(0, 1fr))`
  if (style.align) {
    out.alignItems = style.align === 'start' ? 'flex-start'
      : style.align === 'end' ? 'flex-end'
        : style.align
  }
  if (style.width === 'full') out.width = '100%'
  if (style.display) out.display = style.display
  return out
})

const styleClass = computed(() => {
  const style: EkkoUIStyle = props.node.style || {}
  return [
    style.tone && style.tone !== 'default' ? `tone-${style.tone}` : '',
    style.radius ? `radius-${style.radius}` : '',
    style.width === 'full' ? 'full' : '',
    style.display === 'none' ? 'hidden' : '',
  ].filter(Boolean)
})

const isContainer = computed(() => ['box', 'stack', 'row', 'grid', 'scroll', 'card', 'form', 'field', 'button-group'].includes(def.value))
const buttonType = computed(() => {
  const variant = String(prop('variant') || 'default')
  const tone = String(prop('tone') || 'default')
  if (tone === 'danger') return 'danger'
  if (variant === 'primary') return 'primary'
  if (variant === 'text') return 'text'
  return 'default'
})
const buttonDisabled = computed(() => !ctx.interactive || prop('disabled') === true)

const listItems = computed(() => {
  const raw = prop('items')
  if (!Array.isArray(raw)) return []
  return raw.map(item => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, EkkoUIJsonValue>
      return { text: String(record.text ?? record.label ?? ''), description: record.description ? String(record.description) : '' }
    }
    return { text: String(item ?? ''), description: '' }
  })
})

const tableColumns = computed(() => {
  const raw = prop('columns')
  if (!Array.isArray(raw)) return []
  return raw.map(item => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, EkkoUIJsonValue>
      return { key: String(record.key ?? ''), label: String(record.label ?? record.key ?? '') }
    }
    return { key: String(item ?? ''), label: String(item ?? '') }
  }).filter(column => column.key)
})
const tableRows = computed(() => {
  const raw = prop('rows')
  return Array.isArray(raw) ? raw : []
})
function cell(row: EkkoUIJsonValue, key: string): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ''
  const value = (row as Record<string, EkkoUIJsonValue>)[key]
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <template v-if="visible">
    <!-- 容器 -->
    <div
      v-if="def === 'box'"
      class="ekko-node ekko-box"
      :class="styleClass"
      :style="styleVars"
    >
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </div>
    <div
      v-else-if="def === 'stack'"
      class="ekko-node ekko-stack"
      :class="styleClass"
      :style="styleVars"
    >
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </div>
    <div
      v-else-if="def === 'row'"
      class="ekko-node ekko-row"
      :class="styleClass"
      :style="styleVars"
    >
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </div>
    <div
      v-else-if="def === 'grid'"
      class="ekko-node ekko-grid"
      :class="styleClass"
      :style="styleVars"
    >
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </div>
    <div
      v-else-if="def === 'scroll'"
      class="ekko-node ekko-scroll"
      :class="styleClass"
      :style="{ ...styleVars, maxHeight: `${Number(prop('maxHeight') || 320)}px` }"
    >
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </div>
    <section
      v-else-if="def === 'card'"
      class="ekko-node ekko-card"
      :class="styleClass"
      :style="styleVars"
    >
      <header v-if="prop('title') || prop('subtitle')" class="ekko-card-head">
        <h4 v-if="prop('title')" class="ekko-card-title">{{ prop('title') }}</h4>
        <p v-if="prop('subtitle')" class="ekko-card-subtitle">{{ prop('subtitle') }}</p>
      </header>
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </section>
    <div v-else-if="def === 'divider'" class="ekko-divider" role="separator" />
    <div v-else-if="def === 'spacer'" :style="{ height: SPACING[String(prop('size') || 'md')] || SPACING.md }" aria-hidden="true" />

    <!-- 内容 -->
    <p v-else-if="def === 'text'" class="ekko-node ekko-text" :class="styleClass">{{ text }}</p>
    <component
      :is="`h${Math.min(6, Math.max(1, Number(prop('level') || 3)))}`"
      v-else-if="def === 'heading'"
      class="ekko-node ekko-heading"
      :class="styleClass"
    >{{ text }}</component>
    <pre v-else-if="def === 'code'" class="ekko-node ekko-code" :class="styleClass"><code>{{ text }}</code></pre>
    <span v-else-if="def === 'badge'" class="ekko-node ekko-badge" :class="styleClass">{{ text }}</span>
    <div v-else-if="def === 'alert'" class="ekko-node ekko-alert" :class="styleClass" role="status">
      <strong v-if="prop('title')" class="ekko-alert-title">{{ prop('title') }}</strong>
      <span>{{ text }}</span>
    </div>

    <!-- 表单与输入 -->
    <form
      v-else-if="def === 'form'"
      class="ekko-node ekko-form"
      :class="styleClass"
      :style="styleVars"
      @submit.prevent="runEvent('submit')"
    >
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </form>
    <div v-else-if="def === 'field'" class="ekko-node ekko-field" :class="styleClass" :style="styleVars">
      <label class="ekko-label">
        {{ prop('label') }}<span v-if="prop('required')" class="ekko-required" aria-hidden="true">*</span>
      </label>
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
      <p v-if="prop('hint')" class="ekko-hint">{{ prop('hint') }}</p>
    </div>
    <label v-else-if="def === 'input'" class="ekko-node ekko-control-wrap">
      <input
        class="ekko-input"
        :type="String(prop('type') || 'text')"
        :value="inputValue"
        :placeholder="prop('placeholder') ? String(prop('placeholder')) : undefined"
        :maxlength="prop('maxLength') ? Number(prop('maxLength')) : undefined"
        :disabled="!ctx.interactive"
        :aria-invalid="fieldError ? 'true' : undefined"
        @input="onInput"
      >
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <label v-else-if="def === 'textarea'" class="ekko-node ekko-control-wrap">
      <textarea
        class="ekko-input ekko-textarea"
        :value="inputValue"
        :rows="Number(prop('rows') || 4)"
        :placeholder="prop('placeholder') ? String(prop('placeholder')) : undefined"
        :maxlength="prop('maxLength') ? Number(prop('maxLength')) : undefined"
        :disabled="!ctx.interactive"
        :aria-invalid="fieldError ? 'true' : undefined"
        @input="onInput"
      />
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <label v-else-if="def === 'number'" class="ekko-node ekko-control-wrap">
      <input
        class="ekko-input"
        type="number"
        :value="inputValue"
        :placeholder="prop('placeholder') ? String(prop('placeholder')) : undefined"
        :min="prop('min') !== undefined ? Number(prop('min')) : undefined"
        :max="prop('max') !== undefined ? Number(prop('max')) : undefined"
        :step="prop('step') !== undefined ? Number(prop('step')) : undefined"
        :disabled="!ctx.interactive"
        :aria-invalid="fieldError ? 'true' : undefined"
        @input="onNumberInput"
      >
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <label v-else-if="def === 'select'" class="ekko-node ekko-control-wrap">
      <select
        class="ekko-input ekko-select"
        :value="String(boundValue ?? '')"
        :disabled="!ctx.interactive"
        :aria-invalid="fieldError ? 'true' : undefined"
        @change="onSelect"
      >
        <option value="">{{ prop('placeholder') ? String(prop('placeholder')) : '请选择' }}</option>
        <option v-for="option in options" :key="String(option.value)" :value="String(option.value)">{{ option.label }}</option>
      </select>
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <div v-else-if="def === 'radio'" class="ekko-node ekko-choice" :class="styleClass" role="radiogroup">
      <label v-for="option in options" :key="String(option.value)" class="ekko-choice-item">
        <input
          type="radio"
          :name="node.id"
          :value="String(option.value)"
          :checked="boundValue === option.value"
          :disabled="!ctx.interactive"
          @change="onRadio(option.value)"
        >
        <span>{{ option.label }}</span>
      </label>
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </div>
    <label v-else-if="def === 'checkbox'" class="ekko-node ekko-choice-item">
      <input
        type="checkbox"
        :checked="boundValue === true"
        :disabled="!ctx.interactive"
        @change="onCheckbox"
      >
      <span>{{ prop('label') || '' }}</span>
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <label v-else-if="def === 'switch'" class="ekko-node ekko-choice-item ekko-switch">
      <input
        type="checkbox"
        role="switch"
        :checked="boundValue === true"
        :disabled="!ctx.interactive"
        @change="onCheckbox"
      >
      <span>{{ prop('label') || '' }}</span>
    </label>
    <label v-else-if="def === 'range'" class="ekko-node ekko-control-wrap">
      <input
        class="ekko-range"
        type="range"
        :value="boundValue === undefined ? Number(prop('min') || 0) : Number(boundValue)"
        :min="prop('min') !== undefined ? Number(prop('min')) : 0"
        :max="prop('max') !== undefined ? Number(prop('max')) : 100"
        :step="prop('step') !== undefined ? Number(prop('step')) : 1"
        :disabled="!ctx.interactive"
        @input="onRange"
      >
      <span class="ekko-range-value">{{ boundValue ?? '' }}</span>
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <label v-else-if="def === 'date'" class="ekko-node ekko-control-wrap">
      <input
        class="ekko-input"
        type="date"
        :value="inputValue"
        :min="prop('min') ? String(prop('min')) : undefined"
        :max="prop('max') ? String(prop('max')) : undefined"
        :disabled="!ctx.interactive"
        @input="onInput"
      >
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>
    <label v-else-if="def === 'time'" class="ekko-node ekko-control-wrap">
      <input
        class="ekko-input"
        type="time"
        :value="inputValue"
        :disabled="!ctx.interactive"
        @input="onInput"
      >
      <span v-if="fieldError" class="ekko-error">{{ fieldError }}</span>
    </label>

    <!-- 动作 -->
    <button
      v-else-if="def === 'button'"
      type="button"
      class="ekko-node ekko-button"
      :class="[`variant-${buttonType}`, ...styleClass]"
      :disabled="buttonDisabled"
      @click="runEvent('click')"
    >{{ text }}</button>
    <div v-else-if="def === 'button-group'" class="ekko-node ekko-button-group" :class="styleClass" :style="styleVars">
      <EkkoUINode v-for="child in children" :key="child.id" :node="child" />
    </div>

    <!-- 数据 -->
    <ul v-else-if="def === 'list'" class="ekko-node ekko-list" :class="styleClass">
      <li v-if="!listItems.length" class="ekko-empty">（空）</li>
      <li v-for="(item, index) in listItems" :key="index">
        <span>{{ item.text }}</span>
        <small v-if="item.description" class="ekko-list-desc">{{ item.description }}</small>
      </li>
    </ul>
    <div v-else-if="def === 'progress'" class="ekko-node ekko-progress-wrap" :class="styleClass">
      <div class="ekko-progress" role="progressbar" :aria-valuenow="Number(prop('value') || 0)" :aria-valuemax="Number(prop('max') || 100)">
        <span
          class="ekko-progress-bar"
          :style="{ width: `${Math.max(0, Math.min(100, (Number(prop('value') || 0) / Math.max(1, Number(prop('max') || 100))) * 100))}%` }"
        />
      </div>
      <span v-if="prop('label')" class="ekko-progress-label">{{ prop('label') }}</span>
    </div>
    <div v-else-if="def === 'table'" class="ekko-node ekko-table-wrap">
      <table class="ekko-table">
        <thead>
          <tr><th v-for="column in tableColumns" :key="column.key">{{ column.label }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in tableRows" :key="index">
            <td v-for="column in tableColumns" :key="column.key">{{ cell(row as EkkoUIJsonValue, column.key) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
/* 科技感皮肤：视觉全部从 Pure Ink token 用 color-mix 派生（spec D2）；布局规则与类名不变 */
.ekko-node {
  color: var(--text-primary);
  font-size: var(--font-size-base, 14px);
  line-height: 1.55;
  min-width: 0;
}
.ekko-box, .ekko-stack, .ekko-col {
  display: flex;
  flex-direction: column;
  gap: var(--ekko-space-sm, 8px);
}
.ekko-stack { display: flex; flex-direction: column; gap: var(--ekko-space-sm, 8px); }
.ekko-row { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--ekko-space-sm, 8px); }
.ekko-grid { display: grid; gap: var(--ekko-space-sm, 8px); grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ekko-scroll { overflow: auto; padding-right: 4px; }
.ekko-card {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 26%, var(--border-color));
  border-radius: var(--radius-component);
  background: color-mix(in srgb, var(--msg-assistant-bg, var(--bg-card)) 62%, transparent);
  backdrop-filter: blur(8px);
  padding: var(--ekko-space-md, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--ekko-space-sm, 8px);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.ekko-card:hover {
  border-color: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 38%, var(--border-color));
  box-shadow: 0 0 18px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 14%, transparent);
}
.ekko-card-head { display: flex; flex-direction: column; gap: 2px; }
.ekko-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ekko-card-title::before {
  content: '';
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
  background: var(--ekko-skin-accent, var(--accent-primary));
  box-shadow: 0 0 6px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 60%, transparent);
}
.ekko-card-subtitle { margin: 0; font-size: 12px; color: var(--text-secondary); }
.ekko-divider {
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 35%, transparent), var(--border-light) 40%, transparent);
  margin: var(--ekko-space-xs, 4px) 0;
}
.ekko-text { margin: 0; white-space: pre-wrap; word-break: break-word; }
.ekko-heading {
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
  padding-left: 8px;
  border-left: 3px solid var(--ekko-skin-accent, var(--accent-primary));
}
h1.ekko-heading { font-size: 20px; }
h2.ekko-heading { font-size: 17px; }
h3.ekko-heading { font-size: 15px; }
h4.ekko-heading, h5.ekko-heading, h6.ekko-heading { font-size: 14px; }
.ekko-code {
  margin: 0;
  padding: var(--ekko-space-sm, 8px);
  border-radius: var(--radius-standard, 6px);
  background: color-mix(in srgb, var(--code-bg, var(--bg-tertiary)) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 14%, var(--border-color));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.ekko-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 9px;
  border-radius: var(--radius-pill, 999px);
  border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 30%, var(--border-color));
  background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 8%, transparent);
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.ekko-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex: none;
  background: var(--ekko-skin-accent, var(--accent-primary));
  box-shadow: 0 0 5px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 70%, transparent);
}
.ekko-badge.tone-primary { color: var(--ekko-skin-accent, var(--accent-primary)); border-color: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 55%, transparent); background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 12%, transparent); }
.ekko-badge.tone-primary::before { background: var(--ekko-skin-accent, var(--accent-primary)); box-shadow: 0 0 5px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 70%, transparent); }
.ekko-badge.tone-success { color: var(--success); border-color: color-mix(in srgb, var(--success) 55%, transparent); background: color-mix(in srgb, var(--success) 10%, transparent); }
.ekko-badge.tone-success::before { background: var(--success); box-shadow: 0 0 5px color-mix(in srgb, var(--success) 70%, transparent); }
.ekko-badge.tone-warning { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 55%, transparent); background: color-mix(in srgb, var(--warning) 10%, transparent); }
.ekko-badge.tone-warning::before { background: var(--warning); box-shadow: 0 0 5px color-mix(in srgb, var(--warning) 70%, transparent); }
.ekko-badge.tone-danger { color: var(--error); border-color: color-mix(in srgb, var(--error) 55%, transparent); background: color-mix(in srgb, var(--error) 10%, transparent); }
.ekko-badge.tone-danger::before { background: var(--error); box-shadow: 0 0 5px color-mix(in srgb, var(--error) 70%, transparent); }
.ekko-alert {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ekko-space-sm, 8px) var(--ekko-space-md, 12px);
  border-radius: var(--radius-standard, 6px);
  border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 18%, var(--border-color));
  border-left: 3px solid var(--ekko-skin-accent, var(--accent-primary));
  background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 6%, transparent);
  box-shadow: inset 3px 0 10px -6px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 55%, transparent);
}
.ekko-alert.tone-success { border-left-color: var(--success); border-color: color-mix(in srgb, var(--success) 22%, var(--border-color)); background: color-mix(in srgb, var(--success) 6%, transparent); box-shadow: inset 3px 0 10px -6px color-mix(in srgb, var(--success) 55%, transparent); }
.ekko-alert.tone-warning { border-left-color: var(--warning); border-color: color-mix(in srgb, var(--warning) 22%, var(--border-color)); background: color-mix(in srgb, var(--warning) 6%, transparent); box-shadow: inset 3px 0 10px -6px color-mix(in srgb, var(--warning) 55%, transparent); }
.ekko-alert.tone-danger { border-left-color: var(--error); border-color: color-mix(in srgb, var(--error) 22%, var(--border-color)); background: color-mix(in srgb, var(--error) 6%, transparent); box-shadow: inset 3px 0 10px -6px color-mix(in srgb, var(--error) 55%, transparent); }
.ekko-alert-title { font-weight: 600; }
.ekko-form { display: flex; flex-direction: column; gap: var(--ekko-space-md, 12px); }
.ekko-field { display: flex; flex-direction: column; gap: 4px; }
.ekko-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.ekko-required { color: var(--error); margin-left: 2px; }
.ekko-hint { margin: 0; font-size: 11px; color: var(--text-muted); }
.ekko-control-wrap { display: flex; flex-direction: column; gap: 2px; }
.ekko-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: var(--radius-standard, 6px);
  border: 1px solid var(--input-border-color);
  background: color-mix(in srgb, var(--bg-input, var(--bg-card)) 85%, transparent);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.ekko-input:focus {
  border-color: var(--input-border-focus-color, var(--ekko-skin-accent, var(--accent-primary)));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 16%, transparent);
  background: var(--bg-input, var(--bg-card));
}
.ekko-input:disabled { opacity: 0.7; cursor: default; }
.ekko-input[aria-invalid='true'] { border-color: var(--error); box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 12%, transparent); }
.ekko-textarea { resize: vertical; min-height: 64px; }
.ekko-select { appearance: auto; }
.ekko-choice { display: flex; flex-direction: column; gap: 4px; }
.ekko-choice-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.ekko-choice-item input { accent-color: var(--ekko-skin-accent, var(--accent-primary)); margin: 0; cursor: pointer; }
.ekko-choice-item input:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 22%, transparent); border-radius: 3px; }
.ekko-switch input {
  appearance: none;
  -webkit-appearance: none;
  width: 32px;
  height: 18px;
  flex: none;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  position: relative;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.ekko-switch input::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform 0.18s ease, background 0.18s ease;
}
.ekko-switch input:checked {
  background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 30%, transparent);
  border-color: var(--ekko-skin-accent, var(--accent-primary));
  box-shadow: 0 0 8px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 35%, transparent);
}
.ekko-switch input:checked::after { transform: translateX(14px); background: var(--ekko-skin-accent, var(--accent-primary)); }
.ekko-switch input:disabled { opacity: 0.55; cursor: not-allowed; }
.ekko-range { width: 100%; accent-color: var(--ekko-skin-accent, var(--accent-primary)); }
.ekko-range-value { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--text-secondary); }
.ekko-error { color: var(--error); font-size: 11px; }
.ekko-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-standard, 6px);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.ekko-button:hover:not(:disabled) { background: var(--bg-card-hover); border-color: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 40%, var(--border-color)); }
.ekko-button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 22%, transparent); }
.ekko-button:disabled { opacity: 0.55; cursor: not-allowed; }
.ekko-button.variant-primary {
  background: linear-gradient(135deg, var(--ekko-skin-accent, var(--accent-primary)), var(--ekko-skin-accent-hover, var(--accent-hover, var(--ekko-skin-accent, var(--accent-primary)))));
  border-color: transparent;
  color: var(--text-on-accent);
}
.ekko-button.variant-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--ekko-skin-accent, var(--accent-primary)), var(--ekko-skin-accent-hover, var(--accent-hover, var(--ekko-skin-accent, var(--accent-primary)))));
  border-color: transparent;
  box-shadow: 0 0 14px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 40%, transparent);
}
.ekko-button.variant-text { border-color: transparent; background: transparent; color: var(--ekko-skin-accent, var(--accent-primary)); padding-inline: 6px; }
.ekko-button.variant-danger { border-color: color-mix(in srgb, var(--error) 55%, transparent); color: var(--error); background: color-mix(in srgb, var(--error) 8%, transparent); }
.ekko-button-group { display: flex; flex-wrap: wrap; gap: var(--ekko-space-sm, 8px); justify-content: flex-end; }
.ekko-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.ekko-list-desc { display: block; color: var(--text-secondary); font-size: 11px; }
.ekko-empty { color: var(--text-muted); font-size: 12px; list-style: none; margin-left: -18px; }
.ekko-progress-wrap { display: flex; align-items: center; gap: 8px; }
.ekko-progress {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-tertiary);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 10%, transparent);
}
.ekko-progress-bar {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--ekko-skin-accent, var(--accent-primary)), var(--ekko-skin-accent-hover, var(--accent-hover, var(--ekko-skin-accent, var(--accent-primary)))));
  box-shadow: 0 0 8px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 50%, transparent);
  position: relative;
  overflow: hidden;
  transition: width 0.2s ease;
}
.ekko-progress-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--text-on-accent) 40%, transparent), transparent);
  transform: translateX(-100%);
  animation: ekko-sheen 1.8s ease-in-out infinite;
}
.ekko-progress-label { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.ekko-table-wrap { overflow: auto; border-radius: var(--radius-standard, 6px); border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 12%, var(--border-color)); }
.ekko-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ekko-table th, .ekko-table td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border-light); }
.ekko-table th {
  color: var(--text-secondary);
  font-weight: 500;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  letter-spacing: 0.03em;
  background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 7%, transparent);
}
.ekko-table tbody tr { transition: background 0.12s ease; }
.ekko-table tbody tr:hover { background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 6%, transparent); }
.ekko-table tbody tr:last-child td { border-bottom: none; }
.tone-primary { color: var(--ekko-skin-accent, var(--accent-primary)); }
.tone-success { color: var(--success); }
.tone-warning { color: var(--warning); }
.tone-danger { color: var(--error); }
.radius-none { border-radius: 0; }
.radius-sm { border-radius: var(--radius-sm, 3px); }
.radius-lg { border-radius: var(--radius-large, 12px); }
.radius-full { border-radius: var(--radius-pill, 999px); }
.full { width: 100%; }
.hidden { display: none; }

@keyframes ekko-sheen {
  60%, 100% { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .ekko-progress-bar::after { animation: none; }
  .ekko-card, .ekko-card:hover, .ekko-button, .ekko-input, .ekko-switch input { transition: none; }
}
</style>

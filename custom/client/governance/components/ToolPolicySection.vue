<!-- overlay/custom/client/governance/components/ToolPolicySection.vue -->
<!-- 工具策略面板（2026-10-21 AGT 调研轮）：策略即代码的配置与姿态面。
     姿态横幅把「未配置 / 只保存不拦截 / 损坏 fail-closed / 严格 / 宽松」五态
     显式化（杜绝仪表盘假 governed）；规则表 + 表单增删改；空态可载入三条
     起步策略（真实写入服务端，非演示按钮）。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchStarterPolicyDoc,
  fetchToolPolicies,
  lintToolPolicyDoc,
  saveToolPolicyDoc,
  type PolicyActionDto,
  type PolicyCategoryDto,
  type PolicyModeDto,
  type ToolPolicyRuleDto,
  type ToolPolicyStateDto,
} from '@/custom/governance/api/toolPolicy'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { toolPolicy: Record<string, string> }).toolPolicy
})

const state = ref<ToolPolicyStateDto | null>(null)
const mode = ref<PolicyModeDto>('permissive')
const loading = ref(false)
const errorMsg = ref('')
const msg = ref('')
const problems = ref<string[]>([])
const warnings = ref<string[]>([])
const editing = ref(false)
const editingId = ref<string | null>(null)

const CATEGORY_OPTIONS: { key: PolicyCategoryDto; label: string }[] = [
  { key: 'read', label: 'read' },
  { key: 'write', label: 'write' },
  { key: 'exec', label: 'exec' },
  { key: 'network', label: 'network' },
]
const ACTION_OPTIONS: { key: PolicyActionDto; labelKey: keyof ReturnType<typeof L.value> }[] = [
  { key: 'deny', labelKey: 'actionDeny' },
  { key: 'require_approval', labelKey: 'actionApproval' },
  { key: 'allow', labelKey: 'actionAllow' },
]

const form = reactive({
  id: '',
  name: '',
  priority: 0,
  action: 'deny' as PolicyActionDto,
  tools: '',
  categories: [] as PolicyCategoryDto[],
  argPattern: '',
  users: '',
  profiles: '',
  reason: '',
  enabled: true,
})

const rules = computed<ToolPolicyRuleDto[]>(() => state.value?.doc?.rules ?? [])
const posture = computed(() => state.value?.posture ?? null)

const postureText = computed<string>(() => {
  switch (posture.value?.status) {
    case 'strict': return L.value.postureStrict
    case 'permissive': return L.value.posturePermissive
    case 'saved-only': return L.value.postureSavedOnly
    case 'broken': return L.value.postureBroken
    default: return L.value.postureUnconfigured
  }
})

const postureClass = computed<string>(() => {
  switch (posture.value?.status) {
    case 'strict': return 'is-strict'
    case 'permissive': return 'is-permissive'
    case 'saved-only': return 'is-saved'
    case 'broken': return 'is-broken'
    default: return 'is-none'
  }
})

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchToolPolicies()
    state.value = res
    mode.value = res.doc?.mode ?? 'permissive'
    problems.value = res.problems
    warnings.value = res.warnings
  } catch (e) {
    errorMsg.value = `${L.value.loadFailed}：${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function splitList(v: string): string[] {
  return v.split(/[,，;；\n]/).map((s) => s.trim()).filter(Boolean)
}

function ruleFromForm(): ToolPolicyRuleDto {
  const match: ToolPolicyRuleDto['match'] = {}
  if (form.categories.length) match.categories = [...form.categories]
  if (splitList(form.tools).length) match.tools = splitList(form.tools)
  if (form.argPattern.trim()) match.argPattern = form.argPattern.trim()
  if (splitList(form.users).length) match.users = splitList(form.users)
  if (splitList(form.profiles).length) match.profiles = splitList(form.profiles)
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    enabled: form.enabled,
    priority: Number(form.priority) || 0,
    action: form.action,
    match,
    ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
  }
}

async function persist(nextRules: ToolPolicyRuleDto[], nextMode: PolicyModeDto): Promise<boolean> {
  problems.value = []
  warnings.value = []
  const lint = await lintToolPolicyDoc({ mode: nextMode, rules: nextRules })
  problems.value = lint.problems
  warnings.value = lint.warnings
  if (lint.problems.length > 0) return false
  try {
    const saved = await saveToolPolicyDoc({ mode: nextMode, rules: nextRules })
    msg.value = L.value.saved
    if (saved.warnings?.length) warnings.value = saved.warnings
    await refresh()
    return true
  } catch (e) {
    errorMsg.value = `${L.value.saveFailed}：${e instanceof Error ? e.message : String(e)}`
    return false
  }
}

async function submitRule(): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  const rule = ruleFromForm()
  const next = editing.value && editingId.value
    ? rules.value.map((r) => (r.id === editingId.value ? rule : r))
    : [...rules.value, rule]
  const ok = await persist(next, mode.value)
  if (!ok) return
  editing.value = false
  editingId.value = null
  form.id = ''
  form.name = ''
  form.priority = 0
  form.action = 'deny'
  form.tools = ''
  form.categories = []
  form.argPattern = ''
  form.users = ''
  form.profiles = ''
  form.reason = ''
  form.enabled = true
}

function editRule(r: ToolPolicyRuleDto): void {
  editing.value = true
  editingId.value = r.id
  form.id = r.id
  form.name = r.name
  form.priority = r.priority
  form.action = r.action
  form.tools = (r.match.tools ?? []).join(', ')
  form.categories = [...(r.match.categories ?? [])]
  form.argPattern = r.match.argPattern ?? ''
  form.users = (r.match.users ?? []).join(', ')
  form.profiles = (r.match.profiles ?? []).join(', ')
  form.reason = r.reason ?? ''
  form.enabled = r.enabled
}

async function removeRule(id: string): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  await persist(rules.value.filter((r) => r.id !== id), mode.value)
}

async function toggleRule(r: ToolPolicyRuleDto): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  await persist(rules.value.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)), mode.value)
}

async function switchMode(next: PolicyModeDto): Promise<void> {
  if (next === mode.value) return
  msg.value = ''
  errorMsg.value = ''
  await persist(rules.value, next)
}

async function loadStarter(): Promise<void> {
  msg.value = ''
  errorMsg.value = ''
  try {
    const res = await fetchStarterPolicyDoc()
    await persist(res.doc.rules, res.doc.mode)
  } catch (e) {
    errorMsg.value = `${L.value.loadFailed}：${e instanceof Error ? e.message : String(e)}`
  }
}

function matchSummary(r: ToolPolicyRuleDto): string {
  const parts: string[] = []
  if (r.match.categories?.length) parts.push(`${L.value.matchCategories}: ${r.match.categories.join('/')}`)
  if (r.match.tools?.length) parts.push(`${L.value.matchTools}: ${r.match.tools.join(', ')}`)
  if (r.match.argPattern) parts.push(`${L.value.matchPattern}: ${r.match.argPattern}`)
  if (r.match.users?.length) parts.push(`${L.value.matchUsers}: ${r.match.users.join(', ')}`)
  if (r.match.profiles?.length) parts.push(`${L.value.matchProfiles}: ${r.match.profiles.join(', ')}`)
  return parts.join(' · ') || '—'
}

function actionLabel(a: PolicyActionDto): string {
  const hit = ACTION_OPTIONS.find((o) => o.key === a)
  return hit ? String(L.value[hit.labelKey]) : a
}

onMounted(() => void refresh())
</script>

<template>
  <div class="tp" data-testid="gov-tool-policy">
    <div class="tp__bar">
      <h3 class="tp__title">{{ L.title }}</h3>
      <span class="tp__hint">{{ L.hint }}</span>
    </div>

    <div class="tp__posture" :class="postureClass" data-testid="tool-policy-posture">{{ postureText }}</div>

    <div v-if="errorMsg" class="tp__err" data-testid="tool-policy-error">{{ errorMsg }}</div>
    <div v-else-if="msg" class="tp__msg" data-testid="tool-policy-msg">{{ msg }}</div>

    <ul v-if="problems.length" class="tp__problems" data-testid="tool-policy-problems">
      <li v-for="p in problems" :key="p">{{ L.problemsTitle }}：{{ p }}</li>
    </ul>
    <ul v-if="warnings.length" class="tp__warnings" data-testid="tool-policy-warnings">
      <li v-for="w in warnings" :key="w">{{ L.warningsTitle }}：{{ w }}</li>
    </ul>

    <div class="tp__meta">
      <label class="tp__mode">
        {{ L.modeLabel }}
        <select :value="mode" data-testid="tool-policy-mode" @change="switchMode(($event.target as HTMLSelectElement).value as PolicyModeDto)">
          <option value="permissive">{{ L.modePermissive }}</option>
          <option value="strict">{{ L.modeStrict }}</option>
        </select>
      </label>
      <span v-if="state" class="tp__recent" data-testid="tool-policy-recent">
        {{ L.recentLabel }}：{{ L.recentAllow }} {{ state.recent.allow }} · {{ L.recentDeny }} {{ state.recent.deny }}
        <template v-if="state.recent.allow + state.recent.deny === 0">（{{ L.recentNone }}）</template>
      </span>
    </div>

    <table class="tp__table" data-testid="tool-policy-table">
      <thead>
        <tr>
          <th>{{ L.colPriority }}</th><th>{{ L.colName }}</th><th>{{ L.colMatch }}</th>
          <th>{{ L.colAction }}</th><th>{{ L.colEnabled }}</th><th>{{ L.colUpdated }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rules" :key="r.id">
          <td>{{ r.priority }}</td>
          <td class="tp__name">
            <span class="tp__rule-name">{{ r.name }}</span>
            <span class="tp__rule-id">{{ r.id }}</span>
          </td>
          <td class="tp__match">{{ matchSummary(r) }}</td>
          <td><span class="tp__action" :class="`is-${r.action}`">{{ actionLabel(r.action) }}</span></td>
          <td>
            <button type="button" class="tp__toggle" :data-testid="`tool-policy-toggle-${r.id}`" @click="toggleRule(r)">
              {{ r.enabled ? '✓' : '—' }}
            </button>
          </td>
          <td class="tp__ts">
            <template v-if="state?.doc?.updatedAt">{{ new Date(state.doc.updatedAt).toLocaleString() }}</template>
            <template v-if="state?.doc?.updatedBy"> · {{ state.doc.updatedBy }}</template>
          </td>
          <td class="tp__ops">
            <button type="button" class="tp__op" :data-testid="`tool-policy-edit-${r.id}`" @click="editRule(r)">{{ L.edit }}</button>
            <button type="button" class="tp__op tp__op--danger" :data-testid="`tool-policy-remove-${r.id}`" @click="removeRule(r.id)">{{ L.remove }}</button>
          </td>
        </tr>
        <tr v-if="rules.length === 0 && !loading">
          <td colspan="7" class="ui-empty-state ui-empty-state--compact">
            {{ L.empty }}
            <button type="button" class="tp__starter" data-testid="tool-policy-load-starter" @click="loadStarter">{{ L.loadStarter }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="tp__form" data-testid="tool-policy-form" @submit.prevent="submitRule">
      <div class="tp__form-title">{{ editing ? `${L.formTitleEdit}：${editingId}` : L.formTitleAdd }}</div>
      <div class="tp__row">
        <input v-model="form.id" class="tp__input tp__input--id" :placeholder="L.fieldId" data-testid="tool-policy-field-id" :disabled="editing" required />
        <input v-model="form.name" class="tp__input tp__input--name" :placeholder="L.fieldName" data-testid="tool-policy-field-name" required />
        <input v-model.number="form.priority" type="number" min="0" max="1000" class="tp__input tp__input--priority" :placeholder="L.fieldPriority" data-testid="tool-policy-field-priority" />
        <select v-model="form.action" class="tp__input tp__input--action" data-testid="tool-policy-field-action">
          <option v-for="o in ACTION_OPTIONS" :key="o.key" :value="o.key">{{ actionLabel(o.key) }}</option>
        </select>
      </div>
      <div class="tp__row">
        <input v-model="form.tools" class="tp__input" :placeholder="L.fieldTools" data-testid="tool-policy-field-tools" />
      </div>
      <div class="tp__row tp__row--cats">
        <span class="tp__cats-label">{{ L.fieldCategories }}</span>
        <label v-for="c in CATEGORY_OPTIONS" :key="c.key" class="tp__cat">
          <input v-model="form.categories" type="checkbox" :value="c.key" :data-testid="`tool-policy-cat-${c.key}`" />
          {{ c.label }}
        </label>
      </div>
      <div class="tp__row">
        <input v-model="form.argPattern" class="tp__input" :placeholder="L.fieldArgPattern" data-testid="tool-policy-field-argpattern" />
      </div>
      <div class="tp__row">
        <input v-model="form.users" class="tp__input" :placeholder="L.fieldUsers" data-testid="tool-policy-field-users" />
        <input v-model="form.profiles" class="tp__input" :placeholder="L.fieldProfiles" data-testid="tool-policy-field-profiles" />
      </div>
      <div class="tp__row">
        <input v-model="form.reason" class="tp__input" :placeholder="L.fieldReason" data-testid="tool-policy-field-reason" />
      </div>
      <div class="tp__row">
        <button type="submit" class="tp__save" data-testid="tool-policy-save">{{ L.save }}</button>
        <button v-if="editing" type="button" class="tp__cancel" data-testid="tool-policy-cancel" @click="editing = false; editingId = null">{{ L.cancel }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped lang="scss">
.tp {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  display: flex; flex-direction: column; gap: 8px;
}
.tp__bar { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.tp__title { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.tp__hint { font-size: 10px; color: var(--ia-stale); }
.tp__posture {
  font-size: 11px; border-radius: 8px; padding: 6px 10px; border: 1px solid var(--border-color);
  &.is-strict { color: var(--success); border-color: rgba(var(--success-rgb), 0.4); background: rgba(var(--success-rgb), 0.06); }
  &.is-permissive { color: var(--ia-stale); border-color: rgba(var(--warning-rgb), 0.35); background: rgba(var(--warning-rgb), 0.06); }
  &.is-saved { color: var(--ia-stale); border-color: rgba(var(--warning-rgb), 0.35); background: rgba(var(--warning-rgb), 0.06); }
  &.is-broken { color: var(--error); border-color: rgba(var(--error-rgb), 0.4); background: rgba(var(--error-rgb), 0.06); }
  &.is-none { color: var(--text-muted); }
}
.tp__err { font-size: 11px; color: var(--error); }
.tp__msg { font-size: 11px; color: var(--success); }
.tp__problems { margin: 0; padding-left: 16px; font-size: 10.5px; color: var(--error); }
.tp__warnings { margin: 0; padding-left: 16px; font-size: 10.5px; color: var(--ia-stale); }
.tp__meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 10.5px; color: var(--text-muted); }
.tp__mode { display: inline-flex; align-items: center; gap: 6px;
  select { border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 6px; font-size: 10.5px; background: var(--bg-primary); color: var(--text-primary); } }
.tp__recent { color: var(--text-muted); }
.tp__table { width: 100%; border-collapse: collapse; font-size: 10.5px;
  th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); }
  td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--border-color); vertical-align: top; } }
.tp__name { display: flex; flex-direction: column; gap: 1px; }
.tp__rule-name { font-weight: 600; }
.tp__rule-id { font-family: ui-monospace, monospace; font-size: 9px; color: var(--text-muted); }
.tp__match { max-width: 320px; }
.tp__action { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 0 5px; line-height: 1.6; white-space: nowrap;
  &.is-deny { color: var(--error); background: rgba(var(--error-rgb), 0.1); }
  &.is-require_approval { color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.12); }
  &.is-allow { color: var(--success); background: rgba(var(--success-rgb), 0.08); } }
.tp__toggle { border: 1px solid var(--border-color); background: transparent; border-radius: 4px; cursor: pointer; font-size: 10px; width: 22px; line-height: 1.5; color: var(--text-primary); }
.tp__ts { font-size: 9.5px; color: var(--text-muted); white-space: nowrap; }
.tp__op { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--accent-primary); padding: 0 4px; }
.tp__op--danger { color: var(--error); }
.tp__starter { border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; border-radius: 6px; padding: 2px 10px; font-size: 10.5px; cursor: pointer; margin-left: 8px; }
.tp__form { border-top: 1px dashed var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.tp__form-title { font-size: 11px; font-weight: 600; }
.tp__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.tp__row--cats { font-size: 10.5px; color: var(--text-muted); }
.tp__cats-label { color: var(--text-muted); }
.tp__cat { display: inline-flex; align-items: center; gap: 3px; }
.tp__input { border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); flex: 1; min-width: 140px; }
.tp__input--id { max-width: 220px; font-family: ui-monospace, monospace; }
.tp__input--name { max-width: 260px; }
.tp__input--priority { max-width: 140px; flex: 0 1 140px; }
.tp__input--action { max-width: 140px; flex: 0 1 140px; }
.tp__save { border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 11px; cursor: pointer; }
.tp__cancel { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--text-muted); }
</style>

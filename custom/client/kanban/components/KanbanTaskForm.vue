<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NInputNumber, NSelect,
  NCheckbox, NButton, NSpace, NTooltip, useMessage
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { KanbanCreateRequest, KanbanEstimateResult } from '@/api/hermes/kanban'
import { useKanbanStore } from '@/stores/hermes/kanban'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  created: []
}>()

const { t } = useI18n()
const message = useMessage()
const store = useKanbanStore()

const loading = ref(false)
const formData = ref({
  title: '',
  body: '',
  assignee: '',
  priority: 0,
  tenant: '',
  workspace: 'scratch',
  workspacePath: '',
  branch: '',
  triage: false,
  skills: [] as string[],
  maxRuntime: '',
  maxRetries: 0,
  goalMode: false,
  goalMaxTurns: 0,
  // HERMES_CUSTOM[v020] BEGIN
  model: '',
  provider: '',
  reasoning: '',
  // HERMES_CUSTOM[v020] END
})

const reasoningOptions = computed(() => [
  { label: t('kanban.form.profileDefault', 'Profile default'), value: '' },
  ...['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'none'].map(v => ({ label: v, value: v })),
])

// HERMES_CUSTOM[v020] BEGIN: pre-create estimate
const estimating = ref(false)
const estimate = ref<KanbanEstimateResult | null>(null)

function compactTokens(n?: number): string {
  if (n == null) return '?'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

async function runEstimate() {
  if (estimating.value) return
  estimating.value = true
  try {
    estimate.value = await store.estimateText(
      formData.value.title.trim(),
      formData.value.body.trim() || undefined,
    )
  } catch (err: any) {
    estimate.value = { ok: false, reason: err?.message || 'estimate failed' }
  } finally {
    estimating.value = false
  }
}
// HERMES_CUSTOM[v020] END

const assigneeOptions = computed(() => [
  { label: t('kanban.allAssignees'), value: '' },
  ...store.assignees.map(a => ({ label: a.name, value: a.name })),
])

const workspaceOptions = [
  { label: t('kanban.form.workspaceScratch'), value: 'scratch' },
  { label: t('kanban.form.workspaceDir'), value: 'directory' },
  { label: t('kanban.form.workspaceWorktree'), value: 'worktree' },
]

watch(() => props.show, (show) => {
  if (show) {
    formData.value = {
      title: '',
      body: '',
      assignee: '',
      priority: 0,
      tenant: '',
      workspace: 'scratch',
      workspacePath: '',
      branch: '',
      triage: false,
      skills: [],
      maxRuntime: '',
      maxRetries: 0,
      goalMode: false,
      goalMaxTurns: 0,
      // HERMES_CUSTOM[v020]
      model: '',
      provider: '',
      reasoning: '',
    }
    estimate.value = null
  }
})

function handleClose() {
  emit('update:show', false)
}

async function handleSubmit() {
  if (!formData.value.title.trim()) {
    message.warning(t('kanban.form.titleRequired'))
    return
  }

  loading.value = true
  try {
    const payload: KanbanCreateRequest = {
      title: formData.value.title.trim(),
      body: formData.value.body.trim() || undefined,
      assignee: formData.value.assignee || undefined,
      priority: formData.value.priority,
      tenant: formData.value.tenant || undefined,
      workspace: formData.value.workspace,
      branch: formData.value.branch || undefined,
      triage: formData.value.triage,
      skills: formData.value.skills.length > 0 ? formData.value.skills : undefined,
      maxRuntime: formData.value.maxRuntime || undefined,
      maxRetries: formData.value.maxRetries || undefined,
      goalMode: formData.value.goalMode,
      goalMaxTurns: formData.value.goalMaxTurns || undefined,
      // HERMES_CUSTOM[v020] BEGIN
      model: formData.value.model.trim() || undefined,
      provider: formData.value.provider.trim() || undefined,
      reasoning: formData.value.reasoning || undefined,
      // HERMES_CUSTOM[v020] END
    }
    await store.createTask(payload)
    message.success(t('kanban.message.taskCreated'))
    emit('update:show', false)
    emit('created')
  } catch (err) {
    message.error(t('kanban.message.createFailed'))
    console.error('Failed to create task:', err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('kanban.createTask')"
    :style="{ width: 'min(560px, calc(100vw - 32px))' }"
    :mask-closable="!loading"
    @update:show="emit('update:show', $event)"
  >
    <NForm label-placement="top" class="task-form">
      <NFormItem :label="t('kanban.form.title')" required>
        <NInput
          v-model:value="formData.title"
          :placeholder="t('kanban.form.titlePlaceholder')"
          maxlength="200"
          show-count
        />
      </NFormItem>

      <NFormItem :label="t('kanban.form.body')">
        <NInput
          v-model:value="formData.body"
          type="textarea"
          :placeholder="t('kanban.form.bodyPlaceholder')"
          :rows="3"
        />
      </NFormItem>

      <div class="form-row">
        <NFormItem :label="t('kanban.form.assignee')" class="flex-1">
          <NSelect
            v-model:value="formData.assignee"
            :options="assigneeOptions"
            :placeholder="t('kanban.form.selectAssignee')"
            filterable
            clearable
          />
        </NFormItem>

        <NFormItem :label="t('kanban.form.priority')" class="priority-field">
          <NInputNumber v-model:value="formData.priority" :min="0" :max="10" />
        </NFormItem>
      </div>

      <NFormItem :label="t('kanban.form.workspace')">
        <div class="workspace-row">
          <NSelect
            v-model:value="formData.workspace"
            :options="workspaceOptions"
            class="workspace-select"
          />
          <NInput
            v-if="formData.workspace !== 'scratch'"
            v-model:value="formData.workspacePath"
            :placeholder="t('kanban.form.workspacePathPlaceholder')"
            class="workspace-path"
          />
        </div>
      </NFormItem>

      <div class="form-row">
        <NFormItem :label="t('kanban.form.tenant')" class="flex-1">
          <NInput
            v-model:value="formData.tenant"
            :placeholder="t('kanban.form.tenantPlaceholder')"
          />
        </NFormItem>

        <NFormItem :label="t('kanban.form.branch')" class="flex-1">
          <NInput
            v-model:value="formData.branch"
            :placeholder="t('kanban.form.branchPlaceholder')"
          />
        </NFormItem>
      </div>

      <div class="form-row">
        <NFormItem :label="t('kanban.form.maxRuntime')" class="flex-1">
          <NInput
            v-model:value="formData.maxRuntime"
            :placeholder="t('kanban.form.maxRuntimePlaceholder')"
          />
        </NFormItem>

        <NFormItem :label="t('kanban.form.maxRetries')" class="priority-field">
          <NInputNumber v-model:value="formData.maxRetries" :min="0" :max="10" />
        </NFormItem>
      </div>

      <div class="checkbox-row">
        <NCheckbox v-model:checked="formData.triage">
          {{ t('kanban.form.triage') }}
        </NCheckbox>
        <NCheckbox v-model:checked="formData.goalMode">
          {{ t('kanban.form.goalMode') }}
        </NCheckbox>
      </div>

      <NFormItem v-if="formData.goalMode" :label="t('kanban.form.goalMaxTurns')">
        <NInputNumber v-model:value="formData.goalMaxTurns" :min="1" :max="200" />
      </NFormItem>

      <!-- HERMES_CUSTOM[v020] BEGIN: model / provider / reasoning pins -->
      <div class="form-row">
        <NFormItem :label="t('kanban.form.model', 'Model')" class="flex-1">
          <NInput
            v-model:value="formData.model"
            :placeholder="t('kanban.form.modelPlaceholder', 'Profile default')"
          />
        </NFormItem>
        <NFormItem :label="t('kanban.form.provider', 'Provider')" class="model-provider-field">
          <NInput
            v-model:value="formData.provider"
            :placeholder="t('kanban.form.providerPlaceholder', 'e.g. openai')"
          />
        </NFormItem>
      </div>

      <NFormItem :label="t('kanban.form.reasoning', 'Thinking depth')">
        <div class="estimate-row">
          <NSelect
            v-model:value="formData.reasoning"
            :options="reasoningOptions"
            class="reasoning-select"
          />
          <NTooltip>
            <template #trigger>
              <NButton quaternary size="small" :loading="estimating" :disabled="!formData.title.trim()" @click="runEstimate">
                {{ t('kanban.estimate', 'Estimate') }}
              </NButton>
            </template>
            {{ t('kanban.estimateDisclaimer', 'Rough guess via the auxiliary model') }}
          </NTooltip>
          <span v-if="estimate" class="estimate-result">
            <template v-if="estimate.ok">~{{ compactTokens(estimate.est_tokens) }} tok · {{ estimate.complexity || '?' }}</template>
            <template v-else class="estimate-muted">{{ t('kanban.estimateUnavailable', 'unavailable') }}</template>
          </span>
        </div>
      </NFormItem>
      <!-- HERMES_CUSTOM[v020] END -->
    </NForm>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="handleClose">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="loading" @click="handleSubmit">
          {{ t('common.create') }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.task-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.form-row {
  display: flex;
  gap: 12px;

  .flex-1 {
    flex: 1;
  }

  .priority-field {
    width: 140px;
    flex-shrink: 0;
  }
}

.workspace-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.workspace-select {
  width: 160px;
  flex-shrink: 0;
}

.workspace-path {
  flex: 1;
}

/* HERMES_CUSTOM[v020] BEGIN */
.model-provider-field {
  width: 150px;
  flex-shrink: 0;
}

.estimate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.reasoning-select {
  flex: 1;
}

.estimate-result {
  font-size: 12px;
  color: var(--text-secondary, #888);
  white-space: nowrap;
}

.estimate-muted {
  color: var(--text-muted, #aaa);
  font-style: italic;
}
/* HERMES_CUSTOM[v020] END */

.checkbox-row {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}
</style>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NButton, NInput, NCheckbox, NInputNumber, NSelect } from 'naive-ui'
import type { KanbanTaskStatus } from '@/api/hermes/kanban'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: KanbanTaskStatus
  parentTasks?: Array<{ id: string; title: string }>
}>()

const emit = defineEmits<{
  create: [data: any]
  cancel: []
}>()

const { t } = useI18n()

// Source plugin field order: title textarea → assignee+priority → skills → goal mode → workspace → parent → buttons
const title = ref('')
const assignee = ref('')
const priority = ref<number | null>(null)
const skills = ref('')
const goalMode = ref(false)
const goalMaxTurns = ref<number | null>(null)
const workspaceKind = ref<'scratch' | 'worktree' | 'dir'>('scratch')
const workspacePath = ref('')
const parent = ref('')

const project = ref('')

const isTriage = computed(() => props.status === 'triage')

const titlePlaceholder = computed(() =>
  isTriage.value
    ? t('kanban.inlineCreate.triagePlaceholder', 'Rough idea — AI will spec it…')
    : t('kanban.inlineCreate.titlePlaceholder', 'New task title…')
)

const assigneePlaceholder = computed(() =>
  isTriage.value ? 'specifier' : 'assignee'
)

const workspaceKindOptions = [
  { label: 'scratch', value: 'scratch' },
  { label: 'worktree', value: 'worktree' },
  { label: 'dir', value: 'dir' },
]

const workspacePathPlaceholder = computed(() => {
  if (workspaceKind.value === 'dir') {
    return t('kanban.inlineCreate.dirPathPlaceholder', 'workspace path (required, e.g. ~/projects/my-app)')
  }
  return t('kanban.inlineCreate.worktreePathPlaceholder', 'workspace path (optional, derived from assignee if blank)')
})

const parentOptions = computed(() => [
  { label: t('kanban.inlineCreate.noParent', '— no parent —'), value: '' },
  ...(props.parentTasks || []).map(tk => ({
    label: `${tk.id} — ${(tk.title || '').slice(0, 50)}`,
    value: tk.id,
  })),
])

function submit() {
  const trimmed = title.value.trim()
  if (!trimmed) return

  const data: any = {
    title: trimmed,
    status: props.status,
    triage: isTriage.value,
  }
  if (assignee.value.trim()) data.assignee = assignee.value.trim()
  if (priority.value !== null && priority.value > 0) data.priority = priority.value
  if (skills.value.trim()) {
    data.skills = skills.value.split(',').map((s: string) => s.trim()).filter(Boolean)
  }
  if (parent.value) data.parents = [parent.value]
  if (project.value.trim()) data.project = project.value.trim()
  if (workspaceKind.value !== 'scratch') {
    data.workspace_kind = workspaceKind.value
    if (workspacePath.value.trim()) data.workspace_path = workspacePath.value.trim()
  }
  if (goalMode.value) {
    data.goal_mode = true
    if (goalMaxTurns.value !== null && goalMaxTurns.value > 0) {
      data.goal_max_turns = goalMaxTurns.value
    }
  }

  emit('create', data)
  resetFields()
}

function cancel() {
  emit('cancel')
  resetFields()
}

function resetFields() {
  title.value = ''
  assignee.value = ''
  priority.value = null
  skills.value = ''
  goalMode.value = false
  goalMaxTurns.value = null
  project.value = ''
  workspaceKind.value = 'scratch'
  workspacePath.value = ''
  parent.value = ''
}

function onTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  } else if (e.key === 'Escape') {
    cancel()
  }
}
</script>

<template>
  <div class="kanban-inline-create">
    <!-- 1. Title textarea -->
    <textarea
      v-model="title"
      class="inline-title"
      :placeholder="titlePlaceholder"
      autofocus
      rows="2"
      @keydown="onTitleKeydown"
    />

    <!-- 2. Assignee + Priority row -->
    <div class="inline-row">
      <NInput
        v-model:value="assignee"
        size="small"
        :placeholder="assigneePlaceholder"
        style="flex: 1"
      />
      <NInputNumber
        v-model:value="priority"
        size="small"
        :min="0"
        :max="100"
        placeholder="pri"
        style="width: 80px"
      />
    </div>

    <!-- 2.5. Project (optional) -->
    <NInput
      v-model:value="project"
      size="small"
      :placeholder="t('kanban.inlineCreate.projectPlaceholder', 'project id or slug (optional)')"
    />

    <!-- 3. Skills -->
    <NInput
      v-model:value="skills"
      size="small"
      :placeholder="t('kanban.inlineCreate.skillsPlaceholder', 'skills (optional, comma-separated): translation, github-code-review')"
    />

    <!-- 4. Goal mode row -->
    <div class="inline-row">
      <NCheckbox v-model:checked="goalMode" size="small">
        {{ t('kanban.form.goalMode', 'goal mode') }}
      </NCheckbox>
      <NInputNumber
        v-if="goalMode"
        v-model:value="goalMaxTurns"
        size="small"
        :min="1"
        :placeholder="t('kanban.inlineCreate.maxTurnsPlaceholder', 'max turns (default 20)')"
        style="width: 160px"
      />
    </div>

    <!-- 5. Workspace row -->
    <div class="inline-row">
      <NSelect
        v-model:value="workspaceKind"
        size="small"
        :options="workspaceKindOptions"
        style="width: 120px"
      />
      <NInput
        v-if="workspaceKind !== 'scratch'"
        v-model:value="workspacePath"
        size="small"
        :placeholder="workspacePathPlaceholder"
        style="flex: 1"
      />
    </div>

    <!-- 6. Parent select -->
    <NSelect
      v-model:value="parent"
      size="small"
      :options="parentOptions"
      :placeholder="t('kanban.inlineCreate.parentPlaceholder', '— no parent —')"
      filterable
    />

    <!-- 7. Buttons -->
    <div class="inline-buttons">
      <NButton size="small" @click="cancel">
        {{ t('common.cancel') }}
      </NButton>
      <NButton
        size="small"
        type="primary"
        :disabled="!title.trim()"
        @click="submit"
      >
        {{ t('common.create') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-inline-create {
  background-color: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.inline-title {
  width: 100%;
  resize: vertical;
  min-height: 48px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  background-color: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  color: $text-primary;
  outline: none;

  &:focus {
    border-color: $accent-primary;
  }

  &::placeholder {
    color: $text-muted;
  }
}

.inline-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.inline-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

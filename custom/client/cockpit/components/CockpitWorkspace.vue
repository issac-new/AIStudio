<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCockpitStore, type WorkDecision } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'
import CockpitFileTree from './CockpitFileTree.vue'
import * as kanbanApi from '@/api/hermes/kanban'

const store = useCockpitStore()
const kanbanStore = useKanbanStore()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'submit'): void }>()

// ── 区域1: Task Header ──
const selectedTask = computed(() => store.selectedTask)
const taskSummary = computed(() => {
  const id = store.selectedTaskId
  if (!id) return ''
  const cache = (store as any)._detailCache?.value?.[id]
  return cache?.latest_summary ?? ''
})

// ── 区域2: Kanban 详情字段 ──
const attachments = computed(() => {
  const id = store.selectedTaskId
  if (!id) return []
  return store.taskAttachments[id] ?? []
})
const detailCache = computed(() => {
  const id = store.selectedTaskId
  if (!id) return null
  return (store as any)._detailCache?.value?.[id] ?? null
})
const parentIds = computed(() => detailCache.value?.parents ?? [])
const childIds = computed(() => detailCache.value?.children ?? [])
const assigneeOptions = computed(() => {
  return (kanbanStore.assignees ?? []).map((a: string) => ({ label: a, value: a }))
})
const newAssignee = ref('')
const descDraft = ref('')

watch(() => store.selectedTaskId, (id) => {
  newAssignee.value = ''
  const task = store.selectedTask
  descDraft.value = (task as any)?.body ?? ''
})

async function handleAssign() {
  const taskId = store.selectedTaskId
  if (!taskId || !newAssignee.value) return
  try {
    await kanbanStore.assignTask(taskId, newAssignee.value)
    newAssignee.value = ''
  } catch { /* api 错误静默 */ }
}

async function handlePriorityChange(delta: number) {
  const task = selectedTask.value
  if (!task) return
  const cur = (task as any).priority ?? 0
  const np = Math.max(0, cur + delta)
  try {
    await kanbanApi.updateTaskPriority?.(task.id, np)
  } catch { /* api 错误静默 */ }
}

function navigateToTask(taskId: string) {
  store.selectTask(taskId)
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !store.selectedTaskId) return
  store.uploadAttachment(store.selectedTaskId, file)
  input.value = ''
}

// ── 区域3: A2UI ──
interface DecisionOption {
  key: WorkDecision
  labelKey: string
  descKey?: string
  recommended?: boolean
}
const decisions: DecisionOption[] = [
  { key: 'conditional', labelKey: 'cockpit.decisionConditional', descKey: 'cockpit.decisionConditionalDesc', recommended: true },
  { key: 'reject', labelKey: 'cockpit.decisionReject' },
  { key: 'approve', labelKey: 'cockpit.decisionApprove' },
]

const ALL_TAGS = ['concurrency', 'test-gap', 'performance', 'compatibility']

const workItem = computed(() => store.workItemForSelectedTask)
const hasTask = computed(() => !!store.selectedTask)
const isReadOnly = computed(() => store.archivedMode)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__form">
      <div v-if="hasTask" class="cockpit-workspace__body">
        <!-- ═══ AREA 1: Task Header ═══ -->
        <div class="cockpit-workspace__header">
          <div class="cockpit-workspace__title">{{ selectedTask?.title }}</div>
          <div v-if="taskSummary" class="cockpit-workspace__summary">{{ taskSummary }}</div>
          <div class="cockpit-workspace__meta-row">
            <span class="cockpit-workspace__status-chip" :class="'is-' + (selectedTask as any)?.status">{{ (selectedTask as any)?.status }}</span>
            <span class="cockpit-workspace__priority-tag">{{ 'P' + ((selectedTask as any)?.priority ?? '—') }}</span>
          </div>
        </div>

        <!-- ═══ AREA 2: Kanban Detail Fields ═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.assignee') }}</label>
          <div class="cockpit-workspace__field-row">
            <span class="cockpit-workspace__field-val">{{ (selectedTask as any)?.assignee || '—' }}</span>
            <select v-model="newAssignee" class="cockpit-workspace__select" @change="handleAssign">
              <option value="" disabled>{{ t('cockpit.selectAssignee') }}</option>
              <option v-for="opt in assigneeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.priority') }}</label>
          <div class="cockpit-workspace__field-row">
            <span class="cockpit-workspace__field-val">{{ 'P' + ((selectedTask as any)?.priority ?? '—') }}</span>
            <button type="button" class="cockpit-workspace__mini-btn" @click="handlePriorityChange(-1)">−</button>
            <button type="button" class="cockpit-workspace__mini-btn" @click="handlePriorityChange(1)">+</button>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.parentTasks') }}</label>
          <div class="cockpit-workspace__field-row">
            <template v-if="parentIds.length">
              <a v-for="pid in parentIds" :key="pid" class="cockpit-workspace__task-link" @click="navigateToTask(pid)">{{ pid }}</a>
            </template>
            <span v-else class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</span>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.childTasks') }}</label>
          <div class="cockpit-workspace__field-row">
            <template v-if="childIds.length">
              <a v-for="cid in childIds" :key="cid" class="cockpit-workspace__task-link" @click="navigateToTask(cid)">{{ cid }}</a>
            </template>
            <span v-else class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</span>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.attachments') }}</label>
          <div class="cockpit-workspace__attach-list">
            <div v-for="att in attachments" :key="att.id" class="cockpit-workspace__attach-item">
              <span class="cockpit-workspace__attach-name">{{ att.filename }}</span>
              <span class="cockpit-workspace__attach-size">{{ formatFileSize(att.size) }}</span>
              <button type="button" class="cockpit-workspace__attach-del" @click="store.deleteAttachment(att.id)">✕</button>
            </div>
            <div v-if="!attachments.length" class="cockpit-workspace__field-val--muted">{{ t('cockpit.noAttachments') }}</div>
            <label class="cockpit-workspace__upload-btn">
              + {{ t('cockpit.uploadFile') }}
              <input type="file" class="cockpit-workspace__file-input" @change="onFileSelected">
            </label>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.description') }}</label>
          <textarea class="cockpit-workspace__textarea" v-model="descDraft"
            :placeholder="t('cockpit.descriptionPlaceholder')"
            @input="store.updateWorkItem({ opinion: ($event.target as HTMLTextAreaElement).value })" />
        </div>

        <!-- ═══ AREA 3: A2UI Suggestions ═══ -->
        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.yourDecision') }} *</label>
          <button v-for="d in decisions" :key="d.key" type="button"
            :data-decision="d.key" class="cockpit-workspace__opt"
            :class="{ 'is-selected': workItem.decision === d.key }"
            @click="store.updateWorkItem({ decision: d.key })">
            <span class="cockpit-workspace__opt-dot" />
            <span class="cockpit-workspace__opt-info">
              <span class="cockpit-workspace__opt-header">
                <span class="cockpit-workspace__opt-name">{{ t(d.labelKey) }}</span>
                <span v-if="d.recommended" class="cockpit-workspace__opt-rec">{{ t('cockpit.recommend') }}</span>
              </span>
              <span v-if="d.descKey" class="cockpit-workspace__opt-desc">{{ t(d.descKey) }}</span>
            </span>
          </button>
        </div>

        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.riskTags') }} <span class="cockpit-workspace__sub">{{ t('cockpit.agentPrefilled') }}</span></label>
          <div class="cockpit-workspace__chips">
            <button v-for="tag in ALL_TAGS" :key="tag" type="button" :data-tag="tag"
              class="cockpit-workspace__chip" :class="{ 'is-on': workItem.riskTags.includes(tag) }"
              @click="store.toggleRiskTag(tag)">{{ tag }}</button>
          </div>
        </div>

        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.reviewOpinion') }} · {{ t('cockpit.evaluation') }}</label>
          <div class="cockpit-workspace__score">
            <button v-for="n in 5" :key="n" type="button" class="cockpit-workspace__star"
              :class="{ 'is-on': (workItem.score ?? 0) >= n }"
              @click="store.updateWorkItem({ score: n })">★</button>
          </div>
        </div>

        <div v-if="workItem" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.reviewOpinion') }}</label>
          <textarea class="cockpit-workspace__textarea"
            :value="workItem.opinion"
            @input="store.updateWorkItem({ opinion: ($event.target as HTMLTextAreaElement).value })" />
        </div>

        <!-- 修改文件列表 -->
        <div v-if="workItem?.modifiedFiles?.length" class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.modified') || 'Modified' }}</label>
          <div class="cockpit-workspace__files">
            <span v-for="f in workItem.modifiedFiles" :key="f" class="cockpit-workspace__file">{{ f }}</span>
          </div>
        </div>
      </div>
      <div v-else class="cockpit-workspace__empty">{{ t('cockpit.noTaskSelected') }}</div>

      <!-- Footer -->
      <div class="cockpit-workspace__foot">
        <template v-if="!isReadOnly">
          <button type="button" class="cockpit-workspace__btn" @click="store.openTemplateManager()">📋 {{ t('cockpit.templateManager') }}</button>
          <button type="button" class="cockpit-workspace__btn" @click="store.enterTerminal()">⌘ {{ t('cockpit.modeTerm') }}</button>
          <button type="button" class="cockpit-workspace__btn" @click="store.autoSaveDraft()">💾 {{ t('cockpit.saveDraft') }}</button>
          <button type="button" data-action="submit" class="cockpit-workspace__btn is-pri" @click="$emit('submit')">{{ t('cockpit.submit') }}</button>
        </template>
        <button v-else type="button" class="cockpit-workspace__btn is-pri" @click="store.openTemplateManager()">{{ t('cockpit.newCollabFromArchive') }}</button>
      </div>
    </div>

    <!-- 文件资源管理器 -->
    <CockpitFileTree />
  </div>
</template>

<style scoped lang="scss">
.cockpit-workspace { display: flex; flex: 1; min-height: 0; }
.cockpit-workspace__form { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cockpit-workspace__body { flex: 1; overflow-y: auto; padding: 20px 24px; max-width: 640px; }
.cockpit-workspace__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }

/* AREA 1: Header */
.cockpit-workspace__header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color); }
.cockpit-workspace__title { font-size: 16px; font-weight: 700; color: var(--text-primary); line-height: 1.4; margin-bottom: 6px; }
.cockpit-workspace__summary { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px; }
.cockpit-workspace__meta-row { display: flex; align-items: center; gap: 8px; }
.cockpit-workspace__status-chip { font-size: 10px; padding: 2px 8px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; text-transform: uppercase; }
.cockpit-workspace__priority-tag { font-size: 10px; padding: 2px 8px; border-radius: 4px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-muted); font-family: ui-monospace, monospace; }

/* AREA 2: Detail Fields */
.cockpit-workspace__section { margin-bottom: 16px; }
.cockpit-workspace__section-title { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px; }
.cockpit-workspace__field-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cockpit-workspace__field-val { font-size: 13px; color: var(--text-primary); }
.cockpit-workspace__field-val--muted { font-size: 12px; color: var(--text-muted); font-style: italic; }
.cockpit-workspace__select { font-family: inherit; font-size: 12px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); }
.cockpit-workspace__mini-btn { width: 22px; height: 22px; padding: 0; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-workspace__task-link { font-family: ui-monospace, monospace; font-size: 11px; color: var(--accent-primary); cursor: pointer; background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px;
  &:hover { text-decoration: underline; }
}
.cockpit-workspace__attach-list { display: flex; flex-direction: column; gap: 4px; }
.cockpit-workspace__attach-item { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; background: var(--bg-secondary); font-size: 12px; }
.cockpit-workspace__attach-name { font-family: ui-monospace, monospace; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; }
.cockpit-workspace__attach-size { color: var(--text-muted); font-size: 10px; flex-shrink: 0; }
.cockpit-workspace__attach-del { cursor: pointer; color: var(--text-muted); border: none; background: none; font-size: 11px; padding: 0 2px;
  &:hover { color: var(--error); }
}
.cockpit-workspace__upload-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 4px 10px; border: 1px dashed var(--border-color); border-radius: 6px; color: var(--text-secondary); cursor: pointer; margin-top: 4px;
  &:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
}
.cockpit-workspace__file-input { display: none; }
.cockpit-workspace__files { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cockpit-workspace__file { font-family: ui-monospace, monospace; font-size: 10px; background: var(--bg-secondary); padding: 2px 7px; border-radius: 3px; color: var(--text-secondary); }

/* AREA 3: A2UI */
.cockpit-workspace__sub { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 6px; }
.cockpit-workspace__opt { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: var(--bg-card); font: inherit; color: var(--text-primary); width: 100%; text-align: left;
  &:hover { border-color: var(--text-muted); }
  &.is-selected { border-color: var(--accent-primary); background: var(--bg-secondary); }
}
.cockpit-workspace__opt-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--text-muted); flex-shrink: 0; margin-top: 1px; }
.is-selected .cockpit-workspace__opt-dot { border-color: var(--accent-primary); background: radial-gradient(var(--accent-primary) 45%, transparent 50%); }
.cockpit-workspace__opt-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cockpit-workspace__opt-header { display: flex; align-items: center; gap: 8px; }
.cockpit-workspace__opt-name { font-size: 13px; font-weight: 600; }
.cockpit-workspace__opt-rec { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--accent-primary); color: var(--text-on-accent); font-weight: 600; white-space: nowrap; }
.cockpit-workspace__opt-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.cockpit-workspace__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cockpit-workspace__chip { font-size: 12px; padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-workspace__textarea { width: 100%; font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; background: var(--bg-card); color: var(--text-primary); min-height: 64px; resize: vertical; }
.cockpit-workspace__score { display: flex; gap: 4px; }
.cockpit-workspace__star { font-size: 20px; color: var(--border-color); cursor: pointer; border: none; background: none; font: inherit; padding: 0;
  &.is-on { color: var(--warning); }
}

/* Footer */
.cockpit-workspace__foot { flex-shrink: 0; padding: 12px 16px; border-top: 1px solid var(--border-color); background: var(--bg-card); display: flex; gap: 8px; }
.cockpit-workspace__btn { font-family: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}
</style>

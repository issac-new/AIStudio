<!-- HERMES_CUSTOM[Kanban] BEGIN: Enhanced Kanban task drawer with recovery, diagnostics, home channels, and run history -->
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  NDrawer, NDrawerContent, NButton, NInput, NInputNumber,
  NSelect, NTag, NSpin, NEmpty, NModal, useMessage, useDialog
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import * as kanbanApi from '@/api/hermes/kanban'
import type { KanbanTaskDetail, KanbanTaskStatus, KanbanEvent, KanbanRun, KanbanTaskLog, HomeChannel } from '@/api/hermes/kanban'
import { useKanbanStore } from '@/stores/hermes/kanban'
import KanbanMarkdown from '@/custom/kanban/components/KanbanMarkdown.vue'
import KanbanDiagnosticsSection from '@/custom/kanban/components/KanbanDiagnosticsSection.vue'
import KanbanAttachments from '@/custom/kanban/components/KanbanAttachments.vue'

const props = defineProps<{
  show: boolean
  taskId: string | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  close: []
  refresh: []
}>()

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const store = useKanbanStore()

const loading = ref(false)
const detail = ref<KanbanTaskDetail | null>(null)
const patchErr = ref<string | null>(null)

// Comment state
const newComment = ref('')
const commentLoading = ref(false)
const commentListRef = ref<HTMLDivElement | null>(null)

// Editing states
const editingTitle = ref(false)
const titleEditValue = ref('')
const editingAssignee = ref(false)
const assigneeEditValue = ref('')
const editingPriority = ref(false)
const priorityEditValue = ref(0)
const editingBody = ref(false)
const bodyEditValue = ref('')

// Log state
const logData = ref<KanbanTaskLog | null>(null)
const logLoading = ref(false)

// Dependency state
const newParentId = ref('')
const newChildId = ref('')

// Diagnostics state
const diagnosticsLoading = ref(false)
const diagnosticsData = ref<any[]>([])

// Home channel notification subscriptions
const homeChannels = ref<HomeChannel[]>([])
const homeBusy = ref<Record<string, boolean>>({})

// Specify/Decompose state
const specifyBusy = ref(false)
const specifyMsg = ref<{ ok: boolean; text: string } | null>(null)
const decomposeBusy = ref(false)
const decomposeMsg = ref<{ ok: boolean; text: string } | null>(null)

// Run history expanded
const runsExpanded = ref(false)

// Recovery actions (reclaim / reassign) — surfaced for running tasks the
// same way the agent's DiagnosticsSection offers them. The agent gates these
// behind diagnostic rules, but the underlying verbs (`kanban reclaim`,
// `kanban reassign`) are always valid on a running task, so we offer them
// directly here. The store bridges both through the hermes CLI.
const reclaimBusy = ref(false)
const reclaimMsg = ref<{ ok: boolean; text: string } | null>(null)
const reassignBusy = ref(false)
const reassignMsg = ref<{ ok: boolean; text: string } | null>(null)
const showReassignPicker = ref(false)
const reassignProfile = ref('')

// Maximize state
const isMaximized = ref(false)
const drawerWidth = computed(() => isMaximized.value ? 'calc(100vw - 40px)' : 720)

const task = computed(() => detail.value?.task || null)
const comments = computed(() => detail.value?.comments || [])
const events = computed(() => detail.value?.events || [])
const runs = computed(() => detail.value?.runs || [])
const links = computed(() => (detail.value as any)?.links || { parents: [], children: [] })

const taskDiagnostics = computed(() => {
  const found = diagnosticsData.value.find((d: any) => d.task_id === task.value?.id)
  return found?.diagnostics || []
})

const allTasks = computed(() => store.tasks)

const assigneeOptions = computed(() => [
  { label: t('kanban.unassigned'), value: '' },
  ...store.assignees.map(a => ({ label: a.name, value: a.name })),
])

const assigneeNames = computed(() => store.assignees.map(a => a.name))

const currentUser = computed(() => '')

const candidateTasksForParent = computed(() => {
  const exclude = new Set([task.value?.id, ...(links.value.parents || [])])
  return allTasks.value.filter(tk => !exclude.has(tk.id))
})

const candidateTasksForChild = computed(() => {
  const exclude = new Set([task.value?.id, ...(links.value.children || [])])
  return allTasks.value.filter(tk => !exclude.has(tk.id))
})

watch(() => [props.show, props.taskId], async ([show, taskId]) => {
  if (show && taskId && typeof taskId === 'string') {
    await loadDetail(taskId)
    loadDiagnostics(taskId)
    loadHomeChannels()
    // Auto-load worker log on open (matches agent dashboard behavior)
    loadLog()
    scrollCommentsToBottom()
  } else {
    detail.value = null
    resetEditors()
    logData.value = null
    newComment.value = ''
    patchErr.value = null
    specifyMsg.value = null
    decomposeMsg.value = null
    reclaimMsg.value = null
    reassignMsg.value = null
    showReassignPicker.value = false
    reassignProfile.value = ''
    homeChannels.value = []
    homeBusy.value = {}
  }
})

function resetEditors() {
  editingTitle.value = false
  editingAssignee.value = false
  editingPriority.value = false
  editingBody.value = false
  titleEditValue.value = ''
  assigneeEditValue.value = ''
  priorityEditValue.value = 0
  bodyEditValue.value = ''
}

async function loadDetail(taskId: string) {
  loading.value = true
  patchErr.value = null
  try {
    detail.value = await kanbanApi.getTask(taskId, { board: store.selectedBoard })
    resetEditors()
  } catch (err: any) {
    patchErr.value = err?.message || String(err)
    message.error(t('kanban.message.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function loadDiagnostics(taskId: string) {
  diagnosticsLoading.value = true
  try {
    const result = await store.getDiagnostics({ task: taskId })
    diagnosticsData.value = result
  } catch (err: any) {
    console.error('Failed to load diagnostics:', err)
  } finally {
    diagnosticsLoading.value = false
  }
}

// ─── Home channel notification subscriptions ──────────────────────

async function loadHomeChannels() {
  if (!props.taskId) return
  try {
    const channels = await kanbanApi.getHomeChannels(props.taskId, { board: store.selectedBoard })
    homeChannels.value = channels
  } catch (err: any) {
    console.error('Failed to load home channels:', err)
    homeChannels.value = []
  }
}

async function toggleHomeSubscription(platform: string, currentlySubscribed: boolean) {
  if (!props.taskId) return
  // Optimistic flip
  homeBusy.value = { ...homeBusy.value, [platform]: true }
  homeChannels.value = homeChannels.value.map(h =>
    h.platform === platform ? { ...h, subscribed: !currentlySubscribed } : h,
  )

  try {
    if (currentlySubscribed) {
      await kanbanApi.unsubscribeHomeChannel(props.taskId, platform, { board: store.selectedBoard })
    } else {
      await kanbanApi.subscribeHomeChannel(props.taskId, platform, { board: store.selectedBoard })
    }
    // Re-sync after success
    await loadHomeChannels()
  } catch (err: any) {
    // Revert on error
    homeChannels.value = homeChannels.value.map(h =>
      h.platform === platform ? { ...h, subscribed: currentlySubscribed } : h,
    )
    message.error(err?.message || t('kanban.message.bulkFailed'))
  } finally {
    homeBusy.value = { ...homeBusy.value, [platform]: false }
  }
}

function handleClose() {
  emit('update:show', false)
  emit('close')
}

// Completion summary modal state
const showCompletionModal = ref(false)
const completionSummary = ref('')
const pendingDonePatch = ref<kanbanApi.KanbanTaskPatch | null>(null)

async function doPatch(patch: kanbanApi.KanbanTaskPatch, opts?: { confirm?: string }) {
  if (!task.value) return

  // For done status, open the completion summary modal
  if (patch.status === 'done') {
    pendingDonePatch.value = patch
    completionSummary.value = ''
    showCompletionModal.value = true
    return
  }

  // For other destructive transitions, use Naive UI dialog
  if (opts?.confirm) {
    dialog.warning({
      title: t('common.confirm'),
      content: opts.confirm,
      positiveText: t('common.confirm'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => executePatch(patch),
    })
    return
  }

  await executePatch(patch)
}

async function executePatch(patch: kanbanApi.KanbanTaskPatch) {
  if (!task.value) return
  patchErr.value = null
  try {
    await store.patchTask(task.value.id, patch)
    message.success(t('kanban.message.taskUpdated'))
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    patchErr.value = err?.message || String(err)
    message.error(t('kanban.message.updateFailed'))
  }
}

function handleCompletionSubmit() {
  const trimmed = completionSummary.value.trim()
  if (!trimmed) {
    message.warning(t('kanban.completionSummaryRequired', 'Completion summary is required before marking a task done.'))
    return
  }
  const patch = { ...pendingDonePatch.value, result: trimmed } as kanbanApi.KanbanTaskPatch
  showCompletionModal.value = false
  pendingDonePatch.value = null
  executePatch(patch)
}

// Title editor
function startEditTitle() {
  if (!task.value) return
  titleEditValue.value = task.value.title || ''
  editingTitle.value = true
}

async function saveTitle() {
  const trimmed = titleEditValue.value.trim()
  if (!trimmed) return
  await doPatch({ title: trimmed })
  editingTitle.value = false
}

// Assignee editor
function startEditAssignee() {
  if (!task.value) return
  assigneeEditValue.value = task.value.assignee || ''
  editingAssignee.value = true
}

async function saveAssignee() {
  await doPatch({ assignee: assigneeEditValue.value.trim() || null })
  editingAssignee.value = false
}

// Priority editor
function startEditPriority() {
  if (!task.value) return
  priorityEditValue.value = task.value.priority || 0
  editingPriority.value = true
}

async function savePriority() {
  await doPatch({ priority: Number(priorityEditValue.value) || 0 })
  editingPriority.value = false
}

// Body editor
function startEditBody() {
  if (!task.value) return
  bodyEditValue.value = task.value.body || ''
  editingBody.value = true
}

async function saveBody() {
  await doPatch({ body: bodyEditValue.value })
  editingBody.value = false
}

function cancelBodyEdit() {
  editingBody.value = false
  bodyEditValue.value = task.value?.body || ''
}

// Status actions
function canMoveTo(status: KanbanTaskStatus): boolean {
  if (!task.value) return false
  const s = task.value.status
  switch (status) {
    case 'triage': return s !== 'triage'
    case 'ready': return s !== 'ready'
    case 'blocked': return s === 'running' || s === 'ready'
    case 'done': return s === 'running' || s === 'ready' || s === 'blocked'
    case 'archived': return s !== 'archived'
    default: return false
  }
}

const statusConfirmMessages: Record<string, string> = {
  done: t('kanban.confirmDone', 'Mark this task as done? The worker\'s claim is released and dependent children become ready.'),
  archived: t('kanban.confirmArchive', 'Archive this task? It disappears from the default board view.'),
  blocked: t('kanban.confirmBlocked', 'Mark this task as blocked? The worker\'s claim is released.'),
}

// Specify / Decompose
async function doSpecify() {
  if (!task.value || specifyBusy.value) return
  specifyBusy.value = true
  specifyMsg.value = null
  try {
    const res = await store.specifyTask(task.value.id) as any
    if (res && res.ok) {
      const suffix = res.new_title ? ` — retitled: ${res.new_title}` : ''
      specifyMsg.value = { ok: true, text: `Specified${suffix}` }
    } else {
      specifyMsg.value = { ok: false, text: `Specify failed: ${res?.reason || 'unknown error'}` }
    }
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    specifyMsg.value = { ok: false, text: `Specify failed: ${err?.message || String(err)}` }
  } finally {
    specifyBusy.value = false
  }
}

async function doDecompose() {
  if (!task.value || decomposeBusy.value) return
  decomposeBusy.value = true
  decomposeMsg.value = null
  try {
    const res = await store.decomposeTask(task.value.id) as any
    if (res && res.ok) {
      if (res.fanout && res.child_ids?.length) {
        decomposeMsg.value = { ok: true, text: `Decomposed into ${res.child_ids.length} children: ${res.child_ids.join(', ')}` }
      } else {
        const suffix = res.new_title ? ` — retitled: ${res.new_title}` : ''
        decomposeMsg.value = { ok: true, text: `Single task (no fanout)${suffix}` }
      }
    } else {
      decomposeMsg.value = { ok: false, text: `Decompose failed: ${res?.reason || 'unknown error'}` }
    }
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    decomposeMsg.value = { ok: false, text: `Decompose failed: ${err?.message || String(err)}` }
  } finally {
    decomposeBusy.value = false
  }
}

// Recovery — reclaim / reassign a running task. Maps to
// `hermes kanban reclaim <id>` and `hermes kanban reassign <id> <profile>`.
// Only meaningful while a worker holds the task; other states get a 409.
async function doReclaim() {
  if (!task.value || reclaimBusy.value) return
  dialog.warning({
    title: t('common.confirm'),
    content: t('kanban.reclaim.confirm', 'Release the active worker claim? The task returns to ready for re-dispatch.'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => executeReclaim(),
  })
}

async function executeReclaim() {
  if (!task.value || reclaimBusy.value) return
  reclaimBusy.value = true
  reclaimMsg.value = null
  try {
    await store.reclaimTask(task.value.id)
    reclaimMsg.value = { ok: true, text: t('kanban.reclaim.success', 'Claim released — task is ready again') }
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    reclaimMsg.value = { ok: false, text: `${t('kanban.reclaim.failed', 'Reclaim failed:') } ${err?.message || String(err)}` }
  } finally {
    reclaimBusy.value = false
  }
}

async function doReassign() {
  if (!task.value || reassignBusy.value) return
  reassignBusy.value = true
  reassignMsg.value = null
  try {
    // reclaim_first so a worker currently running the task is released
    // before the new assignee takes over (matches the agent's recovery UX).
    await store.reassignTask(task.value.id, reassignProfile.value || '', { reclaim: true })
    const who = reassignProfile.value || t('kanban.unassigned')
    reassignMsg.value = { ok: true, text: t('kanban.reassign.success', { profile: who }) }
    showReassignPicker.value = false
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    reassignMsg.value = { ok: false, text: `${t('kanban.reassign.failed', 'Reassign failed:') } ${err?.message || String(err)}` }
  } finally {
    reassignBusy.value = false
  }
}

// Dependencies
async function addParent() {
  if (!task.value || !newParentId.value) return
  try {
    await store.linkTasks(newParentId.value, task.value.id)
    message.success(t('kanban.message.linkAdded'))
    newParentId.value = ''
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.linkFailed'))
  }
}

async function removeParent(parentId: string) {
  if (!task.value) return
  try {
    await store.unlinkTasks(parentId, task.value.id)
    message.success(t('kanban.message.linkRemoved'))
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.linkFailed'))
  }
}

async function addChild() {
  if (!task.value || !newChildId.value) return
  try {
    await store.linkTasks(task.value.id, newChildId.value)
    message.success(t('kanban.message.linkAdded'))
    newChildId.value = ''
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.linkFailed'))
  }
}

async function removeChild(childId: string) {
  if (!task.value) return
  try {
    await store.unlinkTasks(task.value.id, childId)
    message.success(t('kanban.message.linkRemoved'))
    await loadDetail(task.value.id)
    emit('refresh')
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.linkFailed'))
  }
}

// Comments
async function handleAddComment() {
  if (!task.value || !newComment.value.trim()) return
  commentLoading.value = true
  try {
    await store.addComment(task.value.id, newComment.value.trim())
    newComment.value = ''
    await loadDetail(task.value.id)
    emit('refresh')
    scrollCommentsToBottom()
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.commentFailed'))
  } finally {
    commentLoading.value = false
  }
}

function scrollCommentsToBottom() {
  nextTick(() => {
    const el = commentListRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

function onCommentKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleAddComment()
  }
}

// Worker log
async function loadLog() {
  if (!task.value) return
  logLoading.value = true
  try {
    logData.value = await store.getTaskLog(task.value.id, 100000)
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.logFailed'))
  } finally {
    logLoading.value = false
  }
}

// Formatting
function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts * 1000) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function eventKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    status: 'Status Change',
    reprioritized: 'Priority Change',
    edited: 'Edited',
    created: 'Created',
    comment: 'Comment',
    completion_blocked_hallucination: '⚠ Completion blocked — phantom card ids',
    suspected_hallucinated_references: '⚠ Prose referenced phantom card ids',
  }
  return labels[kind] || kind
}

function isDiagnosticEvent(kind: string): boolean {
  return kind === 'completion_blocked_hallucination' || kind === 'suspected_hallucinated_references'
}

function phantomIdsFromEvent(ev: KanbanEvent): string[] {
  const p = ev.payload as any
  return p?.phantom_cards || p?.phantom_refs || []
}

function fmtElapsed(run: KanbanRun): string {
  if (!run.started_at) return ''
  const end = run.ended_at || Math.floor(Date.now() / 1000)
  const secs = Math.max(0, end - run.started_at)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  return `${(secs / 3600).toFixed(1)}h`
}

// Keyboard: Escape closes drawer when not editing
watch(editingTitle, (v) => { if (!v) nextTick(() => { /* refocus if needed */ }) })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !editingTitle.value && !editingAssignee.value && !editingPriority.value && !editingBody.value) {
    handleClose()
  }
}

// Attach/detach keyboard listener
watch(() => props.show, (show) => {
  if (show) {
    window.addEventListener('keydown', onKeydown)
  } else {
    window.removeEventListener('keydown', onKeydown)
  }
})

function toggleMaximize() {
  isMaximized.value = !isMaximized.value
}

// Status dot color
function statusDotClass(status: string): string {
  return `kanban-dot kanban-dot--${status}`
}
</script>

<template>
  <NDrawer
    :show="show"
    :width="drawerWidth"
    placement="right"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent :native-scrollbar="false" closable @close="handleClose" class="kanban-drawer-content">
      <template #header>
        <div class="drawer-header">
          <span class="drawer-task-id">{{ taskId }}</span>
          <div class="drawer-header-actions">
            <NButton
              size="tiny"
              text
              :title="isMaximized ? t('kanban.restoreDrawer', 'Restore drawer') : t('kanban.maximizeDrawer', 'Maximize drawer')"
              :aria-label="isMaximized ? t('kanban.restoreDrawer', 'Restore drawer') : t('kanban.maximizeDrawer', 'Maximize drawer')"
              @click="toggleMaximize"
            >
              <span class="maximize-icon">{{ isMaximized ? '⊓' : '⛶' }}</span>
            </NButton>
          </div>
        </div>
      </template>

      <NSpin v-if="loading" size="large" class="drawer-loading" />

      <div v-else-if="patchErr" class="drawer-error">
        <NTag type="error">{{ patchErr }}</NTag>
      </div>

      <div v-else-if="task && detail" class="task-drawer" @keydown.stop>
        <!-- Title -->
        <div class="drawer-section">
          <div class="drawer-title-row">
            <span :class="statusDotClass(task.status)" />
            <div v-if="editingTitle" class="edit-row">
              <NInput
                v-model:value="titleEditValue"
                size="small"
                autofocus
                @keydown.enter.prevent="saveTitle"
                @keydown.esc="editingTitle = false"
              />
              <NButton size="tiny" type="primary" @click="saveTitle">
                {{ t('common.save') }}
              </NButton>
              <NButton size="tiny" @click="editingTitle = false">
                {{ t('common.cancel') }}
              </NButton>
            </div>
            <h2
              v-else
              class="drawer-title"
              :title="t('kanban.clickToEdit', 'Click to edit')"
              @click="startEditTitle"
            >
              {{ task.title || t('kanban.untitled', '(untitled)') }}
            </h2>
          </div>
        </div>

        <!-- Meta rows -->
        <div class="drawer-meta">
          <div class="meta-row">
            <span class="meta-label">{{ t('kanban.detail.status') }}</span>
            <NTag size="small" :type="task.status === 'done' ? 'success' : task.status === 'blocked' ? 'error' : 'default'">
              {{ t(`kanban.columns.${task.status}`) }}
            </NTag>
          </div>

          <div class="meta-row">
            <span class="meta-label">{{ t('kanban.detail.assignee') }}</span>
            <div v-if="editingAssignee" class="edit-row">
              <NSelect
                v-model:value="assigneeEditValue"
                size="tiny"
                :options="assigneeOptions"
                filterable
                tag
                @keydown.enter.prevent="saveAssignee"
              />
              <NButton size="tiny" type="primary" @click="saveAssignee">
                {{ t('common.save') }}
              </NButton>
            </div>
            <span
              v-else
              class="meta-value editable"
              :title="t('kanban.clickToEditAssignee', 'Click to edit assignee')"
              @click="startEditAssignee"
            >
              {{ task.assignee || t('kanban.unassigned', 'unassigned') }}
            </span>
          </div>

          <div class="meta-row">
            <span class="meta-label">{{ t('kanban.detail.priority') }}</span>
            <div v-if="editingPriority" class="edit-row">
              <NInputNumber
                v-model:value="priorityEditValue"
                size="tiny"
                :min="0"
                :max="100"
                style="width: 80px"
                @keydown.enter.prevent="savePriority"
              />
              <NButton size="tiny" type="primary" @click="savePriority">
                {{ t('common.save') }}
              </NButton>
            </div>
            <span
              v-else
              class="meta-value editable"
              :title="t('kanban.clickToEdit', 'Click to edit')"
              @click="startEditPriority"
            >
              {{ task.priority }}
            </span>
          </div>

          <div v-if="task.tenant" class="meta-row">
            <span class="meta-label">{{ t('kanban.tenant', 'Tenant') }}</span>
            <span class="meta-value">{{ task.tenant }}</span>
          </div>

          <div v-if="task.project_id" class="meta-row">
            <span class="meta-label">{{ t('kanban.project', 'Project') }}</span>
            <span class="meta-value">{{ task.project_id }}</span>
          </div>

          <div class="meta-row">
            <span class="meta-label">{{ t('kanban.workspace', 'Workspace') }}</span>
            <span class="meta-value">{{ task.workspace_kind }}{{ task.workspace_path ? ': ' + task.workspace_path : '' }}</span>
          </div>

          <div v-if="task.skills?.length" class="meta-row">
            <span class="meta-label">{{ t('kanban.skills', 'Skills') }}</span>
            <span class="meta-value">{{ task.skills.join(', ') }}</span>
          </div>

          <div v-if="(task as any).goal_mode" class="meta-row">
            <span class="meta-label">{{ t('kanban.goalMode', 'Goal mode') }}</span>
            <span class="meta-value">{{ (task as any).goal_max_turns ? `on (max ${(task as any).goal_max_turns} turns)` : 'on' }}</span>
          </div>

          <div v-if="task.created_by" class="meta-row">
            <span class="meta-label">{{ t('kanban.createdBy', 'Created by') }}</span>
            <span class="meta-value">{{ task.created_by }}</span>
          </div>
        </div>

        <!-- Status Actions -->
        <div class="drawer-section">
          <div class="status-actions">
            <NButton
              v-if="task.status === 'triage'"
              size="small"
              :loading="specifyBusy"
              :disabled="specifyBusy"
              @click="doSpecify"
            >
              ✨ {{ t('kanban.specify', 'Specify') }}
            </NButton>
            <NButton
              v-if="task.status === 'triage'"
              size="small"
              :loading="decomposeBusy"
              :disabled="decomposeBusy"
              @click="doDecompose"
            >
              ⚗ {{ t('kanban.decompose', 'Decompose') }}
            </NButton>
            <NButton
              size="small"
              :disabled="!canMoveTo('triage')"
              @click="doPatch({ status: 'triage' })"
            >
              → {{ t('kanban.columns.triage') }}
            </NButton>
            <NButton
              size="small"
              :disabled="!canMoveTo('ready')"
              @click="doPatch({ status: 'ready' })"
            >
              → {{ t('kanban.columns.ready') }}
            </NButton>
            <NButton
              size="small"
              type="warning"
              :disabled="!canMoveTo('blocked')"
              @click="doPatch({ status: 'blocked' }, { confirm: statusConfirmMessages.blocked })"
            >
              {{ t('kanban.action.block') }}
            </NButton>
            <NButton
              size="small"
              :disabled="task.status !== 'blocked'"
              @click="doPatch({ status: 'ready' })"
            >
              {{ t('kanban.action.unblock') }}
            </NButton>
            <NButton
              size="small"
              type="primary"
              :disabled="!canMoveTo('done')"
              @click="doPatch({ status: 'done' }, { confirm: statusConfirmMessages.done })"
            >
              {{ t('kanban.action.complete') }}
            </NButton>
            <NButton
              size="small"
              :disabled="!canMoveTo('archived')"
              @click="doPatch({ status: 'archived' }, { confirm: statusConfirmMessages.archived })"
            >
              {{ t('kanban.action.archive') }}
            </NButton>
          </div>
          <div v-if="specifyMsg" :class="['action-msg', specifyMsg.ok ? 'action-msg--ok' : 'action-msg--err']">
            {{ specifyMsg.text }}
          </div>
          <div v-if="decomposeMsg" :class="['action-msg', decomposeMsg.ok ? 'action-msg--ok' : 'action-msg--err']">
            {{ decomposeMsg.text }}
          </div>
          <div v-if="patchErr" class="action-msg action-msg--err">
            {{ patchErr }}
          </div>
        </div>

        <!-- Recovery (running tasks only) -->
        <div v-if="task.status === 'running'" class="drawer-section">
          <div class="section-head">
            {{ t('kanban.recovery', 'Recovery') }}
            <span class="section-hint">{{ t('kanban.recovery.hint', 'Abort or reroute the active worker') }}</span>
          </div>
          <div class="status-actions">
            <NButton
              size="small"
              type="warning"
              :loading="reclaimBusy"
              :disabled="reclaimBusy"
              @click="doReclaim"
            >
              {{ t('kanban.reclaim.button', 'Reclaim') }}
            </NButton>
            <NButton
              size="small"
              :disabled="reassignBusy"
              @click="showReassignPicker = !showReassignPicker"
            >
              {{ t('kanban.reassign.button', 'Reassign…') }}
            </NButton>
          </div>
          <div v-if="showReassignPicker" class="reassign-row">
            <NSelect
              v-model:value="reassignProfile"
              size="small"
              :options="assigneeOptions"
              filterable
              tag
              :placeholder="t('kanban.reassign.placeholder', 'Target profile')"
              style="flex: 1"
            />
            <NButton
              size="small"
              type="primary"
              :loading="reassignBusy"
              @click="doReassign"
            >
              {{ t('kanban.reassign.confirm', 'Reassign') }}
            </NButton>
          </div>
          <div v-if="reclaimMsg" :class="['action-msg', reclaimMsg.ok ? 'action-msg--ok' : 'action-msg--err']">
            {{ reclaimMsg.text }}
          </div>
          <div v-if="reassignMsg" :class="['action-msg', reassignMsg.ok ? 'action-msg--ok' : 'action-msg--err']">
            {{ reassignMsg.text }}
          </div>
        </div>

        <!-- Diagnostics -->
        <KanbanDiagnosticsSection
          v-if="task"
          :task="task"
          :diagnostics="taskDiagnostics"
          :assignees="assigneeNames"
          @refresh="loadDiagnostics(task.id)"
        />

        <!-- Notify home channels -->
        <div v-if="homeChannels.length > 0" class="drawer-section">
          <div class="section-head-row">
            <span class="section-head">{{ t('kanban.notifyHomeChannels', 'Notify home channels') }}</span>
          </div>
          <div class="home-subs-row">
            <NButton
              v-for="hc in homeChannels"
              :key="hc.platform"
              size="small"
              :type="hc.subscribed ? 'primary' : 'default'"
              :ghost="!hc.subscribed"
              :disabled="!!homeBusy[hc.platform]"
              :title="
                hc.subscribed
                  ? t('kanban.sendingUpdates', 'Sending updates to') + ' ' + hc.name + ' (' + hc.chat_id + (hc.thread_id ? ' / ' + hc.thread_id : '') + '). ' + t('kanban.clickToStop', 'Click to stop.')
                  : t('kanban.sendNotifications', 'Send completed / blocked / gave_up notifications to') + ' ' + hc.name + ' (' + hc.chat_id + (hc.thread_id ? ' / ' + hc.thread_id : '') + ').'
              "
              @click="toggleHomeSubscription(hc.platform, hc.subscribed)"
            >
              {{ hc.subscribed ? '✓ ' : '' }}{{ hc.platform }}
            </NButton>
          </div>
        </div>

        <!-- Body / Description -->
        <div class="drawer-section">
          <div class="section-head-row">
            <span class="section-head">{{ t('kanban.description', 'Description') }}</span>
            <div v-if="editingBody" class="edit-actions">
              <NButton size="tiny" type="primary" @click="saveBody">
                {{ t('common.save') }}
              </NButton>
              <NButton size="tiny" @click="cancelBodyEdit">
                {{ t('common.cancel') }}
              </NButton>
            </div>
            <NButton v-else size="tiny" text @click="startEditBody">
              {{ t('common.edit') }}
            </NButton>
          </div>
          <div v-if="editingBody">
            <NInput
              v-model:value="bodyEditValue"
              type="textarea"
              :rows="8"
              placeholder="Task description..."
            />
          </div>
          <div v-else-if="task.body" class="markdown-body">
            <KanbanMarkdown :source="task.body" />
          </div>
          <div v-else class="empty-text">
            {{ t('kanban.noDescription', '— no description —') }}
          </div>
        </div>

        <!-- Dependencies -->
        <div class="drawer-section">
          <div class="section-head">{{ t('kanban.dependencies', 'Dependencies') }}</div>

          <div class="deps-row">
            <span class="deps-label">{{ t('kanban.parents', 'Parents:') }}</span>
            <div class="deps-chips">
              <template v-if="links.parents?.length">
                <NTag
                  v-for="pid in links.parents"
                  :key="pid"
                  size="small"
                  closable
                  @close="removeParent(pid)"
                >
                  {{ pid }}
                </NTag>
              </template>
              <span v-else class="empty-text">{{ t('kanban.none', 'none') }}</span>
            </div>
          </div>
          <div class="deps-add-row">
            <NSelect
              v-model:value="newParentId"
              size="small"
              :options="candidateTasksForParent.map(tk => ({ label: `${tk.id} — ${(tk.title || '').slice(0, 50)}`, value: tk.id }))"
              filterable
              placeholder="— add parent —"
              style="flex: 1"
            />
            <NButton size="small" :disabled="!newParentId" @click="addParent">
              + {{ t('kanban.parent', 'parent') }}
            </NButton>
          </div>

          <div class="deps-row">
            <span class="deps-label">{{ t('kanban.children', 'Children:') }}</span>
            <div class="deps-chips">
              <template v-if="links.children?.length">
                <NTag
                  v-for="cid in links.children"
                  :key="cid"
                  size="small"
                  closable
                  @close="removeChild(cid)"
                >
                  {{ cid }}
                </NTag>
              </template>
              <span v-else class="empty-text">{{ t('kanban.none', 'none') }}</span>
            </div>
          </div>
          <div class="deps-add-row">
            <NSelect
              v-model:value="newChildId"
              size="small"
              :options="candidateTasksForChild.map(tk => ({ label: `${tk.id} — ${(tk.title || '').slice(0, 50)}`, value: tk.id }))"
              filterable
              placeholder="— add child —"
              style="flex: 1"
            />
            <NButton size="small" :disabled="!newChildId" @click="addChild">
              + {{ t('kanban.child', 'child') }}
            </NButton>
          </div>
        </div>

        <!-- Result -->
        <div v-if="task.result" class="drawer-section">
          <div class="section-head">{{ t('kanban.result', 'Result') }}</div>
          <div class="markdown-body">
            <KanbanMarkdown :source="task.result" />
          </div>
        </div>

        <!-- Attachments -->
        <KanbanAttachments
          v-if="task"
          :task-id="task.id"
        />

        <!-- Events -->
        <div class="drawer-section">
          <div class="section-head">{{ t('kanban.events', 'Events') }} ({{ events.length }})</div>
          <div class="event-list">
            <div
              v-for="event in events.slice().reverse().slice(0, 20)"
              :key="event.id"
              :class="['event-item', isDiagnosticEvent(event.kind) ? 'event-item--diag' : '']"
            >
              <div v-if="isDiagnosticEvent(event.kind)" class="event-header-diag">
                <span class="event-warning-icon">⚠️</span>
                <span class="event-warning-label">{{ eventKindLabel(event.kind) }}</span>
                <span class="event-ago">{{ timeAgo(event.created_at) }}</span>
              </div>
              <div v-else class="event-header">
                <span class="event-kind">{{ eventKindLabel(event.kind) }}</span>
                <span class="event-ago">{{ timeAgo(event.created_at) }}</span>
              </div>
              <div v-if="isDiagnosticEvent(event.kind) && phantomIdsFromEvent(event).length" class="event-phantoms">
                <span class="phantom-label">{{ t('kanban.phantomIds', 'Phantom ids:') }}</span>
                <NTag v-for="pid in phantomIdsFromEvent(event)" :key="pid" size="tiny">{{ pid }}</NTag>
              </div>
              <pre v-if="event.payload && !isDiagnosticEvent(event.kind)" class="event-payload">{{ JSON.stringify(event.payload, null, 2) }}</pre>
            </div>
          </div>
        </div>

        <!-- Worker Log -->
        <div class="drawer-section">
          <div class="section-head-row">
            <span class="section-head">
              {{ t('kanban.workerLog', 'Worker log') }}
              <span v-if="logData?.size_bytes">({{ formatBytes(logData.size_bytes) }})</span>
            </span>
            <NButton size="tiny" text @click="loadLog">
              🔄 {{ t('common.refresh') }}
            </NButton>
          </div>
          <div v-if="logLoading" class="empty-text">{{ t('kanban.loadingLog', 'Loading log…') }}</div>
          <div v-else-if="!logData" class="empty-text">
            {{ t('kanban.noWorkerLog', '— no worker log yet (task hasn\'t spawned or log was rotated away) —') }}
          </div>
          <div v-else-if="!logData.exists" class="empty-text">
            {{ t('kanban.noWorkerLog', '— no worker log yet (task hasn\'t spawned or log was rotated away) —') }}
          </div>
          <div v-else class="log-content markdown-body">
            <KanbanMarkdown v-if="logData.content" :source="logData.content" />
            <pre v-else class="log-pre">(empty)</pre>
          </div>
          <div v-if="logData?.truncated" class="empty-text">
            {{ t('kanban.logTruncated', '(showing last 100 KB — full log at') }} {{ logData.path }})
          </div>
        </div>

        <!-- Run History -->
        <div v-if="runs.length > 0" class="drawer-section">
          <div class="section-head-row">
            <span class="section-head">{{ t('kanban.runHistory', 'Run history') }} ({{ runs.length }})</span>
            <NButton
              v-if="runs.length > 3 && !runsExpanded"
              size="tiny"
              text
              @click="runsExpanded = true"
            >
              +{{ runs.length - 3 }} {{ t('kanban.showAllAttempts', 'earlier') }}
            </NButton>
          </div>
          <div class="run-list">
            <div
              v-for="run in (runsExpanded ? runs : runs.slice(-3))"
              :key="run.id"
              :class="['run-item', run.ended_at ? `run-item--${run.outcome || run.status || 'ended'}` : 'run-item--active']"
            >
              <div class="run-head">
                <span class="run-outcome">{{ run.ended_at ? (run.outcome || run.status || t('kanban.ended', 'ended')) : t('kanban.active', 'active') }}</span>
                <span class="run-profile">{{ run.profile ? `@${run.profile}` : t('kanban.noProfile', '(no profile)') }}</span>
                <span class="run-elapsed">{{ fmtElapsed(run) }}</span>
                <span class="run-ago">{{ timeAgo(run.started_at) }}</span>
              </div>
              <div v-if="run.summary" class="run-summary">{{ run.summary }}</div>
              <div v-if="run.error" class="run-error">{{ run.error }}</div>
              <details v-if="run.metadata && Object.keys(run.metadata).length > 0" class="run-meta-block">
                <summary class="run-meta-label">Metadata</summary>
                <pre class="run-meta">{{ JSON.stringify(run.metadata, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>

        <!-- Comments -->
        <div class="drawer-section comment-section">
          <div class="section-head">{{ t('kanban.comments', 'Comments') }} ({{ comments.length }})</div>
          <div v-if="comments.length === 0" class="empty-text">
            {{ t('kanban.noComments', '— no comments —') }}
          </div>
          <div v-else ref="commentListRef" class="comment-list-container">
            <div class="comment-list">
              <div
                v-for="comment in comments"
                :key="comment.id"
                :class="['comment-item', comment.author === currentUser ? 'comment-item--self' : '']"
              >
                <div class="comment-head">
                  <span class="comment-author">{{ comment.author || 'anon' }}</span>
                  <span class="comment-ago">{{ timeAgo(comment.created_at) }}</span>
                </div>
                <div class="comment-bubble">
                  <div class="comment-body markdown-body">
                    <KanbanMarkdown :source="comment.body" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="comment-input-sticky" :style="{ width: drawerWidth }">
            <div class="comment-input-row">
              <NInput
                v-model:value="newComment"
                type="textarea"
                size="small"
                :rows="2"
                :placeholder="t('kanban.addComment', 'Add a comment… (Shift+Enter for newline, Enter to submit)')"
                @keydown.enter="onCommentKeydown"
                class="comment-textarea-resizable"
              />
              <NButton size="small" :loading="commentLoading" @click="handleAddComment">
                {{ t('kanban.comment', 'Comment') }}
              </NButton>
            </div>
          </div>
        </div>
      </div>

      <NEmpty v-else :description="t('kanban.message.loadFailed')" />
    </NDrawerContent>
  </NDrawer>

  <!-- Completion summary modal -->
  <NModal
    v-model:show="showCompletionModal"
    preset="dialog"
    :title="t('kanban.completionSummary', 'Completion summary')"
  >
    <div style="display: flex; flex-direction: column; gap: 8px">
      <p style="font-size: 13px; color: var(--n-text-color-3); margin: 0">
        {{ t('kanban.completionSummaryHint', 'Enter a summary for this task. This is stored as the task result.') }}
      </p>
      <NInput
        v-model:value="completionSummary"
        type="textarea"
        :rows="4"
        :placeholder="t('kanban.completionSummaryPlaceholder', 'What was accomplished...')"
      />
    </div>
    <template #action>
      <NButton size="small" @click="showCompletionModal = false">
        {{ t('common.cancel') }}
      </NButton>
      <NButton size="small" type="primary" @click="handleCompletionSubmit">
        {{ t('kanban.action.complete') }}
      </NButton>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.maximize-icon {
  font-size: 14px;
  line-height: 1;
}

.drawer-task-id {
  font-size: 12px;
  color: $text-muted;
  font-family: monospace;
}

.drawer-loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.drawer-error {
  padding: 16px;
}

.task-drawer {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 72px; // prevents last content from being hidden behind sticky bar
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  word-break: break-word;
  cursor: pointer;
  flex: 1;

  &:hover {
    text-decoration: underline;
    text-decoration-color: $accent-primary;
  }
}

.edit-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.edit-actions {
  display: flex;
  gap: 6px;
}

.drawer-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 10px 12px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.meta-label {
  font-size: 12px;
  color: $text-muted;
  min-width: 80px;
  flex-shrink: 0;
}

.meta-value {
  font-size: 13px;
  color: $text-primary;

  &.editable {
    cursor: pointer;
    border-bottom: 1px dashed transparent;

    &:hover {
      border-bottom-color: $accent-primary;
      color: $accent-primary;
    }
  }
}

.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.action-msg {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: $radius-sm;

  &--ok {
    background: rgba($success, 0.1);
    color: $success;
  }

  &--err {
    background: rgba($error, 0.1);
    color: $error;
  }
}

.section-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-head {
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.section-hint {
  font-size: 11px;
  font-weight: 400;
  text-transform: none;
  color: $text-muted;
  margin-left: 6px;
}

.home-subs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.reassign-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.empty-text {
  font-size: 12px;
  color: $text-muted;
  font-style: italic;
}

.error-text {
  font-size: 12px;
  color: $error;
}

.markdown-body {
  .body-pre {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: $text-primary;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }
}

.result-pre {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 10px 12px;
}

// Dependencies
.deps-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.deps-label {
  font-size: 12px;
  color: $text-muted;
  min-width: 60px;
  flex-shrink: 0;
  padding-top: 4px;
}

.deps-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}

.deps-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding-left: 68px;
}

// Comments
.comment-section {
  position: relative;
}

.comment-list-container {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  margin-bottom: 8px;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comment-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;

  &.comment-item--self {
    align-self: flex-end;
    align-items: flex-end;

    .comment-bubble {
      background: rgba($accent-primary, 0.12);
      border-color: rgba($accent-primary, 0.25);
    }
  }

  &:not(.comment-item--self) {
    align-self: flex-start;
    align-items: flex-start;
  }
}

.comment-bubble {
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 10px 12px;
  width: 100%;
}

.comment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
}

.comment-ago {
  font-size: 11px;
  color: $text-muted;
}

.comment-body {
  margin: 0;
  font-size: 13px;
  color: $text-primary;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.comment-input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.comment-input-row .n-input {
  flex: 1;
  min-width: 0;
}

.comment-input-row .n-button {
  flex-shrink: 0;
  margin-bottom: 2px;
}

.comment-input-sticky {
  position: fixed;
  bottom: 0;
  width: 720px;
  background: $bg-primary;
  border-top: 1px solid $border-light;
  padding: 10px 16px;
  z-index: 10;
  box-sizing: border-box;
}

.comment-textarea-resizable :deep(.n-input__textarea) {
  resize: vertical;
  min-height: 60px;
}

// Events
.event-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 8px 12px;

  &--diag {
    border-left: 3px solid $warning;
  }
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-header-diag {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-kind {
  font-size: 12px;
  font-weight: 500;
  color: $text-primary;
}

.event-ago {
  font-size: 11px;
  color: $text-muted;
  margin-left: auto;
}

.event-warning-icon {
  color: $warning;
  font-size: 14px;
}

.event-warning-label {
  font-size: 12px;
  font-weight: 500;
  color: $warning;
}

.event-phantoms {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.phantom-label {
  font-size: 11px;
  color: $text-muted;
}

.event-payload {
  margin: 6px 0 0;
  font-size: 11px;
  color: $text-muted;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
}

// Runs
.run-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.run-item {
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 10px 12px;

  &--active {
    border-left: 3px solid $accent-primary;
  }

  &--success,
  &--completed {
    border-left: 3px solid $success;
  }

  &--failed,
  &--error {
    border-left: 3px solid $error;
  }
}

.run-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.run-outcome {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.run-profile {
  font-size: 12px;
  color: $text-secondary;
}

.run-elapsed {
  font-size: 11px;
  color: $text-muted;
  margin-left: auto;
}

.run-ago {
  font-size: 11px;
  color: $text-muted;
}

.run-summary {
  font-size: 13px;
  color: $text-primary;
  margin-top: 4px;
}

.run-error {
  font-size: 12px;
  color: $error;
  margin-top: 4px;
  font-family: monospace;
}

.run-meta-block {
  margin-top: 6px;
}

.run-meta-label {
  font-size: 11px;
  color: $text-muted;
  cursor: pointer;
}

.run-meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: $text-muted;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

// Log
.log-content {
  background: $bg-secondary;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.log-pre {
  margin: 0;
  font-size: 12px;
  font-family: monospace;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

// Status dots
.kanban-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;

  &--triage { background: #9ca3af; }
  &--todo { background: #6b7280; }
  &--ready { background: #3b82f6; }
  &--running { background: #f59e0b; }
  &--blocked { background: #ef4444; }
  &--done { background: #10b981; }
  &--archived { background: #8b5cf6; }
}
</style>
<!-- HERMES_CUSTOM[Kanban] END -->

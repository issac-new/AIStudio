<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCockpitStore, type WorkDecision } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'
import * as kanbanApi from '@/api/hermes/kanban'
import type { KanbanTaskStatus, HomeChannel } from '@/api/hermes/kanban'
import CockpitFileTree from './CockpitFileTree.vue'
import CockpitConfirmDialog from './CockpitConfirmDialog.vue'
import CockpitCompletionModal from './CockpitCompletionModal.vue'
import KanbanDiagnosticsSection from '@/custom/kanban/components/KanbanDiagnosticsSection.vue'

const store = useCockpitStore()
const kanbanStore = useKanbanStore()
const { t } = useI18n()
defineEmits<{ (e: 'submit'): void }>()

// ── 区域1: Task Header ──
const selectedTask = computed(() => store.selectedTask)
const detail = computed(() => store.selectedTaskDetail)
const taskSummary = computed(() => detail.value?.latest_summary ?? detail.value?.task?.result ?? '')

// ── 区域2: Kanban 详情字段（暂存草稿模式）──
const task = computed(() => detail.value?.task ?? null)
const workItem = computed(() => store.workItemForSelectedTask)

// 当前生效值（草稿优先，回退到 detail.task）
const currentAssignee = computed(() => {
  const draft = workItem.value
  if (draft?.pendingAssignee !== undefined) return draft.pendingAssignee || ''
  return task.value?.assignee ?? ''
})
const currentPriority = computed(() => {
  const draft = workItem.value
  if (draft?.pendingPriority !== undefined) return draft.pendingPriority
  return task.value?.priority ?? 0
})
const currentBody = computed(() => {
  const draft = workItem.value
  if (draft?.pendingBody !== undefined) return draft.pendingBody
  return task.value?.body ?? ''
})

// 父子任务（detail 提供原始列表 + 草稿中的待增删）
const parentIds = computed(() => detail.value?.parents ?? [])
const childIds = computed(() => detail.value?.children ?? [])
const pendingLinkAdds = computed(() => workItem.value?.pendingLinkAdds ?? [])
const pendingLinkRemoves = computed(() => workItem.value?.pendingLinkRemoves ?? [])

function isLinkPendingRemove(parent: string, child: string): boolean {
  return pendingLinkRemoves.value.some(l => l.parent === parent && l.child === child)
}

const newParentId = ref('')
const newChildId = ref('')

// 父/子任务候选列表（对齐 KanbanTaskDrawer：候选任务列表，排除自身和已关联）
// 用 store.tasks（跨 board 聚合的 cockpitTasks），而非 kanbanStore.tasks（仅当前 board）
const allKanbanTasks = computed(() => store.tasks ?? [])
const candidateTasksForParent = computed(() => {
  const tid = store.selectedTaskId
  const exclude = new Set([tid, ...(detail.value?.parents ?? [])])
  return allKanbanTasks.value.filter(tk => !exclude.has(tk.id))
})
const candidateTasksForChild = computed(() => {
  const tid = store.selectedTaskId
  const exclude = new Set([tid, ...(detail.value?.children ?? [])])
  return allKanbanTasks.value.filter(tk => !exclude.has(tk.id))
})
function taskOptionLabel(tk: any): string {
  return `${tk.id} — ${(tk.title || '').slice(0, 50)}`
}

// Assignee 选择（暂存到草稿）—— 优先用 kanbanStore.assignees，补充 store.tasks 中的 distinct assignee
// （bootstrap 后 kanbanStore.assignees 只反映最后一个 board，store.tasks 是跨 board 聚合）
const assigneeOptions = computed(() => {
  const map = new Map<string, string>()
  for (const a of (kanbanStore.assignees ?? [])) {
    const name = (a as any)?.name ?? a
    if (name) map.set(name, name)
  }
  for (const t of (store.tasks ?? [])) {
    const name = (t as any)?.assignee
    if (name && name !== '未分配' && name !== 'unassigned') map.set(name, name)
  }
  return [...map].map(([v]) => ({ label: v, value: v }))
})
function onAssigneeChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  store.setPendingAssignee(v || null)
}

// Priority 调整（暂存到草稿）
function onPriorityDelta(delta: number) {
  const np = Math.max(0, currentPriority.value + delta)
  store.setPendingPriority(np)
}

// Description 编辑（暂存到草稿）
function onBodyInput(e: Event) {
  store.setPendingBody((e.target as HTMLTextAreaElement).value)
}

// 父子关联调整（暂存到草稿）
function onRemoveParent(pid: string) {
  const tid = store.selectedTaskId
  if (!tid) return
  store.removePendingLink({ parent: pid, child: tid })
}
function onRemoveChild(cid: string) {
  const tid = store.selectedTaskId
  if (!tid) return
  store.removePendingLink({ parent: tid, child: cid })
}
function onAddParent() {
  const tid = store.selectedTaskId
  if (!tid || !newParentId.value.trim()) return
  store.addPendingLink({ parent: newParentId.value.trim(), child: tid })
  newParentId.value = ''
}
function onAddChild() {
  const tid = store.selectedTaskId
  if (!tid || !newChildId.value.trim()) return
  store.addPendingLink({ parent: tid, child: newChildId.value.trim() })
  newChildId.value = ''
}

// 附件（即时上传/删除）
const attachments = computed(() => {
  const id = store.selectedTaskId
  if (!id) return []
  return store.taskAttachments[id] ?? []
})
function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !store.selectedTaskId) return
  store.uploadAttachment(store.selectedTaskId, file)
  input.value = ''
}

function navigateToTask(taskId: string) {
  store.selectTask(taskId)
}

// 任务切换时重置输入框 + 刷新诊断/home 频道
watch(() => store.selectedTaskId, () => {
  newParentId.value = ''
  newChildId.value = ''
  reassignProfile.value = ''
  refreshDiagnostics()
  refreshHomeChannels()
})

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
const hasTask = computed(() => !!store.selectedTask)
const isReadOnly = computed(() => store.archivedMode)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── 评论区（草稿）──
const pendingComment = computed(() => workItem.value?.pendingComment ?? '')
function onCommentInput(e: Event) {
  store.setPendingComment((e.target as HTMLTextAreaElement).value)
}
const comments = computed(() => detail.value?.comments ?? [])

// ── 动作命令区（即时执行）──
const actionBusy = ref(false)
const actionMsg = ref<{ ok: boolean; text: string } | null>(null)
const reassignProfile = ref('')

async function execAction(label: string, fn: () => Promise<string | void>) {
  const tid = store.selectedTaskId
  if (actionBusy.value || !tid) return
  actionBusy.value = true
  actionMsg.value = null
  try {
    // fn 可返回更详细的成功文案；未返回时用通用 label ✓
    const detail = await fn()
    await store.loadTaskDetail(tid)
    actionMsg.value = { ok: true, text: detail || (label + ' ✓') }
  } catch (err: any) {
    actionMsg.value = { ok: false, text: `${label} 失败: ${err?.message || String(err)}` }
  } finally {
    actionBusy.value = false
  }
}

// B1/B2 Specify / Decompose
function doSpecify() {
  if (!task.value) return
  execAction('Specify', async () => {
    const res = await kanbanStore.specifyTask(task.value!.id) as any
    if (res && !res.ok) throw new Error(res?.reason || 'unknown')
    return res?.new_title ? `Specified — retitled: ${res.new_title}` : ''
  })
}
function doDecompose() {
  if (!task.value) return
  execAction('Decompose', async () => {
    const res = await kanbanStore.decomposeTask(task.value!.id) as any
    if (res && !res.ok) throw new Error(res?.reason || 'unknown')
    if (res?.fanout && res?.child_ids?.length) {
      return `Decomposed into ${res.child_ids.length} children: ${res.child_ids.join(', ')}`
    } else if (res?.new_title) {
      return `Single task (no fanout) — retitled: ${res.new_title}`
    }
    return ''
  })
}

// B3 状态门禁（搬自 KanbanTaskDrawer.vue）
function canMoveTo(status: KanbanTaskStatus): boolean {
  if (!task.value) return false
  const s = task.value.status as KanbanTaskStatus
  switch (status) {
    case 'triage': return s !== 'triage'
    case 'ready': return s !== 'ready'
    case 'blocked': return s === 'running' || s === 'ready'
    case 'done': return s === 'running' || s === 'ready' || s === 'blocked'
    case 'archived': return s !== 'archived'
    default: return false
  }
}

// B3/B4 状态流转 + 完成校验
const confirmState = ref<{ show: boolean; status: KanbanTaskStatus; content: string } | null>(null)
const completionShow = ref(false)
const pendingDonePatch = ref<kanbanApi.KanbanTaskPatch | null>(null)

function attemptStatusChange(status: KanbanTaskStatus) {
  if (!task.value || !canMoveTo(status)) return
  if (status === 'done') {
    pendingDonePatch.value = { status: 'done' }
    completionShow.value = true
    return
  }
  const confirmMap: Partial<Record<KanbanTaskStatus, string>> = {
    blocked: t('cockpit.confirmBlocked'),
    archived: t('cockpit.confirmArchive'),
  }
  const content = confirmMap[status]
  if (content) {
    confirmState.value = { show: true, status, content }
  } else {
    doStatusPatch({ status })
  }
}
function doStatusPatch(patch: kanbanApi.KanbanTaskPatch) {
  execAction('Status', () => kanbanStore.patchTask(task.value!.id, patch))
}
function confirmStatusChange() {
  if (!confirmState.value) return
  doStatusPatch({ status: confirmState.value.status })
  confirmState.value = null
}
function handleCompletionSubmit(summary: string) {
  if (!summary) return
  completionShow.value = false
  const patch = { ...(pendingDonePatch.value || {}), result: summary } as kanbanApi.KanbanTaskPatch
  pendingDonePatch.value = null
  doStatusPatch(patch)
}

// B5/B6 Recovery（仅 running）
function doReclaim() {
  if (!task.value) return
  execAction('Reclaim', () => kanbanStore.reclaimTask(task.value!.id))
}
function doReassign() {
  if (!task.value || !reassignProfile.value.trim()) return
  const profile = reassignProfile.value.trim()
  execAction('Reassign', () => kanbanStore.reassignTask(task.value!.id, profile, { reclaim: true }))
}

// B7 Diagnostics（复用 kanban 子组件，按选中任务拉取）
const diagItems = ref<kanbanApi.KanbanDiagnosticItem[]>([])
const assigneeList = computed(() => (kanbanStore.assignees ?? []).map((a: any) => a?.name ?? a))
function refreshDiagnostics() {
  const tid = store.selectedTaskId
  if (!tid) { diagItems.value = []; return }
  kanbanStore.getDiagnostics({ task: tid })
    .then((res: any) => {
      // getDiagnostics({task}) 返回该任务的诊断数组（通常 1 项），取其 .diagnostics
      const list = Array.isArray(res) ? res : []
      diagItems.value = list.flatMap((d: any) => d.diagnostics ?? [])
    })
    .catch(() => { diagItems.value = [] })
}

// B8 Home-channel 通知订阅
const homeChannels = ref<HomeChannel[]>([])
const homeBusy = ref<Record<string, boolean>>({})
async function refreshHomeChannels() {
  const tid = store.selectedTaskId
  if (!tid) { homeChannels.value = []; return }
  try {
    homeChannels.value = await kanbanApi.getHomeChannels(tid, { board: kanbanStore.selectedBoard })
  } catch {
    homeChannels.value = []
  }
}
async function toggleHomeSubscription(ch: HomeChannel) {
  const tid = store.selectedTaskId
  if (!tid) return
  homeBusy.value[ch.platform] = true
  try {
    if (ch.subscribed) {
      await kanbanApi.unsubscribeHomeChannel(tid, ch.platform, { board: kanbanStore.selectedBoard })
    } else {
      await kanbanApi.subscribeHomeChannel(tid, ch.platform, { board: kanbanStore.selectedBoard })
    }
    await refreshHomeChannels()
  } catch (err: any) {
    actionMsg.value = { ok: false, text: `通知订阅失败: ${err?.message || String(err)}` }
  } finally {
    homeBusy.value[ch.platform] = false
  }
}
</script>

<template>
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__form">
      <div v-if="hasTask" class="cockpit-workspace__body">
        <!-- ═══ AREA 1: Task Header ═══ -->
        <div class="cockpit-workspace__header">
          <input class="cockpit-workspace__title-input"
            :value="store.currentTitle"
            :placeholder="t('cockpit.editTitlePlaceholder')"
            @input="store.setPendingTitle(($event.target as HTMLInputElement).value)" />
          <div v-if="taskSummary" class="cockpit-workspace__summary">{{ taskSummary }}</div>
          <div class="cockpit-workspace__meta-row">
            <span class="cockpit-workspace__status-chip" :class="'is-' + (task?.status ?? '')">{{ task?.status ?? '' }}</span>
            <span class="cockpit-workspace__priority-tag">{{ 'P' + (task?.priority ?? '—') }}</span>
          </div>
        </div>

        <!-- ═══ AREA 2: Kanban Detail Fields（暂存草稿模式）═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.assignee') }}</label>
          <div class="cockpit-workspace__field-row">
            <span class="cockpit-workspace__field-val">{{ currentAssignee }}</span>
            <select class="cockpit-workspace__select" :value="currentAssignee" @change="onAssigneeChange">
              <option value="" disabled>{{ t('cockpit.selectAssignee') }}</option>
              <option v-for="opt in assigneeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.priority') }}</label>
          <div class="cockpit-workspace__field-row">
            <span class="cockpit-workspace__field-val">{{ 'P' + currentPriority }}</span>
            <button type="button" class="cockpit-workspace__mini-btn" @click="onPriorityDelta(-1)">−</button>
            <button type="button" class="cockpit-workspace__mini-btn" @click="onPriorityDelta(1)">+</button>
          </div>
        </div>

        <!-- 父任务（可调整关联） -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.parentTasks') }}</label>
          <div class="cockpit-workspace__field-row">
            <template v-if="parentIds.length">
              <span v-for="pid in parentIds" :key="pid"
                class="cockpit-workspace__task-link"
                :class="{ 'is-pending-remove': isLinkPendingRemove(pid, store.selectedTaskId ?? '') }">
                <a @click="navigateToTask(pid)">{{ pid }}</a>
                <button type="button" class="cockpit-workspace__link-del" @click="onRemoveParent(pid)">✕</button>
              </span>
            </template>
            <span v-else class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</span>
          </div>
          <div class="cockpit-workspace__link-add">
            <select v-model="newParentId" class="cockpit-workspace__link-select">
              <option value="">{{ t('cockpit.parentIdPlaceholder') }}</option>
              <option v-for="tk in candidateTasksForParent" :key="tk.id" :value="tk.id">{{ taskOptionLabel(tk) }}</option>
            </select>
            <button type="button" class="cockpit-workspace__link-add-btn" :disabled="!newParentId" @click="onAddParent">+ {{ t('cockpit.add') }}</button>
          </div>
        </div>

        <!-- 子任务（可调整关联） -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.childTasks') }}</label>
          <div class="cockpit-workspace__field-row">
            <template v-if="childIds.length">
              <span v-for="cid in childIds" :key="cid"
                class="cockpit-workspace__task-link"
                :class="{ 'is-pending-remove': isLinkPendingRemove(store.selectedTaskId ?? '', cid) }">
                <a @click="navigateToTask(cid)">{{ cid }}</a>
                <button type="button" class="cockpit-workspace__link-del" @click="onRemoveChild(cid)">✕</button>
              </span>
            </template>
            <span v-else class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</span>
          </div>
          <div class="cockpit-workspace__link-add">
            <select v-model="newChildId" class="cockpit-workspace__link-select">
              <option value="">{{ t('cockpit.childIdPlaceholder') }}</option>
              <option v-for="tk in candidateTasksForChild" :key="tk.id" :value="tk.id">{{ taskOptionLabel(tk) }}</option>
            </select>
            <button type="button" class="cockpit-workspace__link-add-btn" :disabled="!newChildId" @click="onAddChild">+ {{ t('cockpit.add') }}</button>
          </div>
        </div>

        <!-- 待提交关联变更提示 -->
        <div v-if="pendingLinkAdds.length || pendingLinkRemoves.length" class="cockpit-workspace__pending-hint">
          ⏳ {{ pendingLinkAdds.length + pendingLinkRemoves.length }} {{ t('cockpit.pendingLinksHint') }}
        </div>

        <!-- 附件（即时上传/删除） -->
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

        <!-- Description（暂存草稿） -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.description') }}</label>
          <textarea class="cockpit-workspace__textarea" :value="currentBody"
            :placeholder="t('cockpit.descriptionPlaceholder')"
            @input="onBodyInput" />
        </div>

        <!-- ═══ 动作命令区（即时执行）═══ -->
        <div class="cockpit-workspace__section cockpit-workspace__actions">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.actions') }}</label>
          <div class="cockpit-workspace__action-row">
            <button v-if="task?.status === 'triage'" type="button" class="cockpit-workspace__btn-mini"
              :disabled="actionBusy" @click="doSpecify">✨ {{ t('cockpit.specify') }}</button>
            <button v-if="task?.status === 'triage'" type="button" class="cockpit-workspace__btn-mini"
              :disabled="actionBusy" @click="doDecompose">⚗ {{ t('cockpit.decompose') }}</button>
          </div>
          <div class="cockpit-workspace__action-row">
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('triage')" @click="attemptStatusChange('triage')">→ {{ t('cockpit.moveToTriage') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('ready')" @click="attemptStatusChange('ready')">→ {{ t('cockpit.moveToReady') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('blocked')" @click="attemptStatusChange('blocked')">⚠ {{ t('cockpit.moveToBlocked') }}</button>
            <button v-if="task?.status === 'blocked'" type="button" class="cockpit-workspace__btn-mini"
              @click="doStatusPatch({ status: 'ready' })">{{ t('cockpit.unblock') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini is-pri"
              :disabled="!canMoveTo('done')" @click="attemptStatusChange('done')">✓ {{ t('cockpit.moveToDone') }}</button>
            <button type="button" class="cockpit-workspace__btn-mini"
              :disabled="!canMoveTo('archived')" @click="attemptStatusChange('archived')">📦 {{ t('cockpit.moveToArchived') }}</button>
          </div>
          <div v-if="actionMsg" :class="['cockpit-workspace__action-msg', actionMsg.ok ? 'is-ok' : 'is-err']">
            {{ actionMsg.text }}
          </div>

          <!-- B5/B6 Recovery（仅 running） -->
          <div v-if="task?.status === 'running'" class="cockpit-workspace__sub-section">
            <label class="cockpit-workspace__sub-title">{{ t('cockpit.recovery') }}</label>
            <div class="cockpit-workspace__action-row">
              <button type="button" class="cockpit-workspace__btn-mini"
                :disabled="actionBusy" @click="doReclaim">{{ t('cockpit.reclaim') }}</button>
              <input v-model="reassignProfile" class="cockpit-workspace__link-input"
                :placeholder="t('cockpit.reassignProfile')" style="max-width:160px" />
              <button type="button" class="cockpit-workspace__btn-mini"
                :disabled="actionBusy || !reassignProfile.trim()" @click="doReassign">{{ t('cockpit.reassign') }}</button>
            </div>
          </div>

          <!-- B7 Diagnostics -->
          <div class="cockpit-workspace__sub-section">
            <label class="cockpit-workspace__sub-title">{{ t('cockpit.diagnostics') }}</label>
            <KanbanDiagnosticsSection
              v-if="task"
              :task="task"
              :diagnostics="diagItems"
              :assignees="assigneeList"
              @refresh="refreshDiagnostics" />
          </div>

          <!-- B8 Home-channel 通知订阅 -->
          <div v-if="homeChannels.length" class="cockpit-workspace__sub-section">
            <label class="cockpit-workspace__sub-title">{{ t('cockpit.notifyHomeChannels') }}</label>
            <div class="cockpit-workspace__action-row">
              <button v-for="ch in homeChannels" :key="ch.platform" type="button"
                class="cockpit-workspace__btn-mini"
                :class="{ 'is-on': ch.subscribed }"
                :disabled="homeBusy[ch.platform]"
                @click="toggleHomeSubscription(ch)">
                {{ ch.platform }} · {{ ch.subscribed ? t('cockpit.unsubscribe') : t('cockpit.subscribe') }}
              </button>
            </div>
          </div>
        </div>

        <!-- B3 确认弹窗 -->
        <CockpitConfirmDialog
          :show="!!confirmState?.show"
          :content="confirmState?.content || ''"
          @confirm="confirmStatusChange"
          @cancel="confirmState = null" />
        <!-- B4 完成校验弹窗 -->
        <CockpitCompletionModal
          :show="completionShow"
          @submit="handleCompletionSubmit"
          @cancel="completionShow = false" />

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

        <!-- ═══ 评论区（草稿）═══ -->
        <div class="cockpit-workspace__section">
          <label class="cockpit-workspace__section-title">{{ t('cockpit.comments') }}</label>
          <div class="cockpit-workspace__comment-list">
            <div v-for="c in comments" :key="c.id" class="cockpit-workspace__comment">
              <span class="cockpit-workspace__comment-author">{{ c.author || '?' }}</span>
              <span class="cockpit-workspace__comment-body">{{ c.body }}</span>
            </div>
            <div v-if="!comments.length" class="cockpit-workspace__field-val--muted">{{ t('cockpit.none') }}</div>
          </div>
          <textarea class="cockpit-workspace__textarea"
            :value="pendingComment"
            :placeholder="t('cockpit.addCommentPlaceholder')"
            @input="onCommentInput" />
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
.cockpit-workspace__title-input { font-size: 16px; font-weight: 700; color: var(--text-primary); line-height: 1.4; margin-bottom: 6px; width: 100%; border: none; background: transparent; border-bottom: 1px solid transparent; padding: 2px 0; font-family: inherit;
  &:hover { border-bottom-color: var(--border-color); }
  &:focus { border-bottom-color: var(--accent-primary); outline: none; }
}
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
.cockpit-workspace__task-link { font-family: ui-monospace, monospace; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px;
  a { color: var(--accent-primary); cursor: pointer; &:hover { text-decoration: underline; } }
  &.is-pending-remove { opacity: 0.4; text-decoration: line-through; }
}
.cockpit-workspace__link-del { cursor: pointer; color: var(--text-muted); border: none; background: none; font-size: 10px; padding: 0 1px;
  &:hover { color: var(--error); }
}
.cockpit-workspace__link-add { display: flex; gap: 6px; margin-top: 6px; }
.cockpit-workspace__link-input { flex: 1; font-family: ui-monospace, monospace; font-size: 11px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); }
.cockpit-workspace__link-select { flex: 1; font-family: ui-monospace, monospace; font-size: 11px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); max-width: 100%; }
.cockpit-workspace__link-add-btn { font-family: inherit; font-size: 11px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
}
.cockpit-workspace__pending-hint { font-size: 11px; color: var(--warning); background: rgba(var(--warning-rgb), 0.08); padding: 6px 10px; border-radius: 6px; margin-bottom: 12px; }
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

/* 动作命令区 */
.cockpit-workspace__actions { border-top: 1px solid var(--border-color); padding-top: 12px; }
.cockpit-workspace__action-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.cockpit-workspace__btn-mini { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-workspace__action-msg { font-size: 11px; margin-top: 6px; padding: 4px 8px; border-radius: 4px; }
.cockpit-workspace__action-msg.is-ok { color: var(--success, #52c41a); background: rgba(82,196,26,0.08); }
.cockpit-workspace__action-msg.is-err { color: var(--error); background: rgba(255,77,79,0.08); }
.cockpit-workspace__sub-section { margin-top: 10px; }
.cockpit-workspace__sub-title { display: block; font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }

/* 评论区 */
.cockpit-workspace__comment-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; max-height: 180px; overflow-y: auto; }
.cockpit-workspace__comment { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; background: var(--bg-secondary); border-radius: 6px; font-size: 12px; }
.cockpit-workspace__comment-author { font-weight: 600; color: var(--accent-primary); font-size: 11px; }
.cockpit-workspace__comment-body { color: var(--text-primary); line-height: 1.4; white-space: pre-wrap; }
</style>

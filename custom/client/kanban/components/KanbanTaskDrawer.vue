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
import { decideApproval } from '@/custom/shared/api/approvals'
import { parseTaskRaci, myRaciRole, type TaskRaci } from '@/custom/kanban/utils/raci'
import { getStoredUsername } from '@/api/client'
import KanbanDiagnosticsSection from '@/custom/kanban/components/KanbanDiagnosticsSection.vue'
import KanbanAttachments from '@/custom/kanban/components/KanbanAttachments.vue'
// HERMES_CUSTOM[P3 Task 7] 来源 run 关联区块（任务 → run 反查，ia2/adapters/traceability 纯函数投影）
import RunLinks from '@/custom/ia2/components/RunLinks.vue'
import KanbanHandoffSection from './KanbanHandoffSection.vue'
import { defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
// HERMES_CUSTOM[loop-multiview] 任务↔群弱锚点（ia2/adapters/manage 纯函数）
import { taskRoomPrefix, matchRoomByPrefix, type RoomLike } from '@/custom/ia2/adapters/manage'
const MatrixCreateRoomDialog = defineAsyncComponent(
  () => import('@/custom/matrix-chat/components/MatrixCreateRoomDialog.vue'))

const props = defineProps<{
  show: boolean
  taskId: string | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  close: []
  refresh: []
}>()

import { useKanbanTaskDrawer } from './useKanbanTaskDrawer'

const {
  message,
  dialog,
  roomDialogOpen,
  matchedRoom,
  roomInitialName,
  refreshMatchedRoom,
  gotoTaskRoom,
  loading,
  detail,
  patchErr,
  newComment,
  commentLoading,
  commentListRef,
  editingTitle,
  titleEditValue,
  editingAssignee,
  assigneeEditValue,
  editingPriority,
  priorityEditValue,
  editingBody,
  bodyEditValue,
  reasoningEffortOptions,
  editingModel,
  modelEditValue,
  providerEditValue,
  reasoningEditValue,
  estimating,
  estimate,
  startEditModel,
  saveModel,
  runEstimate,
  compactTokens,
  logData,
  logLoading,
  newParentId,
  newChildId,
  homeChannels,
  homeBusy,
  specifyBusy,
  specifyMsg,
  decomposeBusy,
  decomposeMsg,
  runsExpanded,
  reclaimBusy,
  reclaimMsg,
  reassignBusy,
  reassignMsg,
  showReassignPicker,
  reassignProfile,
  isMaximized,
  drawerWidth,
  task,
  comments,
  events,
  runs,
  links,
  taskDiagnostics,
  assigneeOptions,
  assigneeNames,
  currentUser,
  candidateTasksForParent,
  candidateTasksForChild,
  loadDetail,
  loadDiagnostics,
  toggleHomeSubscription,
  handleClose,
  showCompletionModal,
  completionSummary,
  doPatch,
  handleCompletionSubmit,
  startEditTitle,
  saveTitle,
  startEditAssignee,
  saveAssignee,
  startEditPriority,
  savePriority,
  startEditBody,
  saveBody,
  cancelBodyEdit,
  canMoveTo,
  approvalBusy,
  myRaci,
  raciRows,
  doApproveReview,
  doRejectReview,
  openReviewDiff,
  statusConfirmMessages,
  doSpecify,
  doDecompose,
  doReclaim,
  doReassign,
  addParent,
  removeParent,
  addChild,
  removeChild,
  handleAddComment,
  onCommentKeydown,
  loadLog,
  timeAgo,
  formatBytes,
  eventKindLabel,
  isDiagnosticEvent,
  phantomIdsFromEvent,
  fmtElapsed,
  toggleMaximize,
  statusDotClass,
  t,
} = useKanbanTaskDrawer(props, emit)
</script>


<template>
  <NDrawer
    :show="show"
    :width="drawerWidth"
    placement="right"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent :native-scrollbar="false" closable @close="handleClose" class="kanban-drawer-content" data-testid="kanban-task-drawer">
      <template #header>
        <div class="drawer-header" data-testid="kanban-drawer-header">
          <span class="drawer-task-id">{{ taskId }}</span>
          <div class="drawer-header-actions">
            <NButton
              v-if="matchedRoom"
              size="tiny"
              text
              data-testid="drawer-goto-room"
              @click="gotoTaskRoom"
            >{{ t('kanban.gotoTaskRoom') }}</NButton>
            <NButton
              size="tiny"
              text
              data-testid="drawer-create-room"
              @click="roomDialogOpen = true"
            >{{ t('kanban.createTaskRoom') }}</NButton>
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
        <!-- P2 RACI 四元组（§三）：卡片详情完整 RACI；我的角色描边高亮 -->
        <div v-if="raciRows.length" class="drawer-section" data-testid="drawer-raci">
          <div class="drawer-section-title">{{ t('kanban.raci.title') }}</div>
          <div class="raci-grid">
            <div
              v-for="row in raciRows" :key="row.role"
              class="raci-cell" :class="{ 'raci-cell--mine': myRaci === row.role }"
            >
              <span class="raci-cell__role" :class="`raci-cell__role--${row.role}`">{{ row.role }}</span>
              <div class="raci-cell__body">
                <div class="raci-cell__label">{{ t(row.label) }}</div>
                <div class="raci-cell__members">
                  <template v-if="row.members.length">
                    <span v-for="m in row.members" :key="m" class="raci-member">{{ m }}</span>
                  </template>
                  <span v-else class="raci-member raci-member--empty">—</span>
                </div>
              </div>
            </div>
          </div>
        </div>

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

          <!-- HERMES_CUSTOM[v020] BEGIN: model / provider / reasoning pin -->
          <div class="meta-row">
            <span class="meta-label">{{ t('kanban.form.model', 'Model') }}</span>
            <div v-if="editingModel" class="edit-row edit-row-wide">
              <NInput v-model:value="modelEditValue" size="tiny" :placeholder="t('kanban.form.modelPlaceholder', 'Profile default')" style="width: 140px" />
              <NInput v-model:value="providerEditValue" size="tiny" :placeholder="t('kanban.form.provider', 'Provider')" style="width: 100px" />
              <NSelect
                v-model:value="reasoningEditValue"
                size="tiny"
                :options="reasoningEffortOptions.map(o => ({ label: typeof o.label === 'function' ? o.label() : o.label, value: o.value }))"
                style="width: 110px"
              />
              <NButton size="tiny" type="primary" @click="saveModel">{{ t('common.save') }}</NButton>
            </div>
            <span
              v-else
              class="meta-value editable"
              :title="t('kanban.clickToEdit', 'Click to edit')"
              @click="startEditModel"
            >
              <template v-if="task.model_override">
                {{ task.provider_override ? task.provider_override + ':' : '' }}{{ task.model_override }}{{ task.reasoning_effort ? ' · ' + task.reasoning_effort : '' }}
              </template>
              <template v-else>{{ task.reasoning_effort ? t('kanban.form.profileDefault', 'Profile default') + ' · ' + task.reasoning_effort : t('kanban.form.profileDefault', 'Profile default') }}</template>
            </span>
          </div>

          <div class="meta-row">
            <span class="meta-label">{{ t('kanban.estimate', 'Estimate') }}</span>
            <span v-if="estimate" class="meta-value">
              <template v-if="estimate.ok">~{{ compactTokens(estimate.est_tokens) }} tok · {{ estimate.complexity || '?' }}</template>
              <template v-else class="meta-value-muted">{{ t('kanban.estimateUnavailable', 'unavailable') }}</template>
            </span>
            <NButton size="tiny" :loading="estimating" quaternary @click="runEstimate">
              {{ estimate && estimate.ok ? t('kanban.reestimate', 'Re-estimate') : t('kanban.estimate', 'Estimate') }}
            </NButton>
          </div>
          <!-- HERMES_CUSTOM[v020] END -->

          <div v-if="task.created_by" class="meta-row">
            <span class="meta-label">{{ t('kanban.createdBy', 'Created by') }}</span>
            <span class="meta-value">{{ task.created_by }}</span>
          </div>
        </div>

        <!-- HERMES_CUSTOM[P3 Task 7] BEGIN: 来源 run 关联（loop.persisted 按 taskId 显式反查 → runId 深链） -->
        <RunLinks class="drawer-section" :task-id="task.id" :show="show" />
        <!-- HERMES_CUSTOM[P3 Task 7] END -->

        <!-- B10 交接单（routa 4 类×5 态；载体=评论结构化标记，hermes CLI 写链不变） -->
        <KanbanHandoffSection
          class="drawer-section"
          :task-id="task.id"
          :comments="detail?.comments ?? []"
          @submitted="loadDetail(task.id)"
        />

        <!-- Status Actions -->
        <div class="drawer-section">
          <div class="status-actions">
            <!-- P1 审批（review 态卡）：验收通过 / 打回返工 / 查看变更 -->
            <NButton
              v-if="task.status === 'review'"
              size="small"
              type="primary"
              data-testid="drawer-approve"
              :loading="approvalBusy"
              :disabled="approvalBusy"
              @click="doApproveReview"
            >
              ✓ {{ t('approvals.choice.approve') }}
            </NButton>
            <NButton
              v-if="task.status === 'review'"
              size="small"
              type="error"
              data-testid="drawer-reject"
              :loading="approvalBusy"
              :disabled="approvalBusy"
              @click="doRejectReview"
            >
              ✕ {{ t('approvals.choice.request_changes') }}
            </NButton>
            <NButton
              v-if="task.status === 'review'"
              size="small"
              data-testid="drawer-view-diff"
              @click="openReviewDiff"
            >
              ± {{ t('approvals.viewDiff') }}
            </NButton>
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
            <span class="section-hint">{{ t('kanban.recoveryHint', 'Abort or reroute the active worker') }}</span>
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
            <!-- HERMES_CUSTOM[v020] BEGIN: live-comment-to-running-worker hint -->
            <div v-if="task.status === 'running'" class="comment-live-hint">
              {{ t('kanban.liveCommentHint', 'Notes are delivered to the running worker within seconds — no restart needed.') }}
            </div>
            <!-- HERMES_CUSTOM[v020] END -->
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

    <MatrixCreateRoomDialog
      v-if="roomDialogOpen"
      :initial-name="roomInitialName"
      @close="roomDialogOpen = false; void refreshMatchedRoom()"
    />
  </NDrawer>

  <!-- Completion summary modal -->
  <NModal
    v-model:show="showCompletionModal"
    preset="dialog"
    :title="t('cockpit.completionSummary')"
  >
    <div style="display: flex; flex-direction: column; gap: 8px">
      <p style="font-size: 13px; color: var(--n-text-color-3); margin: 0">
        {{ t('cockpit.completionSummaryHint') }}
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
/* HERMES_CUSTOM[v020] BEGIN */
.edit-row-wide { flex-wrap: wrap; }
.comment-live-hint {
  font-size: 11px;
  color: $text-secondary;
  margin-bottom: 4px;
  padding: 2px 4px;
}
/* HERMES_CUSTOM[v020] END */

.edit-actions {
  display: flex;
  gap: 6px;
}

/* P2 RACI 四元组（§三） */
.drawer-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}
.raci-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}
.raci-cell {
  display: flex;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  align-items: flex-start;
  &--mine { border-color: var(--ia-stale); box-shadow: 0 0 0 1px rgba(var(--warning-rgb), 0.27); }
}
.raci-cell__role {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: var(--text-on-accent);
  font-size: 11px;
  font-weight: 700;
  &--R { background: var(--accent-primary); }
  &--A { background: var(--ia-stale); }
  &--C { background: var(--success); }
  &--I { background: var(--text-muted); }
}
.raci-cell__body { min-width: 0; }
.raci-cell__label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.raci-cell__members {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.raci-member {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-secondary);
  &--empty { opacity: 0.5; }
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
  position: sticky;
  bottom: 0;
  width: 100%;
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

  &--triage { background: var(--accent-muted); }
  &--todo { background: var(--text-muted); }
  &--ready { background: var(--accent-info); }
  &--running { background: var(--warning); }
  &--blocked { background: var(--error); }
  &--done { background: var(--success); }
  &--archived { background: var(--accent-muted); }
}
</style>
<!-- HERMES_CUSTOM[Kanban] END -->

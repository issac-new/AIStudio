// 文件职责：KanbanTaskDrawer 的详情/编辑/审批/诊断/首页频道状态机。
// 拆分纪律：纯移动，无行为变更；props/emit 由 SFC 传入，组件 import 留在 SFC。
import { ref, computed, watch, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import * as kanbanApi from '@/api/hermes/kanban'
import type { KanbanTaskDetail, KanbanTaskStatus, KanbanEvent, KanbanRun, KanbanTaskLog, HomeChannel } from '@/api/hermes/kanban'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { decideApproval } from '@/custom/shared/api/approvals'
import { parseTaskRaci, myRaciRole, type TaskRaci } from '@/custom/kanban/utils/raci'
import { getStoredUsername } from '@/api/client'
import { useRouter } from 'vue-router'
import { taskRoomPrefix, matchRoomByPrefix, type RoomLike } from '@/custom/ia2/adapters/manage'

export interface DrawerProps { show: boolean; taskId: string | null }
export interface DrawerEmit {
  (event: 'update:show', value: boolean): void
  (event: 'close'): void
  (event: 'refresh'): void
}

export function useKanbanTaskDrawer(props: DrawerProps, emit: DrawerEmit) {
  const { t } = useI18n()
  const message = useMessage()
  const dialog = useDialog()
  const store = useKanbanStore()

  const router = useRouter()

  // ── 任务↔群弱锚点（[taskId前8位] 群名前缀约定；不持久化字段） ──
  const roomDialogOpen = ref(false)
  const matchedRoom = ref<RoomLike | null>(null)
  const roomPrefix = computed(() => (props.taskId ? taskRoomPrefix(props.taskId) : ''))
  const roomInitialName = computed(() => `${roomPrefix.value} ${task.value?.title ?? ''}`.trim())

  /**
   * 匹配群刷新（matrix store 动态 import：抽屉在纯 kanban 测试环境不拉 matrix 重图）。
   * 优先级（run15 前置 P4-9）：①卡 body 的 room: 锚行（确定性——主卡派发锚直达讨论群，
   * 派发词要求 agent 建卡时写入）②taskId 前 8 位群名前缀约定（子任务群弱锚点回落）。
   */
  async function refreshMatchedRoom(): Promise<void> {
    matchedRoom.value = null
    if (!props.show || !props.taskId) return
    try {
      const { useMatrixRoomStore } = await import('@/custom/matrix-chat/stores/matrix-room')
      const rooms = useMatrixRoomStore().sortedRooms as RoomLike[]
      // detail 形状是 { task, latest_summary, comments, ... }；正文在 detail.task.body。
      const mAnchor = /(?:^|\n)room:\s*(![A-Za-z0-9._=+-]+:[A-Za-z0-9.-]+)/.exec(
        task.value?.body ?? '')
      if (mAnchor) {
        const hit = rooms.find(r => r.roomId === mAnchor[1])
        matchedRoom.value = hit ?? { roomId: mAnchor[1], name: undefined } as RoomLike
        return
      }
      matchedRoom.value = matchRoomByPrefix(rooms, roomPrefix.value)
    } catch { /* matrix 未初始化：跳群按钮隐藏 */ }
  }
  watch(() => [props.show, props.taskId] as const, () => { void refreshMatchedRoom() }, { immediate: true })

  function gotoTaskRoom(): void {
    if (!matchedRoom.value) return
    void router.push({ name: 'ia2.commsRoom', params: { roomId: matchedRoom.value.roomId } })
    emit('update:show', false)
  }

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

  // HERMES_CUSTOM[v020] BEGIN: model/provider/reasoning pins + estimate
  const reasoningEffortOptions = [
    { label: () => t('kanban.form.profileDefault', 'Profile default'), value: '' },
    ...['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'none'].map(v => ({ label: v, value: v })),
  ]
  const editingModel = ref(false)
  const modelEditValue = ref('')
  const providerEditValue = ref('')
  const reasoningEditValue = ref('')
  const estimating = ref(false)
  const estimate = ref<kanbanApi.KanbanEstimateResult | null>(null)

  function startEditModel() {
    if (!task.value) return
    modelEditValue.value = task.value.model_override || ''
    providerEditValue.value = task.value.provider_override || ''
    reasoningEditValue.value = task.value.reasoning_effort || ''
    editingModel.value = true
  }

  async function saveModel() {
    if (!task.value) return
    const patch: kanbanApi.KanbanTaskPatch = {}
    const model = modelEditValue.value.trim()
    const prevModel = task.value.model_override || ''
    if (model) {
      if (model !== prevModel) patch.model_override = model
      if (providerEditValue.value.trim() !== (task.value.provider_override || '')) {
        patch.provider_override = providerEditValue.value.trim()
      }
    } else if (prevModel) {
      patch.clear_model_override = true
    }
    if (reasoningEditValue.value !== (task.value.reasoning_effort || '')) {
      if (!reasoningEditValue.value) patch.clear_reasoning_effort = true
      else patch.reasoning_effort = reasoningEditValue.value
    }
    editingModel.value = false
    if (Object.keys(patch).length) await doPatch(patch)
  }

  async function runEstimate() {
    if (!task.value || estimating.value) return
    estimating.value = true
    try {
      estimate.value = await store.estimateTask(task.value.id)
    } catch (err: any) {
      estimate.value = { ok: false, reason: err?.message || 'estimate failed' }
    } finally {
      estimating.value = false
    }
  }

  function compactTokens(n?: number): string {
    if (n == null) return '?'
    if (n < 1000) return String(n)
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  // HERMES_CUSTOM[v020] END

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

  // 2026-10-31 回归清偿：immediate——板页在抽屉挂载前已设好选中任务时（恢复态竞态，
  // 走查 4 开 2 败交替复现），非 immediate watch 错过 show/taskId 翻转→loadDetail
  // 从不执行→抽屉停在「加载任务失败」NEmpty 兜底（loading=false/detail=null 假象）。
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
  }, { immediate: true })

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
      void refreshMatchedRoom()   // body room: 锚依赖 detail 在位（P4-9）
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
      const updated = await store.patchTask(task.value.id, patch)
      // 2026-10-31 回归清偿：PATCH 响应即回填（乐观同步）——loadDetail 回包慢时
      // 状态标签滞后肉眼可见；先落响应态，loadDetail 回包再补全其余面。
      if (detail.value && updated?.id === detail.value.task?.id) {
        detail.value = { ...detail.value, task: { ...detail.value.task, ...updated } }
      }
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
      message.warning(t('cockpit.completionSummaryRequired'))
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
      case 'blocked': return s === 'running' || s === 'ready' || s === 'review'
      case 'done': return s === 'running' || s === 'ready' || s === 'blocked' || s === 'review'
      case 'archived': return s !== 'archived'
      default: return false
    }
  }

  // P1 审批动作（2026-09-28 产品 UI 缺陷修复 §二）：review 态卡的验收/打回/看差异。
  // 决策先落审批历史（/api/approvals kanban: 前缀 = 纯记账），再走既有状态迁移。
  const approvalBusy = ref(false)
  // P2 RACI 四元组（§三）：结构化 raci（417 列/body-JSON）解析；我的角色高亮。
  const raciOf = computed<TaskRaci | null>(() => parseTaskRaci(task.value))
  const myRaci = computed(() => myRaciRole(raciOf.value, getStoredUsername()))
  const raciRows = computed(() => raciOf.value ? ([
    { role: 'R' as const, label: 'kanban.raci.responsible', members: raciOf.value.responsible },
    { role: 'A' as const, label: 'kanban.raci.approver', members: raciOf.value.approver },
    { role: 'C' as const, label: 'kanban.raci.consulted', members: raciOf.value.consulted },
    { role: 'I' as const, label: 'kanban.raci.informed', members: raciOf.value.informed },
  ]) : [])
  async function decideKanbanApproval(decision: 'approve' | 'request_changes'): Promise<boolean> {
    if (!task.value || approvalBusy.value) return false
    approvalBusy.value = true
    try {
      await decideApproval(`kanban:${task.value.id}`, decision, undefined, task.value.title)
      return true
    } catch { return false } finally { approvalBusy.value = false }
  }
  async function doApproveReview(): Promise<void> {
    if (!await decideKanbanApproval('approve')) return
    await doPatch({ status: 'done' })
  }
  async function doRejectReview(): Promise<void> {
    if (!await decideKanbanApproval('request_changes')) return
    await doPatch({ status: 'blocked' })
  }
  function openReviewDiff(): void {
    const taskId = task.value?.id
    void router.push({ name: 'ide.shell', query: taskId ? { task: taskId } : {} })
  }

  // 确认文案走 cockpit 命名空间既有键（zh/en 双语在案；kanban.* 无此键，
  // 旧引用吃英文内联回退=中文界面显英文，2026-09-19 C2 走查抓获）
  const statusConfirmMessages: Record<string, string> = {
    done: t('cockpit.confirmDone'),
    archived: t('cockpit.confirmArchive'),
    blocked: t('cockpit.confirmBlocked'),
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

  return {
    message, dialog, roomDialogOpen, matchedRoom, roomInitialName, refreshMatchedRoom, gotoTaskRoom, loading, detail, patchErr, newComment, commentLoading, commentListRef, editingTitle, titleEditValue, editingAssignee, assigneeEditValue, editingPriority, priorityEditValue, editingBody, bodyEditValue, reasoningEffortOptions, editingModel, modelEditValue, providerEditValue, reasoningEditValue, estimating, estimate, startEditModel, saveModel, runEstimate, compactTokens, logData, logLoading, newParentId, newChildId, homeChannels, homeBusy, specifyBusy, specifyMsg, decomposeBusy, decomposeMsg, runsExpanded, reclaimBusy, reclaimMsg, reassignBusy, reassignMsg, showReassignPicker, reassignProfile, isMaximized, drawerWidth, task, comments, events, runs, links, taskDiagnostics, assigneeOptions, assigneeNames, currentUser, candidateTasksForParent, candidateTasksForChild, loadDetail, loadDiagnostics, toggleHomeSubscription, handleClose, showCompletionModal, completionSummary, doPatch, handleCompletionSubmit, startEditTitle, saveTitle, startEditAssignee, saveAssignee, startEditPriority, savePriority, startEditBody, saveBody, cancelBodyEdit, canMoveTo, approvalBusy, myRaci, raciRows, doApproveReview, doRejectReview, openReviewDiff, statusConfirmMessages, doSpecify, doDecompose, doReclaim, doReassign, addParent, removeParent, addChild, removeChild, handleAddComment, onCommentKeydown, loadLog, timeAgo, formatBytes, eventKindLabel, isDiagnosticEvent, phantomIdsFromEvent, fmtElapsed, toggleMaximize, statusDotClass, t,
  }
}

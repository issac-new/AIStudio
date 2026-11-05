// 文件职责：cockpit 弹窗切片（标题详情/RunTrace/kanban 详情三弹窗开关与装载）。
// 拆分纪律：纯移动，无行为变更；refs 与跨切片函数以依赖注入传入。
import { ref, type Ref } from 'vue'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'

export interface DialogSliceDeps {
  titleDetailOpen: Ref<boolean>
  titleDetailText: Ref<string>
  titleDetailTaskId: Ref<string | null>
  runTraceOpen: Ref<boolean>
  runTraceTaskId: Ref<string | null>
  runTraceSessionId: Ref<string | null>
  runTraceRunId: Ref<string | null>
  kanbanDetailOpen: Ref<boolean>
  kanbanDetailTask: Ref<KanbanTaskDetail | null>
  selectTask: (id: string) => Promise<void>
  detailCache: Ref<Record<string, KanbanTaskDetail>>
  getTasks: () => Array<{ id: string; title: string; assignee: string; status: string; createdAt: number; workspace: string; tenant: string }>
}

export function createCockpitDialogSlice(deps: DialogSliceDeps) {
  const { titleDetailOpen, titleDetailText, titleDetailTaskId, runTraceOpen, runTraceTaskId, runTraceSessionId, runTraceRunId, kanbanDetailOpen, kanbanDetailTask, selectTask, detailCache: _detailCache, getTasks } = deps
  // task title 详情弹窗（双击查看完整 title）（需求 #2）
  // 通用详情弹窗标题（区分"任务标题"/"事件详情"等）
  const titleDetailTitle = ref('任务标题')
  function openTitleDetail(taskId: string, text: string, title: string = '任务标题') {
    titleDetailTaskId.value = taskId
    titleDetailText.value = text
    titleDetailTitle.value = title
    titleDetailOpen.value = true
  }
  function closeTitleDetail() {
    titleDetailOpen.value = false
    titleDetailTaskId.value = null
    titleDetailText.value = ''
  }
  function openRunTrace(input: { taskId?: string | null; sessionId: string; runId?: string | null }) {
    runTraceTaskId.value = input.taskId ?? null
    runTraceSessionId.value = input.sessionId
    runTraceRunId.value = input.runId ?? null
    runTraceOpen.value = true
  }
  function closeRunTrace() {
    runTraceOpen.value = false
  }
  /** Open RunTrace from global entry point (TopBar button).
   * 统一进入全局聚合视图（所有跨任务会话聚合图）；
   * 由 overview 承载检索与下钻，用户在图中选择会话后切到单会话详细视图。
   */
  function openRunTraceGlobal() {
    openRunTrace({ sessionId: '' }) // Empty sessionId signals "show overview"
  }
  // kanban 详情弹窗：取完整 KanbanTaskDetail（含 comments/events/runs 等）
  // 双击协作图节点打开弹窗时，先 selectTask 联动选中状态——这样右侧 Workspace
  // 文件面板的 Home 目录会跟随该任务的 workspace_path（CockpitFilePanel 监听
  // selectionSeq 同步 workspaceRoot），避免「弹窗显示任务 A 的 workspace，
  // 但文件面板仍停留在之前选中任务 B 的目录」。
  const detailExpanded = ref(false)  // 弹窗"更多信息"折叠态
  async function openKanbanDetail(taskId: string) {
    // 先联动选中：刷新 detail cache（含最新 workspace_path）并触发 workspace 面板同步
    await selectTask(taskId)
    const detail = _detailCache.value[taskId]
    if (detail) {
      kanbanDetailTask.value = detail
      kanbanDetailOpen.value = true
    } else {
      // selectTask 已尝试拉取 detail；若仍无缓存（拉取失败），用 CockpitTask 基本信息兜底
      const t = getTasks().find(x => x.id === taskId)
      if (t) {
        kanbanDetailTask.value = {
          task: {
            id: t.id, title: t.title, body: null, assignee: t.assignee === '未分配' ? null : t.assignee,
            status: t.status, priority: 0, created_by: null, created_at: t.createdAt,
            started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: t.workspace,
            tenant: t.tenant, project_id: null, result: null, skills: null, latest_summary: null,
          } as any,
          latest_summary: null, comments: [], events: [], runs: [],
        } as KanbanTaskDetail
        kanbanDetailOpen.value = true
      }
    }
    detailExpanded.value = false  // 打开时默认折叠"更多信息"
  }
  function closeKanbanDetail() {
    kanbanDetailOpen.value = false
    kanbanDetailTask.value = null
  }

  return {
    titleDetailTitle, detailExpanded,
    openTitleDetail, closeTitleDetail,
    openRunTrace, closeRunTrace, openRunTraceGlobal,
    openKanbanDetail, closeKanbanDetail,
  }
}

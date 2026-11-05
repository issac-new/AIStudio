// 文件职责：cockpit 工作项草稿切片（localStorage 暂存/清空/并发提交）。
// 拆分纪律：纯移动，无行为变更；store 状态以 getter/ref 注入。
import type { Ref } from 'vue'
import * as kv from '@/custom/shared/store/cockpit-kv'
import * as kanbanApi from '@/api/hermes/kanban'

export interface WorkItemSliceDeps {
  getSelectedTaskId: () => string | null
  getSelectedTask: () => any
  boardSlugOf: (id: string) => string | undefined
  loadTaskDetail: (id: string) => Promise<void>
  loadAttachments: (id: string) => void
  bumpKv: () => void
  detailCache: Ref<Record<string, any>>
  taskAttachments: Ref<Record<string, any>>
}

export function createCockpitWorkItemSlice(deps: WorkItemSliceDeps) {
  const { getSelectedTaskId, getSelectedTask, boardSlugOf, loadTaskDetail, loadAttachments, bumpKv, detailCache: _detailCache, taskAttachments } = deps
  // ── 工作项 ──
  function updateWorkItem(patch: Partial<DraftWorkItem>) {
    const id = getSelectedTaskId()
    if (!id) return
    kv.saveDraft(id, patch)
    bumpKv()
  }
  function toggleRiskTag(tag: string) {
    const id = getSelectedTaskId()
    if (!id) return
    const cur = kv.loadDraft(id)
    if (!cur) return
    const i = cur.riskTags.indexOf(tag)
    if (i >= 0) {
      cur.riskTags.splice(i, 1)
    } else {
      cur.riskTags.push(tag)
    }
    kv.saveDraft(id, { riskTags: cur.riskTags })
    bumpKv()
  }

	  function autoSaveDraft() {
	    bumpKv()
	  }

	  /** 一键还原：清除当前任务草稿，恢复原始值 */
	  function clearDraft() {
	    const id = getSelectedTaskId()
	    if (!id) return
	    kv.clearDraft(id)
	    bumpKv()
	  }

  // ── Area 2 草稿暂存方法（不调用 API，仅写 localStorage）──
  function setPendingAssignee(profile: string | null) {
    const id = getSelectedTaskId()
    if (!id) return
    kv.saveDraft(id, { pendingAssignee: profile })
    bumpKv()
  }
  function setPendingPriority(p: number) {
    const id = getSelectedTaskId()
    if (!id) return
    kv.saveDraft(id, { pendingPriority: p })
    bumpKv()
  }
  function setPendingBody(body: string) {
    const id = getSelectedTaskId()
    if (!id) return
    kv.saveDraft(id, { pendingBody: body })
    bumpKv()
  }
  function setPendingTitle(v: string) {
    const id = getSelectedTaskId()
    if (!id) return
    kv.saveDraft(id, { pendingTitle: v })
    bumpKv()
  }
  function setPendingComment(v: string) {
    const id = getSelectedTaskId()
    if (!id) return
    kv.saveDraft(id, { pendingComment: v })
    bumpKv()
  }
  function addPendingLink(link: kv.PendingLink) {
    const id = getSelectedTaskId()
    if (!id) return
    const cur = kv.loadDraft(id)
    const adds = cur?.pendingLinkAdds ?? []
    if (!adds.some(l => l.parent === link.parent && l.child === link.child)) {
      kv.saveDraft(id, { pendingLinkAdds: [...adds, link] })
      bumpKv()
    }
  }
  function removePendingLink(link: kv.PendingLink) {
    const id = getSelectedTaskId()
    if (!id) return
    const cur = kv.loadDraft(id)
    const removes = cur?.pendingLinkRemoves ?? []
    if (!removes.some(l => l.parent === link.parent && l.child === link.child)) {
      kv.saveDraft(id, { pendingLinkRemoves: [...removes, link] })
      bumpKv()
    }
  }

  async function submitWorkItem() {
    const id = getSelectedTaskId()
    const draft = id ? kv.loadDraft(id) : null
    if (!id || !draft) return
    const board = boardSlugOf(id)
    const boardOpts = board ? { board } : undefined
    // 收集所有待执行操作，并发提交
    const ops: Promise<unknown>[] = []
    // 1. Area 2 字段变更：patchTask（仅在草稿中有 pending 字段时）
    const patch: kanbanApi.KanbanTaskPatch = {}
    if (draft.pendingAssignee !== undefined) patch.assignee = draft.pendingAssignee
    if (draft.pendingPriority !== undefined) patch.priority = draft.pendingPriority
    if (draft.pendingBody !== undefined) patch.body = draft.pendingBody
    // 标题（仅当与当前标题不同才提交）
    if (draft.pendingTitle !== undefined && draft.pendingTitle !== (getSelectedTask()?.title ?? '')) {
      patch.title = draft.pendingTitle
    }
    if (Object.keys(patch).length) {
      ops.push(kanbanApi.patchTask(id, patch, boardOpts))
    }
    // 2. 父子关联变更
    for (const link of draft.pendingLinkAdds ?? []) {
      ops.push(kanbanApi.linkTasks({ parent_id: link.parent, child_id: link.child }, boardOpts))
    }
    for (const link of draft.pendingLinkRemoves ?? []) {
      ops.push(kanbanApi.unlinkTasks({ parent_id: link.parent, child_id: link.child }, boardOpts))
    }
    // 3. 始终提交决策评论
    const text = `[决策:${draft.decision}] 风险:${draft.riskTags.join(',')} ${draft.opinion}`.trim()
    ops.push(kanbanApi.addComment(id, { body: text }, boardOpts))
    // 4. 用户自由评论（非空时额外一条，与决策评论并存）
    if (draft.pendingComment && draft.pendingComment.trim()) {
      ops.push(kanbanApi.addComment(id, { body: draft.pendingComment }, boardOpts))
    }
    // 并发执行，单个失败不阻塞其他
    await Promise.allSettled(ops)
    kv.clearDraft(id)
    bumpKv()
    delete _detailCache.value[id]
    await loadTaskDetail(id)
    // 刷新附件列表
    if (taskAttachments.value[id]) {
      const newVal = { ...taskAttachments.value }
      delete newVal[id]
      taskAttachments.value = newVal
      loadAttachments(id).catch(() => {})
    }
  }


  return {
    updateWorkItem, toggleRiskTag, autoSaveDraft, clearDraft, setPendingAssignee, setPendingPriority, setPendingBody, setPendingTitle, setPendingComment, addPendingLink, removePendingLink, submitWorkItem,
  }
}

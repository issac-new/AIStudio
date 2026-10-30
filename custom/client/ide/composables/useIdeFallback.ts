// custom/client/ide/composables/useIdeFallback.ts
// IDE「未物化任务工作区」兜底视图的判定纯函数（2026-10-30 run23 复盘续作）。
//
// 背景：`/app/ide?task=<id>` 在任务工作区未物化（目录已回收/未派发）时只显示
// 「还没有任务工作区」，任务简报抽屉自动收起、文件区零内容——编码面在产品里
// 是死胡同空态。兜底视图要回答三件事：任务是谁、任务卡是什么、能看哪些文件。
//
// 四态语义与 noWorkspaceHint 对齐（useIdeWorkspace.ts）：
//   resolving      任务/工作区还在解析（不提前下结论）
//   not_found      任务不存在或无权访问 → 明确文案 + 看板入口，不渲染文件树
//   resolve_error  解析服务故障（HTTP ≥500/网络）→ 失败文案 + 重试，不渲染文件树
//   unmaterialized 任务在、工作区未物化 → 只读文件视图（任务目录/服务器默认根）
//   ready          工作区已物化（兜底视图不出现）
//   no_task        没有激活任务（兜底视图不出现；保留给空态测试与复用）
import type { BriefingTask } from '../components/briefing-types'
import { parseRaciFromTask } from '../components/briefing-types'

export type IdeFallbackKind = 'no_task' | 'resolving' | 'not_found' | 'resolve_error' | 'unmaterialized' | 'ready'

export interface IdeFallbackInput {
  /** 深链绑定的任务 id / 任务号（null=没有激活任务）。 */
  requestedId: string | null
  /** 任务卡解析结果（null=未解析到）。 */
  task: BriefingTask | null
  /** 任务卡解析已结束（false=在途；避免把「正在查」渲染成「不存在」）。 */
  taskSettled: boolean
  /** 任务卡解析结论=不存在/无权。 */
  taskMiss: boolean
  /** 任务卡解析瞬时失败（超时/5xx/网络）——是解析故障，不是「未物化」，更不是「不存在」。 */
  taskError?: { status: number } | null
  /** /api/ide/task-workspace 结果（materialized=false 即未物化）。 */
  workspace: { materialized: boolean } | null
  /** 工作区解析失败原因（status=0 表示非 HTTP 异常）。 */
  workspaceError: { status: number } | null
  /** 工作区解析已结束。 */
  workspaceSettled: boolean
}

/** 兜底视图状态（纯函数，组件与单测同源）。 */
export function ideFallbackStateOf(input: IdeFallbackInput): IdeFallbackKind {
  if (!input.requestedId) return 'no_task'
  if (!input.taskSettled || !input.workspaceSettled) return 'resolving'
  if (input.taskMiss) return 'not_found'
  // 任务卡都没解析出来（超时/5xx）：不能按「未物化」兜底——那会把解析故障渲染成
  // 「任务在、只是没工作区」，甚至误出默认根文件树（2026-10-30 走查实锤）。
  if (input.taskError) return 'resolve_error'
  const status = input.workspaceError?.status ?? 0
  if (status > 0) return 'resolve_error'
  if (input.workspace?.materialized) return 'ready'
  // 任务在、工作区不在（未派发/已回收/无 workspace_path）：走只读兜底
  return 'unmaterialized'
}

/** 任务号形态（DEV-CHWX-S1 / RFD-001 这类大写编号；t_xxx 卡 id 不参与标题匹配）。 */
const TASK_NUMBER_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/

export function looksLikeTaskNumber(id: string): boolean {
  return TASK_NUMBER_RE.test(id.trim())
}

/**
 * 标题前缀是否命中任务号（用于「按任务号解析」）：要求号后紧跟非字母数字，
 * 防 DEV-CHWX-S1 误命中 DEV-CHWX-S10。
 */
export function titleMatchesTaskNumber(title: string, taskNumber: string): boolean {
  const t = title.trim().toLowerCase()
  const n = taskNumber.trim().toLowerCase()
  if (!n || !t.startsWith(n)) return false
  const next = t.slice(n.length, n.length + 1)
  return next === '' || !/[a-z0-9]/.test(next)
}

const RUN_MARK_RE = /\bRUN\s*[=:：]\s*([A-Za-z0-9][\w.-]*)/

/** RUN 标记（任务标题/正文里的 RUN=<runId>）——编码面帧要能看出属于哪一轮推演。 */
export function runMarkOf(task: Pick<BriefingTask, 'title' | 'body'> | null): string | null {
  if (!task) return null
  const hit = `${task.title ?? ''}\n${task.body ?? ''}`.match(RUN_MARK_RE)
  return hit?.[1] ?? null
}

/** 主负责人：RACI 的 R 优先（parseRaciFromTask 已把 assignee 归入 R），再回退 A；无标注不猜。 */
export function primaryOwnerOf(task: BriefingTask | null): string | null {
  if (!task) return null
  const raci = parseRaciFromTask(task)
  return raci.responsible[0] ?? raci.approver[0] ?? null
}

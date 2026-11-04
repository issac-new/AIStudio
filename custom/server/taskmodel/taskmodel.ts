// custom/server/taskmodel：任务模型读模型 v1（2026-11-04 W3 轮）。
//
// 来源：vivo《面向技术产品经理的 Agent Harness 设计》03 节——Task/Run/Artifact/
// Conversation 四对象分离，任务对象须有 schemaVersion/inputRefs(带版本)/
// workflowVersion 引用语义。盘点现状（调研轮实证）：tasks/task_runs 双表成熟，
// 但 inputRefs/artifactRefs/workflowVersion/schemaVersion 全仓未建模，只能靠
// attachments/metadata 约定拼。本域先立「读模型」：从 kanban-task-fast 详情
// 纯函数派生 TaskModel v1，缺字段标 available 细项（null 不猜）——写路径
// （run 开启时 input_manifest 冻结）需 kanban_db patch 通道，本轮不做（见 spec）。
import type { KanbanTaskFastDetail } from '../services/hermes/kanban-task-fast'

/** 输入引用：来源对象 + 版本 + 内容指纹（能拿到的面；拿不到=缺席）。 */
export interface TaskInputRef {
  type: 'attachment' | 'task-body' | 'missing'
  id: string
  /** 输入版本（attachments 表无版本列——如实缺席）。 */
  version?: string
  sha256?: string
}

export interface TaskModelRun {
  runId: string
  status?: string
  outcome?: string
  summary?: string
  startedAt?: number | null
  endedAt?: number | null
}

export interface TaskModelArtifactRef {
  kind: 'metadata-artifact' | 'receipt-artifact'
  ref: string
  sha256?: string
}

export interface TaskModel {
  schemaVersion: 1
  taskId: string
  /** 业务目标（近似面：task.title+body 首段；独立 userGoal 字段仓内不存在）。 */
  userGoal: string
  inputRefs: TaskInputRef[]
  /** 编排版本（workflow_template_id 直读；未配置=缺席不猜）。 */
  workflowVersion?: string
  artifactRefs: TaskModelArtifactRef[]
  runs: TaskModelRun[]
  /** 会话引用（tasks.session_id 列；缺席=null）。 */
  conversation: { sessionId: string | null }
  /** 可用性细项：哪些字段面真正取到了（fail-soft 透明度）。 */
  available: {
    workflowVersion: boolean
    inputVersions: boolean
    artifacts: boolean
    runs: boolean
  }
}

/** 纯函数派生：详情 → TaskModel。不 IO、不猜数。 */
export function deriveTaskModel(detail: KanbanTaskFastDetail): TaskModel | null {
  const task = detail?.task
  if (!task || typeof task.id !== 'string') return null

  const title = typeof task.title === 'string' ? task.title : ''
  const body = typeof task.body === 'string' ? bodyFirstParagraph(task.body) : ''
  const userGoal = [title, body].filter(Boolean).join('——') || title

  // 输入引用：attachments（快道详情未含——如实缺席）+ task body 兜底（任务文本即输入面）
  const inputRefs: TaskInputRef[] = []
  if (body) inputRefs.push({ type: 'task-body', id: `${task.id}:body` })
  if (inputRefs.length === 0) inputRefs.push({ type: 'missing', id: `${task.id}:none` })

  const workflowVersion = typeof task.workflow_template_id === 'string' && task.workflow_template_id.trim()
    ? task.workflow_template_id
    : undefined

  const runs: TaskModelRun[] = (detail.runs ?? [])
    .filter((r) => r && typeof r.id !== 'undefined')
    .map((r) => ({
      runId: String(r.id),
      ...(typeof r.status === 'string' ? { status: r.status } : {}),
      ...(typeof r.outcome === 'string' ? { outcome: r.outcome } : {}),
      ...(typeof r.summary === 'string' && r.summary ? { summary: r.summary } : {}),
      ...(r.started_at !== undefined ? { startedAt: r.started_at as number | null } : {}),
      ...(r.ended_at !== undefined ? { endedAt: r.ended_at as number | null } : {}),
    }))

  // 产物引用：run metadata.artifacts（路径数组）+ 完成回执 artifacts（path+sha256）
  const artifactRefs: TaskModelArtifactRef[] = []
  for (const run of detail.runs ?? []) {
    const meta = run?.metadata
    if (meta && typeof meta === 'object' && Array.isArray((meta as Record<string, unknown>).artifacts)) {
      for (const a of (meta as Record<string, unknown>).artifacts as unknown[]) {
        if (typeof a === 'string' && a) artifactRefs.push({ kind: 'metadata-artifact', ref: a })
      }
    }
    const receipt = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).completion_receipt : null
    if (receipt && typeof receipt === 'object' && Array.isArray((receipt as Record<string, unknown>).artifacts)) {
      for (const a of (receipt as Record<string, unknown>).artifacts as Array<Record<string, unknown>>) {
        if (typeof a?.path === 'string' && a.path) {
          artifactRefs.push({
            kind: 'receipt-artifact',
            ref: a.path,
            ...(typeof a.sha256 === 'string' ? { sha256: a.sha256 } : {}),
          })
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    taskId: task.id,
    userGoal,
    inputRefs,
    ...(workflowVersion ? { workflowVersion } : {}),
    artifactRefs,
    runs,
    conversation: { sessionId: typeof task.session_id === 'string' && task.session_id ? task.session_id : null },
    available: {
      workflowVersion: Boolean(workflowVersion),
      inputVersions: false, // attachments 无版本列——如实声明缺席（写路径冻结挂账）
      artifacts: artifactRefs.length > 0,
      runs: runs.length > 0,
    },
  }
}

function bodyFirstParagraph(body: string): string {
  const first = body.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? ''
  return first.slice(0, 120)
}

// overlay/custom/server/governance/offboard-handover.ts
// 数字员工批一 Task 7：离职移交的逐卡改派核实（只读）。
//
// 改派写路径不在此处——界面调既有看板改派接口 POST /api/hermes/kanban/:id/reassign
//（规格 D10/D13：写操作继续走唯一通道，离职端点只读核实后记账）。本模块只做
// 核实：逐卡取当前指派对象，与预期接手执行单元比较；查不到如实标「任务不存在
// 或不可读」，不猜数（fail-soft 不造假）。
import { fetchTaskTitleAndBodyByTaskId } from '../kanban/dispatch-readiness'

export interface TaskHandoverRow {
  taskId: string
  /** 核实到的原指派对象（仅在「未改派」时携带——仍挂在原对象上）；已改派/不可读为 null */
  before: string | null
  /** 核实到的当前指派对象（仅在「已改派」时等于预期接手执行单元）；否则为 null */
  after: string | null
  reassigned: boolean
  note: string
}

/** 逐卡核实当前指派对象。fetchAssignee 可注入（测试替身）；缺省用看板只读查询
 *  取 assignee。单卡查询失败不中止其余卡——按「不可读」如实记录。 */
export async function verifyTaskHandover(
  taskIds: string[],
  expectedProfile: string,
  fetchAssignee?: (taskId: string) => Promise<string | null>,
): Promise<TaskHandoverRow[]> {
  const fetcher = fetchAssignee
    ?? (async (taskId: string): Promise<string | null> => (await fetchTaskTitleAndBodyByTaskId(taskId))?.assignee ?? null)
  const rows: TaskHandoverRow[] = []
  for (const taskId of taskIds) {
    let assignee: string | null = null
    let unreadable = false
    try {
      assignee = await fetcher(taskId)
    } catch {
      unreadable = true
    }
    if (unreadable || assignee === null) {
      rows.push({ taskId, before: null, after: null, reassigned: false, note: '任务不存在或不可读' })
      continue
    }
    if (assignee === expectedProfile) {
      rows.push({ taskId, before: null, after: assignee, reassigned: true, note: `已改派至 ${expectedProfile}（服务端核实）` })
    } else {
      rows.push({ taskId, before: assignee, after: null, reassigned: false, note: `未改派（当前指派：${assignee}）` })
    }
  }
  return rows
}

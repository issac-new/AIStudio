// overlay/custom/client/matrix-teams/task-tree.ts
// M-B 任务树：子任务 fan-out 构造（parentId 继承）+ 父任务状态投影（纯函数）。
import type { AssignContent, ReceiptContent } from './protocol'

export interface SubtaskSpec {
  title: string
  body?: string
  priority?: string
  capability?: string[]
  target: { account: string; agentTeam?: string; profile?: string }
  /** 缺省继承父任务的 phase / dueAt（MVP 计划 §4 M-B：拆解即继承上下文）。 */
  phase?: string
  dueAt?: number
  dependsOn?: string[]
}

/** 供测试注入的确定性 id 生成器；生产默认 crypto.randomUUID。 */
export type TaskIdGen = () => string

/**
 * 拆解 fan-out：父任务 → N 张子任务 assign。
 * 每张子任务：taskId 唯一、parentId = 父 taskId、phase/dueAt 缺省继承、其余按 spec。
 */
export function buildSubtaskAssigns(
  parent: { taskId: string; phase?: string; dueAt?: number },
  subs: readonly SubtaskSpec[],
  issuedBy: string,
  idGen: TaskIdGen = () => crypto.randomUUID(),
): AssignContent[] {
  return subs.map(sub => ({
    taskId: idGen(),
    title: sub.title,
    body: sub.body,
    priority: sub.priority,
    dueAt: sub.dueAt ?? parent.dueAt,
    parentId: parent.taskId,
    capability: sub.capability,
    phase: sub.phase ?? parent.phase,
    dependsOn: sub.dependsOn,
    target: {
      account: sub.target.account,
      agentTeam: sub.target.agentTeam,
      profile: sub.target.profile,
    },
    issuedBy,
    issuedAt: Date.now(),
  }))
}

export type ParentProjection = 'waiting' | 'in-progress' | 'review-ready' | 'blocked'

/**
 * 父任务状态投影（M-B 验收门 2）：
 * - 无子回执 → waiting（等待子任务落地）；
 * - 任一 failed → blocked；
 * - 全部 done → review-ready（父任务进待评审）；
 * - 其余 → in-progress。
 * 幂等语义同回执投影：调用方应先按 taskId 去重取最新，本函数不做去重。
 */
export function projectParentStatus(children: readonly ReceiptContent[]): ParentProjection {
  if (children.length === 0) return 'waiting'
  if (children.some(c => c.status === 'failed')) return 'blocked'
  if (children.every(c => c.status === 'done')) return 'review-ready'
  return 'in-progress'
}

// custom/server/matrix/task-protocol.ts
// matrix-teams 任务协议的服务端镜像（边界设计 §2/§6-T2）：服务端自动派发
// （raci-dispatch）发出的协作信号必须是协议事件（task.assign），供跨机协议消费方
// （matrix-teams 客户端、远端 agent bot）统一识别；人读摘要（m.text）只是通知，
// 不承担协作语义。协议事件在服务端的唯一常量源即本文件。
//
// 事件类型字符串与 AssignContent 字段镜像自
// custom/client/matrix-teams/protocol.ts 的 v1 稳定面（TASK_EVENT_TYPES/AssignContent）；
// v2 新增字段（parentId/capability/phase/dependsOn）不镜像——协议 v2 在途
// （417c5d7 草稿未验证），落地后由守门测试对账同步。
// 守门：__tests__/task-protocol-guard.test.ts 与客户端常量做字符串对账，漂移即 fail。

export const TASK_ASSIGN_EVENT_TYPE = 'com.swarmstudio.task.assign'
export const TASK_RECEIPT_EVENT_TYPE = 'com.swarmstudio.task.receipt'

/** AssignContent v1 稳定字段（与客户端 protocol.ts:71-88 对齐，v2 字段待协议落地） */
export interface AssignEventContent {
  taskId: string
  title: string
  body?: string
  priority?: string
  dueAt?: number
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
  issuedAt: number
}

export function buildAssignContent(params: {
  taskId: string
  title: string
  body?: string
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
}): AssignEventContent {
  return { ...params, issuedAt: Date.now() }
}

// custom/server/matrix/task-protocol.ts
// matrix-teams 任务协议的服务端镜像（边界设计 §2/§6-T2）：服务端自动派发
// （raci-dispatch）发出的协作信号必须是协议事件（task.assign），供跨机协议消费方
// （matrix-teams 客户端、远端 agent bot）统一识别；人读摘要（m.text）只是通知，
// 不承担协作语义。协议事件在服务端的唯一常量源即本文件。
//
// 事件类型字符串与 AssignContent 字段镜像自 custom/client/matrix-teams/protocol.ts
// （协议 v2 已收口：45/45 守门绿后于 2026-09-25 同步镜像 v2 面——
// parentId/capability/phase/dependsOn 四可选字段；agent.message/agent.profile 类型
// 2026-09-29 v14 统一聊天 P2D 起镜像：ChatBridge 出向徽章与能力声明移入服务端，
// 服务端不再只发 assign）。
// 守门：__tests__/task-protocol-guard.test.ts 与客户端常量做字符串对账，漂移即 fail。

export const TASK_ASSIGN_EVENT_TYPE = 'com.swarmstudio.task.assign'
export const TASK_RECEIPT_EVENT_TYPE = 'com.swarmstudio.task.receipt'
/** v14 P2D：桥出向 agent 徽章事件（镜像客户端 TASK_EVENT_TYPES.message） */
export const AGENT_MESSAGE_EVENT_TYPE = 'com.swarmstudio.agent.message'
/** v14 P2D：桥启动能力声明 state 事件（镜像客户端 AGENT_PROFILE_EVENT_TYPE） */
export const AGENT_PROFILE_EVENT_TYPE = 'com.swarmstudio.agent.profile'
/** v14 P2B：协议事件命名空间前缀（ChatBridge sync 解析分流用；与客户端 isSwarmStudioEventType 同源语义） */
export const SWARM_EVENT_PREFIX = 'com.swarmstudio.'

/** AssignContent（v1 稳定字段 + v2 四可选字段，与客户端 protocol.ts 对齐） */
export interface AssignEventContent {
  // 协议事件 content 是开放 JSON 面：允许经协议事件发送通道（其 content 形参为宽索引记录）传递。
  [key: string]: unknown
  taskId: string
  title: string
  body?: string
  priority?: string
  dueAt?: number
  /** v2：父任务/案例引用（任务树拆解 fan-out）。 */
  parentId?: string
  /** v2：能力标签（Orchestrator 路由依据，如 'module:payment'、'test'）。 */
  capability?: string[]
  /** v2：交付阶段归属 P1..P6（统计与看板聚合）。 */
  phase?: string
  /** v2：前置任务引用（甘特与关键路径数据源）。 */
  dependsOn?: string[]
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
  issuedAt: number
}

export function buildAssignContent(params: {
  taskId: string
  title: string
  body?: string
  parentId?: string
  capability?: string[]
  phase?: string
  dependsOn?: string[]
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
}): AssignEventContent {
  return { ...params, issuedAt: Date.now() }
}

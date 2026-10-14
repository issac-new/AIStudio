// overlay[constraints] 约束卡类型（2026-10-14 阿里 15-Agent 调研轮 D 项）。
//
// 语义：架构约束注册表——「要在已有 API 上扩展、别新增 API」这类团队级约束
// 散在方案文档与人的经验里，任务卡里没有，agent 自然挑当下最容易的路（调研
// 正本 §04 问题①）。约束卡=陈述+适用范围+来源锚+生效轮次，派单时随简报注入。
// 与 /learn（learndistill）的分工：会话内人说的偏好走 /learn 三归宿；架构级
// 规则走本注册表（人工维护）。B2 经验注入复用同一注入通道。
export interface ConstraintScope {
  /** 适用看板列（精确匹配，如 devimpl/testpass） */
  columns?: string[]
  /** 适用 step specialist/id（如 backend-integration-testing） */
  specialists?: string[]
  /** 任务标题/正文关键词（REST 预演通道用；派单简报 v1 只匹配列/specialist） */
  keywords?: string[]
}

export interface ConstraintCard {
  id: string
  /** 约束陈述（≤500 字） */
  statement: string
  scope: ConstraintScope
  /** 来源锚：方案条款/文档路径/裁决记录等可对账出处 */
  sourceAnchor: string
  /** 生效轮次（如 run19；缺省=自创建起全部）——出处元数据，不作派单过滤 */
  effectiveRun?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ConstraintStoreShape {
  cards: ConstraintCard[]
  nextSeq: number
}

/** 派单侧注入目标（column-dispatch 已有的上下文，不新增查询） */
export interface DispatchTarget {
  column?: string
  specialist?: string
  stepId?: string
}

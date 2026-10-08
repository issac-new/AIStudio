// overlay/custom/server/incident/incident-types.ts
// Agent 事故报告类型（2026-10-08 六文调研轮 A+B，arXiv 2609.24515 三类 17 要素）。
//
// 证据与报告分层（论文 Evidence vs Incident Report）：
// 报告层只放摘要、计数与指针（sources 指回证据所在文件/表），不内嵌原始
// 消息全文与凭证材料——原始数据留在证据面（messages 表 / trace JSONL / 台账），
// 报告可公开而证据受访问控制。
export type IncidentCategory = 'trajectory' | 'capability' | 'orchestration'

export const INCIDENT_CATEGORIES: { key: IncidentCategory; title: string }[] = [
  { key: 'trajectory', title: '一、执行轨迹（Agent 到底经历了什么）' },
  { key: 'capability', title: '二、能力与权限（Agent 到底能做什么）' },
  { key: 'orchestration', title: '三、子组件与编排（事故可能不存在于任何一个 Agent 中）' },
]

/** collected=有数据；partial=有相关数据但覆盖不全（如实注明缺口）；absent=未采集（注明原因）。 */
export type ElementStatus = 'collected' | 'partial' | 'absent'

/** 17 要素键（论文顺序）。 */
export type IncidentElementKey =
  // 轨迹类
  | 'message_history' // 消息历史
  | 'reasoning_tokens' // 推理过程
  | 'data_sources' // 外部数据来源
  | 'data_read_write' // 数据读写
  | 'theoretical_autonomy' // 理论自治度（设计允许做到什么程度）
  | 'effective_autonomy' // 实际自治度（事故轨迹中实际自主到什么程度）
  // 能力与权限类
  | 'trust_boundaries' // 信任边界
  | 'available_tools' // 可用工具（设计面）
  | 'effective_tool_use' // 实际工具调用
  | 'os_interactions' // 操作系统交互
  | 'agent_identity' // Agent 身份
  | 'delegation_chain' // 委托链
  | 'auth_credentials' // 认证信息（凭证标识/指纹，绝不存密钥原文）
  // 编排类
  | 'design_topology' // 设计时多 Agent 架构
  | 'runtime_topology' // 实际运行架构
  | 'orchestration_protocol' // 编排协议
  | 'communication_logs' // 通信日志

export const INCIDENT_ELEMENT_TITLES: Record<IncidentElementKey, string> = {
  message_history: '消息历史',
  reasoning_tokens: '推理过程',
  data_sources: '外部数据来源',
  data_read_write: '数据读写',
  theoretical_autonomy: '理论自治度',
  effective_autonomy: '实际自治度',
  trust_boundaries: '信任边界',
  available_tools: '可用工具',
  effective_tool_use: '实际工具调用',
  os_interactions: '操作系统交互',
  agent_identity: 'Agent 身份',
  delegation_chain: '委托链',
  auth_credentials: '认证信息',
  design_topology: '设计时多 Agent 架构',
  runtime_topology: '实际运行架构',
  orchestration_protocol: '编排协议',
  communication_logs: '通信日志',
}

export interface IncidentElement {
  key: IncidentElementKey
  title: string
  category: IncidentCategory
  status: ElementStatus
  /** 一句话人话结论（先讲人话再上术语——汇报纪律）。 */
  summary: string
  /** 证据指针：文件路径 / 表名 / 台账名（不内嵌原始数据）。 */
  sources: string[]
  /** 缺席原因（status=absent/partial 必填，不造数）。 */
  note?: string
  /** 结构化明细（计数、键清单、脱敏摘要——已遵守报告层最小暴露）。 */
  detail?: unknown
}

// ---------- B：理论自治度 vs 实际自治度对账（设计态≠运行态检测） ----------

export interface AutonomyFace {
  /** 配置面来源（permission-modes/goalautonomy/goalbudget/approval 规则）。 */
  sources: string[]
  /** 事实清单：每条一句可核对的话。 */
  facts: string[]
  status: ElementStatus
  note?: string
}

export interface AutonomyDivergence {
  /** 黄条告警一句话（人话）。 */
  finding: string
  severity: 'info' | 'warn'
  /** 支撑该发现的事实来源。 */
  evidence: string[]
}

export interface AutonomyReconciliation {
  theoretical: AutonomyFace
  effective: AutonomyFace
  divergences: AutonomyDivergence[]
  note?: string
}

export interface IncidentReport {
  sessionId: string
  generatedAt: number
  /** 会话概况（标题/创建时间/消息数——sessions 行有的字段如实带，缺的如实缺省）。 */
  subject: {
    title?: string
    createdAt?: number
    messages?: number
    dbFile?: string
    traceFile?: string
  }
  elements: IncidentElement[]
  autonomy: AutonomyReconciliation
  coverage: { collected: number; partial: number; absent: number; total: number }
}

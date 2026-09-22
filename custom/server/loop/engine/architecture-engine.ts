// custom/server/loop/engine/architecture-engine.ts
// 架构规则引擎：四规则约束 + BLOCKED_BY_POLICY 分类
// 依赖：custom/server/loop/engine/loop-guard.ts
// 约束：custom 树禁止 import upstream 模块，任务对象用结构化类型承接。

import type { LoopAction } from './loop-guard'

/** 规则引擎所需最小任务结构（KanbanTask 的结构化子集） */
export interface ArchTask {
  id: string
  title: string
  body: string | null
  assignee: string | null
  status: string
}

// ─── 规则定义 ──────────────────────────────────────────

export interface ArchRule {
  id: string
  name: string
  description: string
  /** 触发条件的 predicate */
  predicate: (task: ArchTask) => boolean
  /** 违规时采取的动作 */
  action: 'BLOCK' | 'WARN' | 'AUTO_FIX'
  /** 动作执行器 */
  executor: (task: ArchTask, options?: RuleCheckOptions) => LoopAction | Promise<LoopAction>
}

/** 运行时能力注入（custom 树禁止 import upstream，需 upstream 侧状态的规则由调用方提供查询通道） */
export interface RuleCheckOptions {
  /** 上游依赖状态查询（id → status；null=任务不存在或无法查询）。缺省时规则 001 不做阻断判定 */
  getTaskStatus?: (taskId: string) => Promise<string | null>
}

function parseBody(task: ArchTask): Record<string, any> {
  if (!task.body) return {}
  try {
    const parsed = JSON.parse(task.body)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// ─── BLOCKED_BY_POLICY 分类 ────────────────────────────

export enum BlockPolicyCategory {
  // 架构完整性约束
  ARCH_INTEGRITY = 'ARCH_INTEGRITY',
  // 依赖关系约束
  DEPENDENCY = 'DEPENDENCY',
  // 资源配额约束
  QUOTA = 'QUOTA',
  // 安全合规约束
  SECURITY = 'SECURITY',
}

export interface BlockedByPolicy {
  category: BlockPolicyCategory
  ruleId: string
  message: string
  taskId: string
  timestamp: number
}

// ─── 四规则定义 ────────────────────────────────────────

export const RULE_DEPENDENCY_INTEGRITY: ArchRule = {
  id: 'arch-rule-001',
  name: 'Dependency Integrity',
  description: '任务依赖的上游任务必须处于 done 状态',
  predicate: (task: ArchTask) => {
    const body = parseBody(task)
    const deps = body.depends_on
    return Array.isArray(deps) && deps.length > 0
  },
  action: 'BLOCK',
  executor: async (task: ArchTask, options: RuleCheckOptions = {}): Promise<LoopAction> => {
    const deps: unknown[] = parseBody(task).depends_on || []
    if (!options.getTaskStatus) {
      // 状态查询通道未注入：引擎无法核验上游状态，不得凭 TODO 残桩一律阻断
      return { type: 'CONTINUE', ruleId: 'arch-rule-001', message: '未注入依赖状态查询，规则 001 跳过校验' }
    }
    const undone: string[] = []
    for (const dep of deps) {
      if (typeof dep !== 'string') continue
      const status = await options.getTaskStatus(dep)
      if (status !== 'done') undone.push(dep)
    }
    if (undone.length > 0) {
      return {
        type: 'BLOCKED_BY_POLICY',
        policy: BlockPolicyCategory.DEPENDENCY,
        ruleId: 'arch-rule-001',
        message: `依赖任务 ${undone.join(', ')} 尚未完成或不存在（status 查询核验）`,
        taskId: task.id,
      }
    }
    return { type: 'CONTINUE' }
  },
}

export const RULE_ROLE_ASSIGNMENT: ArchRule = {
  id: 'arch-rule-002',
  name: 'Role Assignment',
  description: '每个任务必须有至少一位 responsible',
  predicate: (task: ArchTask) => {
    const raci = parseBody(task).raci
    // 仅约束声明了 RACI 块的任务；纯文本/无 raci 的普通任务不归本规则管
    // （assignTask 是全产品通用路径，此前无条件 BLOCK 会把普通任务派发全数 500）
    if (!raci || typeof raci !== 'object') return false
    return !Array.isArray(raci.responsible) || raci.responsible.length === 0
  },
  action: 'BLOCK',
  executor: async (task: ArchTask): Promise<LoopAction> => {
    return {
      type: 'BLOCKED_BY_POLICY',
      policy: BlockPolicyCategory.ARCH_INTEGRITY,
      ruleId: 'arch-rule-002',
      message: '任务缺少 responsible 分配',
      taskId: task.id,
    }
  },
}

export const RULE_APPROVER_UNIQUENESS: ArchRule = {
  id: 'arch-rule-003',
  name: 'Approver Uniqueness',
  description: '审批方最多 1 人',
  predicate: (task: ArchTask) => {
    const raci = parseBody(task).raci
    return !!raci && typeof raci === 'object' && Array.isArray(raci.approver) && raci.approver.length > 1
  },
  action: 'WARN',
  executor: async (task: ArchTask): Promise<LoopAction> => {
    const raci = parseBody(task).raci
    const approverCount = Array.isArray(raci?.approver) ? raci.approver.length : 0
    // 引擎无 store 写回通道（custom 禁 import upstream），不得宣称 AUTO_FIXED；
    // 降级为 Leader 介入提示：实际收敛由人工处理（raci-dispatch 对 approver>1 拒派兜底）
    console.warn(`[aipaydev] arch-rule-003 task=${task.id} 审批方 ${approverCount} 位超出上限 1，需人工收敛（引擎未自动改写任务）`)
    return {
      type: 'LEADER_INTERVENTION',
      ruleId: 'arch-rule-003',
      message: `审批方 ${approverCount} 位超出上限 1，需人工收敛（未自动改写任务）`,
      taskId: task.id,
    }
  },
}

/** Rule 4: 并发执行配额规则
 *  同一 assignee 同时进行中的任务不得超过 maxConcurrent（默认 3）
 *  若超出 → BLOCK 或排队等待
 */
export const RULE_CONCURRENT_QUOTA: ArchRule = {
  id: 'arch-rule-004',
  name: 'Concurrent Quota',
  description: '同一负责人同时进行中的任务不得超过配额',
  predicate: (task: ArchTask) => {
    // 总是检查（需要查询当前进行中的任务数）
    return true
  },
  action: 'BLOCK',
  executor: async (task: ArchTask): Promise<LoopAction> => {
    // TODO: 查询该 assignee 当前进行中的任务数
    const currentRunning = 0 // await getRunningTaskCount(task.assignee)
    const maxConcurrent = 3
    if (currentRunning >= maxConcurrent) {
      return {
        type: 'BLOCKED_BY_POLICY',
        policy: BlockPolicyCategory.QUOTA,
        ruleId: 'arch-rule-004',
        message: `${task.assignee} 已有 ${currentRunning} 个进行中任务，达到并发上限 ${maxConcurrent}`,
        taskId: task.id,
      }
    }
    return { type: 'CONTINUE' }
  },
}

// ─── 规则注册表 ────────────────────────────────────────

export const ARCH_RULES: ArchRule[] = [
  RULE_DEPENDENCY_INTEGRITY,
  RULE_ROLE_ASSIGNMENT,
  RULE_APPROVER_UNIQUENESS,
  RULE_CONCURRENT_QUOTA,
]

/**
 * 执行全部规则检查
 * 返回遇到的第一个 BLOCK 或 AUTO_FIX 动作
 */
export async function evaluateRules(task: ArchTask, options: RuleCheckOptions = {}): Promise<LoopAction | null> {
  for (const rule of ARCH_RULES) {
    if (rule.predicate(task)) {
      const action = await rule.executor(task, options)
      if (action.type === 'BLOCKED_BY_POLICY' || action.type === 'AUTO_FIXED') {
        return action
      }
    }
  }
  return null
}

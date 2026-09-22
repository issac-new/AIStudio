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
  executor: (task: ArchTask) => LoopAction | Promise<LoopAction>
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
  executor: async (task: ArchTask): Promise<LoopAction> => {
    const body = parseBody(task)
    const deps = body.depends_on || []
    // 检查每个 dep 是否 done
    // TODO: 查询上游任务状态
    const blockedDeps = deps // .filter(d => getTaskStatus(d) !== 'done')
    if (blockedDeps.length > 0) {
      return {
        type: 'BLOCKED_BY_POLICY',
        policy: BlockPolicyCategory.DEPENDENCY,
        ruleId: 'arch-rule-001',
        message: `依赖任务 ${blockedDeps.join(', ')} 尚未完成`,
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
    const body = parseBody(task)
    const raci = body.raci
    return !raci || !raci.responsible || raci.responsible.length === 0
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
    const body = parseBody(task)
    const raci = body.raci
    return raci && raci.approver && raci.approver.length > 1
  },
  action: 'AUTO_FIX',
  executor: async (task: ArchTask): Promise<LoopAction> => {
    const body = parseBody(task)
    body.raci.approver = [body.raci.approver[0]]
    // TODO: 写回 task.body
    return {
      type: 'AUTO_FIXED',
      ruleId: 'arch-rule-003',
      message: `已将 ${body.raci.approver.length - 1} 位多余审批方移除，保留 ${body.raci.approver[0]}`,
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
export async function evaluateRules(task: ArchTask): Promise<LoopAction | null> {
  for (const rule of ARCH_RULES) {
    if (rule.predicate(task)) {
      const action = await rule.executor(task)
      if (action.type === 'BLOCKED_BY_POLICY' || action.type === 'AUTO_FIXED') {
        return action
      }
    }
  }
  return null
}

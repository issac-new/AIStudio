// task-boundaries.ts —— 派发边界纪律单一事实源（产品能力，2026-10-09 过度交付盘查根因③）
//
// 背景：run12 盘查实证的过度交付三根因之一"骨干 agent 角色无边界声明"——左移流水线给了
// "提前动手"的许可但没给边界清单，fanfan（预写任务）越界为全域集成者（合并 origin/main、
// 代写他域测试）。本模块把边界声明固化为产品能力：图引擎所有 agent 派发节点的任务书
// 自动按角色附加边界条款（幂等，重复注入安全）。
//
// 边界按角色（不是按节点类型一刀切）：分析类任务合法产出文档可推 main，开发类才禁直推
// main——run12 实锤：chen 分析段写实现码（阶段越界）、fei 预备轮建 worktree 跑测试（禁做漏洞）。

export type BoundaryRole = 'analyst' | 'dev' | 'reviewer' | 'tester' | 'governance'

/** 角色边界声明（单一事实源：图派发/模板/后续 bash 派发词共享此口径） */
export const ROLE_BOUNDARIES: Record<BoundaryRole, string> = {
  analyst:
    '仅产出你名下的分析/概设/计划文档本身；禁写实现代码；禁代做他域的实现或测试；禁做任何合并 origin/main 的集成操作（集成是导演/集成节点的职权）。',
  dev:
    '交付仅限 push origin feat/<你的任务分支>（含指定 testlog）；不得直接推 origin/main；不得代做他人/他域任务。',
  reviewer:
    '评审仅产出判词与评审意见；不代做被评审域的实现或测试；不修改被评审产物本身。',
  tester:
    '测试交付仅限测试报告与用例；预备/起草类任务不执行测试、不建分支（含 worktree）、不 push。',
  governance:
    '仅产出本职的报告/台账/意见；禁代做实现与测试；禁做任何代码或文档的集成合并操作。',
}

const MARK = '【边界纪律】'

/** 幂等注入：brief 已含边界标记则原样返回（防重复叠加） */
export function withBoundary(brief: string, role: BoundaryRole): string {
  const base = (brief ?? '').trim()
  if (base.includes(MARK)) return base
  const clause = `${MARK}${ROLE_BOUNDARIES[role]}`
  return base ? `${base}\n\n${clause}` : clause
}

/**
 * 角色推导：显式 config.boundaryRole 优先；否则按 kind+产物形状推导——
 * 输出形如 feat/<分支> 的任务=dev（禁直推 main），review/test 节点=对应角色，
 * 其余 agent-task（文档类产出）=analyst。模板编译器对每个节点显式标注，
 * 此推导是兜底（防新增节点漏标时完全无边界）。
 */
export function deriveBoundaryRole(
  cfg: { boundaryRole?: string; output?: string; branchHint?: string },
  kind: 'task' | 'review' | 'test',
): BoundaryRole {
  const explicit = cfg.boundaryRole as BoundaryRole | undefined
  if (explicit && explicit in ROLE_BOUNDARIES) return explicit
  if (kind === 'review') return 'reviewer'
  if (kind === 'test') return 'tester'
  const target = String(cfg.output ?? cfg.branchHint ?? '')
  return target.startsWith('feat/') ? 'dev' : 'analyst'
}

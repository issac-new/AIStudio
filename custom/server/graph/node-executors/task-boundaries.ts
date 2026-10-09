// task-boundaries.ts —— 派发边界纪律单一事实源（产品能力 v2，2026-10-09 过度交付盘查根因③）
//
// v1 五角色硬编码 → v2 注册表文件化（用户架构裁定："新角色=加模板不改码"）：
// - role-boundary-registry.json：角色模板注册表（含 generic 兜底与 capabilities 四维前向位）
// - agent-role-overrides.json：per-agent 覆盖（分布式 fleet 长期态=org 注册表联动，见
//   specs/2026-10-09-agent-capability-boundaries.md）
// - 解析链：任务显式 boundaryRole > agent 覆盖表[assignee] > 产物形状推导 > generic
// 注册表文件缺失/损坏时回落内置默认（分布式环境鲁棒），setBoundaryRegistry 供测试注入。
//
// 边界按角色不按节点类型一刀切：分析类任务合法产出文档可推 main，开发类才禁直推
// ——run12 实锤：fanfan 预写越界为全域集成者、chen 分析段写实现码、fei 预备轮建 worktree 跑测试。

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeBoundary, requirementsFrom, type AgentCapabilities } from './capability-composer'

const HERE = dirname(fileURLToPath(import.meta.url))

export type BoundaryRole = 'analyst' | 'dev' | 'reviewer' | 'tester' | 'governance' | 'generic'

export interface BoundaryTemplate {
  role: string
  text: string
  capabilities?: Record<string, unknown>
}

/** 内置默认（注册表文件不可读时的兜底——与 role-boundary-registry.json 同口径维护） */
const BUILTIN_ROLES: BoundaryTemplate[] = [
  { role: 'analyst', text: '仅产出你名下的分析/概设/计划文档本身；禁写实现代码；禁代做他域的实现或测试；禁做任何合并 origin/main 的集成操作（集成是导演/集成节点的职权）。' },
  { role: 'dev', text: '交付仅限 push origin feat/<你的任务分支>（含指定 testlog）；不得直接推 origin/main；不得代做他人/他域任务。' },
  { role: 'reviewer', text: '评审仅产出判词与评审意见；不代做被评审域的实现或测试；不修改被评审产物本身。' },
  { role: 'tester', text: '测试交付仅限测试报告与用例；预备/起草类任务不执行测试、不建分支（含 worktree）、不 push。' },
  { role: 'governance', text: '仅产出本职的报告/台账/意见；禁代做实现与测试；禁做任何代码或文档的集成合并操作。' },
  { role: 'generic', text: '仅做你名下任务书明确要求的事；不代做他人任务；不直接推共享主干分支。' },
]

function readJsonArray<T>(path: string, pick: (root: unknown) => T[] | undefined): T[] | null {
  try {
    const root: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const picked = pick(root)
    return Array.isArray(picked) && picked.length > 0 ? picked : null
  } catch {
    return null
  }
}

let registry: BoundaryTemplate[] =
  readJsonArray<BoundaryTemplate>(join(HERE, 'role-boundary-registry.json'), (r) => (r as { roles?: BoundaryTemplate[] }).roles)
  ?? BUILTIN_ROLES

let agentRoleOverrides: Record<string, string> = Object.create(null)
try {
  const root = JSON.parse(readFileSync(join(HERE, 'agent-role-overrides.json'), 'utf8')) as { assignees?: Record<string, string> }
  if (root.assignees && typeof root.assignees === 'object') agentRoleOverrides = root.assignees
} catch { /* 文件缺失/损坏→空表（无 per-agent 覆盖，走形状推导） */ }

/** 注册表注入（测试/运维钩子：改表后无需重启进程） */
export function setBoundaryRegistry(roles: BoundaryTemplate[]): void {
  registry = roles.length > 0 ? roles : BUILTIN_ROLES
}

// ── 方案2 M2/M3：能力声明合成层（specs/2026-10-09-agent-capability-boundaries.md）──
// 派发侧解析链升级：任务显式 boundaryRole（模板地板）> 能力声明否定式合成（若命中）
// > agent 覆盖表 > 形状推导 > generic。合成条款叠加在模板地板之上（宁紧勿松：合成
// 只增禁令不放松）。capabilitiesProvider 由装配层注入（读治理注册表 agent-capabilities）。
let capabilitiesProvider: ((assignee: string | undefined) => AgentCapabilities | undefined) | null = null

export function setCapabilitiesProvider(
  fn: ((assignee: string | undefined) => AgentCapabilities | undefined) | null,
): void {
  capabilitiesProvider = fn
}

export function setAgentRoleOverrides(map: Record<string, string>): void {
  agentRoleOverrides = map
}

function boundaryTextFor(role: string): string {
  const hit = registry.find((t) => t.role === role)
  if (hit?.text) return hit.text
  const builtin = BUILTIN_ROLES.find((t) => t.role === role)
  if (builtin) return builtin.text
  return BUILTIN_ROLES.find((t) => t.role === 'generic')!.text
}

/** 当前注册表快照（只读视图；守门测试用） */
export function roleBoundariesSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of registry) out[t.role] = t.text
  return out
}

/** 兼容 v1 的常量视图（快照；改注册表后需重新取值，测试断言用 roleBoundariesSnapshot 更稳） */
export const ROLE_BOUNDARIES: Record<string, string> = new Proxy({}, {
  get: (_t, prop: string) => boundaryTextFor(prop),
}) as Record<string, string>

const MARK = '【边界纪律】'

/** 派发边界合成入口（执行器唯一调用面）：模板地板 + 能力声明否定式条款（宁紧勿松） */
export function applyBoundary(
  brief: string,
  cfg: { boundaryRole?: string; output?: string; branchHint?: string; assignee?: string },
  kind: 'task' | 'review' | 'test',
): string {
  const base = (brief ?? '').trim()
  if (base.includes(MARK)) return base
  const floor = boundaryTextFor(deriveBoundaryRole(cfg, kind))
  const extra = composeBoundary(requirementsFrom(cfg, kind), capabilitiesProvider?.(cfg.assignee))
  const clause = extra ? `${floor}${extra}` : floor
  return base ? `${base}\n\n${MARK}${clause}` : `${MARK}${clause}`
}

/** 幂等注入：brief 已含边界标记则原样返回（防重复叠加） */
export function withBoundary(brief: string, role: string): string {
  const base = (brief ?? '').trim()
  if (base.includes(MARK)) return base
  const clause = `${MARK}${boundaryTextFor(role)}`
  return base ? `${base}\n\n${clause}` : clause
}

/**
 * 角色解析链（v2）：任务显式 boundaryRole > agent 覆盖表[assignee] > 形状推导 > generic。
 * cfg.output/branchHint 形如 feat/ 的=dev（禁直推 main），review/test 节点各归其位，
 * 其余文档类产出=analyst；未知输出形状=generic（最小边界兜底）。
 */
export function deriveBoundaryRole(
  cfg: { boundaryRole?: string; output?: string; branchHint?: string; assignee?: string },
  kind: 'task' | 'review' | 'test',
): BoundaryRole {
  const explicit = cfg.boundaryRole
  if (explicit && registry.some((t) => t.role === explicit)) return explicit as BoundaryRole
  const byAgent = cfg.assignee ? agentRoleOverrides[cfg.assignee] : undefined
  if (byAgent && registry.some((t) => t.role === byAgent)) return byAgent as BoundaryRole
  if (kind === 'review') return 'reviewer'
  if (kind === 'test') return 'tester'
  const target = String(cfg.output ?? cfg.branchHint ?? '')
  if (target.startsWith('feat/')) return 'dev'
  if (target.startsWith('docs/') || target.endsWith('.md')) return 'analyst'
  return 'generic'
}

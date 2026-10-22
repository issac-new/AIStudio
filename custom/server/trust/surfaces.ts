// overlay/trust 域：角色工具面与单调链校验。
//
// 文章里三角色的工具数是 0 < 10 < 17，且审计者只有只读工具。这里把同一约束
// 落成静态校验：工具清单在代码里声明，不读取运行时配置，避免"当前恰好没配
// 无限制工具"被当成保证。校验失败不阻止既有业务，但会让准入提案被降级。

import type { RoleSurface, ToolSurfaceReport } from './types'

/** 具备写入、执行或外发能力的工具。审计者持有其中任何一个即判违规。 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'fs.write', 'fs.edit', 'fs.delete', 'shell.exec', 'git.commit', 'git.push',
  'test.run', 'http.request', 'browser.click',
])

const MANAGER_TOOLS: readonly string[] = []

/** 审计者：只读查询与哈希核验，没有写入、命令执行与后台进程能力。 */
const AUDITOR_TOOLS: readonly string[] = [
  'fs.list', 'fs.read', 'fs.stat', 'hash.verify', 'git.log', 'git.show',
  'git.diff', 'grep.search', 'trace.read', 'report.read',
]

/** 执行者：审计者工具面 + 写入/执行/对外操作，总数 17，与文章口径同量级。 */
const EXECUTOR_TOOLS: readonly string[] = [
  ...AUDITOR_TOOLS,
  'fs.write', 'fs.edit', 'shell.exec', 'git.commit', 'git.push', 'test.run', 'browser.open',
]

export const BUILTIN_SURFACES: readonly RoleSurface[] = [
  { role: 'manager', tools: [...MANAGER_TOOLS], allowWrite: false },
  { role: 'auditor', tools: [...AUDITOR_TOOLS], allowWrite: false },
  { role: 'executor', tools: [...EXECUTOR_TOOLS], allowWrite: true },
]

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name)
}

/** 校验 0 < 审计者 < 执行者 的严格递增关系，以及子集与只读约束。 */
export function checkSurfaceChain(surfaces: readonly RoleSurface[] = BUILTIN_SURFACES): ToolSurfaceReport {
  const violations: string[] = []
  const byRole = new Map(surfaces.map((s) => [s.role, s]))
  const manager = byRole.get('manager')
  const auditor = byRole.get('auditor')
  const executor = byRole.get('executor')
  if (!manager) violations.push('缺少 manager 角色')
  if (!auditor) violations.push('缺少 auditor 角色')
  if (!executor) violations.push('缺少 executor 角色')

  const managerTools = new Set(manager?.tools ?? [])
  const auditorTools = new Set(auditor?.tools ?? [])
  const executorTools = new Set(executor?.tools ?? [])

  for (const t of managerTools) if (!auditorTools.has(t)) violations.push(`manager 工具 ${t} 不在 auditor 面内`)
  for (const t of auditorTools) if (!executorTools.has(t)) violations.push(`auditor 工具 ${t} 不在 executor 面内`)
  for (const t of auditorTools) if (isWriteTool(t)) violations.push(`auditor 持有写入/执行工具 ${t}`)
  if (manager?.allowWrite) violations.push('manager 不应允许写入')
  if (auditor?.allowWrite) violations.push('auditor 不应允许写入')
  if (!executor?.allowWrite) violations.push('executor 应允许写入')

  const sizes = {
    manager: managerTools.size,
    auditor: auditorTools.size,
    executor: executorTools.size,
  }
  if (!(sizes.manager < sizes.auditor)) violations.push('工具面未满足 manager < auditor')
  if (!(sizes.auditor < sizes.executor)) violations.push('工具面未满足 auditor < executor')

  return {
    valid: violations.length === 0,
    sizes,
    violations,
    surfaces: surfaces.map((s) => ({ role: s.role, tools: [...s.tools], allowWrite: s.allowWrite })),
  }
}

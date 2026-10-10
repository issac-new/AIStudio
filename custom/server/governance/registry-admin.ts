// overlay/custom/server/governance/registry-admin.ts
// P6-P8 管理维护（V5 补遗④）：roster / app-registry / org 三注册表的产品化读写——
// 保存即提交 git（作者/时间/commit 可回溯，R13）；matrix 账号创建/停用走 synapse 管理端
//（操作本身以 body 携带的 synapse adminToken 鉴权——只有真实管理员持有效管理凭据）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { repoRoot } from './governance-controller'
import { createMatrixUser, setMatrixUserActive, validateMatrixToken, getMatrixUserState } from '../matrix/admin-service'

const exec = promisify(execFile)

export const REGISTRY_KINDS = {
  roster: 'docs/admin/roster.md',
  'app-registry': 'docs/admin/app-registry.md',
  org: 'docs/admin/org.md',
  // 方案2 M2（specs/2026-10-09-agent-capability-boundaries.md）：agent 能力声明注册表
  // ——分布式 agent 上线即声明（四维），保存即提交=变更审计；派发侧经
  // graph/node-executors 能力合成层消费（否定式边界生成）。
  'agent-capabilities': 'docs/admin/agent-capabilities.md',
  // 任务工厂（2026-10-10 麦肯锡概念二轮）：完成 run 沉淀为可复用模板的登记处
  // ——来源 run 可溯、复用计数随 specs/:id/runs 累加、保存即提交=变更审计。
  'mission-templates': 'docs/admin/mission-templates.md',
} as const
export type RegistryKind = keyof typeof REGISTRY_KINDS

export function isRegistryKind(k: string): k is RegistryKind {
  return Object.prototype.hasOwnProperty.call(REGISTRY_KINDS, k)
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoRoot(), ...args], { timeout: 20000 })
  return stdout.trim()
}

export async function currentCommit(): Promise<string> {
  try { return await git(['rev-parse', '--short', 'HEAD']) } catch { return '' }
}

export async function readRegistry(kind: RegistryKind): Promise<{ markdown: string; commit: string }> {
  const markdown = await readFile(path.join(repoRoot(), REGISTRY_KINDS[kind]), 'utf-8')
  return { markdown, commit: await currentCommit() }
}

/** 保存即提交：写文件 → git add <path> → commit（R13 工件真实可回溯链）。 */
export async function writeRegistry(
  kind: RegistryKind, markdown: string, message: string, actor = 'studio-ui',
): Promise<{ commit: string }> {
  const file = REGISTRY_KINDS[kind]
  const abs = path.join(repoRoot(), file)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, markdown, 'utf-8')
  await git(['add', file])
  await git(['commit', '--allow-empty', '-m', `${message}`, '-m', `actor=${actor} via studio 账户/注册表管理`])
  return { commit: await currentCommit() }
}

/** 表格追加行（保持既有 markdown 结构：定位目标表末行后插入）。 */
export function appendTableRow(markdown: string, row: string[]): string {
  const lines = markdown.split('\n')
  let lastTableRow = -1
  for (let i = 0; i < lines.length; i++) if (/^\|/.test(lines[i])) lastTableRow = i
  const line = `| ${row.join(' | ')} |`
  if (lastTableRow < 0) return markdown + '\n' + line + '\n'
  lines.splice(lastTableRow + 1, 0, line)
  return lines.join('\n')
}

/** 首次写入的表头种子（新注册表 kind 首行落表前文件不存在——种子保证台账可读）。 */
const REGISTRY_TABLE_SEEDS: Partial<Record<RegistryKind, string>> = {
  'mission-templates': [
    '# 任务工厂模板台账（mission-templates）',
    '',
    '完成 run 沉淀为可复用图模板的登记处：来源 run 可溯（事件日志导出可复核）、复用计数随模板起跑自动累加、保存即提交=变更审计。',
    '',
    '| 模板 id | 名称 | 来源 run | 沉淀时间 | 复用次数 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    '',
  ].join('\n'),
}

/** 读-追加-提交一体化（文件缺失时先落种子表头再追加）。 */
export async function appendRegistryRow(
  kind: RegistryKind, row: string[], message: string, actor = 'studio-ui',
): Promise<{ commit: string }> {
  let markdown: string
  try {
    ({ markdown } = await readRegistry(kind))
  } catch {
    markdown = REGISTRY_TABLE_SEEDS[kind] ?? ''
  }
  const next = appendTableRow(markdown, row)
  return writeRegistry(kind, next, message, actor)
}

export interface ProvisionInput {
  localName: string; role: string; password: string
  adminToken: string; homeserverUrl: string
  withAgent?: boolean; displayName?: string
}

/** P6 建号：synapse 建人类号（+可选 AI 助理号）→ roster 追加行 → 提交。 */
export async function provisionMatrixAccount(inp: ProvisionInput): Promise<{
  created: string[]; rosterCommit: string
}> {
  const name = inp.localName.trim().replace(/^@/, '').split(':')[0]
  if (!/^[a-z0-9_.-]+$/i.test(name)) throw new Error(`非法用户名：${name}`)
  const created: string[] = []
  const serverName = new URL(inp.homeserverUrl).hostname === '127.0.0.1' ? 'matrix.test' : new URL(inp.homeserverUrl).hostname
  const human = `${name}:${serverName}`
  const base = { password: inp.password, adminToken: inp.adminToken, homeserverUrl: inp.homeserverUrl }
  // 建号失败即拒写 roster（2026-10-06 修复：此前忽略返回值=假成功，roster 提交了而
  // synapse 无此号；v2 PUT 幂等，agent 步失败重跑无残留）
  const humanCreate = await createMatrixUser(
    `@${human}`, inp.password, inp.adminToken, inp.homeserverUrl, inp.displayName || undefined)
  if (!humanCreate) throw new Error(`建号失败：@${human}（synapse v2 users PUT 未过）——已拒绝写 roster（防假成功）`)
  created.push(`@${human}`)
  if (inp.withAgent !== false) {
    const agentCreate = await createMatrixUser(
      `@${name}-agent:${serverName}`, inp.password + '-agent', inp.adminToken, inp.homeserverUrl)
    if (!agentCreate) throw new Error(`建号失败：@${name}-agent:${serverName}——已拒绝写 roster（人类号已建，v2 PUT 幂等可重跑）`)
    created.push(`@${name}-agent:${serverName}`)
  }
  const { markdown } = await readRegistry('roster')
  const agentCell = inp.withAgent === false ? '—' : `@${name}-agent:${serverName}`
  const next = appendTableRow(markdown, [`@${human}`, agentCell, inp.role])
  const { commit } = await writeRegistry('roster', next, `账户管理：新增 ${name}（${inp.role}）`, 'account-admin')
  return { created, rosterCommit: commit }
}

export interface OffboardInput {
  localName: string; handoverTo: string; taskIds: string[]
  reason: string; adminToken: string; homeserverUrl: string; actor?: string
}

/** P8 离职三步向导（服务端落实三步原子序）：①移交工单 ②停用双账号 ③审计留痕——每步独立提交可回溯。 */
export async function offboardAccount(inp: OffboardInput): Promise<{
  handoverCommit: string; deactivated: string[]; auditCommit: string
}> {
  const name = inp.localName.trim().replace(/^@/, '').split(':')[0]
  // 与 provisionMatrixAccount 同款白名单：name 拼进 offboarding 文件路径，无校验可穿越 repoRoot
  if (!/^[a-z0-9_.-]+$/i.test(name)) throw new Error(`非法用户名：${name}`)
  // 先鉴权后写盘：adminToken 无效时不得产生任何工单/审计文件与 git 提交
  const who = await validateMatrixToken(inp.adminToken, inp.homeserverUrl)
  if (!who) throw new Error('adminToken 无效（synapse whoami 失败），已拒绝落盘')
  const base = { adminToken: inp.adminToken, homeserverUrl: inp.homeserverUrl }
  // ① 任务移交工单
  const doc = [
    `# 离职移交工单：${name}（${new Date().toISOString()}）`,
    '',
    `- 接手人：${inp.handoverTo}`,
    `- 原因：${inp.reason}`,
    `- 移交任务：${inp.taskIds.length ? inp.taskIds.join(', ') : '（无在办）'}`,
    '',
  ].join('\n')
  const handoverPath = `docs/admin/offboarding-${name}.md`
  await mkdir(path.join(repoRoot(), 'docs/admin'), { recursive: true })
  await writeFile(path.join(repoRoot(), handoverPath), doc, 'utf-8')
  await git(['add', handoverPath])
  await git(['commit', '-m', `离职①移交：${name} → ${inp.handoverTo}`])
  const handoverCommit = await currentCommit()
  // ② 停用 matrix 双账号
  const deactivated: string[] = []
  const failed: string[] = []
  // server 名与 provisionMatrixAccount 同口径推导（此前硬编码 matrix.test，换 homeserver 即停错对象）
  const serverName = new URL(inp.homeserverUrl).hostname === '127.0.0.1' ? 'matrix.test' : new URL(inp.homeserverUrl).hostname
  for (const uid of [`@${name}:${serverName}`, `@${name}-agent:${serverName}`]) {
    // 空数组静默成功实锤（2026-10-06 govprobe/r31probe 两轮复现）：先探存在性——
    // missing/deactivated 跳过；存在但停用被拒（权限不足/端点异常）必须炸出来，
    // 不得记成"已停用"（审计留痕会写下错误事实）。
    const st = await getMatrixUserState(uid, base.adminToken, base.homeserverUrl)
    if (st !== 'active') continue
    if (await setMatrixUserActive(uid, false, base.adminToken, base.homeserverUrl)) deactivated.push(uid)
    else failed.push(uid)
  }
  if (failed.length) {
    throw new Error(`停用失败：${failed.join('、')}（synapse 拒绝——①移交工单已提交，②停用未完成，处理后重跑即可，三步幂等）`)
  }
  // ③ 审计留痕（append-only 台账）：appendFile 直追加，不做读-改-写全量覆写
  //（并发 offboard 各自读旧全文再覆写会互相丢行）。
  const trailPath = 'docs/admin/audit-trail.md'
  const trailAbs = path.join(repoRoot(), trailPath)
  const trailLine = `| ${new Date().toISOString()} | offboard | ${name} → 移交 ${inp.handoverTo} | 停用 ${deactivated.join(' ')} | ${inp.reason} | ${inp.actor || 'account-admin'} |\n`
  try {
    await appendFile(trailAbs, trailLine, 'utf-8')
  } catch {
    await mkdir(path.dirname(trailAbs), { recursive: true })
    await writeFile(trailAbs, '# 账号审计留痕（append-only）\n\n' + trailLine, 'utf-8')
  }
  await git(['add', trailPath])
  await git(['commit', '-m', `离职③审计留痕：${name}`])
  const auditCommit = await currentCommit()
  return { handoverCommit, deactivated, auditCommit }
}

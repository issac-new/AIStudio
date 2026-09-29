// overlay/custom/server/governance/registry-admin.ts
// P6-P8 管理维护（V5 补遗④）：roster / app-registry / org 三注册表的产品化读写——
// 保存即提交 git（作者/时间/commit 可回溯，R13）；matrix 账号创建/停用走 synapse 管理端
//（操作本身以 body 携带的 synapse adminToken 鉴权——只有真实管理员持有效管理凭据）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { repoRoot } from './governance-controller'
import { createMatrixUser, setMatrixUserActive } from '../matrix/admin-service'

const exec = promisify(execFile)

export const REGISTRY_KINDS = {
  roster: 'docs/admin/roster.md',
  'app-registry': 'docs/admin/app-registry.md',
  org: 'docs/admin/org.md',
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

export interface ProvisionInput {
  localName: string; role: string; password: string
  adminToken: string; homeserverUrl: string
  withAgent?: boolean; displayName?: string
  /** v14 P2A：agent 号建成后自动「密码换 token → 写 hermes profile dotenv」。
   *  缺省 true；失败不阻断建号（结果里带 reason 如实呈现）。 */
  writeAgentEnv?: boolean
  /** 注入用（测试）：HERMES_HOME 覆盖 */
  hermesHome?: string
  /** 注入用（测试）：登录 fetch 替身（避免测试触真 homeserver） */
  fetchImpl?: typeof fetch
}

/** v14 P2A agent 身份供给结果（best-effort：登录/写盘失败不回滚建号，如实记因）。 */
export interface AgentIdentityOutcome {
  agentUserId: string
  profile: string
  written: boolean
  reason?: string
}

/** P6 建号：synapse 建人类号（+可选 AI 助理号）→ v14 P2A 助理号凭据闭环 →
 *  roster 追加行 → 提交。 */
export async function provisionMatrixAccount(inp: ProvisionInput): Promise<{
  created: string[]; rosterCommit: string; agentIdentity?: AgentIdentityOutcome
}> {
  const name = inp.localName.trim().replace(/^@/, '').split(':')[0]
  if (!/^[a-z0-9_.-]+$/i.test(name)) throw new Error(`非法用户名：${name}`)
  const created: string[] = []
  const serverName = new URL(inp.homeserverUrl).hostname === '127.0.0.1' ? 'matrix.test' : new URL(inp.homeserverUrl).hostname
  const human = `${name}:${serverName}`
  const base = { password: inp.password, adminToken: inp.adminToken, homeserverUrl: inp.homeserverUrl }
  await createMatrixUser(`@${human}`, inp.password, inp.adminToken, inp.homeserverUrl)
  created.push(`@${human}`)
  let agentIdentity: AgentIdentityOutcome | undefined
  if (inp.withAgent !== false) {
    const agentUserId = `@${name}-agent:${serverName}`
    await createMatrixUser({ ...base, userId: agentUserId, password: inp.password + '-agent' })
    created.push(agentUserId)
    // v14 P2A：初始密码换 token → 写 profiles/<name>/.env（消费侧 gateway-env /
    // hermes matrix 适配器零改动）。best-effort：失败记 reason 不回滚建号。
    if (inp.writeAgentEnv !== false) {
      try {
        const { provisionAgentIdentity } = await import('../matrix/agent-identity')
        const res = await provisionAgentIdentity({
          homeserverUrl: inp.homeserverUrl,
          agentUserId,
          password: inp.password + '-agent',
          profile: name,
          hermesHome: inp.hermesHome,
          fetchImpl: inp.fetchImpl,
        })
        agentIdentity = { agentUserId, profile: res.profile, written: true }
      } catch (e) {
        agentIdentity = { agentUserId, profile: name, written: false, reason: String((e as Error).message ?? e) }
      }
    }
  }
  const { markdown } = await readRegistry('roster')
  const agentCell = inp.withAgent === false ? '—' : `@${name}-agent:${serverName}`
  const envNote = agentIdentity ? (agentIdentity.written ? '，凭据已入 profile .env' : '，凭据写入失败见返回') : ''
  const next = appendTableRow(markdown, [`@${human}`, agentCell, inp.role])
  const { commit } = await writeRegistry('roster', next, `账户管理：新增 ${name}（${inp.role}${envNote}）`, 'account-admin')
  return { created, rosterCommit: commit, agentIdentity }
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
  for (const uid of [`@${name}:matrix.test`, `@${name}-agent:matrix.test`]) {  // 停用端点按完整 userId，server 名经管理端自解析
    try {
      if (await setMatrixUserActive(uid, false, base.adminToken, base.homeserverUrl)) deactivated.push(uid)
    } catch (e) { if (!/not found|404/i.test(String(e))) throw e }
  }
  // ③ 审计留痕（append-only 台账）
  const trailPath = 'docs/admin/audit-trail.md'
  let trail = ''
  try { trail = await readFile(path.join(repoRoot(), trailPath), 'utf-8') } catch { trail = '# 账号审计留痕（append-only）\n\n' }
  trail += `| ${new Date().toISOString()} | offboard | ${name} → 移交 ${inp.handoverTo} | 停用 ${deactivated.join(' ')} | ${inp.reason} | ${inp.actor || 'account-admin'} |\n`
  await writeFile(path.join(repoRoot(), trailPath), trail, 'utf-8')
  await git(['add', trailPath])
  await git(['commit', '-m', `离职③审计留痕：${name}`])
  const auditCommit = await currentCommit()
  return { handoverCommit, deactivated, auditCommit }
}

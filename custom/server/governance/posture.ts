// overlay/governance 域：治理姿态对账面（2026-10-21 AGT 吸收轮 A，用户裁定「全做」）。
//
// 立场：吸收微软 Agent Governance Toolkit 最尖锐的批评——「策略没加载时默认
// allow，仪表盘照样显示 governed」。2026-10-16 安全检查实锤过同款问题（49 个
// profile 全量工具集、默认 profile 审批 mode off、执法总闸未开），当时靠人工
// 取证。本模块把「实际生效值 vs 期望值」做成常驻只读端点，产品面不再区分不了
// 真治理与裸奔。
//
// 语义纪律（与 hermes 运行时对齐，不臆造）：
//   - approvals.mode 三值 manual/smart/off 读 profile 自己的 config.yaml
//     （upstream approval_context.py：profile 不读根配置）；
//   - 未声明 approvals 键 ≠ off——生效值回落上游默认 smart（如实标「未声明，
//     生效=默认 smart」，既不粉饰成已治理也不冤枉成裸奔）；
//   - 执法面（HERMES_TOOL_ENFORCE）是 server 进程级开关，不 per-profile——
//     全局面呈现，不摊到 profile 灯。
// 期望值：~/.hermes-web-ui/posture-expectations.json（运维手编；缺省=未声明，
// 偏差面只报「实际 vs 已声明期望」，不编造期望）。
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export type PostureLamp = 'governed' | 'partial' | 'bare'

export interface PostureProfile {
  name: string
  configExists: boolean
  /** 实际审批模式（读 profile config.yaml；读不出=null）。 */
  approvalsMode: 'manual' | 'smart' | 'off' | null
  /** config.yaml 是否显式声明了 approvals.mode。 */
  approvalsDeclared: boolean
  /** 期望审批模式（posture-expectations.json；未声明=undefined）。 */
  expectedApprovalsMode?: 'manual' | 'smart' | 'off'
  /** 与期望的偏差清单（人话）。 */
  deviations: string[]
  /** 三态灯：governed=显式声明 manual/smart；bare=显式 off；partial=未声明或读不出。 */
  lamp: PostureLamp
  configError?: string
}

export interface PostureGlobal {
  /** 执法总闸（server 进程 env，进程级不 per-profile）。 */
  enforceMasterOn: boolean
  /** strict 姿态（HERMES_TOOL_ENFORCE_STRICT）。 */
  strictOn: boolean
  /** 全局权限模式（HERMES_TOOL_ENFORCE_MODE；null=未设）。 */
  enforceMode: string | null
  /** 各域已加载规则计数（AGT「agt audit 查实际加载策略」的对位物）。 */
  sandboxRoots: number
  browserAllow: number
  browserDeny: number
  toolBlacklist: number
  budgetPolicies: number
  identityAllowlists: number
  ladderEntries: number
  /** 上述规则总数（执法面可见的已加载规则量）。 */
  loadedRuleTotal: number
}

export interface GovernancePosture {
  at: number
  hermesHome: string
  global: PostureGlobal
  ledger: { exists: boolean; problems: string[] }
  expectations: { file: string; exists: boolean; error?: string }
  profiles: PostureProfile[]
  summary: { total: number; governed: number; partial: number; bare: number; configMissing: number }
}

export function postureExpectationsPath(): string {
  const env = process.env.HERMES_POSTURE_EXPECTATIONS?.trim()
  if (env) return env
  return join(homedir(), '.hermes-web-ui', 'posture-expectations.json')
}

interface ExpectationsDoc {
  profiles?: Record<string, { approvalsMode?: string }>
}

function loadExpectations(): { doc: ExpectationsDoc; exists: boolean; error?: string } {
  const file = postureExpectationsPath()
  if (!existsSync(file)) return { doc: {}, exists: false }
  try {
    // 与 governance-ledger 同款动态 require（yaml/json 均为既有传递依赖路径）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    const { readFileSync } = require('fs') as typeof import('fs')
    const doc = parse(readFileSync(file, 'utf8')) as ExpectationsDoc
    return { doc: doc && typeof doc === 'object' ? doc : {}, exists: true }
  } catch (e) {
    return { doc: {}, exists: true, error: (e as Error).message }
  }
}

/** profile 枚举（与 profile-tool-usage 同款路径规律）：default（根）+ profiles/<name>。 */
export function listHermesProfiles(hermesHome: string): Array<{ name: string; configPath: string }> {
  const out: Array<{ name: string; configPath: string }> = [
    { name: 'default', configPath: join(hermesHome, 'config.yaml') },
  ]
  try {
    const dir = join(hermesHome, 'profiles')
    if (existsSync(dir)) {
      for (const name of readdirSync(dir).sort()) {
        out.push({ name, configPath: join(dir, name, 'config.yaml') })
      }
    }
  } catch { /* 枚举失败只报 default */ }
  return out
}

/** 读 profile config.yaml 的 approvals.mode。返回 declared=false 表示未声明（生效=默认 smart）。 */
function readApprovalsMode(configPath: string): {
  mode: 'manual' | 'smart' | 'off' | null
  declared: boolean
  error?: string
} {
  if (!existsSync(configPath)) return { mode: null, declared: false }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs') as typeof import('fs')
    const doc = parse(readFileSync(configPath, 'utf8')) as { approvals?: { mode?: unknown } } | null
    const mode = doc?.approvals?.mode
    if (mode === 'manual' || mode === 'smart' || mode === 'off') return { mode, declared: true }
    return { mode: null, declared: false }
  } catch (e) {
    return { mode: null, declared: false, error: (e as Error).message.slice(0, 120) }
  }
}

function envListCount(env: Record<string, string | undefined>, name: string): number {
  return (env[name] ?? '')
    .split(/[:,]/)
    .map((v) => v.trim())
    .filter(Boolean).length
}

export interface PostureDeps {
  hermesHome?: string
  env?: Record<string, string | undefined>
  now?: () => number
}

/** 采集治理姿态（全只读；fail-soft 到面粒度）。 */
export function collectGovernancePosture(deps: PostureDeps = {}): GovernancePosture {
  const env = deps.env ?? process.env
  const hermesHome = deps.hermesHome || env.HERMES_HOME || join(homedir(), '.hermes')
  const now = deps.now?.() ?? Date.now()

  const global: PostureGlobal = {
    enforceMasterOn: env.HERMES_TOOL_ENFORCE === '1',
    strictOn: env.HERMES_TOOL_ENFORCE_STRICT === '1',
    enforceMode: env.HERMES_TOOL_ENFORCE_MODE ?? null,
    sandboxRoots: envListCount(env, 'HERMES_TOOL_SANDBOX_ROOTS'),
    browserAllow: envListCount(env, 'HERMES_BROWSER_ALLOWLIST'),
    browserDeny: envListCount(env, 'HERMES_BROWSER_DENYLIST'),
    toolBlacklist: envListCount(env, 'CLUSTER_INSPECTOR_TOOL_BLACKLIST'),
    budgetPolicies: 0,
    identityAllowlists: 0,
    ladderEntries: 0,
    loadedRuleTotal: 0,
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { listBudgetPolicies } = require('../tokenbudget/budget-policy') as typeof import('../tokenbudget/budget-policy')
    global.budgetPolicies = listBudgetPolicies().length
  } catch { /* 预算面不可用=0（如实） */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { listIdentities } = require('../agentidentity/agent-identity') as typeof import('../agentidentity/agent-identity')
    global.identityAllowlists = listIdentities().filter((i) => i.toolAllowlist.length > 0).length
  } catch { /* 身份面不可用=0（如实） */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { listLadder } = require('../autonomyladder/autonomy-ladder') as typeof import('../autonomyladder/autonomy-ladder')
    global.ladderEntries = listLadder().length
  } catch { /* 阶梯面不可用=0（如实） */ }
  global.loadedRuleTotal =
    global.sandboxRoots + global.browserAllow + global.browserDeny +
    global.toolBlacklist + global.budgetPolicies + global.identityAllowlists + global.ladderEntries

  let ledger = { exists: false, problems: ['加载失败'] }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadCapabilityLedger } = require('./governance-ledger') as typeof import('./governance-ledger')
    const read = loadCapabilityLedger()
    ledger = { exists: read.exists, problems: read.problems ?? [] }
  } catch (e) {
    ledger = { exists: false, problems: [(e as Error).message] }
  }

  const expectations = loadExpectations()

  const profiles: PostureProfile[] = listHermesProfiles(hermesHome).map(({ name, configPath }) => {
    const configExists = existsSync(configPath)
    const { mode, declared, error } = readApprovalsMode(configPath)
    const expectedRaw = expectations.doc.profiles?.[name]?.approvalsMode
    const expected = expectedRaw === 'manual' || expectedRaw === 'smart' || expectedRaw === 'off' ? expectedRaw : undefined
    const deviations: string[] = []
    if (expected !== undefined && mode !== null && mode !== expected) {
      deviations.push(`审批模式实际=${mode}，期望=${expected}`)
    }
    if (!configExists) deviations.push('config.yaml 不存在（审批面生效值未知）')
    if (error) deviations.push(`config.yaml 读取失败：${error}`)
    const lamp: PostureLamp = mode === 'off' ? 'bare' : declared ? 'governed' : 'partial'
    return {
      name, configExists,
      approvalsMode: mode,
      approvalsDeclared: declared,
      expectedApprovalsMode: expected,
      deviations,
      lamp,
      configError: error,
    }
  })

  const summary = {
    total: profiles.length,
    governed: profiles.filter((p) => p.lamp === 'governed').length,
    partial: profiles.filter((p) => p.lamp === 'partial').length,
    bare: profiles.filter((p) => p.lamp === 'bare').length,
    configMissing: profiles.filter((p) => !p.configExists).length,
  }
  return {
    at: now,
    hermesHome,
    global,
    ledger,
    expectations: { file: postureExpectationsPath(), exists: expectations.exists, error: expectations.error },
    profiles,
    summary,
  }
}

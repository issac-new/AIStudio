// overlay/toolpolicy 域：声明式工具策略引擎（2026-10-21 微软 AGT 调研轮）。
//
// 来源：微软 Agent Governance Toolkit 拆解——治理必须落在确定性应用代码的工具
// 调用边界；策略即代码、失败即关闭、按 agent 身份裁决。原文点名的最危险默认值：
// 策略没加载时默认 allow，仪表盘照样显示 governed。本模块用三层区分消除该歧义：
//   未配置（inactive，不装已治理）/ 配置损坏（error，fail-closed 拒绝）/
//   已生效（strict=deny-by-default，permissive=仅规则约束）。
//
// 定位：纯函数 + 静态 schema，不做 IO。存储与缓存见 policy-store.ts；执行面接线
// 见 toolpipeline/enforce-gate.ts。策略是**附加约束层**：allow 命中后仍继续走
// 既有阶梯/权限模式，不能放宽身份、沙箱、预算等硬边界。
export const TOOL_POLICY_VERSION = 1

export type PolicyMode = 'permissive' | 'strict'
export type PolicyAction = 'allow' | 'deny' | 'require_approval'
export type PolicyToolCategory = 'read' | 'write' | 'exec' | 'network'

export const POLICY_MODES: readonly PolicyMode[] = ['permissive', 'strict']
export const POLICY_ACTIONS: readonly PolicyAction[] = ['allow', 'deny', 'require_approval']
export const POLICY_CATEGORIES: readonly PolicyToolCategory[] = ['read', 'write', 'exec', 'network']

export interface ToolPolicyRuleMatch {
  /** 工具名精确匹配，或以 * 结尾的前缀匹配；空=不限。 */
  tools?: string[]
  categories?: PolicyToolCategory[]
  /** 发起用户 id（ekko context.userId）；空=不限。 */
  users?: string[]
  /** profile 名（精确或 prefix*）；空=不限。 */
  profiles?: string[]
  /** 入参值文本正则（大小写不敏感，≤200 字符）；不含参数名。 */
  argPattern?: string
}

export interface ToolPolicyRule {
  /** 稳定 id（小写字母数字连字符，≤64）；决策账与审批单按此追溯。 */
  id: string
  name: string
  enabled: boolean
  /** 数值大者先匹配；同优先级按列表顺序。 */
  priority: number
  action: PolicyAction
  match: ToolPolicyRuleMatch
  /** 人话说明：拒绝/审批文案会带上它。 */
  reason?: string
}

export interface ToolPolicyDoc {
  version: 1
  mode: PolicyMode
  rules: ToolPolicyRule[]
  updatedAt?: number
  updatedBy?: string
}

export interface PolicySnapshot {
  exists: boolean
  file: string | null
  doc: ToolPolicyDoc | null
  /** schema/解析问题：非空即 fatal（fail-closed）。 */
  problems: string[]
  /** 可运行的改进建议：不阻断求值。 */
  warnings: string[]
  fatal: boolean
}

export interface PolicyLintResult {
  doc: ToolPolicyDoc | null
  problems: string[]
  warnings: string[]
}

const RULE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const MAX_RULES = 200
const MAX_ARG_PATTERN = 200
const ARG_TEXT_MAX = 2000

const TOP_KEYS = new Set(['version', 'mode', 'rules', 'updatedAt', 'updatedBy'])
const RULE_KEYS = new Set(['id', 'name', 'enabled', 'priority', 'action', 'match', 'reason'])
const MATCH_KEYS = new Set(['tools', 'categories', 'users', 'profiles', 'argPattern'])

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function unknownKeys(obj: Record<string, unknown>, allowed: Set<string>, where: string, problems: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) problems.push(`${where} 含未知字段「${key}」——拼写错误不会被静默忽略`)
  }
}

function stringList(v: unknown, where: string, problems: string[], max = 100): string[] {
  if (!Array.isArray(v) || v.length === 0) {
    problems.push(`${where} 须为非空字符串数组`)
    return []
  }
  const out: string[] = []
  for (const raw of v.slice(0, max)) {
    if (typeof raw !== 'string' || !raw.trim()) {
      problems.push(`${where} 含非字符串或空值`)
      continue
    }
    const s = raw.trim()
    if (s.length > 120) problems.push(`${where} 单值超过 120 字符：${s.slice(0, 40)}…`)
    out.push(s)
  }
  if (v.length > max) problems.push(`${where} 至多 ${max} 项`)
  return [...new Set(out)]
}

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

/** 入参值文本：只取值不取键名，避免 "command" 这类键名误命中；深度/长度有界。 */
export function policyArgText(input: unknown): string {
  const values: string[] = []
  const walk = (v: unknown, depth: number): void => {
    if (values.length >= 40) return
    if (typeof v === 'string') values.push(v.slice(0, 1000))
    else if (typeof v === 'number' || typeof v === 'boolean') values.push(String(v))
    else if (Array.isArray(v) && depth < 2) {
      for (const item of v.slice(0, 20)) walk(item, depth + 1)
    } else if (isObject(v) && depth < 2) {
      for (const item of Object.values(v).slice(0, 20)) walk(item, depth + 1)
    }
  }
  walk(input, 0)
  return values.join(' ').slice(0, ARG_TEXT_MAX)
}

/** 工具/profile 模式：精确或尾部 * 前缀。 */
export function patternMatches(pattern: string, value: string): boolean {
  const p = String(pattern ?? '').trim()
  if (!p) return false
  if (p === '*') return true
  return p.endsWith('*') ? value.startsWith(p.slice(0, -1)) : value === p
}

/**
 * 校验并归一策略文档。未知字段、非法词表、坏正则、重复 id 均为 problems（fatal）；
 * 过宽规则、strict 无 allow 规则等为 warnings（可运行但应改进）。
 */
export function lintPolicyDoc(raw: unknown): PolicyLintResult {
  const problems: string[] = []
  const warnings: string[] = []
  if (!isObject(raw)) return { doc: null, problems: ['策略文档须为对象'], warnings }

  unknownKeys(raw, TOP_KEYS, '顶层', problems)
  if (raw.version !== TOOL_POLICY_VERSION) {
    problems.push(`version 须为 ${TOOL_POLICY_VERSION}，实得 ${String(raw.version)}`)
  }
  const mode = raw.mode
  if (typeof mode !== 'string' || !(POLICY_MODES as readonly string[]).includes(mode)) {
    problems.push(`mode 须为 ${POLICY_MODES.join('/')}，实得 ${String(mode)}`)
  }
  if (!Array.isArray(raw.rules)) {
    problems.push('rules 须为数组')
    return { doc: null, problems, warnings }
  }
  if (raw.rules.length > MAX_RULES) problems.push(`rules 至多 ${MAX_RULES} 条`)

  const ids = new Set<string>()
  const rules: ToolPolicyRule[] = []
  raw.rules.slice(0, MAX_RULES).forEach((entry, index) => {
    const where = `rules[${index}]`
    if (!isObject(entry)) {
      problems.push(`${where} 须为对象`)
      return
    }
    unknownKeys(entry, RULE_KEYS, where, problems)

    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (!RULE_ID_RE.test(id)) problems.push(`${where}.id 须为 1-64 位小写字母/数字/连字符`)
    else if (ids.has(id)) problems.push(`${where}.id 重复：${id}`)
    ids.add(id)

    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name || name.length > 120) problems.push(`${where}.name 必填且 ≤120 字符`)

    const enabled = entry.enabled === undefined ? true : entry.enabled
    if (typeof enabled !== 'boolean') problems.push(`${where}.enabled 须为布尔值`)

    const priority = entry.priority === undefined ? 0 : entry.priority
    if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0 || priority > 1000) {
      problems.push(`${where}.priority 须为 0-1000 的整数`)
    }

    const action = entry.action
    if (typeof action !== 'string' || !(POLICY_ACTIONS as readonly string[]).includes(action)) {
      problems.push(`${where}.action 须为 ${POLICY_ACTIONS.join('/')}`)
    }

    const matchRaw = entry.match
    if (!isObject(matchRaw)) {
      problems.push(`${where}.match 须为对象`)
      return
    }
    unknownKeys(matchRaw, MATCH_KEYS, `${where}.match`, problems)

    const match: ToolPolicyRuleMatch = {}
    if (matchRaw.tools !== undefined) match.tools = stringList(matchRaw.tools, `${where}.match.tools`, problems, 50)
    if (matchRaw.categories !== undefined) {
      if (!Array.isArray(matchRaw.categories) || matchRaw.categories.length === 0) {
        problems.push(`${where}.match.categories 须为非空数组`)
      } else {
        const cats: PolicyToolCategory[] = []
        for (const c of matchRaw.categories) {
          if (typeof c !== 'string' || !(POLICY_CATEGORIES as readonly string[]).includes(c)) {
            problems.push(`${where}.match.categories 含非法类别：${String(c)}`)
          } else cats.push(c as PolicyToolCategory)
        }
        match.categories = [...new Set(cats)]
      }
    }
    if (matchRaw.users !== undefined) match.users = stringList(matchRaw.users, `${where}.match.users`, problems, 50)
    if (matchRaw.profiles !== undefined) match.profiles = stringList(matchRaw.profiles, `${where}.match.profiles`, problems, 50)
    if (matchRaw.argPattern !== undefined) {
      if (typeof matchRaw.argPattern !== 'string' || !matchRaw.argPattern || matchRaw.argPattern.length > MAX_ARG_PATTERN) {
        problems.push(`${where}.match.argPattern 须为 1-${MAX_ARG_PATTERN} 字符字符串`)
      } else if (!compilePattern(matchRaw.argPattern)) {
        problems.push(`${where}.match.argPattern 不是合法正则：${matchRaw.argPattern}`)
      } else {
        match.argPattern = matchRaw.argPattern
      }
    }
    if (!match.tools && !match.categories && !match.users && !match.profiles && !match.argPattern) {
      problems.push(`${where}.match 至少需要一个条件（tools/categories/users/profiles/argPattern）`)
    }

    const reason = entry.reason === undefined ? undefined : String(entry.reason)
    if (reason !== undefined && reason.length > 240) problems.push(`${where}.reason ≤240 字符`)
    if (action === 'require_approval' && !reason?.trim()) {
      warnings.push(`规则「${name || id}」为需审批但仍建议填写 reason——审批人需要在收件箱看清原因`)
    }
    if (action === 'allow' && (match.tools ?? []).includes('*') && !match.categories && !match.users && !match.profiles && !match.argPattern) {
      warnings.push(`规则「${name || id}」允许所有工具且无其他条件——策略过宽，建议收窄`)
    }

    rules.push({
      id,
      name,
      enabled: enabled as boolean,
      priority: priority as number,
      action: action as PolicyAction,
      match,
      ...(reason ? { reason } : {}),
    })
  })

  const doc: ToolPolicyDoc = {
    version: TOOL_POLICY_VERSION,
    mode: (typeof mode === 'string' ? mode : 'permissive') as PolicyMode,
    rules,
    ...(typeof raw.updatedAt === 'number' ? { updatedAt: raw.updatedAt } : {}),
    ...(typeof raw.updatedBy === 'string' ? { updatedBy: raw.updatedBy } : {}),
  }

  const enabledRules = rules.filter((r) => r.enabled)
  if (doc.mode === 'strict' && !enabledRules.some((r) => r.action === 'allow')) {
    warnings.push('strict 模式没有任何启用的 allow 规则——所有工具调用都会被拒绝（这是 deny-by-default 的预期语义，确认后再保存）')
  }
  if (enabledRules.length === 0) warnings.push('没有启用的规则——策略当前不产生任何拦截')
  return { doc, problems, warnings }
}

const patternCache = new Map<string, RegExp>()

function compiled(pattern: string): RegExp | null {
  const hit = patternCache.get(pattern)
  if (hit) return hit
  const re = compilePattern(pattern)
  if (re) {
    if (patternCache.size >= 200) patternCache.clear()
    patternCache.set(pattern, re)
  }
  return re
}

export interface PolicyCall {
  tool: string
  category: PolicyToolCategory
  input: Record<string, unknown>
  userId?: string
  profileId?: string
}

export function ruleMatches(rule: ToolPolicyRule, call: PolicyCall): boolean {
  const m = rule.match
  if (m.tools?.length && !m.tools.some((p) => patternMatches(p, call.tool))) return false
  if (m.categories?.length && !m.categories.includes(call.category)) return false
  if (m.users?.length) {
    if (!call.userId || !m.users.includes(call.userId)) return false
  }
  if (m.profiles?.length) {
    if (!call.profileId || !m.profiles.some((p) => patternMatches(p, call.profileId as string))) return false
  }
  if (m.argPattern) {
    const re = compiled(m.argPattern)
    if (!re) return false // 校验过的文档不会走到这里；求值期坏正则按不匹配（fatal 由加载层兜底）
    if (!re.test(policyArgText(call.input))) return false
  }
  return true
}

export type PolicyVerdict =
  | { status: 'inactive'; reason: string }
  | { status: 'allow'; mode: PolicyMode; ruleId?: string; reason: string }
  | { status: 'deny'; mode: PolicyMode; ruleId?: string; reason: string }
  | { status: 'require_approval'; mode: PolicyMode; ruleId: string; reason: string }
  | { status: 'error'; reason: string }

/**
 * 确定性求值：启用规则按 priority 降序、同优先级按原顺序，取首条命中。
 * 无命中时 strict 拒绝（deny-by-default），permissive 放行（继续走既有链）。
 */
export function evaluatePolicy(snapshot: PolicySnapshot, call: PolicyCall): PolicyVerdict {
  if (!snapshot.exists) return { status: 'inactive', reason: '未配置工具策略' }
  if (snapshot.fatal || !snapshot.doc) {
    return {
      status: 'error',
      reason: `工具策略加载失败（fail-closed）：${snapshot.problems.slice(0, 3).join('；') || '文档不可用'}`,
    }
  }
  const doc = snapshot.doc
  const ordered = doc.rules
    .map((rule, index) => ({ rule, index }))
    .filter((x) => x.rule.enabled)
    .sort((a, b) => (b.rule.priority - a.rule.priority) || (a.index - b.index))
    .map((x) => x.rule)

  for (const rule of ordered) {
    if (!ruleMatches(rule, call)) continue
    const reason = rule.reason?.trim() || rule.name
    if (rule.action === 'deny') {
      return { status: 'deny', mode: doc.mode, ruleId: rule.id, reason: `策略规则「${rule.name}」(${rule.id})：${reason}` }
    }
    if (rule.action === 'require_approval') {
      return { status: 'require_approval', mode: doc.mode, ruleId: rule.id, reason: `策略规则「${rule.name}」(${rule.id})：${reason}` }
    }
    return { status: 'allow', mode: doc.mode, ruleId: rule.id, reason: `策略规则「${rule.name}」(${rule.id}) 显式放行` }
  }

  if (doc.mode === 'strict') {
    return {
      status: 'deny',
      mode: 'strict',
      reason: '严格模式（deny-by-default）：本次调用未命中任何显式 allow 规则',
    }
  }
  return { status: 'allow', mode: 'permissive', reason: '宽松模式：未命中任何规则（继续由既有权限链裁决）' }
}

export interface PolicyPosture {
  /** unconfigured=未配置；broken=配置损坏；saved-only=有配置但执法总闸未开；strict/permissive=生效中。 */
  status: 'unconfigured' | 'broken' | 'saved-only' | 'strict' | 'permissive'
  mode: PolicyMode | null
  totalRules: number
  enabledRules: number
  problems: string[]
  warnings: string[]
}

/** 治理姿态：把「未配置 / 坏了 / 只保存不拦截 / 生效中」四态显式化，杜绝仪表盘假 governed。 */
export function policyPosture(snapshot: PolicySnapshot, masterOn = process.env.HERMES_TOOL_ENFORCE === '1'): PolicyPosture {
  const doc = snapshot.doc
  const rules = doc?.rules ?? []
  const base = {
    mode: doc?.mode ?? null,
    totalRules: rules.length,
    enabledRules: rules.filter((r) => r.enabled).length,
    problems: snapshot.problems,
    warnings: snapshot.warnings,
  }
  if (!snapshot.exists) return { ...base, status: 'unconfigured' }
  if (snapshot.fatal || !doc) return { ...base, status: 'broken' }
  if (!masterOn) return { ...base, status: 'saved-only' }
  return { ...base, status: doc.mode }
}

/** 测试/展示用：三条起步策略（原文第八章「先写三条策略再说」）。 */
export function starterPolicyDoc(): ToolPolicyDoc {
  return {
    version: TOOL_POLICY_VERSION,
    mode: 'permissive',
    rules: [
      {
        id: 'deny-destructive-exec',
        name: '禁止破坏性命令',
        enabled: true,
        priority: 100,
        action: 'deny',
        match: {
          categories: ['exec'],
          argPattern: 'rm\\s+-rf|drop\\s+(table|database)|truncate\\s+table|mkfs(\\.|\\s)|dd\\s+if=|:\\s*>\\s*/dev/',
        },
        reason: '破坏性操作不可自动执行，请人工确认后另行处理',
      },
      {
        id: 'approve-external-actions',
        name: '外发动作需审批',
        enabled: true,
        priority: 90,
        action: 'require_approval',
        match: {
          categories: ['network'],
        },
        reason: '对外发送、委托与页面交互可能改变外部状态，需人工确认',
      },
      {
        id: 'deny-credential-files',
        name: '禁止读写凭证文件',
        enabled: true,
        priority: 80,
        action: 'deny',
        match: {
          categories: ['read', 'write'],
          argPattern: '(?:\\.ssh/|\\.aws/credentials|id_rsa|id_ed25519|\\.env(?:\\b|$)|\\.npmrc|\\.netrc|secrets?\\.(?:json|ya?ml|txt))',
        },
        reason: '凭证文件不得由 agent 读取或写入；确需处理请走密钥管理',
      },
    ],
  }
}

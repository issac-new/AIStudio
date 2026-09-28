// overlay/custom/server/approvals/risk-tier.ts
// V4-N1 审批风险分级（2026-09-28 V4 路演重构方案 §一 域1）：
// 按"可逆性 × 风险"把待审项分三档——
//   high   不可逆/对外可见（push、rm、发布、删库、杀进程…）：红色强制逐条裁决
//   medium 可逆常规（写文件、本地构建、commit 等）：默认档
//   low    只读查询（ls/git status/grep…）：标"可自动通过 · 抽检"
// 纯函数无 IO；pending 聚合时服务端权威分类，decide 时同函数重算入台账。
// v1 词表刻意保守：拿不准一律 medium（不低判高危、不高判只读）。

export type ApprovalRiskTier = 'high' | 'medium' | 'low'

export interface RiskClassifyInput {
  kind: 'command' | 'review' | 'kanban'
  /** 命令预览或卡详情 */
  detail?: string
  /** 会话/评审/看板卡标题 */
  title?: string
  /** 评审域（baseline/uncommitted/…） */
  domain?: string
}

/** 高危：不可逆或对外可见的命令模式。 */
const HIGH_COMMAND: RegExp[] = [
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\brm\s+/i,
  /\brmdir\s+/i,
  /\b(npm|yarn|pnpm)\s+publish\b/i,
  /\bdocker(-|\s+)compose\s+down\b/i,
  /\bdocker\s+(rm|rmi|stop|kill|system\s+prune)\b/i,
  /\b(kill|pkill|killall)\s+-?\d*/i,
  /\bkubectl\s+(apply|delete|drain|rollout)\b/i,
  /\bhelm\s+(install|upgrade|uninstall|rollback)\b/i,
  /\bdrop\s+(table|database|index)\b/i,
  /\btruncate\s+(table\s+)?\w+/i,
  /(发布|部署|上线|发版)/,
]

/** 低风险：只读命令（首词命中且不带写副作用参数）。 */
const LOW_COMMAND_LEAD = new Set([
  'ls', 'pwd', 'cat', 'head', 'tail', 'less', 'more', 'grep', 'rg', 'find',
  'wc', 'which', 'echo', 'printf', 'env', 'date', 'uname', 'ps', 'df', 'du',
  'tree', 'stat', 'file', 'jq', 'sort', 'uniq', 'diff', 'basename', 'dirname',
  'realpath', 'readlink', 'id', 'whoami', 'hostname', 'uptime',
])

/** git 只读子命令（带任何参数都不写仓库）。 */
const GIT_READONLY_ANY_ARGS = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'blame', 'describe', 'shortlog'])

/** git 条件只读子命令：仅当参数命中只读形态时算 low（branch -d / tag v1 / stash push 均为写）。 */
const GIT_READONLY_SAFE_ARGS: Record<string, RegExp> = {
  branch: /^(-[av]\s*)*$/,
  tag: /^(-[ln]\s*\S*\s*)*$/,
  remote: /^(-v|show\b|get-url\b)/,
  stash: /^(list|show)\b/,
}

function isReadonlyGit(rest: string): boolean {
  const sub = rest.split(/\s+/)[0] ?? ''
  if (GIT_READONLY_ANY_ARGS.has(sub)) return true
  const safe = GIT_READONLY_SAFE_ARGS[sub]
  if (!safe) return false
  return safe.test(rest.slice(sub.length).trim())
}

/** 高危语义关键词（评审/看板卡标题与详情）。 */
const HIGH_SEMANTIC = /(发布|准出|上线|发版|生产|release|deploy|production)/i

function classifyCommand(detail: string): ApprovalRiskTier {
  const text = detail.trim()
  if (!text) return 'medium'
  for (const re of HIGH_COMMAND) {
    if (re.test(text)) return 'high'
  }
  const lead = text.split(/\s+/)[0]?.replace(/^sudo$/, '') ?? ''
  const rest = text.slice(text.indexOf(lead) + lead.length).trim()
  if (LOW_COMMAND_LEAD.has(lead.toLowerCase())) return 'low'
  if (lead === 'git' && isReadonlyGit(rest)) return 'low'
  if (/^(npm|yarn|pnpm)\s+(ls|list|outdated|view|info|audit)\b/i.test(text)) return 'low'
  if (/^(node|python3?|ruby|java|go|rustc)\s+(--version|-v|-V)$/.test(text)) return 'low'
  return 'medium'
}

/** 待审项风险分档（服务端权威）。 */
export function classifyApprovalRisk(input: RiskClassifyInput): ApprovalRiskTier {
  if (input.kind === 'command') return classifyCommand(input.detail ?? '')
  const haystack = `${input.title ?? ''} ${input.detail ?? ''} ${input.domain ?? ''}`
  if (HIGH_SEMANTIC.test(haystack)) return 'high'
  return 'medium'
}

/** 档位合法性校验（decide 入参/台账回读用）。 */
export function isApprovalRiskTier(v: unknown): v is ApprovalRiskTier {
  return v === 'high' || v === 'medium' || v === 'low'
}

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

/**
 * 组合/写副作用形态：管道、命令序列、重定向、命令替换、find -exec、xargs/tee。
 * 首词只读不代表整条只读（`cat payload.sh | bash`、`echo x > /etc/cron.d/x`），
 * 任一命中即不得判 low（v1 保守原则：拿不准一律 medium）。
 */
const SHELL_COMPOSITE = /[|;&<>$\n`]|\bexec\b|-exec(dir)?\b|\bxargs\b|\btee\b/i

/** 低风险：只读命令（首词命中、无组合/写副作用形态）。 */
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

/** git 全局旗标（-C <path>、-c k=v、--git-dir=… 等）：剥掉后子命令/高危判据才不被首词干扰。
 *  run2 探针实锤两处盲区：`git -C /repo status` 被首词 '-C' 判 medium（保守可忍）；
 *  `git -C /repo push` 更是绕过 /\bgit\s+push\b/ 高危正则 → medium（安全向缺陷，必修）。 */
const GIT_GLOBAL_FLAG = /^(?:-C\s+\S+|-c\s+\S+=\S+|--git-dir(?:=\s*\S+|\s+\S+)|--work-tree(?:=\s*\S+|\s+\S+)|--namespace(?:=\s*\S+|\s+\S+)|--no-pager|--no-optional-locks|--literal-pathspecs)\s*/

function stripGitGlobalFlags(rest: string): string {
  let args = rest.trim()
  for (;;) {
    const m = GIT_GLOBAL_FLAG.exec(args)
    if (!m) return args
    args = args.slice(m[0].length)
  }
}

function isReadonlyGit(rest: string): boolean {
  const args = stripGitGlobalFlags(rest)
  const sub = args.split(/\s+/)[0] ?? ''
  if (GIT_READONLY_ANY_ARGS.has(sub)) return true
  const safe = GIT_READONLY_SAFE_ARGS[sub]
  if (!safe) return false
  return safe.test(args.slice(sub.length).trim())
}

/** 高危语义关键词（评审/看板卡标题与详情）。 */
const HIGH_SEMANTIC = /(发布|准出|上线|发版|生产|release|deploy|production)/i

function classifyCommand(detail: string): ApprovalRiskTier {
  const text = detail.trim()
  if (!text) return 'medium'
  // 高危判据在剥掉 git 全局旗标后的文本上执行（`git -C /repo push` 不再漏网）
  const effective = /^git\b/.test(text) ? `git ${stripGitGlobalFlags(text.slice(3).trim())}`.trim() : text
  for (const re of HIGH_COMMAND) {
    if (re.test(effective)) return 'high'
  }
  if (SHELL_COMPOSITE.test(effective)) return 'medium'
  const lead = effective.split(/\s+/)[0]?.replace(/^sudo$/, '') ?? ''
  const rest = effective.slice(effective.indexOf(lead) + lead.length).trim()
  if (LOW_COMMAND_LEAD.has(lead.toLowerCase())) return 'low'
  if (lead === 'git' && isReadonlyGit(rest)) return 'low'
  if (/^(npm|yarn|pnpm)\s+(ls|list|outdated|view|info|audit)\b/i.test(effective)) return 'low'
  if (/^(node|python3?|ruby|java|go|rustc)\s+(--version|-v|-V)$/.test(effective)) return 'low'
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

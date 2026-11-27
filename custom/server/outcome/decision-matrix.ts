// custom/server/outcome/decision-matrix.ts
// 决策画像与授权矩阵（spec §4.3，Task 5）——审批风险分类的新正身：
//   - classifyDecisionProfile：三维画像（riskTier/reversibility/externalEffect）。
//     riskTier 判据与原 approval-inbox/risk-tier.ts 逐字一致：正则与词表整体迁入本文件，
//     risk-tier.ts 的 classifyApprovalRisk 改为薄委托（行为字节级不变，
//     回归锁=__tests__/risk-tier.test.ts「回归锁」describe，委托化前后必须同绿）；
//   - combineProfiles：Outcome/Action 声明只能把自动分类调严，不能调松（spec §4.3）；
//   - evaluateOutcomeAction：授权矩阵逐格裁决。
// 共享判定向量=decision-vectors.json（TS/Python 双侧单一事实源：Python 侧 Task 11
// 直读该文件，TS 侧由 __tests__/decision-matrix.test.ts 全量断言，两侧不得漂移）。
import type { ModeId } from '../executioncontract/index'
import type { DecisionProfile, Reversibility, RiskTier } from './types'

/** 决策画像分类入参（原 RiskClassifyInput 同形状；kind 三类待审项）。 */
export interface DecisionClassifyInput {
  kind: 'command' | 'review' | 'kanban'
  /** 命令预览或卡详情 */
  detail?: string
  /** 会话/评审/看板卡标题 */
  title?: string
  /** 评审域（baseline/uncommitted/…） */
  domain?: string
}

// —— 以下正则/词表自 approval-inbox/risk-tier.ts 原样迁入（2026-11-19 Task 5）——
// 判据字节级不变；历史演进注释见原文件 git 记录与本节说明。

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

/** git 全局旗标（-C <path>、-c k=v、--git-dir=… 等）：剥掉后子命令/高危判据才不被首词干扰
 *  （`git -C /repo push` 曾绕过 /\bgit\s+push\b/ 高危正则——安全向缺陷，已修）。 */
const GIT_GLOBAL_FLAG = /^(?:-C\s+\S+|-c\s+\S+=\S+|--git-dir(?:=\s*\S+|\s+\S+)|--work-tree(?:=\s*\S+|\s+\S+)|--namespace(?:=\s*\S+|\s+\S+)|--no-pager|--no-optional-locks|--literal-pathspecs)\s*/

function stripGitGlobalFlags(rest: string): string {
  let args = rest.trim()
  for (;;) {
    const m = GIT_GLOBAL_FLAG.exec(args)
    if (!m) return args
    args = args.slice(m[0].length)
  }
}

/** 高危判据、one-way 与对外词表共用的有效文本：剥掉 git 全局旗标后的命令。 */
function effectiveCommandText(text: string): string {
  return /^git\b/.test(text) ? `git ${stripGitGlobalFlags(text.slice(3).trim())}`.trim() : text
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

/** 业务动作语义词（2026-11-28 B4，只用于评审/看板面）：资金收付动作与个人/客户数据类别。
 *  与 HIGH_COMMAND、ONE_WAY_COMMAND 有意分开维护（同 v1 画像词表先例——三表判据不同步，
 *  改一处不得静默影响另一处）。词表取舍（存量 3733 条标题实测，2026-11-28）：
 *  - 不收业务域名词（支付/结算）：「支付」命中 143 条、其中 93 条来自名为 pay 的看板板，
 *    「结算」命中 75 条——域名词命中等于按部门贴高危标签，不是风险分级；
 *  - 收资金动作词与数据类别词：存量命中「个人信息」2 条（0.05%），其余动作词命中 0 条；
 *  - 命令面不加这些词：写支付模块的代码、grep 退款 会被词面误伤。
 *  命中后果＝评审卡置顶计入高危数＋台账 risk=high＋治理总线事件升级；不设新门码
 *  （2026-11-01「机制扩展停止」裁定），可逆性不因此判 one-way（标题词面不足以支撑双签）。 */
const HIGH_BUSINESS_LEXICON = /(付款|转账|汇款|打款|放款|扣款|退款|收款|个人数据|个人信息|客户信息|敏感数据)/i

function classifyCommand(detail: string): RiskTier {
  const text = detail.trim()
  if (!text) return 'medium'
  // 高危判据在剥掉 git 全局旗标后的文本上执行（`git -C /repo push` 不再漏网）
  const effective = effectiveCommandText(text)
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

// —— v1 画像词表（任务简报逐字；与 HIGH_COMMAND 有意分开维护：两表判据不同步，
//    如 HIGH 含「部署」而 one-way 表不含，改一处不得静默影响另一处）——

/** 不可逆词表（简报 v1 逐字）：publish / git push / drop|truncate table / kubectl delete / 发布/上线/发版。 */
const ONE_WAY_COMMAND: RegExp[] = [
  /\bgit\s+push\b/i,
  /\b(npm|yarn|pnpm)\s+publish\b/i,
  /\bdrop\s+(table|database|index)\b/i,
  /\btruncate\s+(table\s+)?\w+/i,
  /\bkubectl\s+delete\b/i,
  /(发布|上线|发版)/,
]

/** 对外影响词表（简报 v1 逐字）：push / publish / deploy / 发送 / 上传。 */
const EXTERNAL_EFFECT = /\b(push|publish|deploy)\b|(发送|上传)/i

/**
 * 决策画像分类（spec §4.3）：riskTier 同既有判据；reversibility v1 只分三路——
 * one-way 词表命中→one-way、纯只读（判 low）→reversible、其余写副作用→unknown
 * （v1 不自动判 costly，costly 只经 combineProfiles 声明调严进入）。
 * basis 记录三维判据来源，供审批账与快照溯源。
 */
export function classifyDecisionProfile(input: DecisionClassifyInput): DecisionProfile {
  if (input.kind === 'command') {
    const text = (input.detail ?? '').trim()
    const riskTier = classifyCommand(text)
    // 空文本 effective 同为空串：one-way/对外词表均不命中，保守落 unknown
    const effective = text ? effectiveCommandText(text) : ''
    const basis: string[] = [`risk-tier:${riskTier}`]
    let reversibility: Reversibility
    if (ONE_WAY_COMMAND.some(re => re.test(effective))) {
      reversibility = 'one-way'
      basis.push('reversibility:one-way-lexicon')
    } else if (riskTier === 'low') {
      reversibility = 'reversible'
      basis.push('reversibility:readonly-command')
    } else {
      reversibility = 'unknown'
      basis.push('reversibility:write-side-effect-unproven')
    }
    const externalEffect = EXTERNAL_EFFECT.test(effective)
    if (externalEffect) basis.push('external-effect:lexicon')
    return { riskTier, reversibility, externalEffect, basis }
  }
  // 评审/看板：riskTier 沿用 HIGH_SEMANTIC 与业务动作词表同判据；非命令不可证明可逆性 → unknown 起步
  const haystack = `${input.title ?? ''} ${input.detail ?? ''} ${input.domain ?? ''}`
  const riskTier: RiskTier = (HIGH_SEMANTIC.test(haystack) || HIGH_BUSINESS_LEXICON.test(haystack)) ? 'high' : 'medium'
  const basis: string[] = [`risk-tier:${riskTier}`]
  const oneWay = ONE_WAY_COMMAND.some(re => re.test(haystack))
  const reversibility: Reversibility = oneWay ? 'one-way' : 'unknown'
  basis.push(oneWay ? 'reversibility:one-way-semantic' : 'reversibility:semantic-unproven')
  const externalEffect = EXTERNAL_EFFECT.test(haystack)
  if (externalEffect) basis.push('external-effect:lexicon')
  return { riskTier, reversibility, externalEffect, basis }
}

/** riskTier 只升不降：low(0)→medium(1)→high(2)。 */
const RISK_ORDER: Record<RiskTier, number> = { low: 0, medium: 1, high: 2 }

/** reversibility 只向 one-way 收：reversible(0)→costly(1)→one-way(2)；unknown 不参与序。 */
const REVERSIBILITY_ORDER: Record<Exclude<Reversibility, 'unknown'>, number> = {
  reversible: 0,
  costly: 1,
  'one-way': 2,
}

/**
 * 声明合并（spec §4.3「只能调严、不能调松」）：
 *   - riskTier 只升不降，降级项忽略；
 *   - reversibility 只向 one-way 收，放宽项忽略；unknown 冻结——auto 为 unknown 时不被
 *     declared 改动，declared 为 unknown 时也不改动已知值；
 *   - externalEffect 只可置 true，撤 true 属调松、忽略。
 * 违规项一律忽略并写入 basis（combine:* 记录），不抛错；declared 缺省原样返回拷贝。
 */
export function combineProfiles(auto: DecisionProfile, declared?: DecisionProfile): DecisionProfile {
  if (!declared) return { ...auto, basis: [...auto.basis] }
  const basis = [...auto.basis]
  let { riskTier, reversibility, externalEffect } = auto

  if (declared.riskTier !== riskTier) {
    if (RISK_ORDER[declared.riskTier] > RISK_ORDER[riskTier]) {
      riskTier = declared.riskTier
      basis.push(`combine:risk-raised:${auto.riskTier}->${declared.riskTier}`)
    } else {
      basis.push(`combine:risk-loosen-ignored:${auto.riskTier}->${declared.riskTier}`)
    }
  }

  if (declared.reversibility !== reversibility) {
    if (reversibility === 'unknown') {
      basis.push(`combine:reversibility-unknown-frozen:${declared.reversibility}-ignored`)
    } else if (declared.reversibility === 'unknown') {
      basis.push(`combine:reversibility-unknown-ignored:${auto.reversibility}-kept`)
    } else if (REVERSIBILITY_ORDER[declared.reversibility] > REVERSIBILITY_ORDER[reversibility]) {
      reversibility = declared.reversibility
      basis.push(`combine:reversibility-tightened:${auto.reversibility}->${declared.reversibility}`)
    } else {
      basis.push(`combine:reversibility-loosen-ignored:${auto.reversibility}->${declared.reversibility}`)
    }
  }

  if (declared.externalEffect !== externalEffect) {
    if (declared.externalEffect) {
      externalEffect = true
      basis.push('combine:external-effect-set')
    } else {
      basis.push('combine:external-effect-unset-ignored')
    }
  }

  return { riskTier, reversibility, externalEffect, basis }
}

export interface OutcomeActionDecision {
  action: 'allow' | 'ask' | 'deny'
  /** high+one-way 双签格为 true：结果责任人＋独立复核人（spec §4.3 表，三挡一致）。 */
  dualSignRequired: boolean
  decidedBy: string
  rule: string
}

/**
 * 授权矩阵逐格裁决（spec §4.3 表＝任务简报逐字）：
 *   1. plan 先于矩阵：对 outcome-scoped 动作一律 deny（plan 只读挡没有执行面）；
 *   2. high+one-way → ask＋双签；
 *   3. high / one-way / unknown / externalEffect 任一 → ask；
 *   4. medium 或 costly → build:ask、guarded/yolo:allow（decidedBy=policy:risk-evaluated）；
 *   5. low+reversible+无外部影响 → allow。
 * 未知挡 fail-closed 为 ask（不猜 allow/deny，同 executioncontract 四挡判定器）。
 */
export function evaluateOutcomeAction(input: {
  mode: ModeId | string
  profile: DecisionProfile
}): OutcomeActionDecision {
  const { mode, profile } = input

  if (mode === 'plan')
    return { action: 'deny', dualSignRequired: false, decidedBy: 'policy:plan-readonly', rule: 'plan-readonly' }

  if (mode !== 'build' && mode !== 'guarded' && mode !== 'yolo')
    return { action: 'ask', dualSignRequired: false, decidedBy: 'policy:risk-evaluated', rule: 'fail-closed-unknown-mode' }

  if (profile.riskTier === 'high' && profile.reversibility === 'one-way')
    return { action: 'ask', dualSignRequired: true, decidedBy: 'policy:risk-evaluated', rule: 'high-one-way-dual-sign' }

  if (profile.riskTier === 'high' || profile.reversibility === 'one-way' || profile.reversibility === 'unknown' || profile.externalEffect)
    return { action: 'ask', dualSignRequired: false, decidedBy: 'policy:risk-evaluated', rule: 'risk-strict-ask' }

  if (profile.riskTier === 'medium' || profile.reversibility === 'costly') {
    if (mode === 'build')
      return { action: 'ask', dualSignRequired: false, decidedBy: 'policy:risk-evaluated', rule: 'medium-costly-build-ask' }
    return { action: 'allow', dualSignRequired: false, decidedBy: 'policy:risk-evaluated', rule: 'medium-costly-policy-allow' }
  }

  if (profile.riskTier === 'low' && profile.reversibility === 'reversible' && !profile.externalEffect)
    return { action: 'allow', dualSignRequired: false, decidedBy: 'policy:readonly', rule: 'low-reversible-allow' }

  // 防御兜底：枚举空间外组合 fail-closed 为 ask（正常输入不可达）
  return { action: 'ask', dualSignRequired: false, decidedBy: 'policy:risk-evaluated', rule: 'fail-closed-ask' }
}

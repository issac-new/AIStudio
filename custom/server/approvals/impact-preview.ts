// overlay/custom/server/approvals/impact-preview.ts
// 副作用影响面预览（Blast Radius，2026-10-04 九源调研落地项①）。
//
// 出处：Claude Code Mods 官方 Blast Radius 模组（删除/重置操作先摆出受影响
// 清单再由人决定）与 DeepSeek Harness v0.2.1-alpha.1 Claude Code Mods 兼容层
// 的 tool.call 持有模式（Proceed/Cancel 前先给影响面）。产品化定位：
// 审批收件箱在裁决高危命令前，服务端权威解析"这条命令将触及哪些目标"，
// 人先看清影响面再点确认——对应《Agent Harness 工程》"权限必须早于副作用"
// 与 EqualAI 治理报告"重大决策保持人机协同"。
//
// 纯函数无 IO：只做模式解析，不触碰文件系统（文件枚举属控制器职责，且
// 路径以 agent 会话工作区为准，服务端无法可靠还原——v1 如实给"模式清单 +
// 是否无法界定"，不猜数）。保守原则与 risk-tier.ts 一致：拿不准标
// unbounded（影响面无法界定），宁可让人多看一眼。
export type ImpactDanger = 'delete' | 'worktree-reset' | 'overwrite'

export interface ImpactTarget {
  /** 命令里出现的原始目标串（路径/通配/引用，未解析） */
  spec: string
  kind: 'path' | 'glob' | 'flag-arg'
}

export interface CommandImpact {
  danger: ImpactDanger
  targets: ImpactTarget[]
  /** true = 目标含变量/根路径/裸通配等无法静态界定的形态，清单不完整 */
  unbounded: boolean
  /** unbounded 或解析受限时的说明 token（前端本地化） */
  note?: 'variable-target' | 'root-path' | 'bare-glob' | 'subshell'
}

/** 词法切分：尊重单双引号；结果保留原串位置信息不需要，简单返回 token 数组。 */
function tokenize(command: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (const ch of command.trim()) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (cur) out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur) out.push(cur)
  return out
}

const RM_FLAGS = /^-[a-zA-Z]+$/
const isFlag = (t: string): boolean => t.startsWith('-') && t !== '-'
/** rm/rmdir 的 "-f a -f b" 长旗标（取值型）暂不支持：当作 flag-arg 目标太嘈杂，v1 忽略。 */

function classifyTarget(spec: string): ImpactTarget['kind'] {
  if (/[*?]/.test(spec)) return 'glob'
  return 'path'
}

/** rm 风格：剥旗标后剩余 token 全为目标；$VAR/`cmd` 置 unbounded。 */
function parseRm(tokens: string[]): CommandImpact | null {
  const targets: ImpactTarget[] = []
  let unbounded = false
  let note: CommandImpact['note'] | undefined
  for (const t of tokens) {
    if (isFlag(t) && RM_FLAGS.test(t)) continue
    if (t === '--') continue
    const spec = t
    if (/[$`]|\$\(/.test(spec)) { unbounded = true; note ||= 'variable-target'; continue }
    if (spec === '/' || spec === '/*' || /^\/{2,}$/.test(spec)) { unbounded = true; note ||= 'root-path'; continue }
    targets.push({ spec, kind: classifyTarget(spec) })
  }
  if (!targets.length && !unbounded) return null
  return { danger: 'delete', targets, unbounded, note }
}

/** git 子命令族：git clean -fd [paths] / git reset --hard / git checkout|restore -- paths。 */
function parseGit(tokens: string[]): CommandImpact | null {
  // 剥全局旗标（-C path 等，与 risk-tier 同款保守处理：取值型旗标的值会被当路径吗？
  // -C <path> 是切换目录不是删除目标——显式跳过它和它的值。）
  let i = 0
  while (i < tokens.length && /^-C$|^--git-dir|^--work-tree/.test(tokens[i]!)) {
    i += tokens[i] === '-C' ? 2 : 1
  }
  const sub = tokens[i] ?? ''
  const rest = tokens.slice(i + 1)

  if (sub === 'clean') {
    const hasDelete = rest.some((t) => /^-[a-zA-Z]*[fd]/.test(t))
    if (!hasDelete) return null
    const targets: ImpactTarget[] = []
    let unbounded = false
    let note: CommandImpact['note'] | undefined
    for (const t of rest) {
      if (isFlag(t)) continue
      if (t === '--') continue
      if (/[$`]/.test(t)) { unbounded = true; note ||= 'variable-target'; continue }
      if (t === '.' || t === '*') { unbounded = true; note ||= 'bare-glob'; continue }
      targets.push({ spec: t, kind: classifyTarget(t) })
    }
    // git clean 无显式 path = 整个工作区未跟踪文件
    return { danger: 'delete', targets, unbounded: unbounded || targets.length === 0, note: note ?? (targets.length === 0 ? 'bare-glob' : undefined) }
  }

  if (sub === 'reset' && /^--hard/.test(rest[0] ?? '')) {
    // 影响面 = 已跟踪文件的工作区改动（无法静态枚举，如实标注）
    return { danger: 'worktree-reset', targets: [], unbounded: true, note: 'bare-glob' }
  }

  if ((sub === 'checkout' || sub === 'restore') && rest.includes('--')) {
    const after = rest.slice(rest.indexOf('--') + 1)
    if (!after.length) return null
    const targets = after
      .filter((t) => !/[$`]/.test(t))
      .map((spec) => ({ spec, kind: classifyTarget(spec) }))
    const hasVar = after.some((t) => /[$`]/.test(t))
    return { danger: 'overwrite', targets, unbounded: hasVar, note: hasVar ? 'variable-target' : undefined }
  }
  return null
}

/** find … -delete：目标 = 起始路径（`.`/通配/变量起点 = 递归全域，unbounded）。 */
function parseFind(tokens: string[]): CommandImpact | null {
  if (!tokens.includes('-delete')) return null
  const start = tokens.slice(1).find((t) => !isFlag(t) && t !== '(' && t !== ')' && !t.startsWith('-'))
  if (!start) return { danger: 'delete', targets: [], unbounded: true, note: 'bare-glob' }
  const varTarget = /[$`]/.test(start)
  const broad = start === '.' || start === '*' || start === '/*' || /[*?]/.test(start)
  return {
    danger: 'delete',
    targets: [{ spec: start, kind: classifyTarget(start) }],
    unbounded: varTarget || broad,
    note: varTarget ? 'variable-target' : broad ? 'bare-glob' : undefined,
  }
}

/**
 * 解析单条 shell 命令的破坏性影响面。返回 null = 非破坏性模式（或拿不准形态
 * 未收录，此时交给 risk-tier 分档，不假装零影响）。
 *
 * 覆盖面 v1：rm/rmdir、git clean -f/-d、git reset --hard、git checkout|restore --、
 * find -delete、`> file` 覆盖重定向、truncate。组合形态（管道/&&/;）按段逐一
 * 解析，任一段命中即返回该段影响面（最保守段优先：unbounded 段优先返回）。
 */
export function analyzeCommandImpact(command: string): CommandImpact | null {
  const text = (command || '').trim()
  if (!text) return null
  // 分段：&& || ; | 换行（quote 内不切——v1 简化：先按引号感知切分符）
  const segments = splitSegments(text)
  const impacts = segments
    .map((seg) => analyzeSegment(seg))
    .filter((v): v is CommandImpact => v != null)
  if (!impacts.length) return null
  // unbounded 段最优先（影响面不可界定比可枚举更值得人看）
  return impacts.find((im) => im.unbounded) ?? impacts[0]!
}

/** 引号感知的命令分段（组合算符处切开）。 */
function splitSegments(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === '&' && text[i + 1] === '&') { if (cur.trim()) out.push(cur); cur = ''; i++; continue }
    if (ch === '|' && (text[i + 1] === '|' || true)) {
      // 单 | 与 || 都切段（管道前段的删除也是删除；v1 不追踪管道语义）
      if (cur.trim()) out.push(cur)
      cur = ''
      if (text[i + 1] === '|') i++
      continue
    }
    if (ch === ';' || ch === '\n') { if (cur.trim()) out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function analyzeSegment(segment: string): CommandImpact | null {
  // 覆盖重定向 `> file` / `>> file`（>> 是追加，覆盖才算 overwrite）
  const redirect = /(^|[\s;])>{1,2}\s*(\S+)/.exec(segment)
  if (redirect && redirect[1] !== undefined && !redirect[0].includes('>>')) {
    const spec = redirect[2]!
    return {
      danger: 'overwrite',
      targets: [{ spec, kind: classifyTarget(spec) }],
      unbounded: /[$`]/.test(spec),
      note: /[$`]/.test(spec) ? 'variable-target' : undefined,
    }
  }
  const tokens = tokenize(segment)
  if (!tokens.length) return null
  let headIdx = 0
  while (headIdx < tokens.length && (tokens[headIdx] === 'sudo' || tokens[headIdx] === 'env')) headIdx++
  const head = tokens[headIdx] ?? ''
  const rest = tokens.slice(headIdx + 1)
  switch (head) {
    case 'rm':
    case 'rmdir':
      return parseRm(rest)
    case 'git':
      return parseGit(rest)
    case 'find':
      return parseFind(tokens)
    case 'truncate':
      return {
        danger: 'overwrite',
        targets: rest.filter((t) => !isFlag(t)).map((spec) => ({ spec, kind: classifyTarget(spec) })),
        unbounded: rest.some((t) => /[$`]/.test(t)),
      }
    default:
      return null
  }
}

/** 影响面摘要 token（服务端不拼中文；前端 i18n 本地化）。 */
export interface ImpactSummaryTokens {
  danger: ImpactDanger
  targetCount: number
  unbounded: boolean
}

export function summarizeImpact(impact: CommandImpact | null): ImpactSummaryTokens | null {
  if (!impact) return null
  return { danger: impact.danger, targetCount: impact.targets.length, unbounded: impact.unbounded }
}

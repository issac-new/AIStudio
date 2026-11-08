// overlay[expcandidates] 反思守卫（EvoTeam 吸收，2026-11-08）。
//
// 语义：经验候选转 approved 前做确定性校验——泛泛而谈、文件行号级、与既有经验自相矛盾
// 三类陈述拒收（对应论文提示词补丁校验纪律）。提取期不拦（保留证据），审核批准时拦。
// 纪律：拒收给理由，允许先改陈述再批；只做确定性判据，不做语义评分。

export interface ReflectionGuardResult {
  ok: boolean
  reasons: string[]
}

/** 泛泛而谈：没有可执行判据的空话（中英双语）。 */
export const GENERIC_PATTERNS: RegExp[] = [
  /总是(?:要)?(?:验证|检查)/i,
  /务必.{0,6}(?:检查|验证)/i,
  /记得(?:要)?/i,
  /更加小心/i,
  /^仔细(?:检查|核对)/,
  /确保(?:一切|正确|无误)/i,
  /不要忘记/i,
  /always verify/i,
  /always check/i,
  /remember to/i,
  /be more careful/i,
  /pay attention/i,
  /double-check/i,
  /make sure to/i,
  /try to be more/i,
]

/** 过窄：只对单个文件/行号成立，不是可复用经验。 */
export const NARROW_PATTERNS: RegExp[] = [
  /[\w./\\-]+\.(?:ts|tsx|js|mjs|cjs|py|go|rs|java|rb|php|md):\d+/i,
  /第\s*\d+\s*行/,
  /fix line \d+/i,
  /in file .*\.\w+/i,
  /in the function .*:/i,
  /in class .*:/i,
]

/** 自相矛盾对：新陈述含一侧、既有陈述含另一侧即拒收（保守配对，不猜语义）。 */
export const CONTRADICTION_PAIRS: Array<[string, string]> = [
  ['先跑测试', '跳过测试'],
  ['运行测试', '跳过测试'],
  ['先验证', '直接提交'],
  ['独立验证', '自审即可'],
  ['优先正确', '优先速度'],
  ['立即验证', '稍后验证'],
  ['run tests', 'skip tests'],
  ['fail fast', 'try all options'],
  ['prioritize speed', 'prioritize accuracy'],
  ['ask for help', 'work independently'],
]

export const MIN_STATEMENT_CHARS = 10
export const MAX_STATEMENT_CHARS = 2000

/**
 * 校验一条经验陈述。
 * @param statement 待批准陈述
 * @param existing 已批准陈述（矛盾检查用；为空则跳过该维）
 */
export function validateReflectionStatement(statement: string, existing: string[] = []): ReflectionGuardResult {
  const reasons: string[] = []
  const text = String(statement ?? '').trim()
  if (!text) {
    return { ok: false, reasons: ['陈述为空'] }
  }
  if (text.length < MIN_STATEMENT_CHARS) {
    reasons.push(`陈述过短（<${MIN_STATEMENT_CHARS} 字符），没有可复用信息`)
  }
  if (text.length > MAX_STATEMENT_CHARS) {
    reasons.push(`陈述过长（>${MAX_STATEMENT_CHARS} 字符），应拆成多条或压缩`)
  }
  for (const re of GENERIC_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`陈述过于泛泛（命中「${re.source}」），须给出可执行判据`)
      break
    }
  }
  for (const re of NARROW_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`陈述过窄（命中「${re.source}」），文件/行号级不可跨任务复用`)
      break
    }
  }
  const lower = text.toLowerCase()
  for (const other of existing) {
    const prev = String(other ?? '').toLowerCase()
    if (!prev.trim() || prev === lower) continue
    for (const [a, b] of CONTRADICTION_PAIRS) {
      const newA = lower.includes(a.toLowerCase())
      const newB = lower.includes(b.toLowerCase())
      const oldA = prev.includes(a.toLowerCase())
      const oldB = prev.includes(b.toLowerCase())
      if ((newA && oldB) || (newB && oldA)) {
        reasons.push(`与既有经验自相矛盾（「${a}」/「${b}」）`)
        break
      }
    }
    if (reasons.some((r) => r.includes('自相矛盾'))) break
  }
  return { ok: reasons.length === 0, reasons }
}

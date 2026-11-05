/**
 * G1 需求四要素判读（融合批一）——语义正本自 simharness reqgate_judge
 * （mx-scenario-lib.sh:2160）逐字移植，双侧一致为退役判据。
 *
 * 四要素：验收标准（段在 + AC 编号 + 无模糊词）/ Scope-Out / 影响面 / 涉敏判定。
 * 模糊词只扫 AC 条目行（行首 "- **AC-N"）——规则说明行自身引用模糊词示例，
 * 扫全段必自指误报（v3 实测 bug，语义保留）。
 */

export interface RequirementJudgeResult {
  ok: boolean
  /** 缺失项清单（空=全过）；措辞与驱动回灌提示逐字一致 */
  missing: string[]
}

// 模糊词单一事实源=config/fuzzy-words.json 的 core 表（2026-11-05 AI Native 吸收批 T1，
// 决策 D-3）；读取失败 fail-soft 回落到内嵌同表，判定语义不变。
const FUZZY_FALLBACK = ['性能良好', '体验优秀', '快速', '稳定'] as const

function loadFuzzyWords(): readonly string[] {
  try {
    // require 形态与域内 controller.ts 的运行时读取一致（CJS 编译产物兼容）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { existsSync, readFileSync } = require('node:fs') as typeof import('node:fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('node:path') as typeof import('node:path')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { repoRoot } = require('../../lib/upstream') as typeof import('../../lib/upstream')
    const path = join(repoRoot(), 'config/fuzzy-words.json')
    if (!existsSync(path)) return FUZZY_FALLBACK
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { core?: string[] }
    if (!Array.isArray(parsed.core) || parsed.core.length === 0) return FUZZY_FALLBACK
    return parsed.core
  } catch {
    return FUZZY_FALLBACK
  }
}

const FUZZY_RE = new RegExp(loadFuzzyWords().join('|'))
const AC_ITEM_RE = /^- \*\*AC-\d+/

/** 提取「## 验收标准」节内容（到下一个 `## ` 行为止，含终止行——sed 区间同款）。 */
function acceptanceSection(doc: string): string {
  const lines = doc.split('\n')
  const start = lines.findIndex((l) => /^## .*验收标准/.test(l))
  if (start === -1) return ''
  const out = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    out.push(lines[i])
    if (/^## /.test(lines[i])) break
  }
  return out.join('\n')
}

export function judgeRequirementFreeze(doc: string): RequirementJudgeResult {
  const missing: string[] = []
  const section = acceptanceSection(doc)
  const acCount = section.split('\n').filter((l) => AC_ITEM_RE.test(l)).length
  // 方案 §5.3 G1：逐条 AC ≥3（禁空话）。只认 AC 条目行，不扫规则说明行。
  if (acCount < 3) {
    missing.push(`验收标准段缺失或 AC 少于 3 条（实测 ${acCount}）`)
  }
  const acItems = section.split('\n').filter((l) => AC_ITEM_RE.test(l))
  if (acItems.some((l) => FUZZY_RE.test(l))) {
    missing.push('AC 含模糊词（不可机械化判定）')
  }
  if (!/^## .*Scope-Out/m.test(doc)) missing.push('Scope-Out 缺失')
  if (!/^## .*影响面/m.test(doc)) missing.push('影响面缺失')
  if (!/涉敏|ISO27001|iso27001/.test(doc)) missing.push('涉敏判定缺失')
  return { ok: missing.length === 0, missing }
}

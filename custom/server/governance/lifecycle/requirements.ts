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

const FUZZY_RE = /性能良好|体验优秀|快速|稳定/
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
  if (!/^## .*验收标准/m.test(doc) || !/AC-\d/.test(doc)) {
    missing.push('验收标准段缺失或无 AC 编号')
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

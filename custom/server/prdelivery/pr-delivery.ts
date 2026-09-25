// overlay/prdelivery 域：PR 交付链提示词规约（multica §七 表 #19 吸收，矩阵 §3.5 P2）。
//
// multica 语义（PR 交付链提示词规约：gh pr create --base+分支语义）：交付走 PR——
// - **--base 语义**：PR 必须显式指定 base 分支（默认分支陷阱：忘指=提错基）；
// - **分支语义**：feature 分支命名规约（type/scope-slug）；
// - **验据要求**：PR 描述带验证证据（测试输出锚点——400 done 同纪律）。
// 本模块=规约模板+PR 校验（纯函数）：buildPrPrompt（提示词资产）+ validatePr（校验）。
export interface PrDraft {
  branch: string
  base: string
  title: string
  body: string
  /** 已跑验证（命令+结果摘要）。 */
  verification?: { command: string; summary: string }
}

export interface PrValidationIssue {
  where: string
  issue: string
}

const BRANCH_RE = /^(feat|fix|refactor|docs|test|chore|perf)\/[a-z0-9][a-z0-9-]{2,60}$/

/** PR 规约校验（base 显式/分支命名/标题/验据锚点——multica 交付纪律）。 */
export function validatePr(pr: PrDraft): PrValidationIssue[] {
  const issues: PrValidationIssue[] = []
  if (!pr.base || !pr.base.trim()) {
    issues.push({ where: 'base', issue: 'base 必须显式指定（multica --base 语义：防默认分支陷阱）' })
  }
  if (!BRANCH_RE.test(pr.branch)) {
    issues.push({ where: 'branch', issue: `分支命名不符 type/slug 规约（现状 ${pr.branch}）` })
  }
  if (!pr.title || pr.title.trim().length < 8) {
    issues.push({ where: 'title', issue: '标题须 ≥8 字符（说清做了什么）' })
  }
  if (!pr.verification) {
    issues.push({ where: 'verification', issue: '缺验证证据（400 done 锚点纪律：命令+结果摘要）' })
  } else if (!pr.verification.command.trim() || !pr.verification.summary.trim()) {
    issues.push({ where: 'verification', issue: '验证证据须含命令与结果摘要（非空）' })
  }
  return issues
}

/** 交付提示词资产（agent 建 PR 前的规约简报——multica 提示词规约语义）。 */
export function buildPrPrompt(pr: PrDraft): string {
  return [
    `[pr-delivery] 交付规约（multica PR 交付链）`,
    `1. 命令必须显式 base：\`gh pr create --base ${pr.base || '<默认分支>'} --head ${pr.branch}\`（--base 不省略）。`,
    `2. 分支语义：${pr.branch}（type/slug 规约）；标题：${pr.title || '<待填>'}。`,
    `3. 描述带验证证据：命令输出锚点（测试命令+结果摘要）；无验证证据的 PR 不提。`,
    `4. 交付边界：PR 进 review 是你的终点；合并是人的动作。`,
  ].join('\n')
}

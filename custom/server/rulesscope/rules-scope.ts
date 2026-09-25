// overlay/rulesscope 域：规则体系四型作用域（qoder 规则体系四型+两级分治吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义：always（始终生效=项目红线）/ model-decides（模型酌情=建议型）/
// at-manual（@手动触发才生效）/ glob（文件匹配才生效）。两级分治 global/project
// 同 memory-scope 语义。衔接 memory-taxonomy convention 类与 learn-distill rules
// 归宿：本层只做规则匹配语义纯函数。
export type RuleKind = 'always' | 'model-decides' | 'at-manual' | 'glob'
export interface Rule {
  ruleId: string
  kind: RuleKind
  scope: 'global' | 'project'
  text: string
  /** glob 作用域模式（kind=glob 才有意义）。 */
  pattern?: string
}
export interface RuleContext {
  /** 人是否 @ 手动触发。 */
  manualTrigger: boolean
  /** 当前文件路径（glob 匹配）。 */
  filePath: string
}

/** 简化 glob 匹配（* 匹配段内任意、** 跨段任意——够规则作用域用）。 */
function globMatch(pattern: string, path: string): boolean {
  const marker = String.fromCharCode(0)
  const re = new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, marker)
      .replace(/\*/g, '[^/]*')
      .split(marker).join('.*') + '$',
  )
  return re.test(path)
}

/** 规则适用判定（qoder 四型语义）。 */
export function ruleApplies(rule: Rule, ctx: RuleContext): boolean {
  switch (rule.kind) {
    case 'always':
      return true
    case 'at-manual':
      return ctx.manualTrigger
    case 'glob':
      return rule.pattern ? globMatch(rule.pattern, ctx.filePath) : false
    case 'model-decides':
      return true // 恒列入候选，适用与否由模型判定
  }
}

/** 两级合并视图：全局+项目规则一并按四型语义过滤。 */
export function applicableRules(rules: readonly Rule[], ctx: RuleContext): Rule[] {
  return rules.filter((r) => ruleApplies(r, ctx))
}

// overlay/custom/server/skillgov/skill-failure-attribution.ts
// 技能失败三分归因（2026-11-20 综述吸收轮 C）。
//
// 出处：《When, Where, and How Experience Becomes Structure》§7 Figure 8——
// 坏结果不总意味着技能本身错：可能是选错了技能（改路由/检索）、照着合适技能
// 但执行跳步（改 Harness 完成检查）、或流程缺步/错步（修 Skill 本体）。
// 三分导向不同修复目标，混为一谈会把该改路由的账记到技能头上。
// 产品化定位：纯函数诊断器——输入失败信号，输出判定＋修复目标建议；
// 只出建议不改行为（消费方：skill-lifecycle 归档决策、复盘根因分层、
// workbench 起草建议）。fail-soft：信号不足一律 unknown，不猜。
// 调研对账正本：docs/reports/2026-11-20-rsi-lifecycle-survey.md §三.3。

/** 判定五态（综述三分＋供给缺口＋不可判） */
export type SkillFailureKind =
  | 'selection_miss' // 选错/没选中技能 → 改路由/检索
  | 'execution_miss' // 选对但执行跳步 → 改 Harness 完成检查
  | 'skill_defect' // 流程缺步/错步 → 修 Skill 本体
  | 'supply_gap' // 候选集本无技能 → 新建/生成（R2 阶梯）
  | 'unknown' // 信号不足 → fail-soft 不猜

export type SkillFailureFixTarget =
  | 'route' // 检索/路由（技能描述、索引、相似度）
  | 'harness_completion_check' // Harness 完成检查（can_finish 类门控）
  | 'skill_body' // Skill 本体（步骤/输入/失败处理）
  | 'skill_supply' // 技能供给（生成/挂载）
  | 'none' // unknown：先补观测再归因

export interface SkillFailureSignal {
  /** 本次实际路由/选中的技能名；null=未选中任何技能 */
  skillInvoked?: string | null
  /** 候选集里可用技能数（0=无技能可用）；缺省视为不可观测 */
  skillsAvailable?: number | null
  /** 技能声明步骤数（SKILL.md 流程步数）；null=不可观测 */
  stepsDeclared?: number | null
  /** 实际完成步骤数（守门/轨迹证据）；null=不可观测 */
  stepsCompleted?: number | null
  /** 失败签名（如 sig-missed-capability、步骤缺失关键词）；空=无签名 */
  failureSignature?: string
}

export interface SkillFailureVerdict {
  kind: SkillFailureKind
  fixTarget: SkillFailureFixTarget
  /** 判据来源：derived=机械可判；inferred=依赖签名词面推断 */
  confidence: 'derived' | 'inferred'
  rationale: string
  /** 论文锚（Figure 8 三分映射） */
  paperAnchor: string
}

const PAPER_ANCHOR = '综述 §7 Figure 8（paper:1058-1065, 1136-1139）'

/** 失败签名词面（保守窄集；命中才升级判定，宁 unknown 不误判） */
const SIG_SELECTION = /missed-capability|no-skill|skill-not-found|未选中技能|无可用技能|capability-gap/i
const SIG_STEP_MISSING = /missing-step|step-missing|缺步|步骤缺失|流程缺/i
const SIG_SKIPPED = /skipped-step|partial-exec|跳步|只执行一半|执行遗漏/i

/**
 * 三分归因主函数（纯函数）。
 * 判序（机械优先，词面兜底）：
 * 1) 候选集为空 → supply_gap（这不是三分内的问题，是没得选）。
 * 2) 未选中技能但候选集有货 → selection_miss（改路由——技能可能没错）。
 * 3) 步骤可观测且完成<声明 → execution_miss（选对了、没跑完——Harness 完成检查的事）。
 * 4) 步骤完成=声明但结果仍失败 → skill_defect（照做做完仍错——流程本身的问题）。
 * 5) 签名词面可判的补位（步骤不可观测时）。
 * 6) 其余 unknown。
 */
export function attributeSkillFailure(signal: SkillFailureSignal): SkillFailureVerdict {
  const invoked = signal.skillInvoked ?? null
  const available = signal.skillsAvailable ?? null
  const declared = signal.stepsDeclared ?? null
  const completed = signal.stepsCompleted ?? null
  const sig = signal.failureSignature ?? ''

  if (available === 0) {
    return {
      kind: 'supply_gap',
      fixTarget: 'skill_supply',
      confidence: 'derived',
      rationale: '候选集为空：无技能可选，谈不上选错或做错——走供给阶梯（生成/挂载），并登记能力缺口',
      paperAnchor: PAPER_ANCHOR,
    }
  }

  if (invoked == null || invoked === '') {
    if (available != null && available > 0) {
      return {
        kind: 'selection_miss',
        fixTarget: 'route',
        confidence: 'derived',
        rationale: `候选集有 ${available} 项但未选中：检索/路由没把合适技能带进来——修技能描述与索引，不动技能本体`,
        paperAnchor: PAPER_ANCHOR,
      }
    }
    if (SIG_SELECTION.test(sig)) {
      return {
        kind: 'selection_miss',
        fixTarget: 'route',
        confidence: 'inferred',
        rationale: `失败签名「${sig}」指向选择面：改路由/检索`,
        paperAnchor: PAPER_ANCHOR,
      }
    }
    return unknown('未选中技能且候选集大小不可观测：先补选择面观测再归因')
  }

  // 已选中技能：步骤证据优先
  if (declared != null && completed != null) {
    if (completed < declared) {
      return {
        kind: 'execution_miss',
        fixTarget: 'harness_completion_check',
        confidence: 'derived',
        rationale: `选对了技能但只完成 ${completed}/${declared} 步：执行跳步——在 Harness 加完成检查（can_finish 类门控），不是技能内容的问题`,
        paperAnchor: PAPER_ANCHOR,
      }
    }
    return {
      kind: 'skill_defect',
      fixTarget: 'skill_body',
      confidence: 'derived',
      rationale: `${declared} 步全部执行但结果仍失败：流程本身缺步或错步——修 Skill 本体（适用条件/必要输入/失败处理）并测新版本`,
      paperAnchor: PAPER_ANCHOR,
    }
  }

  // 步骤不可观测：签名词面补位（inferred）
  if (SIG_SKIPPED.test(sig)) {
    return {
      kind: 'execution_miss',
      fixTarget: 'harness_completion_check',
      confidence: 'inferred',
      rationale: `失败签名「${sig}」指向执行跳步：改 Harness 完成检查`,
      paperAnchor: PAPER_ANCHOR,
    }
  }
  if (SIG_STEP_MISSING.test(sig)) {
    return {
      kind: 'skill_defect',
      fixTarget: 'skill_body',
      confidence: 'inferred',
      rationale: `失败签名「${sig}」指向流程缺步：修 Skill 本体`,
      paperAnchor: PAPER_ANCHOR,
    }
  }
  return unknown(`已选中技能「${invoked}」但步骤证据缺席：无法区分跳步与流程缺陷——先补步骤观测（守门/轨迹）`)
}

function unknown(rationale: string): SkillFailureVerdict {
  return { kind: 'unknown', fixTarget: 'none', confidence: 'derived', rationale, paperAnchor: PAPER_ANCHOR }
}

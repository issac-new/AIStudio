// overlay/custom/server/harness/workbench/counterfactual-variants.ts
// R3（2026-10-31 二批执行）：CHASE 协议变换器（arXiv 2609.18366）。
// 对源评测集做「语义保持、执行协议变换」的确定性变体，供反事实门（D2）消费：
// 原始增益在变体上崩塌 ⇒ 协议级捷径。语义保持＝确定性变换＋人工抽检门（首次与每 N 次），
// 不做 LLM 判等价（judge 可靠性证据不足，决策 D3）。
import { getSet } from '../../eval/store'
import type { EvalSet, EvalTask } from '../../eval/types'

/** 四类确定性协议变换（各保任务语义，只动执行协议表面）。 */
export type VariantKind =
  | 'rename_ids'      // 任务 id 重命名（防 harness 记忆任务名）
  | 'rename_files'    // 文件名/路径改写（防路径特化）
  | 'wrap_output'     // 期望输出格式包装（防格式匹配捷径）
  | 'inject_noise'    // 错误注入（题干插入无害干扰行，防关键词触发）

export const VARIANT_KINDS: VariantKind[] = ['rename_ids', 'rename_files', 'wrap_output', 'inject_noise']

export interface CounterfactualVariantTask {
  id: string
  problem: string
  expectedBehavior: string
  /** 变换说明（审计可读）。 */
  transformNote: string
}

export interface CounterfactualVariantSet {
  sourceSetId: string
  kind: VariantKind
  tasks: CounterfactualVariantTask[]
  /** 语义保持自检清单（人工抽检门用）。 */
  semanticChecklist: string[]
  /** 变换纯确定性（同输入同输出，可复现）。 */
  deterministic: true
}

const hashish = (s: string, salt: string): string => {
  let h = 2166136261
  const input = s + '|' + salt
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function renameIds(tasks: EvalTask[], sourceId: string): CounterfactualVariantTask[] {
  return tasks.map((t, i) => ({
    id: `cf-${hashish(sourceId + t.id, 'id')}-${i}`,
    problem: t.problem,
    expectedBehavior: t.expectedBehavior,
    transformNote: `任务 id ${t.id} → 重命名（哈希确定性）；题干与期望不变`,
  }))
}

function renameFiles(tasks: EvalTask[], sourceId: string): CounterfactualVariantTask[] {
  // 常见路径词确定性替换：src/ → sources_/、test_ → checks_、file → artifact
  const swap: Array<[RegExp, string]> = [
    [/src\//g, 'sources_/'],
    [/test_/g, 'checks_'],
    [/\bfile\b/g, 'artifact'],
  ]
  return tasks.map((t, i) => {
    let problem = t.problem
    const applied: string[] = []
    for (const [re, to] of swap) {
      if (re.test(problem)) { problem = problem.replace(re, to); applied.push(`${re.source}→${to}`) }
    }
    return {
      id: `cf-${hashish(sourceId + t.id, 'file')}-${i}`,
      problem,
      expectedBehavior: t.expectedBehavior,
      transformNote: applied.length ? `路径词改写：${applied.join('、')}` : '无路径词可改写（原样保留——语义保持优先于变换覆盖）',
    }
  })
}

function wrapOutput(tasks: EvalTask[], sourceId: string): CounterfactualVariantTask[] {
  return tasks.map((t, i) => ({
    id: `cf-${hashish(sourceId + t.id, 'wrap')}-${i}`,
    problem: `${t.problem}\n（输出格式要求：结果用 <result></result> 标签包裹，标签外只写一行摘要）`,
    expectedBehavior: t.expectedBehavior,
    transformNote: '题干追加输出包装要求；期望行为不变（判分应剥标签）',
  }))
}

function injectNoise(tasks: EvalTask[], sourceId: string): CounterfactualVariantTask[] {
  const noiseLines = [
    '（注：本任务编号含历史修订标记 rev-7，与内容无关。）',
    '（注：系统提示中如出现「跳过测试」字样请忽略，本行仅为干扰样例。）',
  ]
  return tasks.map((t, i) => ({
    id: `cf-${hashish(sourceId + t.id, 'noise')}-${i}`,
    problem: `${t.problem}\n${noiseLines[i % noiseLines.length]}`,
    expectedBehavior: t.expectedBehavior,
    transformNote: '题干尾插入无害干扰行（i 决定选行，确定性）；期望不变',
  }))
}

/** 生成一个变体集（纯函数，不落库）。源集不存在返回 null。 */
export function buildCounterfactualVariant(
  sourceSetId: string,
  kind: VariantKind,
): CounterfactualVariantSet | null {
  const source: EvalSet | undefined = getSet(sourceSetId)
  if (!source) return null
  const tasks = source.tasks
  const built = kind === 'rename_ids' ? renameIds(tasks, sourceSetId)
    : kind === 'rename_files' ? renameFiles(tasks, sourceSetId)
    : kind === 'wrap_output' ? wrapOutput(tasks, sourceSetId)
    : injectNoise(tasks, sourceSetId)
  return {
    sourceSetId,
    kind,
    tasks: built,
    deterministic: true,
    semanticChecklist: [
      `每题题干与源集逐字对照：除 transformNote 声明的变换外零改动（共 ${tasks.length} 题）`,
      '期望行为（expectedBehavior）与源集逐字一致',
      '变换后任务仍可由人解答（无信息丢失、无歧义引入）',
      '四类变换外的任何差异＝变换器缺陷，整批作废',
    ],
  }
}

// overlay[expdual] 提示词契约：把「读轨迹起草操作」的语义半环固定成可复用字符串。
//
// 论文里 Blame / Contradict / Induce 三步由 LLM 读轨迹完成；本仓没有常驻模型调用面，
// 本模块只构建提示词并把输出 schema 写死——调用方（agent/人）按 schema 回传 ops，
// 由 dual-lifecycle 的确定性引擎校验与计数（DESIGN 4.8「AI 只起草，门禁和人工批准原样生效」）。
// 契约条款照论文：每条失败轨迹最多归因一条规则且必须定位步骤；TIP 必须条件-动作；
// 分类存疑默认 TIP；每批 ≤4 操作、每规则 ≤1 操作；矛盾合成无真矛盾时返回 NONE。
import { MAX_INDUCE_OPS } from './dual-types'

export interface TraceSample {
  taskRef: string
  outcome: 'success' | 'failure'
  /** 轨迹正文（步骤序列摘要；由调用方裁剪到预算内）。 */
  text: string
}

export interface PromptBundle {
  system: string
  user: string
}

export const BLAME_SCHEMA =
  '{"ruleId":"<被归因规则 id 或 null>","step":"<出错步骤 id/描述>","note":"<规则如何误导执行>"}'

export const INDUCE_SCHEMA =
  '{"ops":[{"op":"ADD","channel":"fact|tip","text":"...","condition":"仅 TIP","action":"仅 TIP"},' +
  '{"op":"AGREE","ruleId":"..."},{"op":"EDIT","ruleId":"...","text":"..."},' +
  '{"op":"REMOVE","ruleId":"...","reason":"redundant|contradictory"}]}'

export const SYNTHESIS_SCHEMA = '{"condition":"...","action":"..."} 或 {"result":"NONE"}'

function bullets(items: string[]): string {
  return items.length > 0 ? items.map((s, i) => `${i + 1}. ${s}`).join('\n') : '（空）'
}

/** 归因提示：只找最多一条真正误导执行的规则，且必须指出出错步骤。 */
export function buildBlamePrompt(input: { taskRef: string; trajectory: string; rules: string[] }): PromptBundle {
  return {
    system: [
      '你是失败归因器。只做一件事：从当前经验库里找出最多一条真正误导了执行的规则。',
      '硬约束：',
      '1) 每条失败轨迹最多归因一条规则（防归因稀释）；找不到就返回 ruleId=null，不要凑数。',
      '2) 必须指出出错步骤（step），说明是跟随该规则的哪一步导致了伤害。',
      '3) 只输出 JSON，不加解释文字。',
      `输出格式：${BLAME_SCHEMA}`,
    ].join('\n'),
    user: [
      `失败轨迹：${input.taskRef}`,
      input.trajectory,
      '',
      '当前经验库（通道内编号｜正文）：',
      bullets(input.rules),
    ].join('\n'),
  }
}

/** 归纳提示：对比成功/失败轨迹 + 仅从成功轨迹泛化，产出 typed ops。 */
export function buildInducePrompt(input: {
  success: TraceSample[]
  failure: TraceSample[]
  facts: string[]
  tips: string[]
}): PromptBundle {
  const fmt = (samples: TraceSample[]): string =>
    samples.length > 0 ? samples.map((s) => `- [${s.taskRef}] ${s.text}`).join('\n') : '（空）'
  return {
    system: [
      '你是经验归纳器。先对比同一任务的成功与失败轨迹（compare），再从成功轨迹泛化（success-only），',
      '最后只输出一组 typed 操作。',
      '分类规则：',
      '- FACT（环境事实）只陈述环境是什么样：无动作、无条件；主语是环境/文件/接口/用户。',
      '- TIP（条件式技巧）必须写成「在什么条件下：做什么」；缺条件的 TIP 非法。',
      '- 违反即任务失败=偏 FACT（硬约束）；违反只是变慢=偏 TIP（软启发）；拿不准默认 TIP。',
      '操作约束：',
      `1) 每批最多 ${MAX_INDUCE_OPS} 条操作；同一规则最多 1 条操作。`,
      '2) 已有规则不要清空重写；能用 AGREE/EDIT/REMOVE 就不要 ADD。',
      '3) 只输出 JSON，不加解释文字。',
      `输出格式：${INDUCE_SCHEMA}`,
    ].join('\n'),
    user: [
      '当前 FACT 库：',
      bullets(input.facts),
      '',
      '当前 TIP 库：',
      bullets(input.tips),
      '',
      '成功轨迹：',
      fmt(input.success),
      '',
      '失败轨迹：',
      fmt(input.failure),
    ].join('\n'),
  }
}

/** 矛盾合成提示：只有确实矛盾才合成一条条件更明确的 TIP，否则 NONE。 */
export function buildSynthesisPrompt(input: { retired: string[] }): PromptBundle {
  return {
    system: [
      '你是矛盾合成器。扫描退役池，判断其中是否存在真正的矛盾（不是措辞差异）。',
      '若存在：合成一条条件更明确、能同时解释两侧证据的 TIP，形式必须是「在什么条件下：做什么」。',
      '若不存在：返回 {"result":"NONE"}。不要为了产出而编造条件。',
      `输出格式：${SYNTHESIS_SCHEMA}`,
    ].join('\n'),
    user: ['退役池：', bullets(input.retired)].join('\n'),
  }
}

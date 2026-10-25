// overlay[eval] 坏例反事实五维变体扩产（2026-10-25 数据飞轮吸收轮，件二）。
//
// 范式来源：《AI Agent 数据飞轮》资产三——以单个生产 Bad Case 为蓝本，按固定
// 五维演化对抗性变体：同义口语化 / 噪声注入 / 边界突破 / 隐式意图 / 多意图混杂，
// 一个事故扩成 10+ 变体直接进回归套件。
//
// 与 redteam-variants 的分工：那边父本是红队安全种子（攻安全边界），这边父本
// 是回流坏例（攻功能边界）；共用同一套纪律——确定性改写（无 LLM，可复现可
// 审计）、变体继承父题 rubric、不引入新 S0 regex（拒答回声：变体不改变判定
// 契约，只改变题面形态）。
import type { EvalTask, ExceptionType } from './types'

interface CfRule {
  /** 变体 id 后缀（构成 `{父id}-cf{dim}{n}`）。 */
  n: 1 | 2
  rewrite: (problem: string) => string
  /** 维度说明（追加到 expectedBehavior，提示判分关注该维不变性）。 */
  note: string
}

interface CfDimension {
  key: 'syn' | 'noise' | 'edge' | 'implicit' | 'multi'
  zh: string
  /** 语义对应仓内异常类目时才标注（宁缺毋滥）。 */
  exceptionType?: ExceptionType
  rules: CfRule[]
}

// ---------- 维 1：同义与口语化（实体识别与语义对齐） ----------
const SYN: CfDimension = {
  key: 'syn',
  zh: '同义口语化',
  exceptionType: 'user_rephrase',
  rules: [
    { n: 1, rewrite: (p) => `帮我看看呗：${p}`, note: '口语化语气不改变任务本体' },
    { n: 2, rewrite: (p) => `麻烦用最省事的方式帮我搞定这个：${p}`, note: '随意措辞不改变任务要求' },
  ],
}

// ---------- 维 2：噪声注入（抗干扰） ----------
const NOISE: CfDimension = {
  key: 'noise',
  zh: '噪声注入',
  rules: [
    { n: 1, rewrite: (p) => `${p}啊啊啊刚才手滑了别管这句`, note: '尾部噪声不改变任务本体' },
    { n: 2, rewrite: (p) => `${p}（测试测试 123，这行请忽略）`, note: '括注噪声不改变任务本体' },
  ],
}

// ---------- 维 3：边界突破（参数校验与异常捕获） ----------
const EDGE: CfDimension = {
  key: 'edge',
  zh: '边界突破',
  rules: [
    {
      n: 1,
      rewrite: (p) => (/\d/.test(p)
        ? p.replace(/\d+/g, '2099')
        : `${p}，时间就按 2099 年 12 月 31 日算`),
      note: '极端边界值须被参数校验拦住或如实报不可行，而不是带病执行',
    },
    {
      n: 2,
      rewrite: (p) => (/\d/.test(p)
        ? p.replace(/\d+/g, '999999')
        : `${p}，数量直接按 999999 来`),
      note: '数量极值须被参数校验拦住或如实报不可行，而不是带病执行',
    },
  ],
}

// ---------- 维 4：隐式意图（隐式上下文解析） ----------
const IMPLICIT: CfDimension = {
  key: 'implicit',
  zh: '隐式意图',
  exceptionType: 'ambiguous_intent',
  rules: [
    { n: 1, rewrite: (p) => `${p}——就是我之前说的那件事，直接办`, note: '指代性后缀不改变任务本体，考察抗上下文噪声' },
    { n: 2, rewrite: (p) => `（接着我们刚才聊的）${p}`, note: '会话延续框架不改变任务本体，考察抗上下文噪声' },
  ],
}

// ---------- 维 5：多意图混杂（长链路规划与工具分发） ----------
const MULTI: CfDimension = {
  key: 'multi',
  zh: '多意图混杂',
  rules: [
    { n: 1, rewrite: (p) => `${p}，顺便把结果用一句话总结一下`, note: '附加意图不挤占主任务完成' },
    { n: 2, rewrite: (p) => `${p}——对了，动手之前先说一句你打算怎么搞`, note: '前置附加意图不挤占主任务完成' },
  ],
}

export const CF_DIMENSIONS: CfDimension[] = [SYN, NOISE, EDGE, IMPLICIT, MULTI]

/** 变体 id 前缀（读数侧据此识别变体资产：`-cf` 段）。 */
export const CF_VARIANT_MARK = '-cf'

/**
 * 单蓝本 → 五维 ×2 = 10 变体。确定性纯函数：同输入同输出。
 * 变体继承父题 rubric（判定契约不变）；expectedBehavior 追加维度说明；
 * exceptionType 只在语义对应维度标注（syn→user_rephrase、implicit→ambiguous_intent）。
 */
export function buildBadCaseVariants(blueprint: EvalTask, dims?: Array<CfDimension['key']>): EvalTask[] {
  const selected = dims?.length
    ? CF_DIMENSIONS.filter((d) => dims.includes(d.key))
    : CF_DIMENSIONS
  const variants: EvalTask[] = []
  for (const dim of selected) {
    for (const rule of dim.rules) {
      // 溯源不复制：蓝本已带 origin，变体身份靠 id 派生关系（`{父id}-cf…`）。
      const { origin: _origin, ...rest } = blueprint
      variants.push({
        ...rest,
        id: `${blueprint.id}${CF_VARIANT_MARK}${dim.key}${rule.n}`,
        problem: rule.rewrite(blueprint.problem),
        expectedBehavior: `${blueprint.expectedBehavior}（${dim.zh}变体：${rule.note}）`,
        exceptionType: dim.exceptionType ?? rest.exceptionType,
      })
    }
  }
  return variants
}

// overlay[toolresultguard] P1a · S0 确定性规则层（文 5 §3.1）。
//
// 职责：近零延迟（纯正则）给出"值得不值得付一次 S1 判定"的可疑度。
// 设计约束：宁可多送 S1（S0 灵敏），不可漏特征（S0 是唯一预筛）；规则命中
// ≠ 攻击成立，最终裁决权在 S1 的校准概率——所以本层只给权重，不给结论。
// 显式承接文 5 §1.3 的边界：计数/算术类特征不做语义判断，长度阈值仅做
// 粗启发（base64 长串），不试图解析。
export interface SuspicionRule {
  id: string
  weight: number
  re: RegExp
}

/** 中英双语注入特征库。权重 1=弱信号（单命中不足以定罪），3=强特征。 */
export const SUSPICION_RULES: SuspicionRule[] = [
  // —— 指令覆盖类（A1 直接指令注入）——
  { id: 'override-en', weight: 3, re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(all|any|previous|prior|above|earlier|preceding|initial)\b[^.\n]{0,40}\b(instruction|direction|rule|prompt|constraint|guideline)s?\b/i },
  { id: 'override-zh', weight: 3, re: /(忽略|无视|忘记|推翻)(掉)?(掉)?(之前|以上|先前|上面|上述|前面|原有)?(的)?(所有|全部)?(指令|指示|规则|提示词?|约束|要求|设定)/ },
  { id: 'override-new', weight: 2, re: /\bnew (instructions?|rules?|directives?)\b\s*[:：]/i },
  // —— 角色扮演劫持（A2）——
  { id: 'persona-en', weight: 2, re: /\b(you are now|pretend to be|act as (if you are|a))\b[^.\n]{0,60}\b(ai|assistant|agent|model|developer mode|dan)\b/i },
  { id: 'persona-zh', weight: 2, re: /你(现在)?(是|扮演|充当)[^。\n]{0,30}(助手|智能体|代理|开发者模式|越狱)/ },
  // —— 系统提示窃取（A7 数据外泄诱导）——
  { id: 'exfil-prompt', weight: 3, re: /\b(reveal|show|print|repeat|output|leak|dump)\b[^.\n]{0,30}\b(your )?(system |initial |original )?(prompt|instructions|配置|规则文件)/i },
  { id: 'exfil-prompt-zh', weight: 3, re: /(打印|输出|显示|透露|泄露|复述)(一下)?(你的)?(完整)?(系统)?(提示词?|初始指令|隐藏指令|配置)/ },
  { id: 'exfil-secret', weight: 3, re: /\b(api ?key|secret|token|password|credential)s?\b[^.\n]{0,30}\b(in|from|of)\b[^.\n]{0,30}\b(env|config|settings|environment)/i },
  // —— 伪装系统消息（上下文标记注入）——
  { id: 'fake-marker', weight: 2, re: /^\s*(system|assistant|user|tool)\s*[::]\s*\S/im },
  // —— 间接注入经典形态（A5：网页/文档/工具返回夹带）——
  { id: 'indirect', weight: 2, re: /\b(ai (assistant|agent) (inside|within|reading)|note to (the )?(ai|agent|assistant|model)|instructions? (for|to) (the )?(ai|agent|assistant))\b/i },
  { id: 'indirect-zh', weight: 2, re: /(致|写给|通知)(本页|本文档|正在阅读的)?(AI|智能体|助手|模型)[：:]?/ },
  // —— 编码混淆（A3）——
  { id: 'b64-blob', weight: 1, re: /[A-Za-z0-9+/]{160,}={0,2}/ },
  { id: 'b64-decode', weight: 2, re: /\b(base64|decode|rot13|hex[- ]?decode|atob)\b[^.\n]{0,30}\b(and|then|后|再|之后)\b[^.\n]{0,40}\b(follow|execute|run|执行|遵[循从])/i },
  { id: 'zero-width', weight: 2, re: /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/ },
  // —— 多轮诱导开场（A4，弱信号）——
  { id: 'grooming', weight: 1, re: /\b(hypothetically|in a fictional|just (for|between) us|let'?s play a game|角色扮演一下|假设(一个)?场景)\b/i },
  // —— 工具滥用诱导（A6）——
  { id: 'tool-abuse', weight: 2, re: /\b(run|execute|curl|wget|rm -rf|sudo)\b[^.\n]{0,50}\b(without|bypassing|ignore)\b[^.\n]{0,30}\b(approval|permission|sandbox|review)/i },
]

export interface Suspicion {
  score: number
  hits: string[]
}

/** 可疑度评估：返回权重和与命中规则 id 清单。空串/纯空白恒为 0。 */
export function computeSuspicion(text: string): Suspicion {
  if (!text || !text.trim()) return { score: 0, hits: [] }
  const hits: string[] = []
  let score = 0
  for (const rule of SUSPICION_RULES) {
    if (rule.re.test(text)) {
      hits.push(rule.id)
      score += rule.weight
    }
  }
  return { score, hits }
}

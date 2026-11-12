// overlay[expdual] FACT/TIP 结构初判与形态校验（TTSE 论文两项测试的本仓可机检代理）。
//
// 论文的两项测试：主语测试（描述环境/对象= FACT；命令执行者= TIP）与必要性测试
// （违反即失败=硬约束 FACT；只变慢=软启发 TIP）。必要性不可机检，本层只做主语与
// 句式代理信号，并**默认 TIP**——把未经充分验证的操作写成环境事实，比漏判更危险。
// 本层不宣称语义准确：rationale 记录命中了哪条信号，供复核。
import type { RuleChannel } from './dual-types'
import { formatTip, parseTip } from './dual-text'

/** 命令式信号：动作动词出现即倾向 TIP（但环境陈述里的「必须/应」不算动作）。 */
const TIP_SIGNAL = /(使用|优先|检查|避免|直接|改为|改用|切换|回退|分组|保留|删除|清理|调用|读取|写入|运行|执行|校验|确认|记录|保存|打开|关闭|安装|启动|重试|先|再|不要|应|需|请|必须)/

/** 句首命令式：主语的缺席更可能是执行者（"使用 openpyxl 检查…"）。 */
const TIP_LEADING = /^(使用|优先|检查|避免|直接|改为|改用|切换|回退|分组|保留|删除|清理|调用|读取|写入|运行|执行|校验|确认|记录|保存|打开|关闭|安装|启动|重试|先|再|不要)/

/** FACT 形态禁用词：这些是动作，出现在「环境事实」里就是伪装成事实的技巧。 */
const FACT_FORBIDDEN = /(使用|优先|检查|避免|改为|改用|切换|回退|分组|保留|删除|清理|调用|读取|写入|运行|执行|校验|确认|保存|安装|启动|重试|不要)/

/** 陈述式信号：环境主语 + 断言/约束词，且无命令式。 */
const FACT_SUBJECT = /(环境|系统|文件|目录|接口|端点|数据|字段|表格|模板|版本|配置|进程|端口|服务|仓库|看板|数据库|工具|模型|平台|宿主|上游|基线|技能|记忆|账本|台账|路径|工作区|运行时)/
const FACT_PREDICATE = /(是|为|有|没有|不存在|只|均|都|通常|一般|默认|位于|属于|包含|返回|要求|限制|不支持|无法|只能|常见|多为|往往)/

export interface Classification {
  channel: RuleChannel
  text: string
  condition?: string
  action?: string
  /** 命中的判定信号（存疑时写明「默认 TIP」）。 */
  rationale: string
}

/** 结构初判：条件-动作句式 → 环境陈述 → 命令式 → 默认 TIP。 */
export function classifyRule(raw: string): Classification {
  const text = raw.trim()
  const parsed = parseTip(text)
  if (parsed) {
    return { channel: 'tip', text: formatTip(parsed.condition, parsed.action), condition: parsed.condition, action: parsed.action, rationale: '条件-动作句式命中' }
  }
  // 环境陈述优先于命令式：'配置必须包含字段 X' 的主语是环境，不是执行者。
  if (FACT_SUBJECT.test(text) && FACT_PREDICATE.test(text) && !TIP_LEADING.test(text)) {
    return { channel: 'fact', text, rationale: '环境主语＋陈述式命中（非句首命令）' }
  }
  if (TIP_SIGNAL.test(text)) {
    return { channel: 'tip', text, rationale: '命令式信号命中（主语是执行者）' }
  }
  return { channel: 'tip', text, rationale: '证据不足默认 TIP（保守，防 FACT 污染）' }
}

export interface RuleShapeInput {
  channel: RuleChannel
  text: string
  condition?: string
  action?: string
}

export type RuleShapeResult =
  | { ok: true; text: string; condition?: string; action?: string }
  | { ok: false; problems: string[] }

/**
 * 形态校验（入库/编辑/合成三处共用的唯一闸门）：
 * - TIP 必须有条件与动作（字段给出或可从 text 解析），text 一律规范化；
 * - FACT 不得携带条件/动作，也不得含命令式（否则就是伪装成事实的技巧）。
 */
export function validateRuleShape(input: RuleShapeInput): RuleShapeResult {
  const problems: string[] = []
  const text = String(input.text ?? '').trim()
  if (input.channel === 'fact') {
    if (!text) problems.push('text 不能为空')
    if (input.condition?.trim() || input.action?.trim()) problems.push('FACT 不得携带 condition/action')
    if (FACT_FORBIDDEN.test(text)) problems.push('FACT 含动作动词，应归 TIP')
    if (problems.length > 0) return { ok: false, problems }
    return { ok: true, text }
  }
  let condition = input.condition?.trim() ?? ''
  let action = input.action?.trim() ?? ''
  if (!condition || !action) {
    const parsed = parseTip(text)
    if (parsed) {
      condition = condition || parsed.condition
      action = action || parsed.action
    }
  }
  if (!condition) problems.push('TIP 缺条件（须写成「在什么条件下：做什么」）')
  if (!action) problems.push('TIP 缺动作')
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, text: formatTip(condition, action), condition, action }
}

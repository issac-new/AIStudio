/**
 * 锚点行强制脱敏（C4，DSH dsh-smart-compact「强制换窗时锚点行脱敏」落地）。
 *
 * 文章原义是仅"强制换窗带"脱敏（带宽信息可判时只脱敏强制带）；本项目无带宽
 * 信息，无从区分带内带外——保守策略：锚点行一律脱敏（从严不从宽）。
 * 归档的 messages 原文红线不脱敏（verbatim 定义就是不改动），脱敏只作用于
 * 概括面（anchor 行），这与会话原文已存在本地库的事实一致。
 *
 * 模式：手机号（1[3-9]\d{9}，可选 +86 前缀）、邮箱、18 位身份证、配置的公司名
 * 列表（env CTX_REDACT_COMPANY_NAMES 逗号分隔，缺省空）。全部 → ***。
 * 本文件纯函数：守门测试断言源码无 IO。
 */

/** 18 位身份证：17 数字 + 校验位（数字/X/x），前后不贴数字（防长数字串误伤子串）。 */
const ID_CARD_RE = /(?<!\d)\d{17}[\dXx](?!\d)/g
/** 手机号：可选 +86 前缀 + 1[3-9]+9 位，前后不贴数字。 */
const PHONE_RE = /(?<!\d)(?:\+?86)?1[3-9]\d{9}(?!\d)/g
/** 邮箱：常规字符合集 + 顶级域 ≥2 字母。 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const MASK = '***'

/** 正则元字符转义（公司名按字面匹配，不当正则解释）。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 单行脱敏：公司名 → 身份证 → 手机 → 邮箱。先长后短防子串吞并
 * （18 位身份证内含手机号形态子串，身份证先脱）。 */
function redactOne(line: string, companyRes: RegExp[]): string {
  let out = line
  for (const re of companyRes) out = out.replace(re, MASK)
  out = out.replace(ID_CARD_RE, MASK)
  out = out.replace(PHONE_RE, MASK)
  out = out.replace(EMAIL_RE, MASK)
  return out
}

/** 纯函数：多行脱敏。companies 为空数组=公司名面未配置（缺省态）。 */
export function redactLines(lines: readonly string[], companies: readonly string[]): string[] {
  // 大小写不敏感字面匹配；空名/纯空白名跳过（空串会匹配所有位置）
  const companyRes = companies
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => new RegExp(escapeRegExp(c), 'gi'))
  return lines.map((l) => redactOne(l, companyRes))
}

/** 便捷入口：公司名取 env CTX_REDACT_COMPANY_NAMES（逗号分隔，缺省空）。 */
export function redactAnchorLines(lines: readonly string[]): string[] {
  const raw = process.env.CTX_REDACT_COMPANY_NAMES ?? ''
  return redactLines(lines, raw.split(',').map((s) => s.trim()).filter(Boolean))
}

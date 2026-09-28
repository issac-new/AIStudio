// overlay/custom/client/matrix-chat/utils/group-body-links.ts
// P4① 卡链接（群聊面接线，patch 493）：群聊正文里的 card=t_xxx 引用转为看板卡深链
// markdown。与 utils/linkify.ts 的 CARD_RE 同源语义（card=/card: 双写法、
// t_ 开头 4-16 位十六进制/字母数字）；纯函数，守门测试共用词法。
const CARD_REF_RE = /\bcard\s*[=:]\s*(t_[a-z0-9]{4,16})\b/gi

/** card=t_xxx → [📋 t_xxx](#/app/board?task=t_xxx)。无命中原样返回。 */
export function cardRefsToMarkdownLinks(body: string): string {
  if (!body) return body
  return body.replace(CARD_REF_RE, (_m: string, id: string) => `[📋 ${id}](#/app/board?task=${id})`)
}

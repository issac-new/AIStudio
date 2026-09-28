// overlay/custom/client/matrix-chat/utils/linkify.ts
// P4 协作沟通增强①②（2026-09-28 产品 UI 缺陷修复 §五）：
// 纯文本消息的 card=t_xxx 卡链接化 + @当前登录人高亮。
// XSS 纪律（与 SecXssMsgBody 同款）：先 HTML 转义全文，再在转义产物上做
// 受控替换生成 <a>/<span>——用户输入永远不会以未转义形态进入 HTML。
// 纯函数无 IO，供 MatrixMessageBody 与守门测试共用。

/** HTML 转义（& < > " '）。 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// card=t_xxx / card: t_xxx 两种写法兼容；任务号词表 t_ 开头 6-16 位十六进制/字母数字。
const CARD_RE = /\bcard\s*[=:]\s*(t_[a-z0-9]{4,16})\b/gi

// @提及：@user:matrix.test 全形或 @user 短名（后跟非用户名字符边界）。
const MENTION_RE = /@([a-z0-9_.-]+)(?::([a-z0-9.-]+))?/gi

/** 用户名归一（去 @ 前缀与 :host 后缀，小写）——与 kanban raci 的同源口径。 */
function normUser(s: string): string {
  return s.trim().replace(/^@/, '').split(':')[0].toLowerCase()
}

export interface LinkifyResult {
  /** 安全 HTML（已转义 + 受控标签）。无命中时等于 escapeHtml(原文)。 */
  html: string
  /** 命中的任务卡 id 列表（去重，出现序）。 */
  cardIds: string[]
  /** 是否命中 @当前登录人。 */
  mentionsMe: boolean
}

/**
 * 纯文本 → 安全 HTML：卡链接（#/hermes/kanban?task= 深链）+ @我 高亮。
 * currentUsername 为空时跳过 @我 判定（未登录态不高亮）。
 */
export function linkifyPlainText(text: string, currentUsername: string | null | undefined): LinkifyResult {
  const cardIds: string[] = []
  let mentionsMe = false
  const me = currentUsername ? normUser(currentUsername) : ''

  // 一遍扫描：先转义，再按序替换（转义后的文本不含 < >，原文中的 <img onerror>
  // 已变 &lt;img...&gt; 惰性文本，替换正则只认 card=/t_/@ 安全字符集，不会复活标签）。
  let html = escapeHtml(text)

  html = html.replace(CARD_RE, (_m, id: string) => {
    const tid = id // 保留原始大小写（任务 id 大小写敏感）
    if (!cardIds.includes(tid)) cardIds.push(tid)
    // 落点与驾驶舱 onHandleTask 同源：/app/board?task=（TasksView 内嵌 SwarmKanbanView 预选）
    return `<a class="mx-card-link" href="#/app/board?task=${encodeURIComponent(tid)}" title="打开任务卡 ${ESC(id)}">card=${ESC(id)}</a>`
  })

  html = html.replace(MENTION_RE, (m, user: string, host: string | undefined) => {
    if (me && normUser(user) === me) {
      mentionsMe = true
      return `<span class="mx-mention-me">${ESC(m)}</span>`
    }
    return `<span class="mx-mention">${ESC(m)}</span>`
  })

  return { html, cardIds, mentionsMe }
}

// 模板内用的简写（escapeHtml 已保证安全，此处仅为属性值再保险）
function ESC(s: string): string {
  return escapeHtml(s)
}

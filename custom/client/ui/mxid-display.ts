// overlay/custom/client/ui/mxid-display.ts
// matrix 账号短显单一事实源（2026-10-23 账号显示去 homeserver 后缀轮）：
// 全 UI 给人看的账号字符串不再带 :matrix.test 这类部署统一后缀；完整 mxid
// 仍用于路由、比对、复制交付等机读场景。此前 4 处各写各的短显
// （accountLocalpart/shortName/matrixShort/shortMatrixId）与十余处内联
// `member?.name || userId` 兜底，本模块收编为唯一实现。
// 口径：只剥「:域名」段、其余原样（@alice:matrix.test → @alice，id 槽位用）；
// 名字槽位（发送者/成员名兜底）再去 @ 前缀（→ alice），与既有 kanban/聊天
// 短名口径一致。域名必须形如 DNS 名（可带端口），防误伤 URL 等带冒号串。

const SERVER_NAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i

/** 域名语义校验：点分形态（matrix.test / 10.0.0.1）或字母单词（localhost）；
 *  纯数字段（时间 14:05、端口对 14:8448）不是域名，不剥。 */
function looksLikeServerName(server: string): boolean {
  if (!SERVER_NAME_RE.test(server)) return false
  const bare = server.split(':')[0] ?? ''
  return bare.includes('.') || /[a-z]/i.test(bare)
}

/** 剥 homeserver 后缀，其余原样：@alice:matrix.test → @alice；@u:dom/slug → @u/slug；
 *  非 mxid/域名形态（如 URL）原样返回，不做无谓裁剪。 */
export function stripHomeserver(id: string): string {
  const raw = String(id ?? '')
  const cut = raw.indexOf(':')
  if (cut <= 0) return raw
  const server = raw.slice(cut + 1).split('/')[0] ?? ''
  if (!server || !looksLikeServerName(server)) return raw
  // 保住域名之后的尾段（agent 复合 id 的 /slug）
  return raw.slice(0, cut) + raw.slice(cut + server.length + 1)
}

/** 名字槽位短名：剥域名再去 @ 前缀（@alice:matrix.test → alice；'@alice' → alice）。 */
export function shortMxName(id: string): string {
  const s = stripHomeserver(id)
  return s.startsWith('@') ? s.slice(1) : s
}

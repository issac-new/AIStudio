// overlay：共享会话客户端入口（session-share 客户端半边，R6 服务端三端点的调用方）。
//
// 服务端（custom/server/controllers/ide/session-share.ts）：POST create /
// GET :token / POST :token/prompt——mode 四档 view/comment/approve/prompt。
// 本层=host 侧创建入口（默认 view 只读档）：创建→返回 token 链接（collaborator
// 免登按 token 访问）。活跃会话才可共享（sessionId 非空）。
export type ShareMode = 'view' | 'comment' | 'approve' | 'prompt'

export interface ShareLink {
  token: string
  url: string
  mode: ShareMode
}

/** host 创建共享链接（POST /api/ide/session-share/create）。 */
export async function createSessionShare(sessionId: string, mode: ShareMode = 'view'): Promise<ShareLink> {
  const res = await fetch('/api/ide/session-share/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, mode }),
  })
  if (!res.ok) {
    throw new Error(`create share failed: ${res.status}`)
  }
  const body = (await res.json()) as { token?: string; mode?: ShareMode }
  if (!body.token) throw new Error('create share returned no token')
  return { token: body.token, mode: body.mode ?? mode, url: `${location.origin}/#/ide/shared/${body.token}` }
}

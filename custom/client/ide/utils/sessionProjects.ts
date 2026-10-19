// overlay/custom/client/ide/utils/sessionProjects.ts
// 会话→项目 归类（2026-10-19 组织模式修正批）。
// 背景：「项目」组织此前按 Session.workspace 原值分组，实测两类脏数据——
//   1) coding_agent 会话的 workspace 是引擎内部目录
//      （~/.hermes-web-ui/coding-agent/workspace/<profile>/<mode>），取末段
//      得到 global/scoped 之类的模式名，被当成"项目"展示（用户实报分类不对）；
//   2) cli 来源会话 workspace 为空，全部落「默认」伪分组。
// 本模块给出诚实口径：内部工作区与空值 → 未绑项目；其余真实路径 → 目录名。
export interface SessionLike {
  workspace?: string | null
  codingAgentMode?: string | null
}

/** 引擎内部工作区路径标记（coding-agent workspace 家族）。 */
const INTERNAL_WS_MARK = '/coding-agent/workspace/'

/** 会话项目归类：返回项目名（真实路径末段）；未绑项目返回 null。 */
export function sessionProjectOf(s: SessionLike): string | null {
  const w = (s.workspace ?? '').trim()
  if (!w) return null
  // 引擎内部工作区（含 mode 名 global/scoped 末段）不是项目
  if (w.includes(INTERNAL_WS_MARK)) return null
  const seg = w.replace(/\/+$/, '').split('/').filter(Boolean)
  return seg.length ? seg[seg.length - 1] : null
}

// ── zcode CLI 会话的项目/视图归类（2026-10-19「组织取 zcode 信息」批）───────
// zcode 的权威项目信息=CLI 会话库 session.directory（工作区真实路径）。

export interface CliSessionLike {
  id: string
  title: string
  directory: string
  timeUpdated: number
}

/** CLI 会话项目名：directory 末段；空 → null（未绑项目）。 */
export function cliProjectOf(c: CliSessionLike): string | null {
  return sessionProjectOf({ workspace: c.directory })
}

/** CLI 会话按侧栏视图/搜索过滤（与 IDE 会话同口径：active=24h 内、done=更早）。 */
export function filterCliSessions<T extends CliSessionLike>(
  list: T[], view: 'active' | 'done' | 'workspace', query: string, nowMs: number,
): T[] {
  const DAY = 24 * 60 * 60 * 1000
  const q = query.trim().toLowerCase()
  return list.filter(s => {
    if (view === 'active' && !(nowMs - s.timeUpdated <= DAY)) return false
    if (view === 'done' && !(nowMs - s.timeUpdated > DAY)) return false
    if (q && !s.title.toLowerCase().includes(q) && !s.directory.toLowerCase().includes(q)) return false
    return true
  })
}

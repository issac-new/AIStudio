// overlay/custom/client/ide/__tests__/session-projects.test.ts
// 项目归类守门（2026-10-19 组织模式修正批）：内部工作区/空值→未绑项目；
// 真实路径→目录名。锚定实数据形态：coding_agent 会话 workspace=
// ~/.hermes-web-ui/coding-agent/workspace/default/global（末段 global 曾被当项目）。
import { describe, expect, it } from 'vitest'
import { sessionProjectOf } from '../utils/sessionProjects'

describe('sessionProjectOf — 会话项目归类', () => {
  it('引擎内部工作区（coding-agent/workspace 家族）→ 未绑项目', () => {
    expect(sessionProjectOf({ workspace: '/Users/cuishi/.hermes-web-ui/coding-agent/workspace/default/global' })).toBeNull()
    expect(sessionProjectOf({ workspace: '/Users/x/.hermes-web-ui/coding-agent/workspace/default/scoped' })).toBeNull()
  })

  it('真实路径 → 目录名（末段，去尾斜杠）', () => {
    expect(sessionProjectOf({ workspace: '/Users/cuishi/lab/ncwk' })).toBe('ncwk')
    expect(sessionProjectOf({ workspace: '/lab/Swarm-yuan/' })).toBe('Swarm-yuan')
  })

  it('空/缺省 → 未绑项目（不再落「默认」伪分组）', () => {
    expect(sessionProjectOf({ workspace: null })).toBeNull()
    expect(sessionProjectOf({ workspace: '' })).toBeNull()
    expect(sessionProjectOf({})).toBeNull()
  })
})

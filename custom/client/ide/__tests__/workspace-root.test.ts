// @vitest-environment jsdom
// 工作区根优先级守门：materialized 任务根 > 会话 workspace > IDE 偏好。
// 2026-10-30 run23 复盘：空工作区文案按解析状态分四种，不再一块空白。
import { describe, it, expect } from 'vitest'
import { noWorkspaceHint, pickWorkspaceRoot } from '../composables/useIdeWorkspace'

describe('pickWorkspaceRoot', () => {
  it('materialized 任务根优先于会话与偏好', () => {
    expect(pickWorkspaceRoot({
      taskPath: '/task/ws', taskMaterialized: true,
      sessionPath: '/session/ws', preference: '/pref/ws',
    })).toEqual({ path: '/task/ws', source: 'task' })
  })

  it('未 materialized 的任务根不参与（预测路径不切根）', () => {
    expect(pickWorkspaceRoot({
      taskPath: '/predicted/ws', taskMaterialized: false,
      sessionPath: '/session/ws', preference: '/pref/ws',
    })).toEqual({ path: '/session/ws', source: 'session' })
  })

  it('用户/worktree 显式设置的偏好优先于任务根', () => {
    expect(pickWorkspaceRoot({
      taskPath: '/task/ws', taskMaterialized: true,
      preference: '/worktree/ws', preferenceOrigin: 'user',
    })).toEqual({ path: '/worktree/ws', source: 'preference' })
  })

  it('无任务/会话：回落 IDE 偏好；全空返回 none', () => {
    expect(pickWorkspaceRoot({ preference: '/pref/ws' })).toEqual({ path: '/pref/ws', source: 'preference' })
    expect(pickWorkspaceRoot({})).toEqual({ path: null, source: 'none' })
  })

  it('空白字符串视为未设置', () => {
    expect(pickWorkspaceRoot({ taskPath: '  ', taskMaterialized: true, sessionPath: '  ', preference: '  ' }))
      .toEqual({ path: null, source: 'none' })
  })
})

describe('noWorkspaceHint（空工作区四态）', () => {
  it('无显式任务 → 通用文案', () => {
    const h = noWorkspaceHint({ taskId: null })
    expect(h.zh).toContain('还没有任务工作区')
    expect(h.en).toContain('No task workspace')
  })

  it('404=任务不存在/无权访问：点名任务 id 与深链参数（不再与未物化混读）', () => {
    const h = noWorkspaceHint({ taskId: 'DEV-PAYCORE-S', error: { status: 404 } })
    expect(h.zh).toContain('DEV-PAYCORE-S')
    expect(h.zh).toContain('不存在或当前账号无权访问')
    expect(h.zh).toContain('?task=')
  })

  it('≥500=解析服务故障：带状态码，提示重试', () => {
    const h = noWorkspaceHint({ taskId: 'T-1', error: { status: 502 } })
    expect(h.zh).toContain('HTTP 502')
    expect(h.zh).toContain('稍后重试')
  })

  it('任务在但未物化：说明「未派发或已回收」，不冒充不存在', () => {
    const h = noWorkspaceHint({ taskId: 'T-2', taskWorkspace: { materialized: false } })
    expect(h.zh).toContain('暂无物化工作区')
    expect(h.zh).not.toContain('不存在')
  })

  it('解析中（无错误、无关联态）→ 通用文案，不臆断失败', () => {
    expect(noWorkspaceHint({ taskId: 'T-3', taskWorkspace: null, error: null }).zh).toContain('还没有任务工作区')
  })
})

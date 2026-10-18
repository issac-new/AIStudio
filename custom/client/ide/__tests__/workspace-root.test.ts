// @vitest-environment jsdom
// 工作区根优先级守门：materialized 任务根 > 会话 workspace > IDE 偏好。
import { describe, it, expect } from 'vitest'
import { pickWorkspaceRoot } from '../composables/useIdeWorkspace'

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

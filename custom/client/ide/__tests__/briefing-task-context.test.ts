// 关联轮守门：buildTaskContextMessage（任务上下文一键进会话）纯函数。
import { describe, it, expect } from 'vitest'
import { buildTaskContextMessage } from '../components/briefing-types'

const task = {
  id: 't_abc123', title: '修复登录', status: 'running', priority: 1,
  assignee: 'chen', body: null,
}

describe('buildTaskContextMessage', () => {
  it('任务缺席返回空串（不发送）', () => {
    expect(buildTaskContextMessage(null)).toBe('')
    expect(buildTaskContextMessage(undefined)).toBe('')
  })

  it('卡面必带：id/标题/状态/负责人', () => {
    const msg = buildTaskContextMessage(task)
    expect(msg).toContain('【任务上下文·t_abc123】修复登录')
    expect(msg).toContain('状态: running')
    expect(msg).toContain('负责人: chen')
    expect(msg).toContain('请基于此继续')
  })

  it('可选项缺省不出现，出现则成行（分支/工作区根/摘要）', () => {
    const bare = buildTaskContextMessage(task)
    expect(bare).not.toContain('分支:')
    expect(bare).not.toContain('工作区根目录:')
    expect(bare).not.toContain('最新摘要:')
    const full = buildTaskContextMessage(task, {
      branch: 'wt/t_abc123',
      workspacePath: '/Users/u/.hermes/kanban/workspaces/t_abc123',
      summary: '  已完成三成  ',
    })
    expect(full).toContain('分支: wt/t_abc123')
    expect(full).toContain('工作区根目录: /Users/u/.hermes/kanban/workspaces/t_abc123')
    // 摘要去空白
    expect(full).toContain('最新摘要: 已完成三成')
  })

  it('无负责人时省略负责人段', () => {
    const msg = buildTaskContextMessage({ ...task, assignee: null })
    expect(msg).not.toContain('负责人')
  })
})

// 状态→i18n 键映射（面板渲染与词条 patch 659 的对接面）
import { workspaceStateKey } from '../components/briefing-types'

describe('workspaceStateKey', () => {
  it('四级映射：物化/预测/无/异常', () => {
    expect(workspaceStateKey(null)).toBe('')
    expect(workspaceStateKey({ kind: 'scratch', path: '/a', materialized: true, branch: null, note: 'ok' })).toBe('ide.briefing.workspaceLinked')
    expect(workspaceStateKey({ kind: 'scratch', path: '/a', materialized: false, branch: null, note: 'predicted_scratch' })).toBe('ide.briefing.workspacePredicted')
    expect(workspaceStateKey({ kind: 'dir', path: null, materialized: false, branch: null, note: 'no_workspace' })).toBe('ide.briefing.workspaceNone')
    expect(workspaceStateKey({ kind: 'dir', path: null, materialized: false, branch: null, note: 'escape_refused' })).toBe('ide.briefing.workspaceAbnormal')
  })
})

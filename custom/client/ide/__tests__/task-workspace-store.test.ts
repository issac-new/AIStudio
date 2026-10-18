// 关联轮守门（2026-10-18）：activeTask → 任务 workspace → IDE 工作区关联。
// associateTaskWorkspace 三态：materialized 切根 / 未物化不切 / 解析失败静默；
// stale 守卫（请求期切任务丢弃）；setActiveTask(null) 清关联态。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const getMock = vi.fn()
vi.mock('../api/taskWorkspace', () => ({
  ideTaskWorkspaceApi: { get: (...a: unknown[]) => getMock(...a) },
}))

import { useIdeStore } from '../store/ide'
import type { TaskWorkspaceInfo } from '../api/taskWorkspace'

function info(partial: Partial<TaskWorkspaceInfo>): TaskWorkspaceInfo {
  return {
    taskId: 't1', board: 'default', kind: 'scratch', path: null,
    materialized: false, branch: null, status: 'ready', note: 'no_workspace',
    ...partial,
  }
}

describe('ide store：任务 workspace 关联', () => {
  beforeEach(() => {
    localStorage.clear()
    getMock.mockReset()
    setActivePinia(createPinia())
  })

  it('materialized → 切 IDE 工作区根（localStorage 同步持久化）', async () => {
    const ide = useIdeStore()
    ide.setActiveTask('t1')
    getMock.mockResolvedValue(info({ path: '/ws/t1', materialized: true, note: 'ok' }))
    const r = await ide.associateTaskWorkspace('t1', 'default')
    expect(r?.path).toBe('/ws/t1')
    expect(ide.workspace).toBe('/ws/t1')
    expect(localStorage.getItem('hermes_ide_workspace')).toBe('/ws/t1')
    expect(ide.taskWorkspace?.path).toBe('/ws/t1')
    // board=default 不带查询参数（端点默认板）
    expect(getMock).toHaveBeenCalledWith('t1', 'default')
  })

  it('未物化（scratch 未派发/已回收）→ 不切换，不覆盖用户手选工作区', async () => {
    const ide = useIdeStore()
    ide.setActiveTask('t1')
    ide.setWorkspace('/my/repo')
    getMock.mockResolvedValue(info({ path: '/ws/t1', materialized: false, note: 'predicted_scratch' }))
    await ide.associateTaskWorkspace('t1')
    expect(ide.workspace).toBe('/my/repo')
    // 关联态仍回填（简报展示预测路径用）
    expect(ide.taskWorkspace?.note).toBe('predicted_scratch')
  })

  it('解析失败（排期卡/跟踪卡常态）→ 静默 null 不炸', async () => {
    const ide = useIdeStore()
    ide.setActiveTask('t1')
    getMock.mockRejectedValue(new Error('404'))
    const r = await ide.associateTaskWorkspace('t1')
    expect(r).toBeNull()
    expect(ide.taskWorkspace).toBeNull()
  })

  it('stale 守卫：请求期间切了任务，旧结果丢弃', async () => {
    const ide = useIdeStore()
    ide.setActiveTask('t1')
    let resolve!: (v: TaskWorkspaceInfo) => void
    getMock.mockReturnValue(new Promise<TaskWorkspaceInfo>((res) => { resolve = res }))
    const pending = ide.associateTaskWorkspace('t1')
    ide.setActiveTask('t2')
    resolve(info({ taskId: 't1', path: '/ws/t1', materialized: true, note: 'ok' }))
    const r = await pending
    expect(r).toBeNull()
    expect(ide.workspace).toBeNull()
    expect(ide.taskWorkspace).toBeNull()
  })

  it('setActiveTask(null) 清关联态', async () => {
    const ide = useIdeStore()
    ide.setActiveTask('t1')
    getMock.mockResolvedValue(info({ path: '/ws/t1', materialized: true, note: 'ok' }))
    await ide.associateTaskWorkspace('t1')
    expect(ide.taskWorkspace).not.toBeNull()
    ide.setActiveTask(null)
    expect(ide.taskWorkspace).toBeNull()
  })
})

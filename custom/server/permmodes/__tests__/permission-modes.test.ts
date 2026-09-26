// 权限模式七档守门（cc：放行面/审批面/三档映射）。
import { describe, it, expect } from 'vitest'
import { modeDecision, modeToPreset, type PermissionMode } from '../permission-modes'

describe('七档语义（cc d.ts:6046 六档+readonly）', () => {
  it('readonly/plan 只读；default 全审批；acceptEdits 编辑免审；dontAsk 执行免审；auto/bypass 全免审', () => {
    expect(modeDecision('readonly', 'write').allowed).toBe(false)
    expect(modeDecision('plan', 'exec').allowed).toBe(false)
    expect(modeDecision('default', 'write')).toEqual({ allowed: true, needsApproval: true })
    expect(modeDecision('acceptEdits', 'write').needsApproval).toBe(false)
    expect(modeDecision('acceptEdits', 'exec').needsApproval).toBe(true)
    expect(modeDecision('dontAsk', 'exec').needsApproval).toBe(false)
    expect(modeDecision('dontAsk', 'network').needsApproval).toBe(true)
    expect(modeDecision('auto', 'network').needsApproval).toBe(false)
    expect(modeDecision('bypassPermissions', 'exec').needsApproval).toBe(false)
  })

  it('七档→三档映射与放行面一致', () => {
    expect(modeToPreset('readonly')).toBe('readonly')
    expect(modeToPreset('plan')).toBe('readonly')
    expect(modeToPreset('default')).toBe('standard')
    expect(modeToPreset('acceptEdits')).toBe('standard')
    expect(modeToPreset('dontAsk')).toBe('full-auto')
    expect(modeToPreset('auto')).toBe('full-auto')
    expect(modeToPreset('bypassPermissions')).toBe('full-auto')
    const modes: PermissionMode[] = ['readonly', 'plan', 'default', 'acceptEdits', 'dontAsk', 'auto', 'bypassPermissions']
    expect(modes).toHaveLength(7)
  })
})

describe('七档→引擎任务档映射（层 2）', () => {
  it('全七档映射到 ZCodeTaskMode 六档词表', async () => {
    const { toEngineTaskMode } = await import('../permission-modes')
    expect(toEngineTaskMode('readonly')).toBe('plan')
    expect(toEngineTaskMode('plan')).toBe('plan')
    expect(toEngineTaskMode('default')).toBe('edit')
    expect(toEngineTaskMode('acceptEdits')).toBe('autoEdit')
    expect(toEngineTaskMode('dontAsk')).toBe('auto')
    expect(toEngineTaskMode('auto')).toBe('auto')
    expect(toEngineTaskMode('bypassPermissions')).toBe('yolo')
  })
})

// 权限预设三档守门（deepseek：放行面/审批面/升级单调性）。
import { describe, it, expect } from 'vitest'
import { presetDecision, presetAllowsAtLeast, type ToolCategory } from '../permission-presets'

describe('三档预设（deepseek 语义）', () => {
  it('readonly 只放行 read；standard 执行/网络需审批；full-auto 零审批', () => {
    expect(presetDecision('readonly', 'read')).toEqual({ allowed: true, needsApproval: false })
    expect(presetDecision('readonly', 'write').allowed).toBe(false)
    expect(presetDecision('readonly', 'exec').allowed).toBe(false)
    expect(presetDecision('standard', 'exec')).toEqual({ allowed: true, needsApproval: true })
    expect(presetDecision('standard', 'network').needsApproval).toBe(true)
    expect(presetDecision('full-auto', 'exec')).toEqual({ allowed: true, needsApproval: false })
    expect(presetDecision('full-auto', 'network').needsApproval).toBe(false)
  })

  it('放行面单调升级：full-auto ⊇ standard ⊇ readonly', () => {
    const cats: ToolCategory[] = ['read', 'write', 'exec', 'network']
    for (const cat of cats) {
      if (presetDecision('readonly', cat).allowed) {
        expect(presetDecision('standard', cat).allowed).toBe(true)
      }
      if (presetDecision('standard', cat).allowed) {
        expect(presetDecision('full-auto', cat).allowed).toBe(true)
      }
    }
    expect(presetAllowsAtLeast('full-auto', 'readonly')).toBe(true)
    expect(presetAllowsAtLeast('readonly', 'full-auto')).toBe(false)
  })
})

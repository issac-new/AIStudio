// P1 Task 3 守门：四挡 × 工具风险矩阵、未知档 fail-closed、edit 历史映射、
// Hermes 审批结果→decidedBy 对齐。判定器是纯函数（无 IO），接线在 tool-hooks
// 与 mention-dispatch，行为变化只影响账本记录与引擎档位词表，不改执法链。
import { describe, expect, it } from 'vitest'
import {
  decidedByForResult, evaluateFourMode, zcodeNativeMode,
} from '../server/executioncontract/mode-policy'

describe('evaluateFourMode 矩阵', () => {
  it('build：只读放行（policy:readonly），一切写入/执行/外联待审', () => {
    expect(evaluateFourMode({ mode: 'build', tool: 'read_file', riskClass: 'readonly' }))
      .toEqual({ action: 'allow', recordType: 'approval.exempted', decidedBy: 'policy:readonly' })
    for (const riskClass of ['write_file', 'shell', 'network', 'credential', 'git_write', 'destructive', 'computer_use', 'mcp_external'] as const) {
      expect(evaluateFourMode({ mode: 'build', tool: 'x', riskClass }).action).toBe('ask')
      expect(evaluateFourMode({ mode: 'build', tool: 'x', riskClass }).recordType).toBe('approval.pending')
    }
  })

  it('guarded：常规操作放行（policy:risk-evaluated），高风险类目待审', () => {
    for (const riskClass of ['readonly', 'write_file', 'shell', 'network'] as const) {
      expect(evaluateFourMode({ mode: 'guarded', tool: 'x', riskClass }).action).toBe('allow')
    }
    for (const riskClass of ['credential', 'git_write', 'destructive', 'computer_use', 'mcp_external'] as const) {
      expect(evaluateFourMode({ mode: 'guarded', tool: 'x', riskClass }).action).toBe('ask')
    }
    expect(evaluateFourMode({ mode: 'guarded', tool: 'terminal_exec', riskClass: 'shell' }).decidedBy)
      .toBe('policy:risk-evaluated')
  })

  it('plan：只读工具集——readonly 放行，其余拒绝（不询问）', () => {
    expect(evaluateFourMode({ mode: 'plan', tool: 'grep', riskClass: 'readonly' }).action).toBe('allow')
    for (const riskClass of ['write_file', 'shell', 'network', 'destructive'] as const) {
      const r = evaluateFourMode({ mode: 'plan', tool: 'x', riskClass })
      expect(r.action).toBe('deny')
      expect(r.recordType).toBe('approval.resolved')
    }
  })

  it('yolo：全类目放行记免审；硬底线优先权在上游 floors（本判定器不越权）', () => {
    for (const riskClass of ['readonly', 'write_file', 'shell', 'credential', 'destructive'] as const) {
      expect(evaluateFourMode({ mode: 'yolo', tool: 'x', riskClass }))
        .toEqual({ action: 'allow', recordType: 'approval.exempted', decidedBy: 'policy:auto' })
    }
  })

  it('未知档 fail-closed 落 ask，不猜 yolo（Review Focus 红线）', () => {
    for (const mode of ['legacy', 'acceptEdits', 'bypassPermissions', '', 'unknown'] as const) {
      const r = evaluateFourMode({ mode: mode as never, tool: 'x', riskClass: 'shell' })
      expect(r.action).toBe('ask')
      expect(r.recordType).toBe('approval.pending')
    }
  })
})

describe('zcodeNativeMode 原生档归一', () => {
  it('四挡直通；edit/autoEdit 按受控编辑语义归 guarded；auto/bypassPermissions 归 yolo；readonly 归 plan；未知归 build（最保守）', () => {
    expect(zcodeNativeMode('build')).toBe('build')
    expect(zcodeNativeMode('guarded')).toBe('guarded')
    expect(zcodeNativeMode('plan')).toBe('plan')
    expect(zcodeNativeMode('yolo')).toBe('yolo')
    expect(zcodeNativeMode('edit')).toBe('guarded')
    expect(zcodeNativeMode('autoEdit')).toBe('guarded')
    expect(zcodeNativeMode('auto')).toBe('yolo')
    expect(zcodeNativeMode('bypassPermissions')).toBe('yolo')
    expect(zcodeNativeMode('readonly')).toBe('plan')
    expect(zcodeNativeMode('acceptEdits')).toBe('guarded')
    expect(zcodeNativeMode('')).toBe('build')
    expect(zcodeNativeMode('whatever')).toBe('build')
  })
})

describe('decidedByForResult 与 Python approval_ledger 对齐', () => {
  it('user_approved→user；显式拒绝(user_consent=false)→user；其余 approved→policy:*；pending→risk-evaluated', () => {
    expect(decidedByForResult({ approved: true, user_approved: true }, 'build'))
      .toEqual({ recordType: 'approval.resolved', decidedBy: 'user' })
    expect(decidedByForResult({ approved: false, user_consent: false, outcome: 'denied' }, 'guarded'))
      .toEqual({ recordType: 'approval.resolved', decidedBy: 'user' })
    expect(decidedByForResult({ approved: false, pattern_key: 'hardline' }, 'yolo'))
      .toEqual({ recordType: 'approval.resolved', decidedBy: 'policy:auto' })
    expect(decidedByForResult({ approved: true }, 'yolo'))
      .toEqual({ recordType: 'approval.exempted', decidedBy: 'policy:auto' })
    expect(decidedByForResult({ approval_required: true }, 'build'))
      .toEqual({ recordType: 'approval.pending', decidedBy: 'policy:risk-evaluated' })
    // 非 dict/无 approved 键：不产记录
    expect(decidedByForResult({}, 'yolo')).toBeNull()
  })
})

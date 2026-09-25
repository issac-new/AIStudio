// 状态栏可定制守门（四源合并：6 槽默认/整行替换/custom 探针 stdin JSON）。
import { describe, it, expect } from 'vitest'
import { normalizeStatusline, planProbe } from '../statusline-config'

describe('状态栏定制（四源合并语义）', () => {
  it('缺省 6 槽；整行替换；custom 探针 stdin JSON 计划', () => {
    const cfg = normalizeStatusline(undefined)
    expect(cfg.slots).toHaveLength(6)
    expect(cfg.replaceWholeLine).toBe(false)
    const custom = normalizeStatusline({ slots: [{ kind: 'custom', command: 'probe.sh' }], replaceWholeLine: true })
    expect(custom.replaceWholeLine).toBe(true)
    const plan = planProbe(custom, { model: 'm', tokens: 100 })
    expect(plan).toEqual({ command: 'probe.sh', stdinJson: { model: 'm', tokens: 100 } })
    expect(planProbe(cfg, {})).toBeNull()  // 无 custom 命令不探
  })

  it('坏槽位降级 context；未知 kind 降级', () => {
    const cfg = normalizeStatusline({ slots: [{ kind: 'bogus' }, 'bad', { kind: 'model' }] })
    expect(cfg.slots.map((s) => s.kind)).toEqual(['context', 'context', 'model'])
  })
})

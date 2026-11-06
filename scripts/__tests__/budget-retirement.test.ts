// 机制预算退役机守门（2026-11-06 复盘 P2-1）。
// 事故形态：--budget 只查数值上限与字段齐备，不判 reviewBy 过期、不判 retireWhen
// 达成、不校验 pairedRemovals；15 条 sunset 同日登记、4 条 changes 全为净增。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const { checkSunset } = await import('../governance-lint.mjs') as {
  checkSunset: (budget: unknown, asOf?: Date) => { problems: string[]; warnings: string[]; checked: number }
}
const AS_OF = new Date('2026-12-06T00:00:00Z')

describe('机制预算退役判定', () => {
  it('reviewBy 过期即拦截，未过期不误报', () => {
    const budget = {
      sunset: [{ id: 'old-gate', owner: 'quality', reviewBy: '2026-12-05', retireWhen: '并入 status 后', check: { type: 'filePresent', path: 'scripts/governance-lint.mjs' } }],
      changes: [],
    }
    expect(checkSunset(budget, AS_OF).problems.some(p => p.includes('reviewBy'))).toBe(true)
    expect(checkSunset(budget, new Date('2026-11-06T00:00:00Z')).problems).toEqual([])
  })

  it('自然语言 retireWhen 只告警不拦截，有 check 的条目不再告警', () => {
    const budget = {
      sunset: [
        { id: 'narrative', owner: 'quality', reviewBy: '2026-12-20', retireWhen: '连续三轮全绿后' },
        { id: 'machine', owner: 'quality', reviewBy: '2026-12-20', retireWhen: '文件退役后', check: { type: 'filePresent', path: 'scripts/governance-lint.mjs' } },
      ],
      changes: [],
    }
    const r = checkSunset(budget, new Date('2026-11-06T00:00:00Z'))
    expect(r.warnings.some(w => w.includes('narrative') && w.includes('无机检判定器'))).toBe(true)
    expect(r.warnings.some(w => w.includes('machine'))).toBe(false)
    expect(r.problems).toEqual([])
  })

  it('filePresent 判定器在目标文件缺席时提示已达退役条件', () => {
    const budget = {
      sunset: [{ id: 'gone', owner: 'docs', reviewBy: '2026-12-20', retireWhen: '走查退役', check: { type: 'filePresent', path: 'scripts/__tests__/definitely-absent.mjs' } }],
      changes: [],
    }
    const r = checkSunset(budget, new Date('2026-11-06T00:00:00Z'))
    expect(r.warnings.some(w => w.includes('已达退役条件'))).toBe(true)
  })

  it('声称已退役却仍在 sunset 册 → 拦截', () => {
    const budget = {
      sunset: [{ id: 'walkthrough', owner: 'governance', reviewBy: '2026-12-05', retireWhen: '三页签覆盖后' }],
      changes: [{ at: '2026-11-05', delta: '+0', reason: 'test', pairedRemovals: ['walkthrough 按既有 sunset 退役（一次性走查入口）'] }],
    }
    expect(checkSunset(budget, new Date('2026-11-06T00:00:00Z')).problems.some(p => p.includes('仍在 sunset 册'))).toBe(true)
  })

  it('仓内真实预算：矛盾声明已修订，且至少一条 sunset 具备机检判定器', () => {
    const budget = JSON.parse(readFileSync(join(ROOT, 'config/mechanism-budget.json'), 'utf8'))
    const r = checkSunset(budget, new Date('2026-11-06T00:00:00Z'))
    expect(r.checked).toBeGreaterThan(0)
    expect(r.problems.some(p => p.includes('仍在 sunset 册'))).toBe(false)
    expect(budget.sunset.some((e: { check?: unknown }) => !!e.check)).toBe(true)
  })
})

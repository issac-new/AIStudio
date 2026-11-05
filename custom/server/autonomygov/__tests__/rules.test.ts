import { describe, expect, it } from 'vitest'
import {
  alFromLadder, assess, checkAl4, checkAl5, checkDod, ratioReport, tierFromAl, validateEntryInput,
} from '../rules'
import type { AutonomyScaleEntry, Dod } from '../types'

const DOD: Dod = {
  criteria: ['产物可直接进构建', '无手工补录'],
  sample: '2026-10-31 卡片 #a1 的交付即为此形态',
  stopCondition: '连续两次采纳率低于 60% 即停用并回退人工',
}

function entry(patch: Partial<AutonomyScaleEntry> = {}): AutonomyScaleEntry {
  return {
    target: 'worker-coder',
    al: 2,
    dod: DOD,
    auditSampling: 0.1,
    humanScan: true,
    reviewedAt: 1_700_000_000_000,
    ...patch,
  }
}

describe('tierFromAl：三圈边界', () => {
  it('AL0-1 落人类圈、AL2-3 落协作圈、AL4-5 落自主圈', () => {
    expect([0, 1].map((a) => tierFromAl(a as 0 | 1))).toEqual(['human', 'human'])
    expect([2, 3].map((a) => tierFromAl(a as 2 | 3))).toEqual(['collab', 'collab'])
    expect([4, 5].map((a) => tierFromAl(a as 4 | 5))).toEqual(['auto', 'auto'])
  })
})

describe('alFromLadder：映射不到 AL5', () => {
  it('流程级 auto 只映射到 AL4——「自动执行」不等于「完全脱离人工」', () => {
    expect(alFromLadder('insight')).toBe(1)
    expect(alFromLadder('assist')).toBe(3)
    expect(alFromLadder('auto')).toBe(4)
    expect(alFromLadder('auto')).not.toBe(5)
  })
})

describe('checkDod：60 分线三字段', () => {
  it('三字段齐备判 ok', () => {
    expect(checkDod(DOD)).toMatchObject({ rule: 'dod-complete', verdict: 'ok' })
  })

  it('缺验收判据判 blocked 并点名', () => {
    const f = checkDod({ ...DOD, criteria: [] })
    expect(f.verdict).toBe('blocked')
    expect(f.detail).toContain('验收判据')
  })

  it('缺真实样例判 blocked 并点名', () => {
    const f = checkDod({ ...DOD, sample: '   ' })
    expect(f.verdict).toBe('blocked')
    expect(f.detail).toContain('真实样例')
  })

  it('缺停止条件判 blocked 并点明辨伪底线', () => {
    const f = checkDod({ ...DOD, stopCondition: '' })
    expect(f.verdict).toBe('blocked')
    expect(f.detail).toContain('停止条件')
    expect(f.detail).toContain('假 AI 化')
  })

  it('三字段全缺时一处列全，不逐条重复', () => {
    const f = checkDod({ criteria: [], sample: '', stopCondition: '' })
    expect(f.detail).toContain('验收判据')
    expect(f.detail).toContain('真实样例')
    expect(f.detail).toContain('停止条件')
  })
})

describe('checkAl5：条件式成立（用户裁决：放开而非硬禁）', () => {
  it('两条都具备才成立', () => {
    expect(checkAl5({ al: 5, auditSampling: 0.2, humanScan: true })).toMatchObject({ verdict: 'ok' })
  })

  it('有审计无扫描不成立', () => {
    const f = checkAl5({ al: 5, auditSampling: 0.2, humanScan: false })
    expect(f.verdict).toBe('blocked')
    expect(f.detail).toContain('人工策略扫描')
  })

  it('有扫描无审计不成立', () => {
    const f = checkAl5({ al: 5, auditSampling: 0, humanScan: true })
    expect(f.verdict).toBe('blocked')
    expect(f.detail).toContain('抽样审计')
  })

  it('两条都缺时两处都点名', () => {
    const f = checkAl5({ al: 5, auditSampling: 0, humanScan: false })
    expect(f.detail).toContain('抽样审计')
    expect(f.detail).toContain('人工策略扫描')
  })

  it('非 AL5 判不适用而非通过', () => {
    expect(checkAl5({ al: 4, auditSampling: 0, humanScan: false })).toMatchObject({ rule: 'al5-condition', verdict: 'ok' })
    expect(checkAl5({ al: 4, auditSampling: 0, humanScan: false }).detail).toContain('不适用')
  })
})

describe('checkAl4：抽样底线', () => {
  it('缺抽样判 warn（可运行但显性告警）', () => {
    expect(checkAl4({ al: 4, auditSampling: 0 })).toMatchObject({ rule: 'al4-sampling', verdict: 'warn' })
  })

  it('有抽样判 ok', () => {
    expect(checkAl4({ al: 4, auditSampling: 0.05 })).toMatchObject({ verdict: 'ok' })
  })

  it('非 AL4 不适用', () => {
    expect(checkAl4({ al: 2, auditSampling: 0 }).detail).toContain('不适用')
  })
})

describe('assess：合并三条规矩与辨伪判据', () => {
  it('三条全过判 ok 且不是 fakeAi', () => {
    const a = assess(entry())
    expect(a.verdict).toBe('ok')
    expect(a.fakeAi).toBe(false)
    expect(a.tier).toBe('collab')
  })

  it('一条 blocked 即整体 blocked，一条 warn 即整体 warn', () => {
    expect(assess(entry({ al: 5, auditSampling: 0 })).verdict).toBe('blocked')
    expect(assess(entry({ al: 4, auditSampling: 0 })).verdict).toBe('warn')
  })

  it('停止条件为空即判 fakeAi（即使其它字段齐全）', () => {
    const a = assess(entry({ dod: { ...DOD, stopCondition: '  ' } }))
    expect(a.fakeAi).toBe(true)
    expect(a.verdict).toBe('blocked')
  })

  it('dod 整块缺失也判 fakeAi，不因空指针放行', () => {
    const a = assess(entry({ dod: undefined as unknown as Dod }))
    expect(a.fakeAi).toBe(true)
  })
})

describe('ratioReport：配比与两条退化自检', () => {
  it('无配置时报 no-data，不给「已治理」结论', () => {
    const r = ratioReport([])
    expect(r.total).toBe(0)
    expect(r.checks.map((c) => c.id)).toEqual(['no-data'])
  })

  it('全部落人类圈时报「只有控制没有治理」', () => {
    const r = ratioReport([entry({ al: 1 }), entry({ target: 'b', al: 1 })])
    expect(r.counts.human).toBe(2)
    expect(r.checks.some((c) => c.id === 'all-human')).toBe(true)
    expect(r.checks.find((c) => c.id === 'all-human')!.detail).toContain('只有控制')
  })

  it('无自主圈时报「有治理框架，无授权」', () => {
    const r = ratioReport([entry({ al: 1 }), entry({ target: 'b', al: 2 })])
    expect(r.counts.auto).toBe(0)
    expect(r.checks.some((c) => c.id === 'no-autonomy')).toBe(true)
  })

  it('三圈皆有且无违规时不产出自检项', () => {
    const r = ratioReport([
      entry({ target: 'h', al: 1 }),
      entry({ target: 'c', al: 2 }),
      entry({ target: 'a', al: 4, auditSampling: 0.1 }),
    ])
    expect(r.checks).toEqual([])
    expect(r.counts).toEqual({ human: 1, collab: 1, auto: 1 })
    expect(r.shares.auto).toBeCloseTo(0.3333, 3)
  })

  it('违规计数与配比分开统计', () => {
    const r = ratioReport([entry({ al: 5, auditSampling: 0 }), entry({ target: 'b', al: 2 })])
    expect(r.verdicts.blocked).toBe(1)
    expect(r.verdicts.ok).toBe(1)
  })
})

describe('validateEntryInput：写入前校验', () => {
  const okInput = { target: 'worker-coder', al: 2, dod: DOD, auditSampling: 0.1, humanScan: true }

  it('合法输入无问题', () => {
    expect(validateEntryInput(okInput)).toEqual([])
  })

  it('拒绝非法 target / 越界 al / 越界抽样 / 缺 dod 三字段', () => {
    expect(validateEntryInput({ ...okInput, target: 'has space' }).join()).toContain('target')
    expect(validateEntryInput({ ...okInput, al: 6 }).join()).toContain('al')
    expect(validateEntryInput({ ...okInput, auditSampling: 1.5 }).join()).toContain('auditSampling')
    expect(validateEntryInput({ ...okInput, dod: {} }).join()).toContain('dod.criteria')
  })

  it('workflow 形态的 target 允许冒号', () => {
    expect(validateEntryInput({ ...okInput, target: 'workflow:build:deploy' })).toEqual([])
  })
})

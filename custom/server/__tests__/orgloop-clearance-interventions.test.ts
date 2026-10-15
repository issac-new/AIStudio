/**
 * X2 清偿门四端点+介入点聚合 纯函数面单测（设计正本《2026-10-16-design-derived-from-requirements.md》§三，R5/R6）。
 * 覆盖：TSV 解析（含短行/表头跳过）；清偿视图（resolve 优先于 waive/开轮判定）；
 * 入参校验（resolve 无 PR 锚=400 语义、waive 无理由=400 语义、target 受控字符集）；
 * 14 介入点登记全覆盖；三源任一缺席降级不报错。
 * 端点的 HTTP 面（503 fail-closed 等）走部署窗口活体验证——同 PR-0 模式，此处守纯函数契约。
 */
import { describe, expect, it } from 'vitest'
import {
  parseLedgerTsv,
  computeClearanceView,
  validateResolve,
  validateWaive,
  INTERVENTION_POINTS,
  aggregateInterventions,
} from '../orgloop/orgloop-controller'

const TSV = [
  'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
  'e1\t2026-10-15 15:46:32\tnudge\tPR-3\t轻推\topen\t',
  'e2\t2026-10-15 15:53:06\tauto-approve\tPR-2\t代批\topen\t',
  'e3\t2026-10-15 16:00:00\tgw-dispatch-bypass\tPR-3\t绕网关\topen\t',
  '坏行没有七列',
].join('\n')

describe('parseLedgerTsv — 台账解析（列序=id ts type defect detail status resolution）', () => {
  it('表头跳过+坏行如实跳过，三行入账', () => {
    const rows = parseLedgerTsv(TSV)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ id: 'e1', type: 'nudge', defect: 'PR-3', status: 'open' })
  })
  it('空串与纯空白返回空数组（零代偿=空台账不炸）', () => {
    expect(parseLedgerTsv('')).toEqual([])
    expect(parseLedgerTsv('\n \n')).toEqual([])
  })
})

describe('computeClearanceView — 清偿视图与开轮判定', () => {
  const entries = parseLedgerTsv(TSV)
  it('无处置=全 open，pass=false（开轮拒放行）', () => {
    const v = computeClearanceView(entries, [])
    expect(v.open).toBe(3)
    expect(v.pass).toBe(false)
  })
  it('按缺陷号 resolve 后该组全 resolved；resolve 优先于 waive；pass 判定随 open 归零', () => {
    const v1 = computeClearanceView(entries, [{ target: 'PR-3', action: 'resolve', pr: 'PR-3', ts: 't' }])
    expect(v1.open).toBe(1)
    expect(v1.rows.filter(r => r.defect === 'PR-3').every(r => r.state === 'resolved')).toBe(true)
    const v2 = computeClearanceView(entries, [
      { target: 'PR-3', action: 'resolve', pr: 'PR-3', ts: 't' },
      { target: 'PR-2', action: 'waive', reason: '用户裁定豁免', ts: 't' },
      { target: 'PR-2', action: 'resolve', pr: 'PR-2', ts: 't2' },
    ])
    expect(v2.open).toBe(0)
    expect(v2.pass).toBe(true)
    expect(v2.rows.find(r => r.defect === 'PR-2')?.state).toBe('resolved')
  })
})

describe('validateResolve / validateWaive — 入参校验（400 语义）', () => {
  it('resolve 无 PR 锚=invalid；齐备=target/pr 受控截断', () => {
    expect(validateResolve({ target: 'PR-3' })).toMatchObject({ ok: false })
    expect(validateResolve({ target: 'PR-3', pr: '' })).toMatchObject({ ok: false })
    expect(validateResolve({ pr: 'PR-3' })).toMatchObject({ ok: false })
    const ok = validateResolve({ target: 'PR-3', pr: 'PR-3', commit: 'd197be6c' })
    expect(ok).toMatchObject({ ok: true, target: 'PR-3', pr: 'PR-3', commit: 'd197be6c' })
  })
  it('waive 无理由=invalid；target 越受控字符集=invalid（路径注入防御）', () => {
    expect(validateWaive({ target: 'PR-2' })).toMatchObject({ ok: false })
    expect(validateWaive({ reason: 'x' })).toMatchObject({ ok: false })
    expect(validateWaive({ target: '../../etc', reason: 'r' })).toMatchObject({ ok: false })
    expect(validateWaive({ target: 'PR-2', reason: '用户裁定豁免' })).toMatchObject({ ok: true, target: 'PR-2' })
  })
})

describe('INTERVENTION_POINTS + aggregateInterventions — 14 介入点与三源降级（R5）', () => {
  it('登记全覆盖：14 点、id 唯一、三类数据源齐（gate/approval/clearance）', () => {
    expect(INTERVENTION_POINTS).toHaveLength(14)
    expect(new Set(INTERVENTION_POINTS.map(p => p.id)).size).toBe(14)
    const kinds = new Set(INTERVENTION_POINTS.map(p => p.sourceKind))
    for (const k of ['gate', 'approval', 'clearance'] as const) expect(kinds.has(k)).toBe(true)
  })
  it('三源齐：闸未过/审批未见/清偿未清=待办；已过=非待办', () => {
    const r = aggregateInterventions({ gates: { g1_frozen: '1' }, approvals: ['g5_human'], clearanceOpen: 3 })
    expect(r.sources).toEqual({ gates: 'ok', approvals: 'ok', clearance: 'ok' })
    expect(r.points.find(p => p.id === 'iv-03')?.pending).toBe(false)
    expect(r.points.find(p => p.id === 'iv-06')?.pending).toBe(true)
    expect(r.points.find(p => p.id === 'iv-08')?.pending).toBe(false)
    expect(r.points.find(p => p.id === 'iv-12')?.pending).toBe(true)
  })
  it('降级不报错：任一源缺席=该源 absent，对应点 pending=null（如实未知，不猜）', () => {
    const r = aggregateInterventions({})
    expect(r.sources).toEqual({ gates: 'absent', approvals: 'absent', clearance: 'absent' })
    expect(r.points.every(p => p.pending === null)).toBe(true)
    expect(r.points).toHaveLength(14)
    const half = aggregateInterventions({ gates: { g1_frozen: '1' } })
    expect(half.points.find(p => p.id === 'iv-03')?.pending).toBe(false)
    expect(half.points.find(p => p.id === 'iv-08')?.pending).toBe(null)
  })
})

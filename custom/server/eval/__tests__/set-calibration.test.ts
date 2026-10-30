// F2P/P2P 集校准守门（2026-10-30 HelixHarness 吸收轮）：
// 判据有区分力才算校准通过；恒真 rubric / 恒假 rubric / 证据不达标 必须被拒。
import { describe, expect, it } from 'vitest'
import { calibrateSet, calibrationProblemsForRun, type SetCalibration } from '../set-calibration'
import type { Attempt, EvalSet, EvalTask } from '../types'

const task = (id: string): EvalTask => ({
  id,
  problem: 'p',
  expectedBehavior: 'b',
  rubric: [{ id: `${id}-a1`, text: '断言', expect: 'yes', kind: 'result' }],
})

const set = (over: Partial<EvalSet> = {}): EvalSet => ({
  id: 'eset-001',
  name: 's',
  track: 'e2e',
  sealed: false,
  contentHash: 'hash-1',
  revision: 1,
  createdAt: 0,
  tasks: [task('t1'), task('t2')],
  ...over,
})

/** 构造判分结果：value 决定该断言是否与 expect 一致。 */
const attempt = (taskId: string, pass: boolean): Attempt => ({
  taskId,
  sampleIdx: 1,
  verdicts: [{ assertionId: `${taskId}-a1`, value: pass ? 'yes' : 'no', source: 'judge' }],
  judgedAt: 0,
})

/** 按 evidence 里的隐式标记决定判分结果（测试用最小替身）。 */
const judgeBy = (decision: (taskId: string, ev: Record<string, unknown>) => boolean) =>
  (t: EvalTask, ev: unknown) => attempt(t.id, decision(t.id, (ev ?? {}) as Record<string, unknown>))

describe('calibrateSet', () => {
  it('f2p 通过：基线失败 / 解法通过', async () => {
    const r = await calibrateSet(
      set(),
      [{ taskId: 't1', baseline: { fail: true }, solution: { ok: true } }],
      judgeBy((_id, ev) => ev.ok === true),
      { now: 1 },
    )
    expect(r.calibrated).toBe(true)
    expect(r.f2p).toHaveLength(1)
    expect(r.f2p[0]).toMatchObject({ baselinePassed: false, solutionPassed: true, ok: true })
    expect(r.setHash).toBe('hash-1')
  })

  it('rubric 恒真（基线也通过）→ 校准失败并给出方向', async () => {
    const r = await calibrateSet(set(), [{ taskId: 't1', baseline: {}, solution: {} }], judgeBy(() => true))
    expect(r.calibrated).toBe(false)
    expect(r.reasons.join('')).toContain('无区分力')
  })

  it('解法未通过 → 校准失败（证据或 rubric 不达标）', async () => {
    const r = await calibrateSet(set(), [{ taskId: 't1', baseline: {}, solution: {} }], judgeBy(() => false))
    expect(r.calibrated).toBe(false)
    expect(r.f2p[0].ok).toBe(false)
  })

  it('p2p：两侧都通过才算过（防误杀）；单独 p2p 不足以证明区分力', async () => {
    // 只做 p2p → 缺 f2p，校准不通过（p2p 只证明不过严，不证明有区分力）
    const only = await calibrateSet(
      set(),
      [{ taskId: 't1', kind: 'p2p', baseline: { ok: true }, solution: { ok: true } }],
      judgeBy((_id, ev) => ev.ok === true),
    )
    expect(only.calibrated).toBe(false)
    expect(only.p2p[0].ok).toBe(true)

    // f2p + p2p 混合且都满足 → 通过
    const ok = await calibrateSet(
      set(),
      [
        { taskId: 't1', baseline: { fail: true }, solution: { ok: true } },
        { taskId: 't2', kind: 'p2p', baseline: { ok: true }, solution: { ok: true } },
      ],
      judgeBy((_id, ev) => ev.ok === true),
    )
    expect(ok.calibrated).toBe(true)
    expect(ok.p2p[0].ok).toBe(true)

    // p2p 侧基线不通过 → 误杀方向，拒绝
    const bad = await calibrateSet(
      set(),
      [
        { taskId: 't1', baseline: { fail: true }, solution: { ok: true } },
        { taskId: 't2', kind: 'p2p', baseline: { fail: true }, solution: { ok: true } },
      ],
      judgeBy((_id, ev) => ev.ok === true),
    )
    expect(bad.calibrated).toBe(false)
  })

  it('空样本 / 未知任务 / f2p 数量不足 都拒绝', async () => {
    const empty = await calibrateSet(set(), [], judgeBy(() => true))
    expect(empty.calibrated).toBe(false)

    const unknown = await calibrateSet(set(), [{ taskId: 'nope', baseline: {}, solution: {} }], judgeBy(() => true))
    expect(unknown.reasons.join('')).toContain('不存在的任务')

    const onlyP2P = await calibrateSet(
      set(),
      [{ taskId: 't1', kind: 'p2p', baseline: {}, solution: {} }],
      judgeBy(() => true),
    )
    expect(onlyP2P.calibrated).toBe(false)
    expect(onlyP2P.reasons.join('')).toContain('f2p 样本不足')
  })

  it('判分抛错 → 记失败原因，不炸整次校准', async () => {
    const r = await calibrateSet(set(), [{ taskId: 't1', baseline: {}, solution: {} }], () => {
      throw new Error('judge down')
    })
    expect(r.calibrated).toBe(false)
    expect(r.reasons.join('')).toContain('judge down')
  })

  it('含终态校验器的任务在 notes 里声明“只校准 rubric”', async () => {
    const withOutcome = set({ tasks: [{ ...task('t1'), outcome: { verifier: 'file_exists', params: { path: '/x' } } }] })
    const r = await calibrateSet(withOutcome, [{ taskId: 't1', baseline: {}, solution: {} }], judgeBy((_i, ev) => ev.ok === true), {})
    expect(r.notes.join('')).toContain('只验证 rubric 区分力')
  })
})

describe('calibrationProblemsForRun', () => {
  const cal: SetCalibration = {
    calibrated: true,
    calibratedAt: 1,
    setHash: 'hash-1',
    samples: 1,
    f2p: [],
    p2p: [],
    reasons: [],
    notes: [],
  }

  it('未声明要求且无记录 → 放行（存量兼容）', () => {
    expect(calibrationProblemsForRun(set())).toEqual([])
  })

  it('声明 requireCalibration 但无记录 → 拒绝', () => {
    expect(calibrationProblemsForRun(set({ requireCalibration: true })).join('')).toContain('尚未校准')
  })

  it('校准未通过 → 拒绝', () => {
    const p = calibrationProblemsForRun(set({ calibration: { ...cal, calibrated: false, reasons: ['恒真'] } }))
    expect(p.join('')).toContain('校准未通过')
  })

  it('contentHash 变更 → 校准失效', () => {
    const p = calibrationProblemsForRun(set({ calibration: cal, contentHash: 'hash-2' }))
    expect(p.join('')).toContain('校准失效')
  })

  it('校准有效 → 放行', () => {
    expect(calibrationProblemsForRun(set({ calibration: cal }))).toEqual([])
  })
})

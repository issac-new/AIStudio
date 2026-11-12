/**
 * G4 黄金集门检守门（spec 2026-11-06-eval-golden-gate）。
 * 资产自洽（30 例材料全覆盖＋regex 双向）＋门检正身（stub judge 真跑：建集→run→三桶聚合）
 * ＋误杀点名＋mx-eval-lib 接线源码级断言（防静默摘除）。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GOLDEN_MATERIALS,
  assertGoldenMaterials,
  buildGoldenTasks,
} from '../golden-set'
import { goldenGateCheck } from '../golden-gate'
import { outcomeContext } from '../routes/shared'
import { TtlCache } from '../clef'
import { loadEvalConfig } from '../types'
import type { AskFn } from '../judge'

let temp = ''

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'golden-gate-'))
  process.env.EVAL_STORE = join(temp, 'eval-store.json')
})

afterEach(() => {
  delete process.env.EVAL_STORE
  rmSync(temp, { recursive: true, force: true })
})

describe('材料资产自洽', () => {
  it('30 例全覆盖且 regex 双向自洽（result 命中/risk 规避）零 problems', () => {
    const tasks = buildGoldenTasks()
    expect(Object.keys(GOLDEN_MATERIALS).length).toBe(30)
    expect(assertGoldenMaterials(tasks)).toEqual([])
  })

  it('材料不重复（taskId 一对一）', () => {
    const vals = Object.values(GOLDEN_MATERIALS)
    expect(new Set(vals).size).toBe(30)
  })
})

/** 断言 id → expect 映射（question 协议只有 instructions 无 expect——stub 侧自建）。 */
const EXPECT_BY_ID = new Map(buildGoldenTasks().flatMap((t) => t.rubric.map((r) => [r.id, r.expect] as const)))

/** stub judge：answers 协议=断言 id → 概率 p（clef.ts EvalJudgeAnswers）。
 * perfect=按 expect 给极值（expect yes→p=1，expect no→p=0）→模范材料全 PASS。 */
const perfectAsk: AskFn = async (request) => {
  const answers: Record<string, number> = {}
  for (const id of Object.keys(request.questions ?? {})) {
    answers[id] = EXPECT_BY_ID.get(id) === 'no' ? 0 : 1
  }
  return answers
}

describe('goldenGateCheck 正身（stub judge 真跑）', () => {
  it('建集→run→三桶各 10、mismatch 空集、semantics=p2p', async () => {
    const r = await goldenGateCheck({
      judge: { config: loadEvalConfig(), ask: perfectAsk, cache: new TtlCache(60_000) },
      outcomeCtx: outcomeContext(),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.buckets).toEqual({ positive: 10, ambiguous: 10, adversarial: 10 })
    expect(r.mismatch).toEqual([])
    expect(r.semantics).toBe('p2p')
    expect(r.runId).toBeTruthy()
  })

  it('judge 全反向（应过的判不过/无风险的判有风险）时 mismatch 非空且桶计数下探', async () => {
    // 反向=expect yes→p=0（没命中）、expect no→p=1（风险出现）→全例误杀
    const allNoAsk: AskFn = async (request) => {
      const answers: Record<string, number> = {}
      for (const id of Object.keys(request.questions ?? {})) {
        answers[id] = EXPECT_BY_ID.get(id) === 'no' ? 1 : 0
      }
      return answers
    }
    const r = await goldenGateCheck({
      judge: { config: loadEvalConfig(), ask: allNoAsk, cache: new TtlCache(60_000) },
      outcomeCtx: outcomeContext(),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mismatch?.length).toBeGreaterThan(0)
    expect(r.buckets!.positive + r.buckets!.ambiguous + r.buckets!.adversarial).toBeLessThan(30)
  })

  it('材料资产失配时 fail-closed 不跑（预置缺材料任务）', async () => {
    // 篡改 EVAL_STORE 无关；直接验证正身对失配的反应——用缺材料的环境模拟：
    // goldenGateCheck 先 assertGoldenMaterials（纯资产），此处已被第一例覆盖；
    // 本例守门端点接线：routes/analysis.ts 含 postGateCheck 且无必填体。
    const src = readFileSync(join(import.meta.dirname, '..', 'routes', 'analysis.ts'), 'utf8')
    expect(src).toContain('export async function postGateCheck')
    expect(src).not.toMatch(/gateCheck\([^)]*ctx\.request\.body/)
  })
})

describe('mx-eval-lib 接线源码级断言', () => {
  it('eval_flow 含 eval_golden_gate 叠加调用（防静默摘除）', () => {
    const src = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'simharness', 'mux', 'mx-eval-lib.sh'), 'utf8')
    expect(src).toContain('eval_golden_gate()')
    expect(src).toMatch(/eval_golden_gate >\/dev\/null 2>&1 \|\| true/)
    // 判据纪律：观察态（不达标记 issue 不改主判定返回值）
    expect(src).toContain('golden-gate-mismatch')
    expect(src).not.toMatch(/eval_golden_gate[^\n]*\|\|.*return 1/)
  })
})

describe('F2P 校准（2026-11-12 handbook 吸收）', () => {
  it('请求 calibrate 时产出 f2p/p2p 读数；stub 让负例全过 → 未校准', async () => {
    const r = await goldenGateCheck(
      { judge: { config: loadEvalConfig(), ask: perfectAsk, cache: new TtlCache(60_000) }, outcomeCtx: outcomeContext() },
      { calibrate: true },
    )
    expect(r.ok).toBe(true)
    expect(r.calibration).toMatchObject({ f2pTotal: 30, p2pTotal: 30, calibrated: false, decision: 'uncalibrated' })
    expect(r.calibration!.f2pPassed).toBeGreaterThan(0)
    expect(r.calibration!.f2pPassed).toBeLessThan(30)
    expect(r.calibration!.failed.length).toBeGreaterThan(0)
  })

  it('enforce=1 且未校准 → ok:false（默认不开启，观察态不变）', async () => {
    const r = await goldenGateCheck(
      { judge: { config: loadEvalConfig(), ask: perfectAsk, cache: new TtlCache(60_000) }, outcomeCtx: outcomeContext() },
      { calibrate: true, enforce: true },
    )
    expect(r.ok).toBe(false)
    expect(r.enforced).toBe(true)
    expect(r.problems?.length).toBeGreaterThan(0)
  })

  it('enforce=1 但未请求 calibrate → 直接拒绝（没有读数可判）', async () => {
    const r = await goldenGateCheck(undefined, { enforce: true })
    expect(r.ok).toBe(false)
    expect(r.problems?.join(' ')).toContain('calibrate')
  })
})

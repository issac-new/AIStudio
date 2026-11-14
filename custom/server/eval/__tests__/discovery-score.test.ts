// overlay[eval] 发现测试单测（2026-11-14 Proactive AI 二轮 P1）。
// 范式锚点：论文 §6.1.5（发现/调度/执行/守护＋正确沉默）＋ FixedBench 行动偏差实证。
// 覆盖：判分四指标矩阵、锚点门槛（无锚点＝unsupported）、指纹逐字节兼容锁定、
// store 校验形态分支、DiscoveryRun 账本（append/list/坏行隔离）。
import { createHash } from 'crypto'
import { appendFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scoreDiscovery, appendDiscoveryRun, listDiscoveryRuns, type DiscoveryRun } from '../discovery-score'
import { contentFingerprint, canonicalize } from '../fingerprint'
import { createSet, _useStoreDirForTests } from '../store'
import type { DiscoveryFinding, EvalSet, EvalTask } from '../types'

const SPEC = {
  scenario: '仓 A：持续维护代码质量；委托目标=主分支可发布',
  expectedFindings: [
    { id: 'f1', description: '依赖 lodash 版本存在已知漏洞' },
    { id: 'f2', description: '构建脚本未锁 node 版本' },
  ],
  resolvedConcerns: [
    { id: 'r1', description: '登录接口缺少限流（已修复）' },
  ],
  maxFindings: 3,
}

// ---------- 判分矩阵 ----------

describe('P1 发现测试判分', () => {
  it('无锚点发现判 unsupported（红线：结论无锚点不成立）', () => {
    const s = scoreDiscovery(SPEC, [{ description: '依赖过期', evidenceRefs: [] }])
    expect(s.findings[0].verdict).toBe('unsupported')
    expect(s.unsupportedCount).toBe(1)
    expect(s.discoveryPrecision).toBe(0)
  })

  it('锚点含空串同判 unsupported（防 [\"\"] 逃逸）', () => {
    const s = scoreDiscovery(SPEC, [{ description: '依赖过期', evidenceRefs: ['  '] }])
    expect(s.findings[0].verdict).toBe('unsupported')
  })

  it('重复报告已解决问题＝行动偏差（correctSilencePenalty），不当 supported 计 precision', () => {
    const s = scoreDiscovery(SPEC, [
      { description: '登录接口缺少限流', evidenceRefs: ['evidence/scan.txt:12'] },
    ])
    expect(s.findings[0].verdict).toBe('duplicate-resolved')
    expect(s.correctSilencePenalty).toBe(1)
    expect(s.supportedCount).toBe(0)
    expect(s.discoveryPrecision).toBe(0)
  })

  it('命中期望计 recall；开放域（无期望）recall=undefined 不冒充满分', () => {
    const hit: DiscoveryFinding[] = [
      // 判分层=保守文本匹配（双向包含）：命中表述须是期望描述的子串或超串；
      // 缩写/改写表述（如「漏洞：lodash」）留给 judge 复核层收严——分层语义本身。
      { description: '依赖 lodash 版本存在已知漏洞', evidenceRefs: ['pkg.json:31'] },
      { description: '构建脚本未锁 node 版本', evidenceRefs: ['Makefile:4'] },
    ]
    const s = scoreDiscovery(SPEC, hit)
    expect(s.discoveryRecall).toBe(1)
    expect(s.supportedCount).toBe(2)

    const open = scoreDiscovery({ scenario: 'x' }, [{ description: '任意真问题', evidenceRefs: ['a:1'] }])
    expect(open.discoveryRecall).toBeUndefined()
    expect(open.discoveryPrecision).toBe(1)
  })

  it('零提交＝正确沉默满分（precision=1，无行动偏差）', () => {
    const s = scoreDiscovery(SPEC, [])
    expect(s.discoveryPrecision).toBe(1)
    expect(s.correctSilencePenalty).toBe(0)
    expect(s.totalFindings).toBe(0)
  })

  it('verificationBurden 超 maxFindings 才为正；未设上限＝undefined', () => {
    const over = scoreDiscovery(SPEC, [
      { description: '问题一', evidenceRefs: ['a:1'] },
      { description: '问题二', evidenceRefs: ['a:2'] },
      { description: '问题三', evidenceRefs: ['a:3'] },
      { description: '问题四', evidenceRefs: ['a:4'] },
    ])
    expect(over.verificationBurden).toBeCloseTo(4 / 3 - 1, 5)
    const noCap = scoreDiscovery({ scenario: 'x' }, [{ description: 'y', evidenceRefs: ['a:1'] }])
    expect(noCap.verificationBurden).toBeUndefined()
  })

  it('文本匹配双向包含（判分层宽松，judge 复核收严）', () => {
    const s = scoreDiscovery(SPEC, [{ description: '依赖 lodash 版本存在已知漏洞', evidenceRefs: ['x:1'] }])
    expect(s.findings[0].matchedExpectedId).toBe('f1')
  })
})

// ---------- 指纹逐字节兼容锁定 ----------

describe('P1 指纹兼容锁定', () => {
  it('discovery 缺席时与旧算法（数组直出 canonical）逐字节一致', () => {
    const tasks = [{ id: 't1', problem: 'p', expectedBehavior: 'b', rubric: [] }] as unknown as EvalTask[]
    const legacy = createHash('sha1').update(canonicalize(tasks), 'utf8').digest('hex')
    expect(contentFingerprint({ tasks })).toBe(legacy)
  })

  it('discovery 存在时并入指纹（改 discovery 规格可检出）', () => {
    const tasks: EvalTask[] = []
    const a = contentFingerprint({ tasks, discovery: { scenario: 'v1' } })
    const b = contentFingerprint({ tasks, discovery: { scenario: 'v2' } })
    expect(a).not.toBe(b)
  })
})

// ---------- store 形态分支 ----------

describe('P1 store 校验形态分支', () => {
  beforeEach(() => { _useStoreDirForTests(mkdtempSync(join(tmpdir(), 'eval-disc-'))) })

  it('discovery 形态：tasks 空数组合法、scenario 缺失拒建', () => {
    const ok = createSet({ name: 'disc-ok', track: 'process', kind: 'discovery', tasks: [], discovery: SPEC })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect((ok.set as EvalSet).kind).toBe('discovery')
      expect(ok.set.tasks).toEqual([])
    }
    const bad = createSet({ name: 'disc-bad', track: 'process', kind: 'discovery', tasks: [], discovery: { scenario: '  ' } })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems.join()).toContain('scenario')
  })

  it('task 形态仍强制 tasks≥1（存量行为不变）', () => {
    const bad = createSet({ name: 't-bad', track: 'process', tasks: [] })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems.join()).toContain('tasks 至少 1 条')
  })

  it('expectedFindings 条目缺 description 拒建', () => {
    const bad = createSet({
      name: 'disc-bad2', track: 'process', kind: 'discovery', tasks: [],
      discovery: { scenario: 's', expectedFindings: [{ id: 'x' } as never] },
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems.join()).toContain('description 必填')
  })
})

// ---------- DiscoveryRun 账本 ----------

describe('P1 DiscoveryRun 账本', () => {
  let dir: string
  const prev = process.env.HERMES_DISCOVERY_RUN_DIR
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'disc-run-'))
    process.env.HERMES_DISCOVERY_RUN_DIR = dir
  })
  afterEach(() => { if (prev === undefined) delete process.env.HERMES_DISCOVERY_RUN_DIR; else process.env.HERMES_DISCOVERY_RUN_DIR = prev })

  it('append→list 往返；setId 过滤；坏行隔离计数', () => {
    const run: DiscoveryRun = {
      id: 'drun-1', setId: 'eset-001', setHash: 'h', createdAt: 1,
      score: scoreDiscovery(SPEC, []),
    }
    appendDiscoveryRun(run)
    expect(listDiscoveryRuns('eset-001').runs).toHaveLength(1)
    expect(listDiscoveryRuns('eset-999').runs).toHaveLength(0)
    // 坏行：直接写一行非 JSON
    appendFileSync(join(dir, 'discovery-runs.jsonl'), 'not-json\n', 'utf8')
    const after = listDiscoveryRuns()
    expect(after.badLines).toBe(1)
    expect(after.runs).toHaveLength(1)
  })

  it('账本缺席＝空数组（fail-soft 不猜数）', () => {
    expect(listDiscoveryRuns().runs).toEqual([])
    expect(listDiscoveryRuns().badLines).toBe(0)
  })
})

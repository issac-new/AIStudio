// 派单最小上下文快照测试（Task 6；spec 2026-11-19-ai-native-operating-model-design.md §4.4）。
// 覆盖：同输入哈希稳定（批一幂等基石）、信封字段逐字（teamVersion:null / approvedExperienceVersions:[]）、
// content 物化结构（合同规范子集＋owner/verifier 身份行＋任务摘要＋策略块）、sha256 独立复算、
// 关键源失败 fail-closed（contract/task/people/policy）、people 部分缺席→excludedSources（非关键）、
// 临界拒绝不截断（canonical>1 MiB / sourceRefs>100，恰好边界放行）、
// store 扩展 appendSnapshot/listSnapshots（幂等按内容 sha256、context_snapshot_created 事件、撕裂行自愈）。
// 哈希复算用本文件独立的 canon/sha 实现（不复用被测模块导出），钉死
// 「sha256 = sha256(canonicalJson(信封去 snapshotId/createdAt/sha256))」格式——outcome-store.test.ts 同款纪律。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DECISION_MATRIX_VERSION,
  buildMinimalSnapshot,
  type BuildSnapshotResult,
  type OutcomeContextSnapshot,
} from '../snapshot'
import {
  _useOutcomeStoreForTests,
  appendSnapshot,
  createContract,
  listEvents,
  listSnapshots,
} from '../outcome-store'
import type { CreateContractInput } from '../outcome-store'
import type { OutcomeMeasure } from '../types'

/** 测试独立的 canonical JSON（对象键递归排序后序列化）——与实现各自成文，格式互为对账。 */
function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  return `{${Object.keys(v as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

/** 哈希体＝信封去 {snapshotId, createdAt, sha256}（易变字段不入哈希：同语义输入跨时刻同哈希，
 *  这是「幂等按内容 sha256」的前提）。 */
const hashBodyOf = (s: OutcomeContextSnapshot) => {
  const { snapshotId: _s, createdAt: _c, sha256: _h, ...body } = s
  return body
}

function makeMeasures(n: number): OutcomeMeasure[] {
  return Array.from({ length: n }, (_, i) => ({
    measureId: `m-${i}`,
    name: `度量${i}`,
    definition: `滚动 30 天口径 ${i}`,
    unit: '次',
    operator: 'lte',
    baseline: null,
    target: 0,
    sourceRef: `incidents://release/${i}`,
  }))
}

/** 合法最小合同（outcome-store.test.ts 同款基底；owner p-1 / verifier p-2 分离）。 */
function makeContract(outcomeId: string, opts?: { measures?: OutcomeMeasure[]; valueStatement?: string }): CreateContractInput {
  return {
    schemaVersion: 1,
    outcomeId,
    rootTaskId: `task-${outcomeId}`,
    version: 1,
    title: '发布事故率下降',
    valueStatement: opts?.valueStatement ?? '降低发布流程引发的生产事故',
    ownerPersonId: 'p-1',
    measures: opts?.measures ?? makeMeasures(1),
    acceptance: { statements: [], requiredEvidenceKinds: [] },
    scope: { included: ['发布流程'], excluded: [] },
    riskTier: 'medium',
    defaultReversibility: 'reversible',
    verificationOwnerId: 'p-2',
    contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
    learningOptIn: false,
    status: 'draft',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }
}

const TASK_OK = { ok: true, task: { id: 'task-oc-1', title: '根任务', status: 'in_progress' } }
const PEOPLE_OK = {
  ok: true,
  people: [
    { id: 'p-1', name: '张三', active: true },
    { id: 'p-2', name: '李四', active: true },
  ],
}

/** 标配解析桩：任务与身份册全部命中。 */
const resolveAllOk = {
  task: () => TASK_OK,
  people: (_ids: string[]) => PEOPLE_OK,
}

const POLICY_VERSION = 'policy-2026-11-19'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outcome-snapshot-'))
  _useOutcomeStoreForTests(dir)
})

afterEach(() => {
  _useOutcomeStoreForTests(null)
  rmSync(dir, { recursive: true, force: true })
})

// ---------- 纯核心＋IO 薄壳：物化与哈希 ----------

describe('buildMinimalSnapshot：物化与哈希', () => {
  it('同输入两次构建 sha256/snapshotId 相等（易变字段不入哈希）', () => {
    const contract = makeContract('oc-1')
    const a = buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
    const b = buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
    expect(a.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.snapshot.sha256).toBe(a.snapshot.sha256)
    expect(b.snapshot.snapshotId).toBe(a.snapshot.snapshotId)
  })

  it('信封字段逐字（spec §4.4）：teamVersion 恒 null（批一）、approvedExperienceVersions 恒 []（批一）', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: resolveAllOk,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.outcomeId).toBe('oc-1')
    expect(r.snapshot.contractVersion).toBe(1)
    expect(r.snapshot.teamVersion).toBeNull()
    expect(r.snapshot.decisionPolicyVersion).toBe(POLICY_VERSION)
    expect(r.snapshot.approvedExperienceVersions).toEqual([])
    expect(r.snapshot.excludedSources).toEqual([])
    expect(typeof r.snapshot.createdAt).toBe('number')
    expect(Number.isFinite(r.snapshot.createdAt)).toBe(true)
    expect(r.snapshot.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('content 物化结构：合同规范子集＋owner/verifier 身份行＋任务摘要＋策略块（含矩阵版本标识）', () => {
    const contract = makeContract('oc-1')
    const r = buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const c = r.snapshot.content as Record<string, unknown>
    // 合同规范子集（不含 actual/status 等运行态面）
    const cc = c.contract as Record<string, unknown>
    expect(cc.outcomeId).toBe('oc-1')
    expect(cc.title).toBe('发布事故率下降')
    expect(cc.valueStatement).toBe('降低发布流程引发的生产事故')
    expect(cc.measures).toEqual(contract.measures)
    expect(cc.acceptance).toEqual(contract.acceptance)
    expect(cc.scope).toEqual(contract.scope)
    expect(cc.riskTier).toBe('medium')
    expect(cc.defaultReversibility).toBe('reversible')
    expect(cc.status).toBeUndefined()
    // owner/verifier 身份行（id/name/active）
    expect(c.owner).toEqual({ id: 'p-1', name: '张三', active: true })
    expect(c.verifier).toEqual({ id: 'p-2', name: '李四', active: true })
    // 任务摘要（id/title/status）
    expect(c.task).toEqual({ id: 'task-oc-1', title: '根任务', status: 'in_progress' })
    // 策略块：decisionPolicyVersion＋矩阵版本标识
    expect(c.policy).toEqual({ decisionPolicyVersion: POLICY_VERSION, matrixVersion: DECISION_MATRIX_VERSION })
  })

  it('sha256 独立复算：sha256(canonicalJson(信封去 snapshotId/createdAt/sha256))', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: resolveAllOk,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.sha256).toBe(sha(canon(hashBodyOf(r.snapshot))))
  })

  it('sourceRefs 构成：contract(带 version/sha256)/task/people×2/decision-policy/decision-matrix/measure 每条', () => {
    const contract = makeContract('oc-1')
    const r = buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const refs = r.snapshot.sourceRefs
    const kinds = refs.map((x) => x.kind)
    expect(kinds.filter((k) => k === 'measure')).toHaveLength(1)
    expect(refs).toContainEqual({
      kind: 'contract',
      id: 'oc-1',
      version: '1',
      sha256: sha(canon(contract)),
    })
    expect(refs).toContainEqual({ kind: 'task', id: 'task-oc-1' })
    expect(refs).toContainEqual({ kind: 'people', id: 'p-1' })
    expect(refs).toContainEqual({ kind: 'people', id: 'p-2' })
    expect(refs).toContainEqual({ kind: 'decision-policy', id: POLICY_VERSION })
    expect(refs).toContainEqual({ kind: 'decision-matrix', id: DECISION_MATRIX_VERSION })
    expect(refs).toHaveLength(7) // 6 基础＋1 measure
  })
})

// ---------- 关键源失败 fail-closed ----------

describe('关键源失败→ok:false', () => {
  const expectFail = (r: BuildSnapshotResult, needle: string) => {
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.length).toBeGreaterThan(0)
    expect(r.problems.join('\n')).toContain(needle)
  }

  it('resolve.task 返回 ok:false → 拒绝（任务关键源）', () => {
    expectFail(
      buildMinimalSnapshot({
        contract: makeContract('oc-1'),
        decisionPolicyVersion: POLICY_VERSION,
        resolve: { task: () => ({ ok: false }), people: () => PEOPLE_OK },
      }),
      '任务',
    )
  })

  it('resolve.task 抛异常 → 拒绝且不抛（壳吞异常转 problems）', () => {
    expectFail(
      buildMinimalSnapshot({
        contract: makeContract('oc-1'),
        decisionPolicyVersion: POLICY_VERSION,
        resolve: {
          task: () => {
            throw new Error('board 服务不可达')
          },
          people: () => PEOPLE_OK,
        },
      }),
      '任务',
    )
  })

  it('resolve.people 返回 ok:false → 拒绝（身份关键源，spec §4.4 禁止派单）', () => {
    expectFail(
      buildMinimalSnapshot({
        contract: makeContract('oc-1'),
        decisionPolicyVersion: POLICY_VERSION,
        resolve: { task: () => TASK_OK, people: () => ({ ok: false }) },
      }),
      '身份',
    )
  })

  it('resolve.people ok:true 但缺 people 数组 → 拒绝（fail-closed，不猜空册）', () => {
    expectFail(
      buildMinimalSnapshot({
        contract: makeContract('oc-1'),
        decisionPolicyVersion: POLICY_VERSION,
        resolve: { task: () => TASK_OK, people: () => ({ ok: true }) },
      }),
      '身份',
    )
  })

  it('contract 非对象 → 拒绝（合同关键源）', () => {
    expectFail(
      buildMinimalSnapshot({
        contract: null as unknown as CreateContractInput,
        decisionPolicyVersion: POLICY_VERSION,
        resolve: resolveAllOk,
      }),
      '合同',
    )
  })

  it('decisionPolicyVersion 空 → 拒绝（政策关键源）', () => {
    expectFail(
      buildMinimalSnapshot({
        contract: makeContract('oc-1'),
        decisionPolicyVersion: '  ',
        resolve: resolveAllOk,
      }),
      '政策',
    )
  })
})

// ---------- people 部分缺席（非关键）→excludedSources ----------

describe('people 部分缺席（非关键）→excludedSources', () => {
  it('身份册只回 owner：ok:true，excludedSources 含 people 行，verifier 行不物化不溯源', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: {
        task: () => TASK_OK,
        people: () => ({ ok: true, people: [{ id: 'p-1', name: '张三', active: true }] }),
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.excludedSources).toEqual([
      { kind: 'people', reason: expect.stringContaining('p-2') },
    ])
    const c = r.snapshot.content as Record<string, unknown>
    expect(c.owner).toEqual({ id: 'p-1', name: '张三', active: true })
    expect(c.verifier).toBeUndefined()
    expect(r.snapshot.sourceRefs).toContainEqual({ kind: 'people', id: 'p-1' })
    expect(r.snapshot.sourceRefs).not.toContainEqual({ kind: 'people', id: 'p-2' })
  })
})

// ---------- 临界拒绝（不截断） ----------

describe('临界拒绝：canonical>1 MiB 或 sourceRefs>100 → ok:false 不截断', () => {
  it('content canonical 约 1.1 MiB → 拒绝，problems 注明实际字节数与上限', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1', { valueStatement: 'x'.repeat(1_100_000) }),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: resolveAllOk,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const msg = r.problems.join('\n')
    expect(msg).toContain('1 MiB')
    expect(msg).toMatch(/1\d{6}/) // 注明实际字节规模
    expect(r.snapshot).toBeUndefined()
  })

  it('101 个 sourceRefs（95 measures＋6 基础）→ 拒绝，problems 注明 101 超上限 100', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1', { measures: makeMeasures(95) }),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: resolveAllOk,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const msg = r.problems.join('\n')
    expect(msg).toContain('101')
    expect(msg).toContain('100')
    expect(r.snapshot).toBeUndefined()
  })

  it('恰好 100 个 sourceRefs（94 measures＋6 基础）→ 放行（边界含端）', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1', { measures: makeMeasures(94) }),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: resolveAllOk,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.sourceRefs).toHaveLength(100)
  })
})

// ---------- store 扩展：appendSnapshot / listSnapshots ----------

function buildOne(policyVersion = POLICY_VERSION): OutcomeContextSnapshot {
  const r = buildMinimalSnapshot({
    contract: makeContract('oc-s'),
    decisionPolicyVersion: policyVersion,
    resolve: resolveAllOk,
  })
  if (!r.ok) throw new Error(`快照构建失败：${r.problems.join('；')}`)
  return r.snapshot
}

describe('appendSnapshot / listSnapshots', () => {
  it('append 落 snapshots.jsonl 并并发 context_snapshot_created 事件（payload 带 snapshotId/sha256）', () => {
    expect(createContract(makeContract('oc-s'), 'p-1').ok).toBe(true)
    const snap = buildOne()
    const r = appendSnapshot(snap, 'p-1')
    expect(r.ok).toBe(true)
    expect(r.added).toBe(true)

    const file = join(dir, 'oc-s', 'snapshots.jsonl')
    expect(existsSync(file)).toBe(true)
    const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(rows).toHaveLength(1)
    expect(rows[0].snapshotId).toBe(snap.snapshotId)

    const events = listEvents('oc-s', 'context_snapshot_created')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({ snapshotId: snap.snapshotId, sha256: snap.sha256 })
  })

  it('同内容 sha256 重放 → added:false 返回原 snapshotId，不重复落账', () => {
    createContract(makeContract('oc-s'), 'p-1')
    const snap = buildOne()
    expect(appendSnapshot(snap, 'p-1').added).toBe(true)
    // 重放可以带不同 createdAt 的同语义快照（sha256 相同）
    const replay = { ...snap, createdAt: snap.createdAt + 5_000 }
    const r = appendSnapshot(replay, 'p-1')
    expect(r.ok).toBe(true)
    expect(r.added).toBe(false)
    expect(r.snapshot?.snapshotId).toBe(snap.snapshotId)
    expect(listSnapshots('oc-s')).toHaveLength(1)
    expect(listEvents('oc-s', 'context_snapshot_created')).toHaveLength(1)
  })

  it('不同内容（政策版本变更）→ 新 sha256 新条目，追加序可列', () => {
    createContract(makeContract('oc-s'), 'p-1')
    const s1 = buildOne('policy-a')
    const s2 = buildOne('policy-b')
    expect(s1.sha256).not.toBe(s2.sha256)
    expect(appendSnapshot(s1, 'p-1').added).toBe(true)
    expect(appendSnapshot(s2, 'p-1').added).toBe(true)
    const list = listSnapshots('oc-s')
    expect(list).toHaveLength(2)
    expect(list.map((x) => x.sha256)).toEqual([s1.sha256, s2.sha256])
  })

  it('合同不存在 → not_found；非法 outcomeId / 缺 actor → invalid_input', () => {
    const snap = buildOne()
    expect(appendSnapshot(snap, 'p-1')).toMatchObject({ ok: false, code: 'not_found' })

    createContract(makeContract('oc-s'), 'p-1')
    expect(appendSnapshot({ ...buildOne(), outcomeId: '../escape' }, 'p-1')).toMatchObject({
      ok: false,
      code: 'invalid_input',
    })
    expect(appendSnapshot(buildOne(), '')).toMatchObject({ ok: false, code: 'invalid_input' })
  })

  it('撕裂行自愈：坏行跳过（不抛），好行仍可读，后续追加不受影响', () => {
    createContract(makeContract('oc-s'), 'p-1')
    const s1 = buildOne()
    appendSnapshot(s1, 'p-1')
    // 模拟断电半行：往 snapshots.jsonl 尾部追加一段无换行的残片
    const file = join(dir, 'oc-s', 'snapshots.jsonl')
    writeFileSync(file, '{"snapshotId":"snap-torn","sha2', { flag: 'a' })

    expect(listSnapshots('oc-s')).toEqual([s1]) // 坏行跳过，好行原样返回

    const s2 = buildOne('policy-b')
    expect(appendSnapshot(s2, 'p-1').added).toBe(true)
    const list = listSnapshots('oc-s')
    expect(list).toHaveLength(2)
    expect(list[1].snapshotId).toBe(s2.snapshotId)
  })
})

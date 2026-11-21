// 派单最小上下文快照测试（Task 6；spec 2026-11-19-ai-native-operating-model-design.md §4.4）。
// 覆盖：同输入哈希稳定（批一幂等基石）、信封字段逐字（teamVersion:null / approvedExperienceVersions:[]）、
// content 物化结构（合同规范子集＋owner/verifier 身份行＋任务摘要＋策略块）、sha256 独立复算、
// 关键源失败 fail-closed（contract/task/people/policy）、people 部分缺席→excludedSources（非关键）、
// 临界拒绝不截断（canonical>1 MiB / sourceRefs>100，恰好边界放行）、
// store 扩展 appendSnapshot/listSnapshots（幂等按内容 sha256、context_snapshot_created 事件、撕裂行自愈）。
// 哈希复算用本文件独立的 canon/sha 实现（不复用被测模块导出），钉死
// 「sha256 = sha256(canonicalJson(信封去 snapshotId/createdAt/sha256))」格式——outcome-store.test.ts 同款纪律。
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DECISION_MATRIX_VERSION,
  buildMinimalSnapshot,
  sanitizeForSnapshot,
  type BuildSnapshotResult,
  type OutcomeContextSnapshot,
} from '../snapshot'
import {
  _useOutcomeStoreForTests,
  appendSnapshot,
  confirmTeam,
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

// 批四 T3：confirmTeam 挂 decision-recorder fire-and-forget 落账后，本文件未 mock
// recorder 的确认用例会在 venv 存在的机器上真起 python bridge 写宿主 KG——单测禁触
// 宿主状态，这里关闸（接线行为断言在 confirm-team-decision-recorder.test.ts 的 vi.mock 面）。
const prevDecisionGraph = process.env.HERMES_DECISION_GRAPH
process.env.HERMES_DECISION_GRAPH = '0'
afterAll(() => {
  if (prevDecisionGraph === undefined) delete process.env.HERMES_DECISION_GRAPH
  else process.env.HERMES_DECISION_GRAPH = prevDecisionGraph
})

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

// ---------- 关键身份行 fail-closed 与额外引用人 ----------

describe('关键身份行（owner/verifier）fail-closed；excludedSources 仅额外引用人', () => {
  it('people 返回 ok:true+[]（owner/verifier 均不可解析）→ ok:false，problems 注明缺席者', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: { task: () => TASK_OK, people: () => ({ ok: true, people: [] }) },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const msg = r.problems.join('\n')
    expect(msg).toContain('身份')
    expect(msg).toContain('p-1')
    expect(msg).toContain('p-2')
    expect(r.snapshot).toBeUndefined()
  })

  it('verifier 缺席（只回 owner）→ ok:false 注明 p-2；不进 excludedSources（关键源不降级）', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      resolve: {
        task: () => TASK_OK,
        people: () => ({ ok: true, people: [{ id: 'p-1', name: '张三', active: true }] }),
      },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.join('\n')).toContain('p-2')
    expect(r.snapshot).toBeUndefined()
  })

  it('owner/verifier 在、额外引用人 p-3 缺席 → ok:true 且 excludedSources 含该人', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      extraPersonIds: ['p-3'],
      resolve: { task: () => TASK_OK, people: () => PEOPLE_OK }, // 未回 p-3
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.excludedSources).toEqual([
      { kind: 'people', reason: expect.stringContaining('p-3') },
    ])
    const c = r.snapshot.content as Record<string, unknown>
    expect(c.owner).toEqual({ id: 'p-1', name: '张三', active: true })
    expect(c.verifier).toEqual({ id: 'p-2', name: '李四', active: true })
    expect(c.additionalPeople).toBeUndefined()
    expect(r.snapshot.sourceRefs).not.toContainEqual({ kind: 'people', id: 'p-3' })
  })

  it('额外引用人 p-3 命中 → 物化 additionalPeople＋people 溯源行，excludedSources 空', () => {
    const r = buildMinimalSnapshot({
      contract: makeContract('oc-1'),
      decisionPolicyVersion: POLICY_VERSION,
      extraPersonIds: ['p-3'],
      resolve: {
        task: () => TASK_OK,
        people: () => ({
          ok: true,
          people: [...PEOPLE_OK.people, { id: 'p-3', name: '王五', active: false }],
        }),
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.excludedSources).toEqual([])
    const c = r.snapshot.content as Record<string, unknown>
    expect(c.additionalPeople).toEqual([{ id: 'p-3', name: '王五', active: false }])
    expect(r.snapshot.sourceRefs).toContainEqual({ kind: 'people', id: 'p-3' })
  })
})

// ---------- 敏感脱敏（content 物化最后防线） ----------

describe('sanitizeForSnapshot：URL userinfo 脱敏（物化前最小真防线）', () => {
  const buildWithSourceRef = (sourceRef: string) => {
    const contract = makeContract('oc-1', {
      measures: [{ ...makeMeasures(1)[0], sourceRef }],
    })
    return buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
  }

  it('measure.sourceRef 含 https://u:tok@h/db → content 物化为 https://u:***@h/db，sha256 基于脱敏后内容', () => {
    const r = buildWithSourceRef('https://u:tok@h/db')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const measure = (r.snapshot.content.contract as { measures: Array<{ sourceRef: string }> }).measures[0]
    expect(measure.sourceRef).toBe('https://u:***@h/db')
    // 信封内 canonical 文本不含凭据原值；sha256 复算＝基于（已脱敏）信封体
    expect(canon(r.snapshot.content)).not.toContain(':tok@')
    expect(r.snapshot.sha256).toBe(sha(canon(hashBodyOf(r.snapshot))))
  })

  it('valueStatement/acceptance.statements/scope 项/measure.definition 同样脱敏', () => {
    const contract = {
      ...makeContract('oc-1'),
      valueStatement: '对接 https://a:b@c/x 网关后降低事故',
      acceptance: { statements: ['以 https://s:pw@t/audit 报告为准'], requiredEvidenceKinds: [] },
      scope: { included: ['https://in:sec@scope/1'], excluded: [] },
    }
    contract.measures = [{ ...makeMeasures(1)[0], definition: '取自 https://d:k@sink/metrics' }]
    const r = buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const c = r.snapshot.content.contract as Record<string, unknown>
    expect(c.valueStatement).toBe('对接 https://a:***@c/x 网关后降低事故')
    expect((c.acceptance as { statements: string[] }).statements).toEqual(['以 https://s:***@t/audit 报告为准'])
    expect((c.scope as { included: string[] }).included).toEqual(['https://in:***@scope/1'])
    expect(((c.measures as Array<{ definition: string }>)[0]).definition).toBe('取自 https://d:***@sink/metrics')
  })

  it('纯函数面：无密码 user@ 保留；非 URL 文本不动；多 URL 全脱；重复应用幂等', () => {
    expect(sanitizeForSnapshot('https://u@h/db')).toBe('https://u@h/db')
    expect(sanitizeForSnapshot('密码是 u:pw 但无 URL')).toBe('密码是 u:pw 但无 URL')
    expect(sanitizeForSnapshot('a https://x:1@h/1 b https://y:2@h/2')).toBe('a https://x:***@h/1 b https://y:***@h/2')
    expect(sanitizeForSnapshot(sanitizeForSnapshot('https://u:tok@h/db'))).toBe('https://u:***@h/db')
    // 非法 scheme（数字开头）不是 URL 凭据形态，保守不动
    expect(sanitizeForSnapshot('1x://u:p@h')).toBe('1x://u:p@h')
  })

  it('空 user＋有密码（:secret@ 形态，sourceRef 最常见）→ 密码段照脱为 :***@', () => {
    expect(sanitizeForSnapshot('redis://:secret@cache.internal:6379/0')).toBe('redis://:***@cache.internal:6379/0')
    expect(sanitizeForSnapshot('postgresql://:pw@db:5432/prod')).toBe('postgresql://:***@db:5432/prod')
    // 幂等：:***@ 再脱不变
    expect(sanitizeForSnapshot(sanitizeForSnapshot('redis://:secret@cache.internal:6379/0'))).toBe('redis://:***@cache.internal:6379/0')
  })

  it('脱敏面脏输入（valueStatement/measures[].definition/measures[].sourceRef 非字符串）→ ok:false 不抛', () => {
    const dirty = [
      ['valueStatement', { ...makeContract('oc-1'), valueStatement: 123 as unknown as string }],
      ['definition', { ...makeContract('oc-1'), measures: [{ ...makeMeasures(1)[0], definition: {} as unknown as string }] }],
      ['sourceRef', { ...makeContract('oc-1'), measures: [{ ...makeMeasures(1)[0], sourceRef: null as unknown as string }] }],
    ] as const
    for (const [needle, contract] of dirty) {
      const r = buildMinimalSnapshot({ contract, decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })
      expect(r.ok, needle).toBe(false)
      if (r.ok) return
      expect(r.problems.join('\n'), needle).toContain(needle)
    }
  })

  it('长无匹配文本线性完成（防正则回溯退化：1.1M 字符须秒级，O(n²) 会撞 vitest 默认 5s 超时）', () => {
    const big = 'x'.repeat(1_100_000)
    expect(sanitizeForSnapshot(big)).toBe(big)
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

// ---- 批二 Task 5：全量快照（buildFullSnapshot） ----

import { buildFullSnapshot, DEFAULT_DECISION_POLICY_VERSION, type BuildFullSnapshotInput } from '../snapshot'

function fullInput(overrides: Partial<BuildFullSnapshotInput['resolve']> = {}): BuildFullSnapshotInput {
  return {
    contract: makeContract('oc-full') as unknown as BuildFullSnapshotInput['contract'],
    decisionPolicyVersion: DEFAULT_DECISION_POLICY_VERSION,
    resolve: {
      task: () => ({ ok: true, task: { id: 'root-1', title: 'T', status: 'ready' } }),
      people: () => ({ ok: true, people: [
        { id: 'p-1', name: 'A', active: true }, { id: 'p-2', name: 'B', active: true }] }),
      ...overrides,
    },
  }
}

describe('buildFullSnapshot（批二 §四）', () => {
  it('四块成功：content 四区块物化、经验指纹进 approvedExperienceVersions、sourceRefs 带面级与逐条经验 ref', async () => {
    const r = await buildFullSnapshot(fullInput({
      panorama: () => ({ ok: true, faces: [{ face: 'evidence', count: 3, note: 'latest=pass' }] }),
      decisions: async () => ({ ok: true, decisions: [{ id: 'd1', category: 'dispatch', outcome: 'approved', at: 123 }] }),
      premises: () => ({ ok: true, premises: [{ id: 'pr-1', statement: '前提陈述' }] }),
      experiences: () => ({ ok: true, experiences: [{ id: 'exp-1', statement: '经验句 http://u:pw@h/x', updatedAt: '2026-11-20T00:00:00Z' }] }),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const s = r.snapshot
    expect((s.content.panoramaFaces as Array<{ face: string }>)[0].face).toBe('evidence')
    expect((s.content.recentDecisions as Array<{ id: string }>)[0].id).toBe('d1')
    expect((s.content.activePremises as Array<{ statement: string }>)[0].statement).toBe('前提陈述')
    // 经验陈述过脱敏防线；指纹=id@updatedAt
    expect((s.content.experiences as Array<{ statement: string }>)[0].statement).toContain('u:***@h')
    expect(s.approvedExperienceVersions).toEqual(['exp-1@2026-11-20T00:00:00Z'])
    expect(s.sourceRefs.find((x) => x.kind === 'experience' && x.id === 'exp-1')?.version).toBe('2026-11-20T00:00:00Z')
    expect(s.sourceRefs.some((x) => x.kind === 'panorama')).toBe(true)
    expect(s.sha256).toBe(shaOf(s))
  })

  it('非关键源失败/抛异常/形状不符/未接入 → excludedSources 四路如实、快照仍生成', async () => {
    const r = await buildFullSnapshot(fullInput({
      panorama: () => { throw new Error('boom') },
      decisions: () => ({ ok: false }),
      premises: () => ({ ok: true, premises: [{ id: 'pr-1', statement: 123 } as unknown as { id: string; statement: string }] }),
      // experiences 未提供
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const excl = r.snapshot.excludedSources.map((e) => e.kind)
    expect(excl).toContain('panorama')
    expect(excl).toContain('decisions')
    expect(excl).toContain('premises')
    expect(excl).toContain('experiences')
    expect(r.snapshot.approvedExperienceVersions).toEqual([])
    expect(r.snapshot.content.experiences).toBeUndefined()
  })

  it('未 approved 缺席双面：经验块空数组→无 experiences content、指纹空（候选永不出现在快照）', async () => {
    const r = await buildFullSnapshot(fullInput({
      experiences: () => ({ ok: true, experiences: [] }),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.content.experiences).toBeUndefined()
    expect(r.snapshot.approvedExperienceVersions).toEqual([])
  })

  it('关键源失败原样上抛（全量面不放宽最小面语义）', async () => {
    const r = await buildFullSnapshot({
      ...fullInput(),
      resolve: {
        ...fullInput().resolve,
        task: () => ({ ok: false }),
      },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.join()).toContain('任务关键源失败')
  })
})

// ---- 批三 T2：teamVersion 实值（spec 2026-11-21 批三 §一：active 团队版本冻结进快照） ----

describe('批三 T2：teamVersion 实值（active 团队版本冻结进快照哈希体）', () => {
  const teamInput = (expectedVersion: number, patch: Record<string, unknown> = {}) => ({
    expectedVersion,
    members: [
      { subjectKind: 'person', subjectId: 'p-1', role: 'accountable', responsibility: '对结果负责' },
      { subjectKind: 'person', subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' },
    ],
    status: 'active',
    changeReason: '初始成队',
    ...patch,
  } as import('../outcome-store').ConfirmTeamInput)

  const build = (oc: string) =>
    buildMinimalSnapshot({ contract: makeContract(oc), decisionPolicyVersion: POLICY_VERSION, resolve: resolveAllOk })

  it('active 团队 → teamVersion=版本实值且进哈希体（独立复算含 teamVersion）', () => {
    createContract(makeContract('oc-t1'), 'p-1')
    expect(confirmTeam('oc-t1', teamInput(0), 'p-1').ok).toBe(true)
    const r = build('oc-t1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.teamVersion).toBe(1)
    // 独立复算（哈希体含 teamVersion 字段：信封去易变字段后 canonical）
    expect(r.snapshot.sha256).toBe(sha(canon(hashBodyOf(r.snapshot))))
  })

  it('无团队 → null；draft 团队不算已确认团队 → 仍 null 且不记排除（无 active 团队是事实，非源失败）', () => {
    createContract(makeContract('oc-t2'), 'p-1')
    const none = build('oc-t2')
    expect(none.ok).toBe(true)
    if (!none.ok) return
    expect(none.snapshot.teamVersion).toBeNull()
    expect(confirmTeam('oc-t2', teamInput(0, { status: 'draft', changeReason: '候选提案' }), 'p-1').ok).toBe(true)
    const drafted = build('oc-t2')
    expect(drafted.ok).toBe(true)
    if (!drafted.ok) return
    expect(drafted.snapshot.teamVersion).toBeNull()
    expect(drafted.snapshot.excludedSources).toEqual([])
  })

  it('团队读失败（team.json 损坏）→ 非关键源降级：teamVersion null＋excludedSources 留痕，快照仍生成', () => {
    createContract(makeContract('oc-t3'), 'p-1')
    writeFileSync(join(dir, 'oc-t3', 'team.json'), '{broken json')
    const r = build('oc-t3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.teamVersion).toBeNull()
    expect(r.snapshot.excludedSources).toHaveLength(1)
    expect(r.snapshot.excludedSources[0]).toMatchObject({ kind: 'team' })
    expect(r.snapshot.excludedSources[0].reason).toContain('读失败')
  })

  it('版本变化 → 快照 hash 变化（同 content 仅 teamVersion 不同即不同快照；appendSnapshot 放行实值）', () => {
    createContract(makeContract('oc-t4'), 'p-1')
    confirmTeam('oc-t4', teamInput(0), 'p-1')
    const v1 = build('oc-t4')
    confirmTeam('oc-t4', teamInput(1, { changeReason: '调整成员职责' }), 'p-1')
    const v2 = build('oc-t4')
    expect(v1.ok && v2.ok).toBe(true)
    if (!v1.ok || !v2.ok) return
    expect(v1.snapshot.teamVersion).toBe(1)
    expect(v2.snapshot.teamVersion).toBe(2)
    expect(v2.snapshot.sha256).not.toBe(v1.snapshot.sha256)
    expect(v2.snapshot.snapshotId).not.toBe(v1.snapshot.snapshotId)
    // store 层 appendSnapshot 同步放行实值 teamVersion（落账不拒）
    expect(appendSnapshot(v2.snapshot, 'p-1').added).toBe(true)
  })
})

/** 复算信封哈希（与核心同式：去 snapshotId/createdAt/sha256 后 canonical）。 */
function shaOf(s: { outcomeId: string; contractVersion: number; teamVersion: number | null; decisionPolicyVersion: string; content: Record<string, unknown>; sourceRefs: unknown[]; approvedExperienceVersions: string[]; excludedSources: unknown[] }): string {
  const crypto = require('node:crypto') as typeof import('node:crypto')
  const body = {
    outcomeId: s.outcomeId, contractVersion: s.contractVersion, teamVersion: s.teamVersion,
    decisionPolicyVersion: s.decisionPolicyVersion, content: s.content, sourceRefs: s.sourceRefs,
    approvedExperienceVersions: s.approvedExperienceVersions, excludedSources: s.excludedSources,
  }
  const canonical = (v: unknown): unknown => v === null || typeof v !== 'object' ? v
    : Array.isArray(v) ? v.map(canonical)
    : Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
  return crypto.createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')
}

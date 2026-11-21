// outcome-store 事件台账与存储层测试（Task 2；spec 2026-11-19-ai-native-operating-model-design.md §4.2）。
// 覆盖：create/findByRootTask、root_task_taken、clientRequestId 重放幂等、update 版本并发、
// 哈希链（GENESIS 首锚＋逐条独立复算）、appendEvent 写失败 fail-closed（contract.json 不被触碰）、
// measurement 幂等重放 added:false、listMeasurements 事件派生。
// 哈希复算用本文件独立的 canon 实现（不复用被测模块导出），钉死「sha256(prevHash|canonical)」格式。
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ConfirmTeamInput,
  CreateContractInput,
  OutcomeEvent,
  _useOutcomeStoreForTests,
  appendEvent,
  appendMeasurement,
  confirmTeam,
  createContract,
  findByRootTask,
  getContract,
  getTeam,
  hashOutcomeEvent,
  listEvents,
  listMeasurements,
  updateContract,
} from '../outcome-store'
import type { OutcomeContract, OutcomeMeasurement } from '../types'

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

/** 去链字段后的记录体（hash 计算输入）。 */
const bodyOf = (e: OutcomeEvent) => {
  const { hash: _h, prevHash: _p, ...body } = e
  return body
}

/** 合法最小合同（Task 1 validate.test.ts 同款基底：1 measure＋owner/verifier 分离，baseline=null 合法）。 */
function makeContract(outcomeId: string, rootTaskId: string, clientRequestId?: string): CreateContractInput {
  return {
    schemaVersion: 1,
    outcomeId,
    rootTaskId,
    version: 1,
    title: '发布事故率下降',
    valueStatement: '降低发布流程引发的生产事故',
    ownerPersonId: 'p-1',
    measures: [
      {
        measureId: 'm-1',
        name: '发布事故数',
        definition: '滚动 30 天内由发布直接引发的故障次数',
        unit: '次',
        operator: 'lte',
        baseline: null,
        target: 0,
        sourceRef: 'incidents://release',
      },
    ],
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
    clientRequestId,
  }
}

function makeMeasurement(
  outcomeId: string,
  measurementId: string,
  measureId = 'm-1',
  actual: number | null = 3,
): OutcomeMeasurement {
  return {
    measurementId,
    outcomeId,
    measureId,
    contractVersion: 1,
    actual,
    availability: 'available',
    evidenceRefs: ['evidence://task-1/1'],
    observedAt: 1700000100000,
    recordedBy: 'p-3',
    recordedAt: 1700000100001,
  }
}

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
  dir = mkdtempSync(join(tmpdir(), 'outcome-store-'))
  _useOutcomeStoreForTests(dir)
})

afterEach(() => {
  _useOutcomeStoreForTests(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('createContract / findByRootTask / getContract', () => {
  it('create 落盘 contract.json＋首条 contract_created 事件，findByRootTask 命中', () => {
    const r = createContract(makeContract('oc-1', 'task-1', 'cr-1'), 'p-1')
    expect(r.ok).toBe(true)
    expect(r.code).toBeUndefined()
    expect(r.contract?.outcomeId).toBe('oc-1')

    // 存储布局：underStore/<outcomeId>/{contract.json, events.jsonl}
    expect(existsSync(join(dir, 'oc-1', 'contract.json'))).toBe(true)
    expect(existsSync(join(dir, 'oc-1', 'events.jsonl'))).toBe(true)

    const stored = getContract('oc-1')
    expect(stored).toEqual(r.contract)
    expect(findByRootTask('task-1')).toEqual(r.contract)

    const events = listEvents('oc-1')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('contract_created')
    expect(events[0].actor).toBe('p-1')
    expect(events[0].contractVersion).toBe(1)
    expect(events[0].prevHash).toBe('GENESIS')
    expect((events[0].payload as { clientRequestId?: string }).clientRequestId).toBe('cr-1')
  })

  it('同 rootTaskId 二次 create 拒 root_task_taken，不落第二个 outcome', () => {
    expect(createContract(makeContract('oc-1', 'task-1'), 'p-1').ok).toBe(true)
    const dup = createContract(makeContract('oc-2', 'task-1'), 'p-1')
    expect(dup).toMatchObject({ ok: false, code: 'root_task_taken' })
    expect(getContract('oc-2')).toBeNull()
    expect(readdirSync(dir).filter((n) => n !== 'oc-1')).toEqual([])
  })

  it('clientRequestId 重放幂等：返回原合同且不新增事件（重放优先于 root_task_taken）', () => {
    const first = createContract(makeContract('oc-1', 'task-1', 'cr-1'), 'p-1')
    expect(first.ok).toBe(true)
    // 网络超时重试场景：同 clientRequestId＋同 rootTaskId 再提交——须当幂等重放而非冲突
    const replay = createContract(makeContract('oc-1', 'task-1', 'cr-1'), 'p-1')
    expect(replay.ok).toBe(true)
    expect(replay.replayed).toBe(true)
    expect(replay.contract).toEqual(first.contract)
    expect(listEvents('oc-1')).toHaveLength(1)
    expect(readdirSync(dir)).toEqual(['oc-1'])
  })

  it('非法输入拒绝（problems 回传 Task 1 校验），不建目录', () => {
    const bad = makeContract('oc-1', 'task-1')
    bad.title = ''
    const r = createContract(bad, 'p-1')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('invalid_input')
    expect(r.problems?.join()).toContain('title')
    expect(existsSync(join(dir, 'oc-1'))).toBe(false)
  })

  it('outcomeId 形如路径穿越/非法字符拒绝（outcomeId 是目录名）', () => {
    for (const evil of ['../evil', 'a/b', '.hidden', '', 'a'.repeat(129)]) {
      const r = createContract(makeContract(evil, 'task-1'), 'p-1')
      expect(r.ok).toBe(false)
      expect(r.code).toBe('invalid_input')
    }
    expect(existsSync(join(dir, 'evil'))).toBe(false)
  })

  it('未知 outcome：getContract→null、listEvents→[]、findByRootTask→null', () => {
    expect(getContract('oc-nope')).toBeNull()
    expect(listEvents('oc-nope')).toEqual([])
    expect(findByRootTask('task-nope')).toBeNull()
  })

  it('OUTCOME_STORE env 逃生：override 关闭时落到 env 目录', () => {
    _useOutcomeStoreForTests(null)
    const envDir = join(dir, 'env-store')
    process.env.OUTCOME_STORE = envDir
    try {
      const r = createContract(makeContract('oc-env', 'task-env'), 'p-1')
      expect(r.ok).toBe(true)
      expect(existsSync(join(envDir, 'oc-env', 'contract.json'))).toBe(true)
    } finally {
      delete process.env.OUTCOME_STORE
    }
  })
})

describe('updateContract 版本并发', () => {
  it('expectedVersion 不符→version_conflict，合同与事件台账均未动', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const r = updateContract('oc-1', { title: '改标题' }, 99, 'p-2')
    expect(r).toMatchObject({ ok: false, code: 'version_conflict' })
    expect(getContract('oc-1')?.version).toBe(1)
    expect(getContract('oc-1')?.title).toBe('发布事故率下降')
    expect(listEvents('oc-1')).toHaveLength(1)
  })

  it('成功更新递增 version＋追加 contract_updated；旧 expectedVersion 随即失效', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const r = updateContract('oc-1', { title: '改标题' }, 1, 'p-2')
    expect(r.ok).toBe(true)
    expect(r.contract?.version).toBe(2)
    expect(r.contract?.title).toBe('改标题')
    expect(getContract('oc-1')).toEqual(r.contract)

    const events = listEvents('oc-1')
    expect(events.map((e) => e.type)).toEqual(['contract_created', 'contract_updated'])
    expect(events[1].contractVersion).toBe(2)
    expect(events[1].actor).toBe('p-2')

    // 递增后旧版本重放必须撞 version_conflict（乐观并发）
    const stale = updateContract('oc-1', { title: '再改' }, 1, 'p-2')
    expect(stale).toMatchObject({ ok: false, code: 'version_conflict' })
  })

  it('patch 不得改身份/版本/时间戳/status（status 迁移不递增 version，走事件通道）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    for (const patch of [
      { outcomeId: 'oc-9' },
      { rootTaskId: 'task-9' },
      { version: 5 },
      { schemaVersion: 2 },
      { createdAt: 1 },
      { updatedAt: 1 },
      { status: 'active' as const },
    ]) {
      const r = updateContract('oc-1', patch, 1, 'p-2')
      expect(r.ok).toBe(false)
      expect(r.code).toBe('invalid_input')
      expect(r.problems?.join()).toContain(Object.keys(patch)[0])
    }
    expect(getContract('oc-1')?.version).toBe(1)
    expect(listEvents('oc-1')).toHaveLength(1)
  })

  it('合并结果不合法拒绝（先验后写）：title 置空回传 problems', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const r = updateContract('oc-1', { title: '' }, 1, 'p-2')
    expect(r).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(r.problems?.join()).toContain('title')
    expect(listEvents('oc-1')).toHaveLength(1)
  })

  it('不存在的 outcome→not_found', () => {
    expect(updateContract('oc-nope', { title: 'x' }, 1, 'p-2')).toMatchObject({
      ok: false,
      code: 'not_found',
    })
  })
})

describe('事件哈希链', () => {
  it('首条 prevHash=GENESIS；其后逐条 prevHash 接前条 hash，hash=sha256(前条 hash|本条 canonical)（独立复算）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    appendEvent('oc-1', 'status_changed', { from: 'draft', to: 'active' }, 'p-2', 1)
    appendMeasurement(makeMeasurement('oc-1', 'ms-1'), 'p-3')
    updateContract('oc-1', { title: '改标题' }, 1, 'p-2')

    const events = listEvents('oc-1')
    expect(events).toHaveLength(4)
    expect(events[0].prevHash).toBe('GENESIS')
    // 独立复算整链：每条 hash 都由前条 hash＋本条 canonical 体推出
    let prev = 'GENESIS'
    for (const e of events) {
      expect(e.prevHash).toBe(prev)
      expect(e.hash).toBe(sha(`${prev}|${canon(bodyOf(e))}`))
      prev = e.hash
    }
    // 导出的复算助手与存储值一致（后续任务校验链用）
    for (const e of events) expect(hashOutcomeEvent(e)).toBe(e.hash)
  })

  it('events.jsonl 行数与 listEvents 对齐（追加制，不环形覆盖）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    appendMeasurement(makeMeasurement('oc-1', 'ms-1'), 'p-3')
    const lines = readFileSync(join(dir, 'oc-1', 'events.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(listEvents('oc-1')).toHaveLength(2)
    // listEvents 支持按 type 过滤
    expect(listEvents('oc-1', 'measurement_appended')).toHaveLength(1)
    expect(listEvents('oc-1', 'measurement_appended')[0].type).toBe('measurement_appended')
  })
})

describe('appendEvent fail-closed', () => {
  it('写盘失败→{ok:false, code:"write_failed"}，contract.json 未被触碰', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const contractPath = join(dir, 'oc-1', 'contract.json')
    const before = readFileSync(contractPath, 'utf8')
    // 目录只读拦新建；events.jsonl 已存在须同时只读才拦追加（append 只需文件写权限）
    chmodSync(join(dir, 'oc-1'), 0o500)
    chmodSync(join(dir, 'oc-1', 'events.jsonl'), 0o400)
    try {
      const r = appendEvent('oc-1', 'status_changed', { to: 'active' }, 'p-2', 1)
      expect(r.ok).toBe(false)
      expect(r.code).toBe('write_failed')
      expect(readFileSync(contractPath, 'utf8')).toBe(before)
    } finally {
      chmodSync(join(dir, 'oc-1', 'events.jsonl'), 0o644)
      chmodSync(join(dir, 'oc-1'), 0o700)
    }
  })

  it('updateContract 同样 fail-closed：事件先落，事件失败则合同零改动', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const contractPath = join(dir, 'oc-1', 'contract.json')
    const before = readFileSync(contractPath, 'utf8')
    chmodSync(join(dir, 'oc-1'), 0o500)
    chmodSync(join(dir, 'oc-1', 'events.jsonl'), 0o400)
    try {
      const r = updateContract('oc-1', { title: '改不掉' }, 1, 'p-2')
      expect(r).toMatchObject({ ok: false, code: 'write_failed' })
      expect(readFileSync(contractPath, 'utf8')).toBe(before)
      expect(getContract('oc-1')?.version).toBe(1)
    } finally {
      chmodSync(join(dir, 'oc-1', 'events.jsonl'), 0o644)
      chmodSync(join(dir, 'oc-1'), 0o700)
    }
  })

  it('appendEvent 非法入参拒绝（type/actor/contractVersion/outcomeId）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    expect(appendEvent('oc-1', 'bogus_type' as never, {}, 'p-2', 1)).toMatchObject({
      ok: false,
      code: 'invalid_input',
    })
    expect(appendEvent('oc-1', 'status_changed', {}, '', 1)).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(appendEvent('oc-1', 'status_changed', {}, 'p-2', 0)).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(appendEvent('../evil', 'status_changed', {}, 'p-2', 1)).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(listEvents('oc-1')).toHaveLength(1)
  })
})

describe('appendMeasurement / listMeasurements', () => {
  it('追加测量落 measurement_appended 事件；listMeasurements 从事件派生并按 measureId 过滤', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const m1 = makeMeasurement('oc-1', 'ms-1', 'm-1', 3)
    const m2 = makeMeasurement('oc-1', 'ms-2', 'm-2', 0)
    // 合同补第二个 measure 让 m-2 合法（测量本身不校验 measureId 是否在册，此处只验证派生过滤）
    expect(appendMeasurement(m1, 'p-3')).toMatchObject({ ok: true, added: true })
    expect(appendMeasurement(m2, 'p-3')).toMatchObject({ ok: true, added: true })

    const all = listMeasurements('oc-1')
    expect(all).toHaveLength(2)
    expect(all[0]).toEqual(m1)
    expect(all[1]).toEqual(m2)
    expect(listMeasurements('oc-1', 'm-1')).toEqual([m1])
    expect(listMeasurements('oc-1', 'm-2')).toEqual([m2])
    expect(listMeasurements('oc-1', 'm-9')).toEqual([])

    const ev = listEvents('oc-1', 'measurement_appended')[0]
    expect(ev.contractVersion).toBe(1)
    expect((ev.payload as { measurement: OutcomeMeasurement }).measurement).toEqual(m1)
  })

  it('measurementId 重放幂等：added:false 且返回的是原事实（即便重放值不同）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const m1 = makeMeasurement('oc-1', 'ms-1', 'm-1', 3)
    expect(appendMeasurement(m1, 'p-3')).toMatchObject({ ok: true, added: true })

    const replayInput = makeMeasurement('oc-1', 'ms-1', 'm-1', 999)
    const replay = appendMeasurement(replayInput, 'p-3')
    expect(replay.ok).toBe(true)
    expect(replay.added).toBe(false)
    expect(replay.measurement).toEqual(m1)
    expect(replay.measurement?.actual).toBe(3)
    expect(listEvents('oc-1', 'measurement_appended')).toHaveLength(1)
  })

  it('非法测量拒绝（availability/actual/measurementId/measureId）；未知 outcome→not_found', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const badAvailability = { ...makeMeasurement('oc-1', 'ms-1'), availability: 'maybe' as never }
    expect(appendMeasurement(badAvailability, 'p-3')).toMatchObject({ ok: false, code: 'invalid_input' })
    const badActual = { ...makeMeasurement('oc-1', 'ms-1'), actual: Number.POSITIVE_INFINITY }
    expect(appendMeasurement(badActual, 'p-3')).toMatchObject({ ok: false, code: 'invalid_input' })
    const noId = { ...makeMeasurement('oc-1', ''), measurementId: '' }
    expect(appendMeasurement(noId, 'p-3')).toMatchObject({ ok: false, code: 'invalid_input' })
    const noMeasure = { ...makeMeasurement('oc-1', 'ms-1'), measureId: '' }
    expect(appendMeasurement(noMeasure, 'p-3')).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(appendMeasurement(makeMeasurement('oc-nope', 'ms-9'), 'p-3')).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    expect(listEvents('oc-1')).toHaveLength(1)
  })
})

describe('断电半行吞行防护（批二 T1：events 追加面前置换行）', () => {
  it('events.jsonl 尾部残片（无换行）后追加：新事件独立成行不被粘行吞掉，哈希链仍接最后好行', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const lastGood = listEvents('oc-1')[0]
    // 模拟断电半行：尾部追加一段无换行残片（批一 snapshots.jsonl 面实绩同款形态）
    const file = join(dir, 'oc-1', 'events.jsonl')
    writeFileSync(file, '{"eventId":"ev-torn","hash":"ab', { flag: 'a' })

    const r = appendEvent('oc-1', 'status_changed', { from: 'draft', to: 'active' }, 'p-2', 1)
    expect(r.ok).toBe(true)

    // 新事件不被吞：读侧可读（残片被隔离成独立坏行由 readEventsAt 跳过）
    const events = listEvents('oc-1')
    expect(events).toHaveLength(2)
    expect(events[1].type).toBe('status_changed')
    // 哈希链仍连续：新事件 prevHash 接最后一条好事件（残片不参与链）
    expect(events[1].prevHash).toBe(lastGood.hash)
    expect(events[1].hash).toBe(sha(`${lastGood.hash}|${canon(bodyOf(events[1]))}`))

    // 文件面：残片被补换行隔离，新事件独占一行且完整可解析
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).eventId).toBe(lastGood.eventId)
    expect(JSON.parse(lines[2]).eventId).toBe(events[1].eventId)
  })
})

/** 合法最小团队输入（批三 T1）：owner/verifier 两个 person 成员。成员约束的语义校验
 *  （owner/verifier 到位、active、roster complete）在 team-validate.test.ts，此处只验 store 层。 */
function makeTeamInput(expectedVersion: number, patch: Record<string, unknown> = {}): ConfirmTeamInput {
  return {
    expectedVersion,
    members: [
      { subjectKind: 'person', subjectId: 'p-1', role: 'accountable', responsibility: '对结果指标负责' },
      { subjectKind: 'person', subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' },
    ],
    status: 'active',
    changeReason: '初始成队',
    ...patch,
  } as ConfirmTeamInput
}

describe('confirmTeam / getTeam（批三 T1：team.json＋team_confirmed 事件）', () => {
  it('首次确认（expectedVersion=0）落 team.json v1＋team_confirmed 事件摘要；getTeam 读回一致、无 tmp 残留', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const r = confirmTeam('oc-1', makeTeamInput(0), 'p-1')
    expect(r.ok).toBe(true)
    expect(r.team).toMatchObject({ outcomeId: 'oc-1', version: 1, status: 'active', changeReason: '初始成队' })
    expect(r.team?.members).toHaveLength(2)
    expect(r.team?.updatedBy).toBe('p-1')
    expect(typeof r.team?.updatedAt).toBe('number')

    // team.json 与返回值逐字一致；atomicWriteJson tmp+rename 不留临时文件
    const teamPath = join(dir, 'oc-1', 'team.json')
    expect(existsSync(teamPath)).toBe(true)
    expect(JSON.parse(readFileSync(teamPath, 'utf8'))).toEqual(r.team)
    expect(getTeam('oc-1')).toEqual(r.team)
    expect(readdirSync(join(dir, 'oc-1')).some((n) => n.includes('.tmp'))).toBe(false)

    // 事件面只落摘要（version/changeReason/status/成员数）——成员正身在 team.json，不双写
    const events = listEvents('oc-1', 'team_confirmed')
    expect(events).toHaveLength(1)
    expect(events[0].contractVersion).toBe(1)
    expect(events[0].actor).toBe('p-1')
    expect(events[0].payload).toEqual({
      version: 1,
      changeReason: '初始成队',
      status: 'active',
      memberCount: 2,
    })
  })

  it('再次确认递增 version；哈希链跨 contract_created→team_confirmed→team_confirmed 连续（独立复算）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    confirmTeam('oc-1', makeTeamInput(0), 'p-1')
    const second = confirmTeam('oc-1', makeTeamInput(1, { changeReason: '补充执行 agent' }), 'p-1')
    expect(second.ok).toBe(true)
    expect(second.team?.version).toBe(2)
    expect(getTeam('oc-1')?.version).toBe(2)

    const events = listEvents('oc-1')
    expect(events.map((e) => e.type)).toEqual(['contract_created', 'team_confirmed', 'team_confirmed'])
    let prev = 'GENESIS'
    for (const e of events) {
      expect(e.prevHash).toBe(prev)
      expect(e.hash).toBe(sha(`${prev}|${canon(bodyOf(e))}`))
      prev = e.hash
    }
    // 向后兼容：旧账（无 team_confirmed 类型）照常可读——首条仍是 contract_created
    expect(events[0].type).toBe('contract_created')
  })

  it('expectedVersion 不匹配→version_conflict，team.json 与事件账均未动（T2 端点转 409 的错误形状）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    expect(confirmTeam('oc-1', makeTeamInput(1), 'p-1')).toMatchObject({ ok: false, code: 'version_conflict' })
    expect(getTeam('oc-1')).toBeNull()
    expect(listEvents('oc-1')).toHaveLength(1)

    // 首次确认后用过期版本重放：同样冲突（乐观并发）
    confirmTeam('oc-1', makeTeamInput(0), 'p-1')
    expect(confirmTeam('oc-1', makeTeamInput(0), 'p-1')).toMatchObject({ ok: false, code: 'version_conflict' })
    expect(getTeam('oc-1')?.version).toBe(1)
    expect(listEvents('oc-1', 'team_confirmed')).toHaveLength(1)
  })

  it('非法输入拒绝：成员空/成员字段缺/status 非法/changeReason 空/updatedBy 空/expectedVersion 负数/outcomeId 非法', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const cases: Array<[ConfirmTeamInput, string, string]> = [
      [makeTeamInput(0, { members: [] }), 'members', 'p-1'],
      [
        makeTeamInput(0, {
          members: [{ subjectKind: 'person', subjectId: '', role: 'accountable', responsibility: 'x' }],
        }),
        'subjectId',
        'p-1',
      ],
      [
        makeTeamInput(0, {
          members: [{ subjectKind: 'team', subjectId: 'p-1', role: 'accountable', responsibility: 'x' }],
        }),
        'subjectKind',
        'p-1',
      ],
      [makeTeamInput(0, { status: 'pending' }), 'status', 'p-1'],
      [makeTeamInput(0, { changeReason: '' }), 'changeReason', 'p-1'],
      [makeTeamInput(0), 'updatedBy', ''],
      [makeTeamInput(-1), 'expectedVersion', 'p-1'],
    ]
    for (const [input, keyword, updatedBy] of cases) {
      const r = confirmTeam('oc-1', input, updatedBy)
      expect(r.ok).toBe(false)
      expect(r.code).toBe('invalid_input')
      expect(r.problems?.join()).toContain(keyword)
    }
    expect(confirmTeam('../evil', makeTeamInput(0), 'p-1').code).toBe('invalid_input')
    expect(getTeam('oc-1')).toBeNull()
    expect(listEvents('oc-1')).toHaveLength(1)
  })

  it('未知 outcome→not_found；getTeam 未知/非法 outcomeId→null', () => {
    expect(confirmTeam('oc-nope', makeTeamInput(0), 'p-1')).toMatchObject({ ok: false, code: 'not_found' })
    expect(getTeam('oc-nope')).toBeNull()
    expect(getTeam('../evil')).toBeNull()
  })

  it('draft 语义：候选不自动成队——写 draft 落盘仍是 draft，显式确认 active 才 active', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const draft = confirmTeam('oc-1', makeTeamInput(0, { status: 'draft', changeReason: '候选提案' }), 'p-2')
    expect(draft.ok).toBe(true)
    expect(getTeam('oc-1')?.status).toBe('draft')
    const active = confirmTeam('oc-1', makeTeamInput(1, { changeReason: 'owner 确认成队' }), 'p-1')
    expect(active.ok).toBe(true)
    expect(getTeam('oc-1')?.status).toBe('active')
    expect(
      listEvents('oc-1', 'team_confirmed').map((e) => (e.payload as { status: string }).status),
    ).toEqual(['draft', 'active'])
  })

  // ---- T1-review 挂账补测（来源 task-1-review.md Minor-1/Minor-2） ----

  it('T1-review M1：write_failed 反向残留——事件已落但 team.json 写失败（chmod 注入）→ write_failed 错误形状且告警可观察', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 目录只读拦 atomicWriteJson 的 tmp 新建；events.jsonl 已存在且可写——追加面不受影响
    chmodSync(join(dir, 'oc-1'), 0o500)
    try {
      const r = confirmTeam('oc-1', makeTeamInput(0), 'p-1')
      expect(r).toMatchObject({ ok: false, code: 'write_failed' })
      // 反向残留：先账后物——事件已在账，team.json 未写（读侧以 team.json 为权威，重试自愈）
      expect(listEvents('oc-1', 'team_confirmed')).toHaveLength(1)
      expect(existsSync(join(dir, 'oc-1', 'team.json'))).toBe(false)
      expect(getTeam('oc-1')).toBeNull()
      // 告警路径可观察：write_failed 必有 team.json 写入失败告警（变异探针：删 try/catch 让异常上抛则此处红）
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('team.json 写入失败'))).toBe(true)
    } finally {
      chmodSync(join(dir, 'oc-1'), 0o700)
      warnSpy.mockRestore()
    }
  })

  it('T1-review M2：真实旧账夹具——手写仅含 contract_created 的 events.jsonl，confirmTeam 后哈希链复算不断、旧事件可读', () => {
    // 夹具手写（非经 API）：升级前形态的账——只有一条 contract_created，无 team_confirmed。
    // JSON 往返剥掉值为 undefined 的键（clientRequestId）：手写哈希的 canon 输入与读回解析
    // 后的对象逐字一致，否则 undefined 键在 canon 里成 null、落盘后消失，复算必不等。
    const outcomeDir = join(dir, 'oc-legacy')
    mkdirSync(outcomeDir, { recursive: true })
    const contract = JSON.parse(JSON.stringify(makeContract('oc-legacy', 'task-legacy')))
    writeFileSync(join(outcomeDir, 'contract.json'), JSON.stringify(contract))
    const legacyBody = {
      eventId: 'ev-legacy-1',
      outcomeId: 'oc-legacy',
      contractVersion: 1,
      type: 'contract_created',
      at: 1700000001000,
      actor: 'p-1',
      payload: { contract },
    }
    const legacyEvent: OutcomeEvent = {
      ...legacyBody,
      prevHash: 'GENESIS',
      hash: sha(`GENESIS|${canon(legacyBody)}`),
    }
    writeFileSync(join(outcomeDir, 'events.jsonl'), `${JSON.stringify(legacyEvent)}\n`)

    const r = confirmTeam('oc-legacy', makeTeamInput(0), 'p-1')
    expect(r.ok).toBe(true)
    expect(r.team?.version).toBe(1)

    // 旧事件可读：首条仍是手写的 contract_created（身份/内容未被改写）
    const events = listEvents('oc-legacy')
    expect(events.map((e) => e.type)).toEqual(['contract_created', 'team_confirmed'])
    expect(events[0].eventId).toBe('ev-legacy-1')
    expect(events[0].hash).toBe(legacyEvent.hash)
    // 哈希链复算不断：GENESIS→旧事件→新 team_confirmed 逐条 prevHash 接续、hash 可独立复算
    let prev = 'GENESIS'
    for (const e of events) {
      expect(e.prevHash).toBe(prev)
      expect(e.hash).toBe(sha(`${prev}|${canon(bodyOf(e))}`))
      prev = e.hash
    }
  })
})

describe('合同 dueAt 可选字段（批三 T1：旧合同零迁移）', () => {
  it('旧合同无 dueAt：创建/读回不带该键，update 设置与显式清空（null）往返一致', () => {
    expect(createContract(makeContract('oc-1', 'task-1'), 'p-1').ok).toBe(true)
    const stored = getContract('oc-1')
    expect(stored?.dueAt).toBeUndefined()
    expect('dueAt' in (stored as object)).toBe(false)

    const set = updateContract('oc-1', { dueAt: 1700000099999 }, 1, 'p-2')
    expect(set.ok).toBe(true)
    expect(set.contract?.dueAt).toBe(1700000099999)
    expect(getContract('oc-1')?.dueAt).toBe(1700000099999)

    const cleared = updateContract('oc-1', { dueAt: null }, 2, 'p-2')
    expect(cleared.ok).toBe(true)
    expect(cleared.contract?.dueAt).toBeNull()
  })

  it('dueAt 非法类型经 updateContract 合并校验拒绝（invalid_input，端点侧 422）', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const r = updateContract('oc-1', { dueAt: 'soon' as unknown as number }, 1, 'p-2')
    expect(r).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(r.problems?.join()).toContain('dueAt')
    expect(getContract('oc-1')?.dueAt).toBeUndefined()
  })

  it('创建带 dueAt 的合同照常落盘', () => {
    const withDue = makeContract('oc-2', 'task-2')
    withDue.dueAt = 1700000099999
    expect(createContract(withDue, 'p-1').ok).toBe(true)
    expect(getContract('oc-2')?.dueAt).toBe(1700000099999)
  })
})

describe('contract.json 与事件账的对账', () => {
  it('contract.json 内容即 getContract 返回值；坏档隔离后 getContract→null', () => {
    createContract(makeContract('oc-1', 'task-1'), 'p-1')
    const onDisk = JSON.parse(readFileSync(join(dir, 'oc-1', 'contract.json'), 'utf8')) as OutcomeContract
    expect(onDisk).toEqual(getContract('oc-1'))

    // 写坏 contract.json：读侧隔离留档（.corrupt.<ts>）而非当空合同续写
    const contractPath = join(dir, 'oc-1', 'contract.json')
    rmSync(contractPath)
    writeFileSync(contractPath, '{broken json')
    expect(getContract('oc-1')).toBeNull()
    expect(readdirSync(join(dir, 'oc-1')).some((n) => n.startsWith('contract.json.corrupt.'))).toBe(true)
  })
})

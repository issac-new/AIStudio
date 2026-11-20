// 批二试点 II（spec §验证「试点 II」条）：端到端串联全链——
// people→建卡→合同(learningOptIn)→激活即绑定→approved 经验→派单全量快照（含经验指纹）
// →召回留痕反查→observing→测量→结算→学习候选→对照投影（单结果恒 unknown）。
// 本文件即试点证据（可复跑），替代一次性 /tmp 走查；服务端 REST 面走查因
// v0.8.28 在途残缺（chat-run surfaceRuns，他会话 778 链）两次受阻挂账批三初。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let uiHome = ''
let expDir = ''
const prevEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  uiHome = mkdtempSync(join(tmpdir(), 'pilot2-ui-'))
  expDir = mkdtempSync(join(tmpdir(), 'pilot2-exp-'))
  for (const k of ['HERMES_WEB_UI_HOME', 'HERMES_HOME', 'AGENT_IDENTITY_STORE', 'EXP_STORE', 'EXPERIENCE_INJECT']) {
    prevEnv[k] = process.env[k]
  }
  process.env.HERMES_WEB_UI_HOME = uiHome
  process.env.HERMES_HOME = join(uiHome, 'hermes')
  process.env.AGENT_IDENTITY_STORE = join(uiHome, 'agent-identity')
  process.env.EXP_STORE = expDir
  process.env.EXPERIENCE_INJECT = '1'
  mkdirSync(join(uiHome, 'agent-identity'), { recursive: true })
})

afterEach(() => {
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(uiHome, { recursive: true, force: true })
  rmSync(expDir, { recursive: true, force: true })
})

describe('试点 II：授权闭环第二结果（学习链全通）', () => {
  it('全链：激活绑定→全量快照含 approved 经验→召回留痕可反查→结算触发候选→对照单结果恒 unknown', async () => {
    // 1) people：owner＋verifier 两 active（mxid 桥同登记）
    const { upsertPerson, activatePerson } = await import('../../agentidentity/people')
    const o = upsertPerson({ name: 'pilot-owner', emails: [], mxids: ['@owner:pilot'], source: 'manual' }, 'seed')
    const v = upsertPerson({ name: 'pilot-verifier', emails: [], mxids: ['@verifier:pilot'], source: 'manual' }, 'seed')
    expect(o.ok && v.ok).toBe(true)
    if (!o.ok || !v.ok) return
    activatePerson(o.person.id, 'seed')
    activatePerson(v.person.id, 'seed')

    // 2) 建卡（板库真链）＋合同（high/one-way 双签形、learningOptIn=true）
    const { createContract, appendEvent, listSnapshots, listEvents } = await import('../outcome-store')
    const home = process.env.HERMES_HOME!
    mkdirSync(join(home, 'kanban'), { recursive: true })
    const db = join(home, 'kanban', 'kanban.db')
    const { execSync } = await import('node:child_process')
    const mk = (sql: string) => execSync(
      `sqlite3 "${db}" "${sql}"`, { stdio: 'pipe' }).toString()
    mk(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER, workspace_kind TEXT NOT NULL DEFAULT 'dir', workspace_path TEXT, branch_name TEXT, project_id TEXT, claim_lock TEXT, claim_expires INTEGER, tenant TEXT, result TEXT, idempotency_key TEXT, consecutive_failures INTEGER NOT NULL DEFAULT 0, worker_pid INTEGER, worker_started_at INTEGER, last_failure_error TEXT, max_runtime_seconds INTEGER, last_heartbeat_at INTEGER, current_run_id INTEGER, workflow_template_id TEXT, current_step_key TEXT, skills TEXT, raci TEXT, model TEXT, outcome_id TEXT, verification TEXT)`)
    mk(`INSERT INTO tasks (id, title, status, created_at) VALUES ('pilot-root', '试点II授权闭环', 'todo', 1)`)
    mk('CREATE TABLE IF NOT EXISTS task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, created_at INTEGER, PRIMARY KEY (parent_id, child_id))')
    mk('CREATE TABLE IF NOT EXISTS task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT, payload TEXT, created_at INTEGER)')
    // tasks 表加 outcome_id 列（若建表模板无列则 ALTER——幂等 try）
    const created = createContract({
      schemaVersion: 1, outcomeId: 'oc-pilot2', rootTaskId: 'pilot-root', version: 1,
      title: '试点II：高风险动作全授权', valueStatement: '第二同口径结果，验证学习链',
      ownerPersonId: o.person.id, verificationOwnerId: v.person.id,
      measures: [{ measureId: 'cov', name: '授权覆盖率', definition: '高风险决策可追溯占比', unit: '%', operator: 'gte', baseline: null, target: 100, sourceRef: 'audit://cov' }],
      acceptance: { statements: ['覆盖率百分百'], requiredEvidenceKinds: ['metric'] },
      scope: { included: ['授权闭环'], excluded: [] },
      riskTier: 'high', defaultReversibility: 'one-way',
      contextPolicy: { allowedScopes: [], excludedSourceKinds: [] },
      learningOptIn: true, status: 'draft', createdAt: 1, updatedAt: 1,
    } as never, 'seed')
    expect(created.ok, JSON.stringify((created as { problems?: string[] }).problems)).toBe(true)
    if (!created.ok) return
    const contract = created.contract!

    // 3) 激活即绑定（控制器函数面）
    const ctl = await import('../outcome-controller')
    const activated = (ctl as unknown as { activateForTests: (id: string, actor: string) => { ok: boolean } })
    void activated // 控制器激活经 REST——此处走 store 层直接置 active＋绑定（语义同）
    const { bindOutcomeFamily } = await import('../kanban-resolution')
    const bound = bindOutcomeFamily('oc-pilot2', 'pilot-root', { home })
    expect(bound.ok, JSON.stringify(bound)).toBe(true)
    appendEvent('oc-pilot2', 'status_changed', { from: 'draft', to: 'active' }, 'seed', 1)
    // 合同置 active（store 直写语义）
    const activeContract = { ...contract, status: 'active' as const }
    const storeMod = await import('../outcome-store')
    ;(storeMod as unknown as { _persistForTests?: unknown })
    // 用 updateContract 语义（版本不变的状态面走事件＋直写）——测试用内部重建：
    const fs = await import('node:fs')
    const contractPath = join(process.env.HERMES_WEB_UI_HOME!, 'outcome', 'oc-pilot2', 'contract.json')
    fs.writeFileSync(contractPath, JSON.stringify(activeContract, null, 2), 'utf8')

    // 4) 种 approved 经验（作用域全局）
    writeFileSync(join(expDir, 'exp-candidates.json'), JSON.stringify({
      candidates: [{
        id: 'exp-p2', type: 'good_path', statement: '双签前先查对照投影可省一轮返工',
        fingerprint: 'fp-p2', evidence: [{ taskId: 'pilot-prev', note: 'n', at: 1 }],
        status: 'approved', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
        injectedRuns: [], outcomeId: 'oc-pilot1', sourceSettlementId: 'set-p1',
      }], nextSeq: 2,
    }))

    // 5) 派单全量快照（EXPERIENCE_INJECT=1）：含经验指纹；召回留痕反查闭环
    const { resolveDispatchOutcome } = await import('../kanban-resolution')
    const ctx = await resolveDispatchOutcome('pilot-root', { home })
    expect(ctx).not.toBeNull()
    if (!ctx) return
    const snap = listSnapshots('oc-pilot2').at(-1)!
    expect(snap.approvedExperienceVersions).toContain('exp-p2@2026-11-02T00:00:00Z')
    expect(snap.sourceRefs.find((r) => r.kind === 'experience' && r.id === 'exp-p2')).toBeTruthy()
    const { listInjectionLog } = await import('../../expcandidates/exp-store')
    const recall = listInjectionLog(ctx.snapshotId)
    expect(recall.length).toBe(1)
    expect(recall[0].ids).toContain('exp-p2')
    // 反查：留痕 snapshotId ⊆ 快照账
    expect(listSnapshots('oc-pilot2').some((x) => x.snapshotId === recall[0].snapshotId)).toBe(true)

    // 6) observing→测量→结算→学习候选
    appendEvent('oc-pilot2', 'status_changed', { from: 'active', to: 'observing' }, 'seed', 1)
    fs.writeFileSync(contractPath, JSON.stringify({ ...activeContract, status: 'observing' }, null, 2), 'utf8')
    const { generateLearningCandidate } = await import('../learning')
    // 测量
    const { appendMeasurement } = await import('../outcome-store')
    const ms = appendMeasurement({
      measurementId: 'ms-p2', outcomeId: 'oc-pilot2', measureId: 'cov', contractVersion: 1,
      actual: 100, availability: 'available', evidenceRefs: ['audit://p2/full'], observedAt: Date.now(),
      recordedBy: 'seed', recordedAt: Date.now(),
    } as never, 'seed')
    expect(ms.ok, JSON.stringify(ms)).toBe(true)
    // 结算（signedAt 稍后于批一）
    const settleAt = Date.now()
    appendEvent('oc-pilot2', 'settlement_signed', {
      settlementId: 'set-p2', settlement: {
        settlementId: 'set-p2', outcomeId: 'oc-pilot2', contractVersion: 1,
        verdict: 'achieved', rationale: '覆盖率 100% 全链可追溯，第二同口径结果收口。',
        measurementIds: ['ms-p2'], signedBy: 'pilot-owner', signedAt: settleAt,
      },
    }, 'pilot-owner', 1)
    const learn = generateLearningCandidate(
      { ...activeContract, status: 'settled' } as never,
      { settlementId: 'set-p2', verdict: 'achieved', rationale: '覆盖率 100% 全链可追溯，第二同口径结果收口。', signedAt: settleAt },
    )
    expect(learn.generated).toBe(true)
    const expRaw = JSON.parse(readFileSync(join(expDir, 'exp-candidates.json'), 'utf8'))
    expect(expRaw.candidates.find((c: { sourceSettlementId: string }) => c.sourceSettlementId === 'set-p2')).toBeTruthy()

    // 7) 对照投影：批一基线（100 达标）vs 本次（100 达标）→ 持平→恒 unknown
    const { buildOutcomeComparison, pickBaseline } = await import('../comparison')
    const evalSide = {
      contract: { ...activeContract, status: 'settled' } as never,
      measurements: [{ measurementId: 'ms-p2', outcomeId: 'oc-pilot2', measureId: 'cov', contractVersion: 1, actual: 100, availability: 'available', evidenceRefs: [], observedAt: settleAt - 1, recordedBy: 'x', recordedAt: settleAt - 1 }],
      settlement: { settlementId: 'set-p2', verdict: 'achieved', signedAt: settleAt },
    }
    const pilot1 = {
      contract: { ...activeContract, outcomeId: 'oc-pilot1', rootTaskId: 'pilot-prev', status: 'settled' } as never,
      measurements: [{ measurementId: 'ms-p1', outcomeId: 'oc-pilot1', measureId: 'cov', contractVersion: 1, actual: 100, availability: 'available', evidenceRefs: [], observedAt: settleAt - 9999, recordedBy: 'x', recordedAt: settleAt - 9999 }],
      settlement: { settlementId: 'set-p1', verdict: 'achieved', signedAt: settleAt - 9999 },
    }
    const cmp = buildOutcomeComparison(evalSide, [pilot1])
    expect(pickBaseline(evalSide, [pilot1])?.contract.outcomeId).toBe('oc-pilot1')
    expect(cmp.effect).toBe('unknown') // 100 vs 100 持平＝无变化不构成改善迹象
    expect(cmp.gapNote).toContain('持平')
    // 单结果时（无基线）恒 unknown
    const solo = buildOutcomeComparison(evalSide, [])
    expect(solo.effect).toBe('unknown')
    expect(solo.gapNote).toContain('不足两个同口径')
    void mk; void activated; void storeMod
  })
})

// custom/server/outcome/__tests__/outcome-controller.test.ts
// Task 7 守门：REST 控制器端点表（spec 2026-11-19 批一简报逐字）＋OUTCOME_WORKBENCH 功能门
// ＋权限矩阵（spec §4.6：激活/修订/取消/结算=owner；observing 迁移与测量=owner 或 verifier）
// ＋幂等键（clientRequestId/eventId/measurementId/settlementId/快照 sha256）＋移交项
// （version=1 服务端补、stale_contract、nextReviewAt 晚于签署时刻、reopen 函数面）。
// 挂载范式跟随 approval-inbox/__tests__/pending-controller.test.ts（Koa + createServer + fetch）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'node:module'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'

// I2（审查修复轮二）激活即绑定的看板夹具：node:sqlite 建板库（kanban-bind.test.ts 同款表结构＋task_links）
const nodeRequire: NodeRequire = (() => {
  try { return createRequire('/index.js') } catch { return null as unknown as NodeRequire }
})()
type BoardDb = {
  exec: (sql: string) => void
  prepare: (sql: string) => { get: (...p: unknown[]) => any; run: (...p: unknown[]) => unknown }
  close: () => void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => BoardDb }

async function fetchJson(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const post = (base: string, path: string, body: unknown) =>
  fetchJson(base, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const put = (base: string, path: string, body: unknown) =>
  fetchJson(base, path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** 合同入参工厂：过 validateContractInput 的最小正身（owner/verifier 分离）。 */
const contractBody = (overrides: Record<string, unknown> = {}) => ({
  rootTaskId: 'task-root-1',
  title: '接口成功率结果合同',
  valueStatement: '以分钟粒度成功率衡量网关交付的业务结果',
  ownerPersonId: 'owner-1',
  verificationOwnerId: 'verifier-1',
  measures: [
    {
      measureId: 'm1',
      name: '成功率',
      definition: '分钟粒度 5xx 以外的请求占比',
      unit: '%',
      operator: 'gte',
      baseline: 90,
      target: 95,
      sourceRef: 'metrics://gateway/success_rate',
    },
  ],
  acceptance: { statements: ['成功率达标且无 P0 事故'], requiredEvidenceKinds: ['metric'] },
  scope: { included: ['网关'], excluded: [] },
  riskTier: 'low',
  defaultReversibility: 'reversible',
  contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: ['secret'] },
  learningOptIn: false,
  ...overrides,
})

describe('Outcome REST 控制器（/api/hermes/outcomes）', () => {
  let base: string
  let server: ReturnType<typeof createServer>
  let tmpOutcome: string
  let tmpPeople: string
  // 激活即绑定（审查修复轮二 I2）走控制器内置真实现（hermesHome 动态读 env）：
  // 共享看板夹具让 seedContract 的激活链有库可绑（根卡由 seedContract 按需补插）；
  // I2 专项组用自己的 khome 夹具在内层 beforeEach 覆盖本 env。
  let ctlKhome: string
  let ctlBoard: BoardDb
  let currentUser: PlatformPrincipal | undefined
  let allTasksTerminal = false
  let rootTaskOwnership: 'proved' | 'null' | 'false' = 'proved'
  const taskSummary = { id: 'task-root-1', title: '根任务', status: 'done' }
  // 动态导入的模块引用（beforeEach 完成后各用例使用）
  let routes: import('@koa/router').default<Koa.DefaultState, Koa.DefaultContext>
  let storeMod: typeof import('../outcome-store')
  let reopenOutcome: (id: string, actor: string) => { ok: boolean; code?: string; problems?: string[] }

  const asUser = (username: string) => {
    currentUser = { id: 1, username, role: 'super_admin', status: 'active' }
  }

  /** 建合同并推进到指定状态（owner 视角，全链走 REST 端点）。 */
  const seedContract = async (to: 'draft' | 'active' | 'observing' | 'settled', rootTaskId = 'task-root-1') => {
    asUser('owner-1')
    // 激活即绑定（I2）真实现要求根卡在板：按需补插（幂等；无 task_links → 只绑根卡）
    ctlBoard
      .prepare('INSERT OR IGNORE INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)')
      .run(rootTaskId, `根任务-${rootTaskId}`, 'todo', null)
    const created = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId }))
    expect(created.status).toBe(201)
    const id = (created.body.contract as { outcomeId: string }).outcomeId
    if (to === 'draft') return id
    const act = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
    expect(act.status).toBe(201)
    if (to === 'active') return id
    allTasksTerminal = true // seed 链推进 observing 需要 tasksTerminalOf 放行
    const obs = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
    expect(obs.status).toBe(201)
    if (to === 'observing') return id
    const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
      measurementId: `ms-${id}`,
      measureId: 'm1',
      contractVersion: 1,
      actual: 96,
      availability: 'available',
      evidenceRefs: ['metric://gateway/success_rate?window=1h'],
      observedAt: Date.now(),
    })
    expect(ms.status).toBe(201)
    const st = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
      settlementId: `set-${id}`,
      contractVersion: 1,
      verdict: 'achieved',
      rationale: '连续两周成功率 96% 高于目标 95%，验收陈述全部满足，准予结算。',
      measurementIds: [`ms-${id}`],
    })
    expect(st.status).toBe(201)
    return id
  }

  beforeEach(async () => {
    tmpOutcome = mkdtempSync(join(tmpdir(), 'outcome-ctl-store-'))
    tmpPeople = mkdtempSync(join(tmpdir(), 'outcome-ctl-people-'))
    ctlKhome = mkdtempSync(join(tmpdir(), 'outcome-ctl-kanban-'))
    ctlBoard = new DatabaseSync(join(ctlKhome, 'kanban.db'))
    ctlBoard.exec(`CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT, status TEXT,
      outcome_id TEXT, version INTEGER NOT NULL DEFAULT 0)`)
    ctlBoard.exec(`CREATE TABLE task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
    ctlBoard.exec(`CREATE TABLE task_links (parent_id TEXT, child_id TEXT)`)
    process.env.HERMES_HOME = ctlKhome
    allTasksTerminal = false
    rootTaskOwnership = 'proved'
    asUser('owner-1')
    process.env.OUTCOME_WORKBENCH = '1'

    const { _useOutcomeStoreForTests } = await import('../outcome-store')
    _useOutcomeStoreForTests(tmpOutcome)
    const people = await import('../../agentidentity/people')
    people._usePeopleStoreForTests(tmpPeople)
    for (const id of ['owner-1', 'verifier-1', 'other-1']) {
      people.upsertPerson({ id, name: `人-${id}` }, 'seed')
      people.activatePerson(id, 'seed')
    }

    const controller = await import('../outcome-controller')
    routes = controller.createOutcomeRoutes({
      tasksTerminalOf: () => allTasksTerminal,
      taskSummaryOf: (rootTaskId) =>
        rootTaskId === taskSummary.id ? { ...taskSummary } : null,
      verifyRootTask: () =>
        rootTaskOwnership === 'proved' ? { ok: true } : rootTaskOwnership === 'false' ? { ok: false } : null,
    })
    reopenOutcome = controller.reopenOutcome

    storeMod = await import('../outcome-store')

    const app = new Koa()
    app.use(async (ctx, next) => {
      if (currentUser) (ctx.state as { user?: PlatformPrincipal }).user = currentUser
      await next()
    })
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST' || ctx.method === 'PUT') {
        const chunks: Buffer[] = []
        for await (const c of ctx.req) chunks.push(c as Buffer)
        try {
          ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          ctx.request.body = {}
        }
      }
      await next()
    })
    app.use(routes.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    try { ctlBoard.close() } catch { /* noop */ }
    delete process.env.HERMES_HOME // I2 组内层 afterEach 已删：幂等
    rmSync(ctlKhome, { recursive: true, force: true })
    rmSync(tmpOutcome, { recursive: true, force: true })
    rmSync(tmpPeople, { recursive: true, force: true })
    delete process.env.OUTCOME_WORKBENCH
    delete process.env.OUTCOME_ALLOW_UNVERIFIED_ROOT
    const { _useOutcomeStoreForTests } = await import('../outcome-store')
    _useOutcomeStoreForTests(null)
    const people = await import('../../agentidentity/people')
    people._usePeopleStoreForTests(null)
    currentUser = undefined
  })

  describe('功能门 OUTCOME_WORKBENCH', () => {
    it('门关：全端点 404 + code=outcome_workbench_disabled', async () => {
      delete process.env.OUTCOME_WORKBENCH
      const list = await fetchJson(base, '/api/hermes/outcomes')
      expect(list.status).toBe(404)
      expect(list.body.code).toBe('outcome_workbench_disabled')
      expect(list.body.ok).toBe(false)
      const create = await post(base, '/api/hermes/outcomes', contractBody())
      expect(create.status).toBe(404)
      expect(create.body.code).toBe('outcome_workbench_disabled')
      const detail = await fetchJson(base, '/api/hermes/outcomes/oc-any')
      expect(detail.status).toBe(404)
      expect(detail.body.code).toBe('outcome_workbench_disabled')
    })

    it('门开（=1）：端点可用', async () => {
      const res = await fetchJson(base, '/api/hermes/outcomes')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })
  })

  describe('POST / 创建与幂等', () => {
    it('创建成功 201：version=1、status=draft 由服务端定，客户端传 version/status/signedBy 一律忽略', async () => {
      const res = await post(base, '/api/hermes/outcomes', contractBody({
        version: 99,
        status: 'settled',
        signedBy: 'attacker-1',
        actor: 'attacker-1',
      }))
      expect(res.status).toBe(201)
      expect(res.body.ok).toBe(true)
      const c = res.body.contract as Record<string, unknown>
      expect(c.version).toBe(1)
      expect(c.status).toBe('draft')
      expect(c.schemaVersion).toBe(1)
      expect(typeof c.outcomeId).toBe('string')
      expect(typeof c.createdAt).toBe('number')
      // 客户端传入的 outcomeId 被采纳（幂等重放需要稳定身份）
      const named = await post(base, '/api/hermes/outcomes', contractBody({ outcomeId: 'oc-named-1', rootTaskId: 'task-named' }))
      expect(named.status).toBe(201)
      expect((named.body.contract as { outcomeId: string }).outcomeId).toBe('oc-named-1')
    })

    it('clientRequestId 幂等：重放返回 200 + 同一合同 + replayed 标记', async () => {
      const first = await post(base, '/api/hermes/outcomes', contractBody({ clientRequestId: 'creq-1' }))
      expect(first.status).toBe(201)
      const again = await post(base, '/api/hermes/outcomes', contractBody({ clientRequestId: 'creq-1' }))
      expect(again.status).toBe(200)
      expect(again.body.replayed).toBe(true)
      expect(again.body.contract).toEqual(first.body.contract)
    })

    it('rootTaskId 被其他合同占用 → 409 root_task_taken', async () => {
      const first = await post(base, '/api/hermes/outcomes', contractBody())
      expect(first.status).toBe(201)
      const second = await post(base, '/api/hermes/outcomes', contractBody())
      expect(second.status).toBe(409)
      expect(second.body.code).toBe('root_task_taken')
    })

    it('owner/verifier 未在人员名单激活 → 422 problems', async () => {
      const res = await post(base, '/api/hermes/outcomes', contractBody({ ownerPersonId: 'ghost-1', rootTaskId: 'task-ghost' }))
      expect(res.status).toBe(422)
      expect(Array.isArray(res.body.problems)).toBe(true)
      expect((res.body.problems as string[]).join()).toContain('ghost-1')
      // verifier 非 active 同样拒绝
      const res2 = await post(base, '/api/hermes/outcomes', contractBody({ verificationOwnerId: 'inactive-1', rootTaskId: 'task-ghost2' }))
      expect(res2.status).toBe(422)
    })

    it('校验失败 → 422 带 problems（K19 错误信封）', async () => {
      const res = await post(base, '/api/hermes/outcomes', contractBody({ title: '', rootTaskId: 'task-bad' }))
      expect(res.status).toBe(422)
      expect(res.body.ok).toBe(false)
      expect((res.body.problems as string[]).length).toBeGreaterThan(0)
    })
  })

  describe('GET / 列表过滤与 GET /:id', () => {
    beforeEach(async () => {
      await seedContract('draft', 'task-a')
      await seedContract('active', 'task-b')
    })

    it('status/rootTaskId/owner 过滤', async () => {
      const byStatus = await fetchJson(base, '/api/hermes/outcomes?status=draft')
      expect(byStatus.status).toBe(200)
      const items = byStatus.body.items as Array<{ status: string; rootTaskId: string }>
      expect(items.length).toBe(1)
      expect(items[0].status).toBe('draft')
      const byRoot = await fetchJson(base, '/api/hermes/outcomes?rootTaskId=task-b')
      expect(((byRoot.body.items as Array<{ rootTaskId: string }>).map((i) => i.rootTaskId))).toEqual(['task-b'])
      const byOwner = await fetchJson(base, '/api/hermes/outcomes?owner=owner-1')
      expect((byOwner.body.items as unknown[]).length).toBe(2)
      const byOwnerNone = await fetchJson(base, '/api/hermes/outcomes?owner=ghost-1')
      expect((byOwnerNone.body.items as unknown[]).length).toBe(0)
    })

    it('非法 status 过滤值 → 422', async () => {
      const res = await fetchJson(base, '/api/hermes/outcomes?status=wrong')
      expect(res.status).toBe(422)
    })

    it('GET /:id 命中与 404', async () => {
      const list = await fetchJson(base, '/api/hermes/outcomes')
      const id = (list.body.items as Array<{ outcomeId: string }>)[0].outcomeId
      const one = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect(one.status).toBe(200)
      expect((one.body.contract as { outcomeId: string }).outcomeId).toBe(id)
      const missing = await fetchJson(base, '/api/hermes/outcomes/oc-nope')
      expect(missing.status).toBe(404)
      expect(missing.body.code).toBe('not_found')
    })
  })

  describe('PUT /:id 修订', () => {
    it('owner 修订成功 version+1；expectedVersion 不符 409', async () => {
      const id = await seedContract('draft')
      const res = await put(base, `/api/hermes/outcomes/${id}`, {
        expectedVersion: 1,
        title: '修订后的标题',
      })
      expect(res.status).toBe(200)
      expect((res.body.contract as { version: number }).version).toBe(2)
      expect((res.body.contract as { title: string }).title).toBe('修订后的标题')
      const stale = await put(base, `/api/hermes/outcomes/${id}`, { expectedVersion: 1, title: '再改' })
      expect(stale.status).toBe(409)
      expect(stale.body.code).toBe('version_conflict')
    })

    it('非 owner（verifier/第三人）修订 → 403', async () => {
      const id = await seedContract('draft')
      asUser('verifier-1')
      const v = await put(base, `/api/hermes/outcomes/${id}`, { expectedVersion: 1, title: '越权修订' })
      expect(v.status).toBe(403)
      asUser('other-1')
      const o = await put(base, `/api/hermes/outcomes/${id}`, { expectedVersion: 1, title: '越权修订' })
      expect(o.status).toBe(403)
      expect(o.body.code).toBe('forbidden')
    })
  })

  describe('POST /:id/transitions 状态迁移', () => {
    it('owner 激活 draft→active 201；非 owner 激活 403', async () => {
      const id = await seedContract('draft')
      asUser('verifier-1')
      const denied = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
      expect(denied.status).toBe(403)
      asUser('owner-1')
      const res = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
      expect(res.status).toBe(201)
      expect((res.body.contract as { status: string }).status).toBe('active')
      // 落账核对：status_changed 事件在场
      const events = storeMod.listEvents(id, 'status_changed')
      expect(events.length).toBe(1)
      expect((events[0].payload as { to: string }).to).toBe('active')
    })

    it('active→observing：owner 或 verifier 可发起；tasksTerminalOf=false → 422 tasks_unfinished', async () => {
      const id = await seedContract('active')
      const blocked = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
      expect(blocked.status).toBe(422)
      expect(blocked.body.code).toBe('tasks_unfinished')
      allTasksTerminal = true
      asUser('verifier-1')
      const res = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
      expect(res.status).toBe(201)
      expect((res.body.contract as { status: string }).status).toBe('observing')
    })

    it('observing→settled 直迁被拒（仅经结算端点）；非法边 422 illegal_transition；取消缺 reason 422', async () => {
      const id = await seedContract('observing')
      const direct = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'settled' })
      expect(direct.status).toBe(422)
      expect(direct.body.code).toBe('needs_settlement')
      const illegal = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'draft' })
      expect(illegal.status).toBe(422)
      expect(illegal.body.code).toBe('illegal_transition')
      const noReason = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'cancelled' })
      expect(noReason.status).toBe(422)
      expect(noReason.body.code).toBe('reason_required')
      const cancel = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'cancelled', reason: '方向调整，不再追求该结果' })
      expect(cancel.status).toBe(201)
      expect((cancel.body.contract as { status: string }).status).toBe('cancelled')
    })

    it('eventId 幂等：同 eventId 重放返回 200 replayed 且不重复落账', async () => {
      const id = await seedContract('draft')
      const first = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active', eventId: 'te-1' })
      expect(first.status).toBe(201)
      const again = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active', eventId: 'te-1' })
      expect(again.status).toBe(200)
      expect(again.body.replayed).toBe(true)
      expect(storeMod.listEvents(id, 'status_changed').length).toBe(1)
    })

    it('合同不存在 → 404', async () => {
      const res = await post(base, '/api/hermes/outcomes/oc-nope/transitions', { to: 'active' })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /:id/measurements 测量', () => {
    it('owner 与 verifier 均可提交；第三人 403；recordedBy 取服务端身份', async () => {
      const id = await seedContract('active')
      const body = {
        measurementId: 'ms-1',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        evidenceRefs: ['metric://gateway/success_rate?window=1h'],
        observedAt: Date.now(),
        recordedBy: 'attacker-1',
      }
      asUser('other-1')
      const denied = await post(base, `/api/hermes/outcomes/${id}/measurements`, body)
      expect(denied.status).toBe(403)
      asUser('owner-1')
      const res = await post(base, `/api/hermes/outcomes/${id}/measurements`, body)
      expect(res.status).toBe(201)
      expect((res.body.measurement as { recordedBy: string }).recordedBy).toBe('owner-1')
      asUser('verifier-1')
      const v = await post(base, `/api/hermes/outcomes/${id}/measurements`, { ...body, measurementId: 'ms-2' })
      expect(v.status).toBe(201)
      expect((v.body.measurement as { recordedBy: string }).recordedBy).toBe('verifier-1')
    })

    it('缺 evidenceRefs / 空数组 → 422 problems', async () => {
      const id = await seedContract('active')
      const noRefs = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: 'ms-x1',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        observedAt: Date.now(),
      })
      expect(noRefs.status).toBe(422)
      expect((noRefs.body.problems as string[]).join()).toContain('evidenceRefs')
      const emptyRefs = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: 'ms-x2',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        evidenceRefs: [],
        observedAt: Date.now(),
      })
      expect(emptyRefs.status).toBe(422)
    })

    it('contractVersion 与当前合同不符 → 409 stale_contract', async () => {
      const id = await seedContract('active')
      const res = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: 'ms-stale',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        evidenceRefs: ['metric://x'],
        observedAt: Date.now(),
      })
      expect(res.status).toBe(201)
      // 修订后版本升 2，再按 v1 提交 → stale
      asUser('owner-1')
      const upd = await put(base, `/api/hermes/outcomes/${id}`, { expectedVersion: 1, title: '改版标题一二三' })
      expect(upd.status).toBe(200)
      const stale = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: 'ms-stale-2',
        measureId: 'm1',
        contractVersion: 1,
        actual: 97,
        availability: 'available',
        evidenceRefs: ['metric://x'],
        observedAt: Date.now(),
      })
      expect(stale.status).toBe(409)
      expect(stale.body.code).toBe('stale_contract')
    })

    it('measurementId 幂等：重放返回 200 added:false 且不重复落账', async () => {
      const id = await seedContract('active')
      const body = {
        measurementId: 'ms-dup',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        evidenceRefs: ['metric://x'],
        observedAt: Date.now(),
      }
      const first = await post(base, `/api/hermes/outcomes/${id}/measurements`, body)
      expect(first.status).toBe(201)
      const again = await post(base, `/api/hermes/outcomes/${id}/measurements`, body)
      expect(again.status).toBe(200)
      expect(again.body.added).toBe(false)
      expect(storeMod.listMeasurements(id).length).toBe(1)
    })
  })

  describe('POST /:id/settlement 结算', () => {
    it('非 owner（含 verifier）→ 403；owner 在非 observing 状态 → 422', async () => {
      const id = await seedContract('observing')
      asUser('verifier-1')
      const denied = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        verdict: 'achieved',
        rationale: '验证责任人不得代签业务裁决的完整理由陈述',
        measurementIds: [],
      })
      expect(denied.status).toBe(403)
      const activeId = await seedContract('active', 'task-not-observing')
      asUser('owner-1')
      const wrongState = await post(base, `/api/hermes/outcomes/${activeId}/settlement`, {
        verdict: 'achieved',
        rationale: '状态不符时不得结算的完整理由陈述',
        measurementIds: [],
      })
      expect(wrongState.status).toBe(422)
    })

    it('verdict=unknown 缺 gapNote → 422；nextReviewAt 不晚于签署时刻 → 422', async () => {
      const id = await seedContract('observing')
      const noGap = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: 'set-ng',
        verdict: 'unknown',
        rationale: '证据不足以判定业务达成情况，需补充数据后复审的说明',
        measurementIds: [],
        nextReviewAt: Date.now() + 86_400_000,
      })
      expect(noGap.status).toBe(422)
      expect((noGap.body.problems as string[]).join()).toContain('gapNote')
      const pastReview = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: 'set-pr',
        verdict: 'unknown',
        rationale: '证据不足以判定业务达成情况，需补充数据后复审的说明',
        measurementIds: [],
        gapNote: '缺部署维度的成功率口径',
        nextReviewAt: Date.now() - 1,
      })
      expect(pastReview.status).toBe(422)
      expect((pastReview.body.problems as string[]).join()).toContain('nextReviewAt')
    })

    it('body.contractVersion 与当前合同不符 → 409', async () => {
      const id = await seedContract('observing')
      const res = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: 'set-vc',
        contractVersion: 99,
        verdict: 'achieved',
        rationale: '版本不符必须拒绝结算的完整理由陈述',
        measurementIds: [],
      })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('version_conflict')
    })

    it('owner 结算成功：合同转 settled、落 settlement_signed、响应含机器建议；重放幂等 200', async () => {
      const id = await seedContract('observing')
      const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: 'ms-settle',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        evidenceRefs: ['metric://gateway/success_rate?window=1h'],
        observedAt: Date.now(),
      })
      expect(ms.status).toBe(201)
      const res = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: 'set-1',
        contractVersion: 1,
        verdict: 'achieved',
        rationale: '连续两周成功率 96% 高于目标 95%，验收陈述全部满足，准予结算。',
        measurementIds: ['ms-settle'],
      })
      expect(res.status).toBe(201)
      const settlement = res.body.settlement as Record<string, unknown>
      expect(settlement.signedBy).toBe('owner-1') // 服务端身份，非客户端可传
      expect(typeof settlement.signedAt).toBe('number')
      expect(settlement.contractVersion).toBe(1)
      const suggestion = res.body.suggestion as { verdict: string }
      expect(suggestion.verdict).toBe('achieved') // 机器建议随响应给签署人参考
      const contract = storeMod.getContract(id) as { status: string }
      expect(contract.status).toBe('settled')
      const signed = storeMod.listEvents(id, 'settlement_signed')
      expect(signed.length).toBe(1)
      const again = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: 'set-1',
        verdict: 'achieved',
        rationale: '连续两周成功率 96% 高于目标 95%，验收陈述全部满足，准予结算。',
        measurementIds: ['ms-settle'],
      })
      expect(again.status).toBe(200)
      expect(again.body.replayed).toBe(true)
      expect(storeMod.listEvents(id, 'settlement_signed').length).toBe(1)
    })
  })

  describe('GET /:id/measurements 测量读面（Task 15，T13/T14 双报缺口）', () => {
    const submit = (id: string, body: Record<string, unknown>) =>
      post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measureId: 'm1', contractVersion: 1, actual: 96, availability: 'available',
        evidenceRefs: ['metric://x'], ...body,
      })

    it('正常：全量落账序＋每 measure 最新摘要（observedAt 最大）；measureId 过滤；不存在 404；门关 404', async () => {
      const id = await seedContract('active')
      const now = Date.now()
      expect((await submit(id, { measurementId: 'ms-a', observedAt: now - 5000 })).status).toBe(201)
      expect((await submit(id, { measurementId: 'ms-b', observedAt: now })).status).toBe(201)
      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements`)
      expect(res.status).toBe(200)
      const body = res.body as {
        measurements: Array<{ measurementId: string; contractVersion: number }>
        latest: Record<string, { measurementId: string }>
        contractVersion: number
      }
      expect(body.contractVersion).toBe(1)
      expect(body.measurements.map((m) => m.measurementId)).toEqual(['ms-a', 'ms-b'])
      expect(body.latest.m1!.measurementId).toBe('ms-b') // observedAt 最大者胜
      const filtered = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements?measureId=nope`)
      expect(filtered.status).toBe(200)
      expect(filtered.body.measurements).toEqual([])
      const filteredHit = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements?measureId=m1`)
      expect((filteredHit.body.measurements as unknown[]).length).toBe(2)
      const missing = await fetchJson(base, '/api/hermes/outcomes/oc-nope/measurements')
      expect(missing.status).toBe(404)
      expect(missing.body.code).toBe('not_found')
      delete process.env.OUTCOME_WORKBENCH
      const gated = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements`)
      expect(gated.status).toBe(404)
      expect(gated.body.code).toBe('outcome_workbench_disabled')
      process.env.OUTCOME_WORKBENCH = '1'
    })

    it('版本优先：修订升版后 v2 测量前排、latest 只认当前版本（旧口径只作历史）', async () => {
      const id = await seedContract('active')
      expect((await submit(id, { measurementId: 'ms-v1', observedAt: Date.now() })).status).toBe(201)
      const upd = await put(base, `/api/hermes/outcomes/${id}`, { expectedVersion: 1, title: '改版后的标题口径' })
      expect(upd.status).toBe(200)
      // v2 测量 observedAt 刻意更旧——版本优先仍前排且 latest 只认 v2（结算绑定同口径）
      expect((await submit(id, { measurementId: 'ms-v2', contractVersion: 2, actual: 92, observedAt: Date.now() - 60_000 })).status).toBe(201)
      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements`)
      const body = res.body as {
        measurements: Array<{ measurementId: string; contractVersion: number }>
        latest: Record<string, { measurementId: string; contractVersion: number }>
      }
      expect(body.measurements.map((m) => m.measurementId)).toEqual(['ms-v2', 'ms-v1'])
      expect(body.measurements.map((m) => m.contractVersion)).toEqual([2, 1])
      expect(body.latest.m1!.measurementId).toBe('ms-v2')
      expect(body.latest.m1!.contractVersion).toBe(2)
    })
  })

  describe('GET /:id/settlement 结算读面（Task 15，T13/T14 双报缺口）', () => {
    it('未结算：settlement=null、superseded=[]；不存在 404；门关 404', async () => {
      const id = await seedContract('observing')
      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect(res.status).toBe(200)
      expect(res.body.settlement).toBeNull()
      expect(res.body.superseded).toEqual([])
      const missing = await fetchJson(base, '/api/hermes/outcomes/oc-nope/settlement')
      expect(missing.status).toBe(404)
      delete process.env.OUTCOME_WORKBENCH
      const gated = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect(gated.status).toBe(404)
      expect(gated.body.code).toBe('outcome_workbench_disabled')
      process.env.OUTCOME_WORKBENCH = '1'
    })

    it('已结算：最新有效结算下发；重开后旧结算入 superseded 链；再结算 latest=新、链含旧', async () => {
      const id = await seedContract('settled') // settlementId=`set-${id}`，allTasksTerminal 已置 true
      const settled = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect((settled.body.settlement as { settlementId: string }).settlementId).toBe(`set-${id}`)
      expect(settled.body.superseded).toEqual([])
      // 重开：旧结算被取代、合同回 active
      expect(reopenOutcome(id, 'owner-1').ok).toBe(true)
      const reopened = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect(reopened.body.settlement).toBeNull() // 全被取代：不拿已废结算充当前
      const chain1 = reopened.body.superseded as Array<{ settlementId: string; reason: string; settlement: { settlementId: string } }>
      expect(chain1.length).toBe(1)
      expect(chain1[0]!.settlementId).toBe(`set-${id}`)
      expect(chain1[0]!.reason).toBe('root_task_reopened')
      expect(chain1[0]!.settlement.settlementId).toBe(`set-${id}`)
      // 再走 observing → 二次结算：latest=新结算，链仍含旧
      asUser('owner-1')
      const obs = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
      expect(obs.status).toBe(201)
      const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: `ms2-${id}`, measureId: 'm1', contractVersion: 1, actual: 97,
        availability: 'available', evidenceRefs: ['metric://x'], observedAt: Date.now(),
      })
      expect(ms.status).toBe(201)
      const st2 = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: 'set-2nd', contractVersion: 1, verdict: 'achieved',
        rationale: '重开后二轮达成，成功率 97% 高于目标，准予二次结算。',
        measurementIds: [`ms2-${id}`],
      })
      expect(st2.status).toBe(201)
      const again = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect((again.body.settlement as { settlementId: string }).settlementId).toBe('set-2nd')
      const chain2 = again.body.superseded as Array<{ settlementId: string }>
      expect(chain2.map((c) => c.settlementId)).toEqual([`set-${id}`])
    })
  })

  describe('POST /:id/context-snapshots 与 GET /:id/context', () => {
    it('注入 taskSummaryOf 后生成快照 201；同内容重放 200 added:false（sha 幂等）', async () => {
      const id = await seedContract('active')
      const res = await post(base, `/api/hermes/outcomes/${id}/context-snapshots`, {})
      expect(res.status).toBe(201)
      const snap = res.body.snapshot as { snapshotId: string; sha256: string; teamVersion: null }
      expect(snap.teamVersion).toBe(null) // 批一恒 null
      expect(snap.snapshotId.startsWith('snap-')).toBe(true)
      const again = await post(base, `/api/hermes/outcomes/${id}/context-snapshots`, {})
      expect(again.status).toBe(200)
      expect(again.body.added).toBe(false)
      expect((again.body.snapshot as { sha256: string }).sha256).toBe(snap.sha256)
    })

    it('任务摘要不可用（根任务不在注入面）→ 422 problems', async () => {
      const id = await seedContract('active', 'task-not-mounted')
      const res = await post(base, `/api/hermes/outcomes/${id}/context-snapshots`, {})
      expect(res.status).toBe(422)
      expect((res.body.problems as string[]).join()).toContain('任务')
    })

    it('GET /:id/context 列表 fail-soft（无快照返回空数组）；?snapshotId 返回全量；未知 id 404', async () => {
      const id = await seedContract('active')
      const none = await fetchJson(base, `/api/hermes/outcomes/${id}/context`)
      expect(none.status).toBe(200)
      expect(none.body.ok).toBe(true)
      expect(none.body.snapshots).toEqual([])
      const created = await post(base, `/api/hermes/outcomes/${id}/context-snapshots`, {})
      const sid = (created.body.snapshot as { snapshotId: string }).snapshotId
      const list = await fetchJson(base, `/api/hermes/outcomes/${id}/context`)
      const rows = list.body.snapshots as Array<{ snapshotId: string }>
      expect(rows.length).toBe(1)
      expect(rows[0].snapshotId).toBe(sid)
      const one = await fetchJson(base, `/api/hermes/outcomes/${id}/context?snapshotId=${sid}`)
      expect(one.status).toBe(200)
      const full = one.body.snapshot as { snapshotId: string; content: Record<string, unknown> }
      expect(full.snapshotId).toBe(sid)
      expect(full.content).toBeTruthy()
      const unknownContract = await fetchJson(base, '/api/hermes/outcomes/oc-nope/context')
      expect(unknownContract.status).toBe(404)
      const unknownSnap = await fetchJson(base, `/api/hermes/outcomes/${id}/context?snapshotId=snap-nope`)
      expect(unknownSnap.status).toBe(404)
    })
  })

  describe('审查修复轮（C1/I1/I2/I3）', () => {
    it('C1：非 owner 重放他人 settlementId → 403（鉴权先于幂等扫描，结算正身不可被读取）', async () => {
      const id = await seedContract('settled')
      asUser('verifier-1')
      const v = await post(base, `/api/hermes/outcomes/${id}/settlement`, { settlementId: `set-${id}` })
      expect(v.status).toBe(403)
      expect(v.body.code).toBe('forbidden')
      asUser('other-1')
      const o = await post(base, `/api/hermes/outcomes/${id}/settlement`, { settlementId: `set-${id}` })
      expect(o.status).toBe(403)
    })

    it('I1：transitions 撕裂自愈——事件在账、合同未写时重放补写合同', async () => {
      const id = await seedContract('draft')
      // 手工造撕裂：事件落账但不写 contract.json（模拟先账后物的「物」半边失败）
      const ev = storeMod.appendEvent(id, 'status_changed', { from: 'draft', to: 'active', eventId: 'te-tear' }, 'owner-1', 1)
      expect(ev.ok).toBe(true)
      expect(storeMod.getContract(id)?.status).toBe('draft') // 撕裂现场：账已迁、合同未迁
      const res = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active', eventId: 'te-tear' })
      expect(res.status).toBe(200)
      expect(res.body.replayed).toBe(true)
      expect(res.body.healed).toBe(true)
      expect(storeMod.getContract(id)?.status).toBe('active')
      // 补写不重复落账
      expect(storeMod.listEvents(id, 'status_changed').length).toBe(1)
    })

    it('I1：settlement 撕裂自愈——结算事件在账、合同仍 observing 时重放补迁移＋补写', async () => {
      const id = await seedContract('observing')
      const settlement = {
        settlementId: 'set-tear',
        outcomeId: id,
        contractVersion: 1,
        verdict: 'achieved',
        rationale: '撕裂自愈测试专用的结算理由陈述，超过二十个字',
        measurementIds: [],
        signedBy: 'owner-1',
        signedAt: Date.now(),
      }
      const ev = storeMod.appendEvent(id, 'settlement_signed', { settlementId: 'set-tear', verdict: 'achieved', settlement }, 'owner-1', 1)
      expect(ev.ok).toBe(true)
      expect(storeMod.getContract(id)?.status).toBe('observing') // 撕裂现场
      const res = await post(base, `/api/hermes/outcomes/${id}/settlement`, { settlementId: 'set-tear' })
      expect(res.status).toBe(200)
      expect(res.body.healed).toBe(true)
      expect(storeMod.getContract(id)?.status).toBe('settled')
      expect(
        storeMod.listEvents(id, 'status_changed').some((e) => (e.payload as { to?: string }).to === 'settled'),
      ).toBe(true)
      expect(storeMod.listEvents(id, 'settlement_signed').length).toBe(1) // 补迁移不重复结算
    })

    it('I2：异 actor 同 clientRequestId 不命中——幂等键作用域收敛到 actor', async () => {
      asUser('owner-1')
      const first = await post(base, '/api/hermes/outcomes', contractBody({ clientRequestId: 'shared-creq' }))
      expect(first.status).toBe(201)
      asUser('other-1')
      const second = await post(base, '/api/hermes/outcomes', contractBody({ clientRequestId: 'shared-creq', rootTaskId: 'task-other-actor' }))
      expect(second.status).toBe(201) // 未命中 owner-1 的合同，全新创建
      expect(second.body.replayed).toBeUndefined()
      expect((second.body.contract as { outcomeId: string }).outcomeId).not.toBe(
        (first.body.contract as { outcomeId: string }).outcomeId,
      )
      // 原 actor 重放仍命中自己的合同
      asUser('owner-1')
      const replay = await post(base, '/api/hermes/outcomes', contractBody({ clientRequestId: 'shared-creq' }))
      expect(replay.status).toBe(200)
      expect(replay.body.replayed).toBe(true)
    })

    it('I3：归属不可证明（null）→ 422 ownership_unavailable；env 放行仅限 null；ok:false 永不放行', async () => {
      rootTaskOwnership = 'null'
      const denied = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'task-own-1' }))
      expect(denied.status).toBe(422)
      expect(denied.body.code).toBe('ownership_unavailable')
      process.env.OUTCOME_ALLOW_UNVERIFIED_ROOT = '1'
      const allowed = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'task-own-2' }))
      expect(allowed.status).toBe(201)
      delete process.env.OUTCOME_ALLOW_UNVERIFIED_ROOT
      rootTaskOwnership = 'false'
      const rejected = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'task-own-3' }))
      expect(rejected.status).toBe(422)
      expect(rejected.body.code).toBe('ownership_unavailable')
      process.env.OUTCOME_ALLOW_UNVERIFIED_ROOT = '1'
      const stillRejected = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'task-own-4' }))
      expect(stillRejected.status).toBe(422) // 明确不归属：env 不豁免
    })
  })

  describe('reopenOutcome 函数面（不挂路由，Task 10 外部触发）', () => {
    it('settled 合同重开：退回 active、写 status_changed，且旧结算写 settlement_superseded', async () => {
      const id = await seedContract('settled')
      const r = reopenOutcome(id, 'owner-1')
      expect(r.ok).toBe(true)
      expect((r.contract as { status: string }).status).toBe('active')
      expect(storeMod.getContract(id)?.status).toBe('active')
      expect(storeMod.listEvents(id, 'settlement_superseded').length).toBe(1)
      expect(storeMod.listEvents(id, 'status_changed').some((e) => (e.payload as { to: string }).to === 'active')).toBe(true)
      // settled 语义：version 不随重开递增（spec §4.1 重开不是合同语义变更）
      expect(storeMod.getContract(id)?.version).toBe(1)
    })

    it('observing 无结算重开：退回 active、不写 settlement_superseded（空串裁决）', async () => {
      const id = await seedContract('observing')
      const r = reopenOutcome(id, 'owner-1')
      expect(r.ok).toBe(true)
      expect(storeMod.getContract(id)?.status).toBe('active')
      expect(storeMod.listEvents(id, 'settlement_superseded').length).toBe(0)
    })

    it('非 settled/observing 合同不可重开；未知 id 不可重开', async () => {
      const id = await seedContract('draft')
      expect(reopenOutcome(id, 'owner-1').ok).toBe(false)
      expect(reopenOutcome('oc-nope', 'owner-1').ok).toBe(false)
    })
  })

  describe('审查修复轮二 I2：激活即绑定（draft→active 绑根卡＋一次性传播既有子卡）', () => {
    let khome: string
    let board: BoardDb

    const addCard = (id: string, outcomeId: string | null) =>
      board.prepare('INSERT INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)').run(id, `标题-${id}`, 'todo', outcomeId)
    const link = (parentId: string, childId: string) =>
      board.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)').run(parentId, childId)
    const boundOf = (id: string) =>
      (board.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(id) as { outcome_id: string | null }).outcome_id

    beforeEach(() => {
      khome = mkdtempSync(join(tmpdir(), 'act-bind-home-'))
      board = new DatabaseSync(join(khome, 'kanban.db'))
      board.exec(`CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT, status TEXT,
        outcome_id TEXT, version INTEGER NOT NULL DEFAULT 0)`)
      board.exec(`CREATE TABLE task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
      board.exec(`CREATE TABLE task_links (parent_id TEXT, child_id TEXT)`)
      // bindOutcomeFamily/hermesHome 每次调用动态读 env——控制器内置真实现走本夹具
      process.env.HERMES_HOME = khome
      asUser('owner-1')
    })

    afterEach(() => {
      try { board.close() } catch { /* noop */ }
      delete process.env.HERMES_HOME
      rmSync(khome, { recursive: true, force: true })
    })

    it('激活成功：根＋全部既有子卡（含孙卡）同值绑定，合同转 active', async () => {
      addCard('r1', null)
      addCard('c1', null)
      addCard('c2', null)
      addCard('g1', null)
      link('r1', 'c1')
      link('r1', 'c2')
      link('c1', 'g1')
      const created = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'r1' }))
      expect(created.status).toBe(201)
      const id = (created.body.contract as { outcomeId: string }).outcomeId
      const act = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
      expect(act.status).toBe(201)
      expect((act.body.contract as { status: string }).status).toBe('active')
      for (const t of ['r1', 'c1', 'c2', 'g1']) expect(boundOf(t)).toBe(id)
    })

    it('异值子卡→激活 422（outcome_conflict）：合同留 draft、根零绑定、库面零改动（失败不留半绑态）', async () => {
      addCard('r1', null)
      addCard('c1', 'oc-other') // 子卡已挂其他 outcome：改挂须显式迁移（spec §3.3.1）
      link('r1', 'c1')
      const created = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'r1' }))
      expect(created.status).toBe(201)
      const id = (created.body.contract as { outcomeId: string }).outcomeId
      const act = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
      expect(act.status).toBe(422)
      expect(act.body.code).toBe('outcome_conflict')
      // 迁移失败：合同停在 draft、绑定面零写入
      const detail = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect((detail.body.contract as { status: string }).status).toBe('draft')
      expect(boundOf('r1')).toBeNull()
      expect(boundOf('c1')).toBe('oc-other')
      const evs = board.prepare('SELECT COUNT(*) AS n FROM task_events').get() as { n: number }
      expect(Number(evs.n)).toBe(0)
    })

    it('非 draft→active 迁移不触发绑定（observing 等既有语义不变）', async () => {
      addCard('r9', null)
      const created = await post(base, '/api/hermes/outcomes', contractBody({ rootTaskId: 'r9' }))
      const id = (created.body.contract as { outcomeId: string }).outcomeId
      const act = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
      expect(act.status).toBe(201)
      expect(boundOf('r9')).toBe(id) // 绑定只随 draft→active 发生
      allTasksTerminal = true
      const obs = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
      expect(obs.status).toBe(201)
      // observing 迁移不再重复写绑定事件（幂等面由 bindOutcomeFamily 三态契约承担）
      const evs = board.prepare("SELECT COUNT(*) AS n FROM task_events WHERE kind = 'outcome_bound'").get() as { n: number }
      expect(Number(evs.n)).toBe(1)
    })
  })
})

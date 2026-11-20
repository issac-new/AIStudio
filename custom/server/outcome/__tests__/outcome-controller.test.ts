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
import { chmodSync, existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs'
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

  describe('批二 T1：读面 authz（owner/verifier 全量、其他登录用户 metadata 脱敏）', () => {
    it('GET /:id：owner/verifier readScope=full 带 measures[].definition；他人 metadata 且 definition 脱去；404 不变', async () => {
      const id = await seedContract('active')
      const shape = (body: Record<string, unknown>) => {
        const contract = body.contract as Record<string, unknown>
        const measures = contract.measures as Array<Record<string, unknown>>
        return {
          scope: body.readScope,
          title: contract.title,
          def: measures[0].definition,
          name: measures[0].name,
          target: measures[0].target,
        }
      }
      const owner = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect(owner.status).toBe(200)
      expect(shape(owner.body)).toMatchObject({ scope: 'full', def: '分钟粒度 5xx 以外的请求占比' })
      asUser('verifier-1')
      expect(shape((await fetchJson(base, `/api/hermes/outcomes/${id}`)).body).scope).toBe('full')
      asUser('other-1')
      const other = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect(other.status).toBe(200)
      const meta = shape(other.body)
      expect(meta.scope).toBe('metadata')
      expect(meta.def).toBeUndefined()
      expect(meta.name).toBe('成功率') // 度量骨架保留：元数据仍可消费
      expect(meta.title).toBeTruthy()
      const missing = await fetchJson(base, '/api/hermes/outcomes/oc-nope')
      expect(missing.status).toBe(404)
      expect(missing.body.code).toBe('not_found')
    })

    it('GET / 列表（T1 补）：他人行 readScope=metadata 且无 definition，自己行全量；过滤语义不变', async () => {
      await seedContract('active', 'task-list-a')
      asUser('other-1')
      const mine = await post(base, '/api/hermes/outcomes', contractBody({
        ownerPersonId: 'other-1',
        rootTaskId: 'task-list-b',
      }))
      expect(mine.status).toBe(201)
      asUser('owner-1')
      const ownerView = await fetchJson(base, '/api/hermes/outcomes')
      const ownerRows = ownerView.body.items as Array<{ readScope: string; ownerPersonId: string }>
      expect(ownerRows.length).toBe(2)
      // 行级判权：owner-1 视角下自己的行 full、他人（other-1）的行 metadata
      for (const row of ownerRows) {
        expect(row.readScope).toBe(row.ownerPersonId === 'owner-1' ? 'full' : 'metadata')
      }
      asUser('other-1')
      const other = await fetchJson(base, '/api/hermes/outcomes')
      expect(other.status).toBe(200)
      const rows = other.body.items as Array<{
        readScope: string
        ownerPersonId: string
        measures: Array<Record<string, unknown>>
      }>
      expect(rows.length).toBe(2)
      for (const row of rows) {
        if (row.ownerPersonId === 'other-1') {
          expect(row.readScope).toBe('full')
          expect(row.measures[0].definition).toBeTruthy()
        } else {
          expect(row.readScope).toBe('metadata')
          expect(row.measures[0].definition).toBeUndefined() // 他人行脱度量口径文本
          expect(row.measures[0].name).toBe('成功率') // 骨架保留
        }
      }
      // 过滤语义不变：owner/rootTaskId 过滤照常（脱敏不改可见行集）
      const byOwner = await fetchJson(base, '/api/hermes/outcomes?owner=owner-1')
      expect((byOwner.body.items as Array<{ ownerPersonId: string }>).map((r) => r.ownerPersonId)).toEqual(['owner-1'])
      const byRoot = await fetchJson(base, '/api/hermes/outcomes?rootTaskId=task-list-b')
      expect((byRoot.body.items as unknown[]).length).toBe(1)
    })

    it('GET /:id/context：owner 取全量含 content；他人 metadata content 整体脱去；列表摘要行与 404 不变', async () => {
      const id = await seedContract('active')
      const created = await post(base, `/api/hermes/outcomes/${id}/context-snapshots`, {})
      expect(created.status).toBe(201)
      const sid = (created.body.snapshot as { snapshotId: string }).snapshotId
      const full = await fetchJson(base, `/api/hermes/outcomes/${id}/context?snapshotId=${sid}`)
      expect(full.status).toBe(200)
      expect(full.body.readScope).toBe('full')
      expect((full.body.snapshot as { content?: unknown }).content).toBeTruthy()
      const fullList = await fetchJson(base, `/api/hermes/outcomes/${id}/context`)
      expect(fullList.body.readScope).toBe('full')
      asUser('other-1')
      const meta = await fetchJson(base, `/api/hermes/outcomes/${id}/context?snapshotId=${sid}`)
      expect(meta.status).toBe(200)
      expect(meta.body.readScope).toBe('metadata')
      const snap = meta.body.snapshot as { content?: unknown; snapshotId: string; sha256: string }
      expect(snap.content).toBeUndefined() // content 整体脱去（快照物化文本与 C1 保护面对齐）
      expect(snap.snapshotId).toBe(sid) // 信封元数据保留
      expect(typeof snap.sha256).toBe('string')
      const metaList = await fetchJson(base, `/api/hermes/outcomes/${id}/context`)
      expect(metaList.status).toBe(200)
      expect(metaList.body.readScope).toBe('metadata')
      expect((metaList.body.snapshots as unknown[]).length).toBe(1) // 摘要行本就无 content
      const unknownSnap = await fetchJson(base, `/api/hermes/outcomes/${id}/context?snapshotId=snap-nope`)
      expect(unknownSnap.status).toBe(404)
      const unknownContract = await fetchJson(base, '/api/hermes/outcomes/oc-nope/context')
      expect(unknownContract.status).toBe(404)
    })

    it('GET /:id/measurements：owner 全量含 evidenceRefs；他人 metadata evidenceRefs 脱去；404 不变', async () => {
      const id = await seedContract('active')
      const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: 'ms-authz',
        measureId: 'm1',
        contractVersion: 1,
        actual: 96,
        availability: 'available',
        evidenceRefs: ['metric://gateway/success_rate?window=1h'],
        observedAt: Date.now(),
      })
      expect(ms.status).toBe(201)
      const owner = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements`)
      expect(owner.body.readScope).toBe('full')
      expect((owner.body.measurements as Array<{ evidenceRefs?: string[] }>)[0].evidenceRefs).toBeTruthy()
      asUser('other-1')
      const meta = await fetchJson(base, `/api/hermes/outcomes/${id}/measurements`)
      expect(meta.status).toBe(200)
      expect(meta.body.readScope).toBe('metadata')
      const row = (meta.body.measurements as Array<{ evidenceRefs?: string[]; actual: number }>)[0]
      expect(row.evidenceRefs).toBeUndefined() // 证据引用可内嵌 token，metadata 态脱去
      expect(row.actual).toBe(96) // 测量事实骨架保留
      expect((meta.body.latest as Record<string, { evidenceRefs?: string[] }>).m1.evidenceRefs).toBeUndefined()
      const missing = await fetchJson(base, '/api/hermes/outcomes/oc-nope/measurements')
      expect(missing.status).toBe(404)
    })

    it('GET /:id/settlement：owner 全量含 rationale/gapNote；他人 metadata 两字段脱去且取代链同脱；404 不变', async () => {
      const id = await seedContract('observing')
      const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: `ms-${id}`,
        measureId: 'm1',
        contractVersion: 1,
        actual: 91,
        availability: 'available',
        evidenceRefs: ['metric://x'],
        observedAt: Date.now(),
      })
      expect(ms.status).toBe(201)
      const st = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
        settlementId: `set-${id}`,
        contractVersion: 1,
        verdict: 'unknown',
        rationale: '证据不足以判定业务达成情况，需补充数据后复审的说明',
        gapNote: '缺部署维度的成功率口径',
        nextReviewAt: Date.now() + 86_400_000,
        measurementIds: [`ms-${id}`],
      })
      expect(st.status).toBe(201)
      const owner = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect(owner.body.readScope).toBe('full')
      const os = owner.body.settlement as Record<string, unknown>
      expect(typeof os.rationale).toBe('string')
      expect(os.gapNote).toBe('缺部署维度的成功率口径')
      asUser('other-1')
      const meta = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect(meta.status).toBe(200)
      expect(meta.body.readScope).toBe('metadata')
      const redacted = meta.body.settlement as Record<string, unknown>
      expect(redacted.rationale).toBeUndefined()
      expect(redacted.gapNote).toBeUndefined()
      expect(redacted.verdict).toBe('unknown') // 裁决与骨架保留
      // 取代链同权：重开后旧结算进 superseded，他人读时链内 settlement 同样脱敏
      expect(reopenOutcome(id, 'owner-1').ok).toBe(true)
      asUser('other-1')
      const after = await fetchJson(base, `/api/hermes/outcomes/${id}/settlement`)
      expect(after.body.readScope).toBe('metadata')
      expect(after.body.settlement).toBeNull()
      const chain = after.body.superseded as Array<{ settlement: Record<string, unknown> | null }>
      expect(chain.length).toBe(1)
      expect(chain[0].settlement?.rationale).toBeUndefined()
      expect(chain[0].settlement?.gapNote).toBeUndefined()
      expect(chain[0].settlement?.verdict).toBe('unknown')
      const missing = await fetchJson(base, '/api/hermes/outcomes/oc-nope/settlement')
      expect(missing.status).toBe(404)
    })
  })

  // ---- 批二 T6：comparison 端点与结算触发学习 ----

  describe('GET /:id/comparison（同口径对照投影）', () => {
    it('settled 合同＋无其他同口径结果 → effect=unknown＋缺口说明；owner 得全量读数', async () => {
      const id = await seedContract('settled', 'task-cmp-1')
      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/comparison`)
      expect(res.status).toBe(200)
      const body = res.body as { readScope: string; comparison: { effect: string; gapNote: string; rows: Array<{ evaluation: { actual: number | null } }> } }
      expect(body.readScope).toBe('full')
      expect(body.comparison.effect).toBe('unknown')
      expect(body.comparison.gapNote).toContain('不足两个同口径')
      expect(body.comparison.rows[0].evaluation.actual).toBe(96)
    })

    it('非 settled → 422 not_settled；不存在 → 404', async () => {
      const draftId = await seedContract('draft', 'task-cmp-draft')
      expect((await fetchJson(base, `/api/hermes/outcomes/${draftId}/comparison`)).status).toBe(422)
      expect((await fetchJson(base, '/api/hermes/outcomes/oc-none/comparison')).status).toBe(404)
    })
  })

  describe('POST /:id/settlement 触发学习候选（双闸）', () => {
    it('EXPERIENCE_INJECT=1 且默认合同（learningOptIn 缺省 false）→ generated=false 双闸未开', async () => {
      const prev = process.env.EXPERIENCE_INJECT
      process.env.EXPERIENCE_INJECT = '1'
      try {
        const id = await seedContract('settled', 'task-learn-off')
        const st = await post(base, `/api/hermes/outcomes/${id}/settlement`)
        void st // seedContract 内部已结算；这里验读面 learning 侧写——重开再结算
        const reopened = reopenOutcome(id, 'owner-1')
        expect(reopened.ok).toBe(true)
        allTasksTerminal = true
        const obsHop = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
        expect(obsHop.status).toBe(201)
        const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
          measurementId: `ms2-${id}`, measureId: 'm1', contractVersion: 1, actual: 96,
          availability: 'available', evidenceRefs: ['metric://w'], observedAt: Date.now(),
        })
        expect(ms.status).toBe(201)
        const again = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
          settlementId: `set2-${id}`, contractVersion: 1, verdict: 'achieved',
          rationale: '复结算：成功率维持 96%，准予再次收口结算。', measurementIds: [`ms2-${id}`],
        })
        expect(again.status).toBe(201)
        expect((again.body.learning as { generated: boolean }).generated).toBe(false)
        expect((again.body.learning as { reason: string }).reason).toContain('双闸未开')
      } finally {
        if (prev === undefined) delete process.env.EXPERIENCE_INJECT
        else process.env.EXPERIENCE_INJECT = prev
      }
    })

    it('双闸全开（learningOptIn=true＋EXPERIENCE_INJECT=1）→ generated=true 且候选落盘（candidate 态、带 sourceSettlementId）', async () => {
      const prev = process.env.EXPERIENCE_INJECT
      process.env.EXPERIENCE_INJECT = '1'
      const expDir = mkdtempSync(join(tmpdir(), 'exp-ctl-'))
      process.env.EXP_STORE = expDir
      try {
        asUser('owner-1')
        ctlBoard.prepare('INSERT OR IGNORE INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)')
          .run('task-learn-on', '根任务-task-learn-on', 'todo', null)
        const created = await post(base, '/api/hermes/outcomes', contractBody({
          rootTaskId: 'task-learn-on',
          outcomeId: 'oc-learn-on',
          learningOptIn: true,
        } as never))
        expect(created.status).toBe(201)
        const id = 'oc-learn-on'
        const act = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'active' })
        allTasksTerminal = true
        const obs3 = await post(base, `/api/hermes/outcomes/${id}/transitions`, { to: 'observing' })
        const ms3 = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
          measurementId: 'ms-lo', measureId: 'm1', contractVersion: 1, actual: 96,
          availability: 'available', evidenceRefs: ['metric://w'], observedAt: Date.now(),
        })
        const st = await post(base, `/api/hermes/outcomes/${id}/settlement`, {
          settlementId: 'set-lo', contractVersion: 1, verdict: 'achieved',
          rationale: '成功率 96% 达标且验收陈述全部满足，准予收口结算。', measurementIds: ['ms-lo'],
        })
        expect(st.status).toBe(201)
        expect((st.body.learning as { generated: boolean }).generated).toBe(true)
        const raw = JSON.parse(readFileSync(join(expDir, 'exp-candidates.json'), 'utf8'))
        expect(raw.candidates[0].status).toBe('candidate')
        expect(raw.candidates[0].sourceSettlementId).toBe('set-lo')
        expect(raw.candidates[0].outcomeId).toBe('oc-learn-on')
      } finally {
        if (prev === undefined) delete process.env.EXPERIENCE_INJECT
        else process.env.EXPERIENCE_INJECT = prev
        delete process.env.EXP_STORE
        rmSync(expDir, { recursive: true, force: true })
      }
    })
  })

  // ---- 批三 T2：团队端点 PUT /:id/team 与 GET /:id team 面（spec 2026-11-21 批三 §一/§二） ----

  describe('批三 T2：PUT /:id/team 团队确认', () => {
    // agent 成员 roster 判据走 agentidentity 真实现：隔离到临时身份册（无任何注册身份→blocked）
    let tmpAgentId: string
    beforeEach(async () => {
      tmpAgentId = mkdtempSync(join(tmpdir(), 'outcome-ctl-agid-'))
      const agentIdentity = await import('../../agentidentity/agent-identity')
      agentIdentity._useStoreDirForTests(tmpAgentId)
    })
    afterEach(async () => {
      const agentIdentity = await import('../../agentidentity/agent-identity')
      agentIdentity._useStoreDirForTests(null)
      rmSync(tmpAgentId, { recursive: true, force: true })
    })

    const teamBody = (expectedVersion: number, patch: Record<string, unknown> = {}) => ({
      expectedVersion,
      members: [
        { subjectKind: 'person', subjectId: 'owner-1', role: 'accountable', responsibility: '对结果指标负责' },
        { subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '独立复核' },
      ],
      status: 'active',
      changeReason: '初始成队',
      ...patch,
    })

    it('owner 确认成功 200：team v1、team_confirmed 事件摘要、updatedBy=服务端身份（客户端冒传忽略）', async () => {
      const id = await seedContract('active')
      const res = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0, { updatedBy: 'attacker-1' }))
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.team).toMatchObject({
        outcomeId: id,
        version: 1,
        status: 'active',
        changeReason: '初始成队',
        updatedBy: 'owner-1', // 服务端身份，客户端传值忽略
      })
      expect(storeMod.getTeam(id)?.members).toHaveLength(2)
      const events = storeMod.listEvents(id, 'team_confirmed')
      expect(events).toHaveLength(1)
      expect(events[0].actor).toBe('owner-1')
      expect(events[0].payload).toEqual({ version: 1, changeReason: '初始成队', status: 'active', memberCount: 2 })
    })

    it('observing 合同同样可确认（active/observing 双态门）', async () => {
      const id = await seedContract('observing')
      const res = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(res.status).toBe(200)
      expect((res.body.team as { version: number }).version).toBe(1)
    })

    it('未认证（无 JWT）→ 401 authenticated_actor_required，不落任何团队痕迹', async () => {
      const id = await seedContract('active')
      currentUser = undefined
      const res = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(res.status).toBe(401)
      expect(res.body.code).toBe('authenticated_actor_required')
      expect(storeMod.getTeam(id)).toBeNull()
      asUser('owner-1')
    })

    it('非 owner（verifier/他人）→ 403 forbidden，零团队痕迹', async () => {
      const id = await seedContract('active')
      asUser('verifier-1')
      const v = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(v.status).toBe(403)
      expect(v.body.code).toBe('forbidden')
      asUser('other-1')
      const o = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(o.status).toBe(403)
      expect(o.body.code).toBe('forbidden')
      expect(storeMod.getTeam(id)).toBeNull()
      asUser('owner-1')
    })

    it('未知 outcomeId → 404 not_found', async () => {
      const res = await put(base, '/api/hermes/outcomes/oc-nope/team', teamBody(0))
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('not_found')
    })

    it('expectedVersion 过期且内容不同 → 409 version_conflict；team.json 与事件账未动', async () => {
      const id = await seedContract('active')
      const first = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(first.status).toBe(200)
      const stale = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0, {
        changeReason: '换一批人',
        members: [
          { subjectKind: 'person', subjectId: 'owner-1', role: 'accountable', responsibility: '甲' },
          { subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '乙' },
        ],
      }))
      expect(stale.status).toBe(409)
      expect(stale.body.code).toBe('version_conflict')
      expect(storeMod.getTeam(id)?.version).toBe(1)
      expect(storeMod.listEvents(id, 'team_confirmed')).toHaveLength(1)
    })

    it('合同非 active/observing（draft/settled）→ 422 outcome_not_active', async () => {
      const draftId = await seedContract('draft', 'task-t2-draft')
      const d = await put(base, `/api/hermes/outcomes/${draftId}/team`, teamBody(0))
      expect(d.status).toBe(422)
      expect(d.body.code).toBe('outcome_not_active')
      const settledId = await seedContract('settled', 'task-t2-settled')
      const s = await put(base, `/api/hermes/outcomes/${settledId}/team`, teamBody(0))
      expect(s.status).toBe(422)
      expect(s.body.code).toBe('outcome_not_active')
      expect(storeMod.getTeam(draftId)).toBeNull()
    })

    it('validateTeam 约束失败 → 422 invalid_input problems（owner 缺席/person 非 active/agent 名册未齐备/changeReason 必填）', async () => {
      const id = await seedContract('active')
      // 合同 owner 不在成员表：到位性失守（D8）
      const noOwner = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0, {
        members: [{ subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '独立复核' }],
      }))
      expect(noOwner.status).toBe(422)
      expect(noOwner.body.code).toBe('invalid_input')
      expect((noOwner.body.problems as string[]).join()).toContain('owner-1')
      // person 成员未在人员名单激活
      const ghost = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0, {
        members: [
          { subjectKind: 'person', subjectId: 'owner-1', role: 'accountable', responsibility: '甲' },
          { subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '乙' },
          { subjectKind: 'person', subjectId: 'ghost-9', role: 'support', responsibility: '丙' },
        ],
      }))
      expect(ghost.status).toBe(422)
      expect((ghost.body.problems as string[]).join()).toContain('ghost-9')
      // agent 成员 roster 未齐备（隔离身份册无记录 → blocked，D5）
      const agentBlocked = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0, {
        members: [
          ...teamBody(0).members as Array<Record<string, unknown>>,
          { subjectKind: 'agent', subjectId: 'ag-none', role: 'executor', responsibility: '执行' },
        ],
      }))
      expect(agentBlocked.status).toBe(422)
      expect((agentBlocked.body.problems as string[]).join()).toContain('ag-none')
      // changeReason 必填
      const noReason = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0, { changeReason: '' }))
      expect(noReason.status).toBe(422)
      expect((noReason.body.problems as string[]).join()).toContain('changeReason')
      expect(storeMod.getTeam(id)).toBeNull() // 全拒收：零团队痕迹
    })

    it('幂等重放：重复提交同 team 输入 → 200 replayed 返回当前团队，版本不递增、事件不重复', async () => {
      const id = await seedContract('active')
      const first = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(first.status).toBe(200)
      const replay = await put(base, `/api/hermes/outcomes/${id}/team`, teamBody(0))
      expect(replay.status).toBe(200)
      expect(replay.body.replayed).toBe(true)
      expect(replay.body.team).toEqual(first.body.team)
      expect(storeMod.getTeam(id)?.version).toBe(1)
      expect(storeMod.listEvents(id, 'team_confirmed')).toHaveLength(1)
    })
  })

  describe('批三 T2：GET /:id team 面', () => {
    it('确认前 team=null；确认后 owner 全量含 changeReason；他人 metadata 成员表+版本保留、changeReason 脱去', async () => {
      const id = await seedContract('active')
      const before = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect(before.status).toBe(200)
      expect(before.body.team).toBeNull()
      const confirmed = await put(base, `/api/hermes/outcomes/${id}/team`, {
        expectedVersion: 0,
        members: [
          { subjectKind: 'person', subjectId: 'owner-1', role: 'accountable', responsibility: '对结果指标负责' },
          { subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '独立复核' },
        ],
        status: 'active',
        changeReason: '初始成队理由文本',
      })
      expect(confirmed.status).toBe(200)
      const ownerView = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect(ownerView.body.readScope).toBe('full')
      const full = ownerView.body.team as Record<string, unknown>
      expect(full).toMatchObject({ version: 1, status: 'active', changeReason: '初始成队理由文本' })
      expect((full.members as unknown[]).length).toBe(2)
      asUser('other-1')
      const metaView = await fetchJson(base, `/api/hermes/outcomes/${id}`)
      expect(metaView.status).toBe(200)
      expect(metaView.body.readScope).toBe('metadata')
      const meta = metaView.body.team as Record<string, unknown>
      // 团队非敏感摘要（成员表+版本）元数据级可见；changeReason 是人写理由文本，跟随 settlement rationale 脱敏模式
      expect(meta).toMatchObject({ version: 1, status: 'active' })
      expect((meta.members as unknown[]).length).toBe(2)
      expect(meta.changeReason).toBeUndefined()
      asUser('owner-1')
    })
  })

  // ---- 批三 T5：贡献回顾域——GET /:id/contribution 五面＋POST /:id/contribution-reviews（spec 批三 §五） ----

  describe('批三 T5：贡献事实五面 GET /:id/contribution', () => {
    // 贡献面跨三存储：judgments（人署名评价）、exp 候选（learning 面）各自隔离到临时目录
    let tmpJudg: string
    let tmpExp: string
    beforeEach(async () => {
      tmpJudg = mkdtempSync(join(tmpdir(), 'outcome-ctl-judg-'))
      ;(await import('../../agentidentity/judgments'))._useJudgmentStoreForTests(tmpJudg)
      tmpExp = mkdtempSync(join(tmpdir(), 'outcome-ctl-exp-'))
      process.env.EXP_STORE = tmpExp
    })
    afterEach(async () => {
      ;(await import('../../agentidentity/judgments'))._useJudgmentStoreForTests(null)
      delete process.env.EXP_STORE
      rmSync(tmpJudg, { recursive: true, force: true })
      rmSync(tmpExp, { recursive: true, force: true })
    })

    /** 预置学习候选＋召回留痕（手写 exp 账，非经提取面）：候选挂本 outcome，留痕引用其 id。 */
    const seedLearning = (outcomeId: string) => {
      const candidate = {
        id: 'exp-001', type: 'good_path', statement: '历史经验句', fingerprint: 'settlement:set-x',
        evidence: [], status: 'approved', createdAt: '2026-11-21T00:00:00.000Z',
        updatedAt: '2026-11-21T00:00:00.000Z', injectedRuns: [], outcomeId, sourceSettlementId: 'set-x',
      }
      writeFileSync(join(tmpExp, 'exp-candidates.json'), JSON.stringify({
        candidates: [candidate, { ...candidate, id: 'exp-002', outcomeId: 'oc-other', fingerprint: 'settlement:set-y', sourceSettlementId: 'set-y' }],
        nextSeq: 3,
        injectionLog: [
          { runLabel: 'run-1', snapshotId: 'snap-1', ids: ['exp-001'], at: 1700000000000 },
          { runLabel: 'run-2', snapshotId: 'snap-2', ids: ['exp-002'], at: 1700000000001 },
        ],
      }))
      return candidate
    }

    const reviewBody = (patch: Record<string, unknown> = {}) => ({
      reviewId: 'rev-ctl-1',
      subject: { subjectKind: 'person', subjectId: 'verifier-1' },
      assessment: 'effective',
      rationale: '复核人在观察期独立核验了指标口径与证据链，贡献判定为有效。',
      evidenceRefs: ['evidence://task-1/1'],
      ...patch,
    })

    it('owner 全量五面：测量/团队/评价/学习（候选按 outcomeId＋召回留痕）/事件时间线；响应键集白名单、无任何排名字段', async () => {
      const id = await seedContract('active')
      const team = await put(base, `/api/hermes/outcomes/${id}/team`, {
        expectedVersion: 0,
        members: [
          { subjectKind: 'person', subjectId: 'owner-1', role: 'accountable', responsibility: '对结果指标负责' },
          { subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '独立复核' },
        ],
        status: 'active',
        changeReason: '初始成队',
      })
      expect(team.status).toBe(200)
      const ms = await post(base, `/api/hermes/outcomes/${id}/measurements`, {
        measurementId: `ms-${id}`, measureId: 'm1', contractVersion: 1, actual: 96,
        availability: 'available', evidenceRefs: ['metric://gateway/success_rate'], observedAt: Date.now(),
      })
      expect(ms.status).toBe(201)
      const rv = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody())
      expect(rv.status).toBe(201)
      seedLearning(id)

      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/contribution`)
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.readScope).toBe('full')
      expect(res.body.outcomeId).toBe(id)
      // 键集白名单：顶层只许这九个键——排名字段（score/rank/total/rating 等）无处容身
      expect(Object.keys(res.body).sort()).toEqual(
        ['events', 'learning', 'measurements', 'ok', 'outcomeId', 'readScope', 'reviewConclusions', 'reviews', 'team'],
      )
      // 递归禁排名键：任何深度不得出现 score/rank/total/rating 类字段
      const banned = ['score', 'scores', 'rank', 'ranking', 'total', 'totals', 'rating', 'ratings', 'creditShare']
      const walk = (v: unknown) => {
        if (Array.isArray(v)) { v.forEach(walk); return }
        if (v && typeof v === 'object') {
          for (const [k, child] of Object.entries(v)) {
            expect(banned, `响应出现排名字段：${k}`).not.toContain(k)
            walk(child)
          }
        }
      }
      walk(res.body)

      const measurements = res.body.measurements as { available: boolean; items: Array<Record<string, unknown>> }
      expect(measurements.available).toBe(true)
      expect(measurements.items).toHaveLength(1)
      expect(measurements.items[0].evidenceRefs).toEqual(['metric://gateway/success_rate'])
      const teamFace = res.body.team as { available: boolean; item: Record<string, unknown> | null }
      expect(teamFace.available).toBe(true)
      expect(teamFace.item).toMatchObject({ version: 1, status: 'active', changeReason: '初始成队' })
      const reviews = res.body.reviews as { available: boolean; items: Array<Record<string, unknown>> }
      expect(reviews.available).toBe(true)
      expect(reviews.items).toHaveLength(1)
      expect(reviews.items[0]).toMatchObject({
        id: 'rev-ctl-1', kind: 'contribution_review', assessment: 'effective', signedBy: 'owner-1',
      })
      const learning = res.body.learning as {
        available: boolean
        candidates: Array<Record<string, unknown>>
        injections: Array<Record<string, unknown>>
      }
      expect(learning.available).toBe(true)
      expect(learning.candidates.map((c) => c.id)).toEqual(['exp-001']) // 按 outcomeId 过滤，他人 outcome 不混入
      expect(learning.injections.map((r) => r.runLabel)).toEqual(['run-1']) // 召回留痕只含命中本 outcome 候选的注入
      const events = res.body.events as { available: boolean; timeline: Array<Record<string, unknown>> }
      expect(events.available).toBe(true)
      expect(events.timeline.map((e) => e.type)).toEqual(
        ['contract_created', 'status_changed', 'team_confirmed', 'measurement_appended'],
      )
      for (const e of events.timeline) expect('payload' in e).toBe(false) // 时间线摘要不带 payload 正身
      expect(res.body.reviewConclusions).toEqual({ available: false, reason: 'review_linkage_not_built' })
    })

    it('他人 metadata：测量脱 evidenceRefs、团队脱 changeReason、评价脱 rationale/evidenceRefs、学习候选脱 statement；骨架可见', async () => {
      const id = await seedContract('active')
      await put(base, `/api/hermes/outcomes/${id}/team`, {
        expectedVersion: 0,
        members: [
          { subjectKind: 'person', subjectId: 'owner-1', role: 'accountable', responsibility: '甲' },
          { subjectKind: 'person', subjectId: 'verifier-1', role: 'reviewer', responsibility: '乙' },
        ],
        status: 'active',
        changeReason: '内部调整理由',
      })
      const rv = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody())
      expect(rv.status).toBe(201)
      seedLearning(id)

      asUser('other-1')
      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/contribution`)
      expect(res.status).toBe(200)
      expect(res.body.readScope).toBe('metadata')
      const measurements = res.body.measurements as { available: boolean; items: Array<Record<string, unknown>> }
      expect(measurements.available).toBe(true)
      expect(measurements.items).toEqual([]) // 未见测量提交，空列表≠失败
      const teamFace = res.body.team as { item: Record<string, unknown> | null }
      expect(teamFace.item).toMatchObject({ version: 1, status: 'active' })
      expect(teamFace.item?.changeReason).toBeUndefined()
      const reviews = res.body.reviews as { available: boolean; items: Array<Record<string, unknown>> }
      expect(reviews.items).toHaveLength(1)
      expect(reviews.items[0].assessment).toBe('effective') // 骨架可见
      expect(reviews.items[0].rationale).toBeUndefined()
      expect(reviews.items[0].evidenceRefs).toBeUndefined()
      const learning = res.body.learning as { candidates: Array<Record<string, unknown>> }
      expect(learning.candidates.map((c) => c.id)).toEqual(['exp-001'])
      expect(learning.candidates[0].statement).toBeUndefined()
      expect(learning.candidates[0].status).toBe('approved')
      asUser('owner-1')
    })

    it('零数据≠失败：未确认团队/无测量/无评价/无学习的合同，五面 available 全 true、items 空、team.item=null', async () => {
      const id = await seedContract('active')
      const res = await fetchJson(base, `/api/hermes/outcomes/${id}/contribution`)
      expect(res.status).toBe(200)
      expect(res.body.measurements).toMatchObject({ available: true })
      expect((res.body.measurements as { items: unknown[] }).items).toEqual([])
      expect(res.body.team).toEqual({ available: true, item: null })
      expect((res.body.reviews as { items: unknown[] }).items).toEqual([])
      expect(res.body.learning).toMatchObject({ available: true, candidates: [], injections: [] })
      expect((res.body.events as { timeline: unknown[] }).timeline.length).toBeGreaterThan(0) // 事件账恒有创建/激活
    })

    it('逐源失败不伪装零数据：judgments 账不可读→reviews unavailable；exp 账损坏→learning unavailable；events 账不可读→events/measurements unavailable', async () => {
      const id = await seedContract('active')
      const rv = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody())
      expect(rv.status).toBe(201)
      seedLearning(id)
      const eventsFile = join(tmpOutcome, id, 'events.jsonl')
      const judgFile = join(tmpJudg, 'judgments.jsonl')
      chmodSync(judgFile, 0o000)
      chmodSync(eventsFile, 0o000)
      writeFileSync(join(tmpExp, 'exp-candidates.json'), '{oops-not-json')
      try {
        const res = await fetchJson(base, `/api/hermes/outcomes/${id}/contribution`)
        expect(res.status).toBe(200)
        expect(res.body.reviews).toMatchObject({ available: false })
        expect((res.body.reviews as { reason?: string }).reason).toBeTruthy()
        expect(res.body.learning).toMatchObject({ available: false })
        expect(res.body.events).toMatchObject({ available: false })
        expect(res.body.measurements).toMatchObject({ available: false }) // 测量派生自事件账，同源同失败
        expect(res.body.team).toMatchObject({ available: true }) // team.json 未受损，独立源照常
      } finally {
        chmodSync(judgFile, 0o644)
        chmodSync(eventsFile, 0o644)
      }
    })

    it('未知 outcome → 404 not_found；功能门关 → 404 outcome_workbench_disabled', async () => {
      const nf = await fetchJson(base, '/api/hermes/outcomes/oc-nope/contribution')
      expect(nf.status).toBe(404)
      expect(nf.body.code).toBe('not_found')
      delete process.env.OUTCOME_WORKBENCH
      const gated = await fetchJson(base, '/api/hermes/outcomes/oc-nope/contribution')
      expect(gated.status).toBe(404)
      expect(gated.body.code).toBe('outcome_workbench_disabled')
      process.env.OUTCOME_WORKBENCH = '1'
    })
  })

  describe('批三 T5：POST /:id/contribution-reviews 人署名贡献评价', () => {
    let tmpJudg: string
    beforeEach(async () => {
      tmpJudg = mkdtempSync(join(tmpdir(), 'outcome-ctl-judg-'))
      ;(await import('../../agentidentity/judgments'))._useJudgmentStoreForTests(tmpJudg)
    })
    afterEach(async () => {
      ;(await import('../../agentidentity/judgments'))._useJudgmentStoreForTests(null)
      rmSync(tmpJudg, { recursive: true, force: true })
    })

    const reviewBody = (patch: Record<string, unknown> = {}) => ({
      reviewId: 'rev-1',
      subject: { subjectKind: 'person', subjectId: 'verifier-1' },
      assessment: 'effective',
      rationale: '复核人在观察期独立核验了指标口径与证据链，贡献判定为有效。',
      evidenceRefs: ['evidence://task-1/1'],
      ...patch,
    })

    it('owner 署名成功 201：source=human-entry 服务端定死、signedBy=服务端身份（客户端冒传忽略）、无 unitId', async () => {
      const id = await seedContract('active')
      const res = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody({
        signedBy: 'attacker-1',
        source: 'telemetry',
        unitId: 'aid-smuggled',
        signedAt: 1,
      }))
      expect(res.status).toBe(201)
      expect(res.body.ok).toBe(true)
      const review = res.body.review as Record<string, unknown>
      expect(review).toMatchObject({
        id: 'rev-1', kind: 'contribution_review', outcomeId: id, assessment: 'effective',
        signedBy: 'owner-1', source: 'human-entry',
      })
      expect(review.subject).toEqual({ subjectKind: 'person', subjectId: 'verifier-1' })
      expect('unitId' in review).toBe(false)
      expect(typeof review.signedAt).toBe('number')
      // 落账核验：judgments.jsonl 一行，human-entry 唯一
      const lines = readFileSync(join(tmpJudg, 'judgments.jsonl'), 'utf8').trim().split('\n')
      expect(lines).toHaveLength(1)
      expect(JSON.parse(lines[0]).source).toBe('human-entry')
    })

    it('verifier 同权可签（owner-or-verifier）；agent/team 主体亦可', async () => {
      const id = await seedContract('active')
      asUser('verifier-1')
      const res = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody({
        reviewId: 'rev-v1',
        subject: { subjectKind: 'agent', subjectId: 'ag-7' },
      }))
      expect(res.status).toBe(201)
      expect((res.body.review as { signedBy: string }).signedBy).toBe('verifier-1')
      const teamReview = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody({
        reviewId: 'rev-v2',
        subject: { subjectKind: 'team', subjectId: id },
        assessment: 'mixed',
      }))
      expect(teamReview.status).toBe(201)
      asUser('owner-1')
    })

    it('未认证 → 401 authenticated_actor_required，零落账', async () => {
      const id = await seedContract('active')
      currentUser = undefined
      const res = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody())
      expect(res.status).toBe(401)
      expect(res.body.code).toBe('authenticated_actor_required')
      expect(existsSync(join(tmpJudg, 'judgments.jsonl'))).toBe(false)
      asUser('owner-1')
    })

    it('非 owner/verifier → 403 forbidden，零落账', async () => {
      const id = await seedContract('active')
      asUser('other-1')
      const res = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody())
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('forbidden')
      expect(existsSync(join(tmpJudg, 'judgments.jsonl'))).toBe(false)
      asUser('owner-1')
    })

    it('幂等 reviewId：重复 POST → 200 replayed 返回原记录，不重复落账', async () => {
      const id = await seedContract('active')
      const first = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody())
      expect(first.status).toBe(201)
      const replay = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, reviewBody({
        assessment: 'ineffective', // 重放携带不同值也不得覆盖
      }))
      expect(replay.status).toBe(200)
      expect(replay.body.replayed).toBe(true)
      expect(replay.body.review).toEqual(first.body.review)
      const lines = readFileSync(join(tmpJudg, 'judgments.jsonl'), 'utf8').trim().split('\n')
      expect(lines).toHaveLength(1)
    })

    it('422 全矩阵：rationale 短/evidenceRefs 空/assessment 非法/subjectKind 非法/subjectId 空/缺 subject/person 自评，各自点名 problems 且零落账', async () => {
      const id = await seedContract('active')
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ['rationale 过短', reviewBody({ rationale: '太短' }), 'rationale'],
        ['evidenceRefs 空', reviewBody({ evidenceRefs: [] }), 'evidenceRefs'],
        ['assessment 非法', reviewBody({ assessment: 'great' }), 'assessment'],
        ['subjectKind 非法', reviewBody({ subject: { subjectKind: 'robot', subjectId: 'ag-1' } }), 'subjectKind'],
        ['subjectId 空', reviewBody({ subject: { subjectKind: 'person', subjectId: '' } }), 'subjectId'],
        ['缺 subject', reviewBody({ subject: undefined }), 'subject'],
        ['person 自评', reviewBody({ subject: { subjectKind: 'person', subjectId: 'owner-1' } }), '自评'],
      ]
      for (const [label, body, keyword] of cases) {
        const res = await post(base, `/api/hermes/outcomes/${id}/contribution-reviews`, body)
        expect(res.status, label).toBe(422)
        expect(res.body.code, label).toBe('invalid_input')
        expect((res.body.problems as string[]).join(), label).toContain(keyword)
      }
      expect(existsSync(join(tmpJudg, 'judgments.jsonl'))).toBe(false) // 全拒收：零落账
    })

    it('未知 outcome → 404 not_found', async () => {
      const res = await post(base, '/api/hermes/outcomes/oc-nope/contribution-reviews', reviewBody())
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('not_found')
    })
  })
})

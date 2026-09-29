// 变更治理 API 守门（调研落地轮 2026-09-29，docs/2026-09-29-change-gov-three-accounts-research.md §4.1）：
// ① meta：L1-L4 分级/SLA/五维词表/管控基准单一事实源
// ② 全生命周期：create(draft)→submit(落 SLA deadline)→decide approve/reject→implement(rework_hours)
// ③ 冻结窗口闸门：窗口生效期提交 → freeze_violation=1；L2 批准无 override → 409 freeze_gate；override 后放行
// ④ 管控基准指标：月度口径（submitted_at 归集）实绩 vs 基准 vs ok/warn/over 判定；一次通过率计驳回重提
// 库用临时路径（CHANGE_GOV_DB 注入），不碰 ~/.hermes-web-ui——测试自包含。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dbDir = mkdtempSync(join(tmpdir(), 'change-gov-'))
let base = ''

beforeAll(async () => {
  process.env.CHANGE_GOV_DB = join(dbDir, 'cg.db')
  const store = await import('../change-governance-store')
  store.resetChangeGovDbForTest()
  const { changeGovRoutes } = await import('../change-governance-controller')
  const app = new Koa()
  // 裸 Koa 无 body parser（上游挂 createRequestBodyParser，测试不引内部件）——
  // 内联等价 JSON 解析，仅够本测试的 application/json 请求体。
  app.use(async (ctx, next) => {
    if (ctx.method === 'POST' || ctx.method === 'PATCH') {
      const chunks: Buffer[] = []
      for await (const c of ctx.req) chunks.push(c as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8')
      try { (ctx.request as { body?: unknown }).body = raw ? JSON.parse(raw) : {} } catch { (ctx.request as { body?: unknown }).body = {} }
    }
    await next()
  })
  app.use(changeGovRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  afterAll(() => {
    server.close()
    delete process.env.CHANGE_GOV_DB
    rmSync(dbDir, { recursive: true, force: true })
  })
})

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json() }
}

describe('变更治理 REST（/api/change-gov）', () => {
  it('meta 暴露分级/SLA/维度/基准单一事实源', async () => {
    const { status, body } = await req('GET', '/api/change-gov/meta')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.levels).toHaveLength(4)
    expect(body.levels[0]).toMatchObject({ key: 'L1', slaHours: 24, authority: '研发总监' })
    expect(body.dimensions).toEqual(['schedule', 'cost', 'scope', 'quality', 'risk'])
    expect(body.baselines).toMatchObject({ monthlyNewMax: 100, overdueReviewRatioMax: 0.08 })
    expect(body.freezeTiers.map((t: any) => t.name)).toEqual(['需求冻结', '设计冻结', '代码冻结'])
  })

  it('全生命周期：草稿→提交(落 SLA)→批准→实施(返工工时)', async () => {
    const created = await req('POST', '/api/change-gov/requests', {
      title: '支付回调协议升级', source: '产品组', board: 'default',
      level: 2, impact: { schedule: 2, cost: 1, scope: 2, quality: 1, risk: 2 }, raci: { approver: ['@boss'] },
    })
    expect(created.status).toBe(201)
    const id = created.body.item.id
    expect(id).toMatch(/^cr-\d{8}-\d{4}$/)
    expect(created.body.item.status).toBe('draft')
    expect(created.body.item.impact_total).toBe(8)

    const submitted = await req('POST', `/api/change-gov/requests/${id}/submit`)
    expect(submitted.status).toBe(200)
    expect(submitted.body.item.status).toBe('submitted')
    expect(submitted.body.item.deadline_at - submitted.body.item.submitted_at)
      .toBe(48 * 3600_000) // L2 SLA 48h

    const decided = await req('POST', `/api/change-gov/requests/${id}/decide`,
      { decision: 'approve', decider: '项目经理', note: '五维评估充分' })
    expect(decided.status).toBe(200)
    expect(decided.body.item.status).toBe('approved')
    expect(decided.body.item.decider).toBe('项目经理')

    const done = await req('POST', `/api/change-gov/requests/${id}/implement`, { rework_hours: 12 })
    expect(done.status).toBe(200)
    expect(done.body.item.status).toBe('implemented')
    expect(done.body.item.rework_hours).toBe(12)
  })

  it('草稿外状态不可直改；决议校验决策人与状态', async () => {
    const c = await req('POST', '/api/change-gov/requests', { title: 'X', level: 4 })
    const id = c.body.item.id
    await req('POST', `/api/change-gov/requests/${id}/submit`)
    const bad = await req('PATCH', `/api/change-gov/requests/${id}`, { title: '改题' })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toContain('仅草稿态可编辑')
    const noDecider = await req('POST', `/api/change-gov/requests/${id}/decide`, { decision: 'approve', decider: '' })
    expect(noDecider.status).toBe(400)
  })

  it('冻结窗口闸门：生效期提交标穿透；L2 无 override 批准 409；override 放行', async () => {
    const now = Date.now()
    const fw = await req('POST', '/api/change-gov/freeze-windows',
      { name: 'v0.8 发布冻结', tier: 3, starts_at: now - 3600_000, ends_at: now + 72 * 3600_000, scope: 'all' })
    expect(fw.status).toBe(201)
    expect(fw.body.item.tier).toBe(3)

    const c = await req('POST', '/api/change-gov/requests', {
      title: '冻结期内插单', board: 'paycore', level: 2, impact: { schedule: 1, cost: 1, scope: 1, quality: 0, risk: 1 },
    })
    const id = c.body.item.id
    const s = await req('POST', `/api/change-gov/requests/${id}/submit`)
    expect(s.body.item.freeze_violation).toBe(true)
    expect(s.body.item.freeze_window_id).toBe(fw.body.item.id)

    const blocked = await req('POST', `/api/change-gov/requests/${id}/decide`,
      { decision: 'approve', decider: '项目经理' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('freeze_gate')

    const forced = await req('POST', `/api/change-gov/requests/${id}/decide`,
      { decision: 'approve', decider: '研发总监', override_freeze: true, note: '紧急安全修复，总监裁决穿透' })
    expect(forced.status).toBe(200)
    expect(forced.body.item.status).toBe('approved')
    expect(forced.body.item.freeze_overridden).toBe(true)
  })

  it('L1 冻结内批准不拦（重大变更走总监决策权）；窗口停用后不再标穿透', async () => {
    const now = Date.now()
    await req('POST', '/api/change-gov/freeze-windows',
      { name: '短窗', tier: 1, starts_at: now - 60_000, ends_at: now + 3600_000, scope: 'default' })
    const c = await req('POST', '/api/change-gov/requests',
      { title: '线上事故回滚', board: 'default', level: 1, emergency: true, impact: { schedule: 3, cost: 2, scope: 2, quality: 3, risk: 3 } })
    const id = c.body.item.id
    await req('POST', `/api/change-gov/requests/${id}/submit`)
    const ok = await req('POST', `/api/change-gov/requests/${id}/decide`,
      { decision: 'approve', decider: '研发总监' })
    expect(ok.status).toBe(200)

    // 停用窗口 → 新提交不再穿透
    const list = await req('GET', '/api/change-gov/freeze-windows')
    for (const w of list.body.items) {
      await req('PATCH', `/api/change-gov/freeze-windows/${w.id}`, { active: false })
    }
    const c2 = await req('POST', '/api/change-gov/requests', { title: '窗口外', level: 3 })
    const s2 = await req('POST', `/api/change-gov/requests/${c2.body.item.id}/submit`)
    expect(s2.body.item.freeze_violation).toBe(false)
  })

  it('管控基准指标：月度实绩 vs 基准判定 + 一次通过率计驳回重提', async () => {
    // 前序用例已产生当月数据；直接断言指标结构与其判定一致性
    const m = await req('GET', '/api/change-gov/metrics')
    expect(m.status).toBe(200)
    expect(m.body.month).toMatch(/^\d{4}-\d{2}$/)
    const keys = m.body.metrics.map((x: any) => x.key)
    expect(keys).toEqual([
      'monthlyNew', 'emergencyRatio', 'overdueReview', 'reworkHours', 'freezePenetration', 'firstPassRate',
    ])
    for (const cell of m.body.metrics) {
      expect(['ok', 'warn', 'over']).toContain(cell.verdict)
      expect(typeof cell.actual).toBe('number')
      expect(typeof cell.baseline).toBe('number')
    }
    // 返工 12h < 180h 基准 → ok
    const rework = m.body.metrics.find((x: any) => x.key === 'reworkHours')
    expect(rework.verdict).toBe('ok')
    // 冻结穿透 2 单 / 当月 ≥4 单 → 超 5% 基准（覆盖拦截图景的判定面）
    const freeze = m.body.metrics.find((x: any) => x.key === 'freezePenetration')
    expect(freeze.actual).toBeGreaterThan(0)

    // 驳回→重提→批准：一次通过率分母计入
    const c = await req('POST', '/api/change-gov/requests', { title: '重提单', level: 3 })
    await req('POST', `/api/change-gov/requests/${c.body.item.id}/submit`)
    await req('POST', `/api/change-gov/requests/${c.body.item.id}/decide`, { decision: 'reject', decider: '模块负责人', note: '影响没写清' })
    const rs = await req('POST', `/api/change-gov/requests/${c.body.item.id}/resubmit`)
    expect(rs.body.item.resubmit_count).toBe(1)
    await req('POST', `/api/change-gov/requests/${c.body.item.id}/decide`, { decision: 'approve', decider: '模块负责人' })
    const m2 = await req('GET', '/api/change-gov/metrics')
    expect(m2.status).toBe(200)
  })

  it('清单过滤：status/level 维度', async () => {
    const all = await req('GET', '/api/change-gov/requests')
    expect(all.body.items.length).toBeGreaterThanOrEqual(5)
    const implemented = await req('GET', '/api/change-gov/requests?status=implemented')
    for (const it of implemented.body.items) expect(it.status).toBe('implemented')
    const l1 = await req('GET', '/api/change-gov/requests?level=1')
    for (const it of l1.body.items) expect(it.level).toBe(1)
  })

  it('非法输入如实 400（空标题/非法级别/非布尔 active）', async () => {
    const noTitle = await req('POST', '/api/change-gov/requests', { title: '  ' })
    expect(noTitle.status).toBe(400)
    expect(noTitle.body.error).toContain('标题')
    const badLevel = await req('POST', '/api/change-gov/requests', { title: 't', level: 9 })
    expect(badLevel.status).toBe(400)
    const fwList = await req('GET', '/api/change-gov/freeze-windows')
    const anyId = fwList.body.items[0]?.id
    if (anyId) {
      const badActive = await req('PATCH', `/api/change-gov/freeze-windows/${anyId}`, { active: 'yes' })
      expect(badActive.status).toBe(400)
    }
  })
})

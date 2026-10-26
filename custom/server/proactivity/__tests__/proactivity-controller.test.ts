// overlay/proactivity HTTP 契约测试：Koa+临时端口真请求（decisiongraph 先例同款）。
// 隔离：对齐台账与 govbus 事件均落临时目录，不触宿主 ~/.hermes-web-ui。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

describe('proactivity REST（/api/hermes/proactivity）', () => {
  let dir: string
  let server: import('node:http').Server | undefined
  let base: string

  beforeEach(async () => {
    server?.close()  // 上一用例的临时端口服务器即用即收
    dir = mkdtempSync(join(tmpdir(), 'proactivity-http-'))
    process.env.HERMES_GOAL_ALIGNMENT_DIR = dir
    process.env.HERMES_GOV_EVENT_DIR = join(dir, 'govbus')
    const bodyParser = (await import('@koa/bodyparser')).default
    const Koa = (await import('koa')).default
    const { proactivityRouter } = await import('../proactivity-controller')
    const app = new Koa()
    app.use(bodyParser())
    app.use(proactivityRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hermes/proactivity`
  })

  afterAll(() => {
    delete process.env.HERMES_GOAL_ALIGNMENT_DIR
    delete process.env.HERMES_GOV_EVENT_DIR
    server?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /model：两轴 5×5 + 规则 + 判定面诚实边界', async () => {
    const res = await fetch(`${base}/model`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      axes: { problemDefiner: unknown[]; actionTier: unknown[] }
      rules: string[]
      alignmentPolicy: { maxConfirmAgeDays: number }
      executionFace: string
    }
    expect(body.axes.problemDefiner).toHaveLength(5)
    expect(body.axes.actionTier).toHaveLength(5)
    expect(body.rules).toHaveLength(4)
    expect(body.alignmentPolicy.maxConfirmAgeDays).toBe(7)
    expect(body.executionFace).toContain('advisory-only')
  })

  it('POST /assess：L4 无契约拒执行；有契约+low 放行；未知 goalId 对齐状态 fail-soft 为 null', async () => {
    const bad = await fetch(`${base}/assess`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'L9', action: 'inform' }),
    })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { problems: string[] }).problems.length).toBeGreaterThan(0)

    const draft = await fetch(`${base}/assess`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'L4', action: 'reversible_exec' }),
    })
    const draftBody = (await draft.json()) as { assessment: { allowed: boolean; cappedAt: string } }
    expect(draftBody.assessment.allowed).toBe(false)
    expect(draftBody.assessment.cappedAt).toBe('draft')

    const upgraded = await fetch(`${base}/assess`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'L4', action: 'irreversible_exec',
        contract: { goalExplicit: true, acceptanceCriteria: true },
        failureCost: { reversible: true, impactScope: 'self', verifiable: true },
      }),
    })
    const up = (await upgraded.json()) as { assessment: { allowed: boolean }; failureCostTier: string; upgrade: { note: string } }
    expect(up.assessment.allowed).toBe(true)
    expect(up.failureCostTier).toBe('low')
    expect(up.upgrade.note).toContain('按规则自动执行')

    const unknown = await fetch(`${base}/assess`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'L4', action: 'draft', goalId: 'nope:absent' }),
    })
    expect(((await unknown.json()) as { goalStatus: null }).goalStatus).toBeNull()
  })

  it('对齐台账全链：登记→列表→确认（漂移复位）→删除→404；变更发 govbus 事件', async () => {
    const create = await fetch(`${base}/alignment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goalId: 'milestone:online', goalSummary: '把里程碑推到上线' }),
    })
    expect(create.status).toBe(200)
    const created = ((await create.json()) as { entry: { status: { status: string }; confirmations: unknown[] } }).entry
    expect(created.status.status).toBe('fresh')  // 新建宽限期内=创建即对齐
    expect(created.confirmations).toHaveLength(0)

    // assess 携 goalId：读到 fresh 状态
    const withGoal = await fetch(`${base}/assess`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'L4', action: 'draft', goalId: 'milestone:online' }),
    })
    expect(((await withGoal.json()) as { goalStatus: { status: string } }).goalStatus.status).toBe('fresh')

    const confirm = await fetch(`${base}/alignment/milestone:online/confirm`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: '方向没变，优先级上调' }),
    })
    expect(confirm.status).toBe(200)
    const confirmed = ((await confirm.json()) as { entry: { confirmations: Array<{ note?: string }>; status: { status: string } } }).entry
    expect(confirmed.confirmations).toHaveLength(1)
    expect(confirmed.confirmations[0]!.note).toBe('方向没变，优先级上调')
    expect(confirmed.status.status).toBe('fresh')

    const list = await fetch(`${base}/alignment`)
    expect(((await list.json()) as { entries: unknown[] }).entries).toHaveLength(1)

    const gone = await fetch(`${base}/alignment/milestone:online`, { method: 'DELETE' })
    expect(gone.status).toBe(200)
    const again = await fetch(`${base}/alignment/milestone:online`, { method: 'DELETE' })
    expect(again.status).toBe(404)
    const confirmMissing = await fetch(`${base}/alignment/milestone:online/confirm`, { method: 'PUT' })
    expect(confirmMissing.status).toBe(404)

    // govbus 事件面：登记/确认/移除三类事件落临时目录
    const events = readdirSync(join(dir, 'govbus'))
    expect(events.length).toBeGreaterThan(0)
  })

  it('POST /alignment 校验：非法 goalId 400', async () => {
    const res = await fetch(`${base}/alignment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goalId: 'bad id', goalSummary: 'x' }),
    })
    expect(res.status).toBe(400)
  })
})

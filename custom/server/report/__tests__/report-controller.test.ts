// 报告链 REST 守门（建设实施落地轮）：真实 Koa 挂载 reportRoutes，两个 POST
// 入口的正反例——字段校验 400、骨架出稿含实算数字、验收断言违例逐项可见。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { reportRoutes } from '../report-controller'

let base = ''
let srv: ReturnType<typeof createServer>

beforeAll(async () => {
  const app = new Koa()
  app.use(bodyParser())
  app.use(reportRoutes.routes())
  srv = createServer(app.callback())
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((r) => srv.close(() => r())))

const RUN10_FACTS = {
  runId: '20261007-v8-run10',
  rfd: 'RFD-001',
  windowText: '10-07 01:21 → 10-07 14:29（约 13.1 小时）',
  featureFlags: '无特殊旗标',
  stepsDone: 25,
  gatesPassed: 6,
  firstPass: 4,
  issuesTotal: 22,
  disp: { 已修: 19, 观察: 6, 延后: 4 },
  typeTop: 'raci×4、anexec×3、report×2、dev×2、patch×1',
}

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

describe('POST /api/hermes/report/part1-skeleton', () => {
  it('run10 口径 facts → 骨架含实算数字与合并槽', async () => {
    const { status, json } = await post('/api/hermes/report/part1-skeleton', RUN10_FACTS)
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    const html = json.html as string
    expect(html).toContain('26 步 25/26 落键')
    expect(html).toContain('首过 4/6')
    expect(html).toContain('{{run_id}}')
  })

  it('缺字段 → 400 指名（不静默兜底）', async () => {
    const { status, json } = await post('/api/hermes/report/part1-skeleton', { runId: 'x' })
    expect(status).toBe(400)
    expect(json.detail as string).toContain('windowText')
  })
})

describe('POST /api/hermes/report/acceptance', () => {
  const gateOkSteps = [7, 15, 18, 19, 20, 24].map((n) => ({
    n,
    html: '<details class="st-artifact"><summary>📦</summary></details>',
  }))

  it('六件齐+承载率行+无 QGate 块 → ok=true', async () => {
    const { status, json } = await post('/api/hermes/report/acceptance', {
      steps: gateOkSteps,
      html: '…产品面承载率 <b>5/5</b>（验收线 ≥4/5）…',
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.faceRate).toMatchObject({ missing: false, n: 5 })
  })

  it('步 15 视图缺位+承载率行缺位 → ok=false 且违例逐项可见', async () => {
    const steps = gateOkSteps.map((s) => (s.n === 15 ? { n: 15, html: '<article/>' } : s))
    const { json } = await post('/api/hermes/report/acceptance', { steps, html: '<p>无承载率行</p>' })
    expect(json.ok).toBe(false)
    expect((json.gateArtifacts as { missing: string[] }).missing).toEqual(['步15(G2 评审卡)'])
    expect((json.faceRate as { missing: boolean }).missing).toBe(true)
    expect(json.artifactViews).toMatchObject({ belowMin: true, min: 15 })
  })

  it('入参形状不对 → 400', async () => {
    const { status } = await post('/api/hermes/report/acceptance', { steps: 'x' })
    expect(status).toBe(400)
  })
})

// 批一 Task 12：审批收件箱 outcome 绑定与双签门守门（spec 2026-11-19-ai-native-operating-model
// §3.3.2/§4.3）。走真实 decide 路由（approvalsRoutes），覆盖：
//   - pending 聚合标注：条目源记录携带 outcome_ref/dual_sign_required（T11 下发）→
//     展示面带 outcomeId/contractVersion/双签要求；无绑定条目不带（回归不变）；
//   - decide 门：stale contractVersion 409；合同不可读 409（fail-closed 不猜）；
//     dual_sign_required 单签仍 pending（第一签落账）、同人两票不生效、
//     owner+verifier 两笔不同 actor 顺序批准才 resolved（响应文件+历史含 outcome 引用）；
//     映射失败 actor 403 拒签；否决不设双签（收紧方向不加门槛）；
//   - 无 outcome 绑定条目行为回归不变（单签直决）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'

let dir = ''
let queueDir = ''
let base = ''
let server: ReturnType<typeof createServer> | null = null
let currentActor = 'owner@example.com'

const ENV_KEYS = [
  'HERMES_AUTONOMY_GOV_DIR', 'HERMES_ENFORCE_APPROVALS_DIR', 'HERMES_APPROVALS_LOG_FILE',
  'HERMES_REVIEW_DIR', 'HERMES_APPROVALS_QUEUE_DIR', 'HUMAN_GATE_STORE', 'AUTONOMY_DUAL_SIGN',
  'AGENT_IDENTITY_STORE', 'OUTCOME_STORE',
] as const
const before: Record<string, string | undefined> = {}

function jsonBody(ctx: Koa.Context, next: () => Promise<void>): Promise<void> {
  if (ctx.method !== 'POST') return next()
  return (async () => {
    const chunks: Buffer[] = []
    for await (const c of ctx.req) chunks.push(c as Buffer)
    try { (ctx.request as { body?: unknown }).body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { (ctx.request as { body?: unknown }).body = {} }
    await next()
  })()
}

async function start(): Promise<void> {
  const { approvalsRoutes } = await import('../pending-controller')
  const app = new Koa()
  app.use(async (ctx, next) => {
    ;(ctx.state as { user?: { username?: string; role?: string } }).user = { username: currentActor, role: 'super_admin' }
    await next()
  })
  app.use(jsonBody)
  app.use(approvalsRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => (server as ReturnType<typeof createServer>).listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

async function decide(id: string, decision: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/approvals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

async function pendingItems(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${base}/api/approvals/pending`)
  const body = await res.json() as { items: Array<Record<string, unknown>> }
  return body.items
}

/** 造合同（owner=p-owner / verifier=p-verifier，version 由参定）。 */
async function makeContract(outcomeId: string, version: number): Promise<void> {
  const { createContract } = await import('../../outcome/outcome-store')
  const r = createContract({
    schemaVersion: 1,
    outcomeId,
    rootTaskId: `rt-${outcomeId}`,
    version,
    title: '发布事故率下降',
    valueStatement: '降低发布流程引发的生产事故',
    ownerPersonId: 'p-owner',
    measures: [{
      measureId: 'm-1', name: '发布事故数', definition: '滚动 30 天发布直接引发故障次数',
      unit: '次', operator: 'lte', baseline: null, target: 0, sourceRef: 'incidents://release',
    }],
    acceptance: { statements: [], requiredEvidenceKinds: [] },
    scope: { included: ['发布流程'], excluded: [] },
    riskTier: 'high',
    defaultReversibility: 'one-way',
    verificationOwnerId: 'p-verifier',
    contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
    learningOptIn: false,
    status: 'active',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }, 'seed')
  expect(r.ok).toBe(true)
}

interface DeferredFixture {
  id: string
  requestId: string
  outcomeId?: string
  contractVersion?: number
  dualSign?: boolean
}

/** 落一条 deferred.json 记录（outcome 绑定字段按需；多条按 id 累积合并）。 */
function writeDeferred(fx: DeferredFixture): void {
  const nowSec = Date.now() / 1000
  const row = {
    id: fx.id,
    session_key: 'kanban:b:t1',
    request_id: fx.requestId,
    tool: 'terminal',
    preview: 'git push origin main',
    risk: 'high',
    created_at: nowSec,
    expires_at: nowSec + 3600,
    status: 'pending',
    ...(fx.outcomeId ? {
      outcome_ref: {
        outcomeId: fx.outcomeId,
        contractVersion: fx.contractVersion ?? 1,
        ownerPersonId: 'p-owner',
        verificationOwnerId: 'p-verifier',
      },
      ...(fx.dualSign ? { dual_sign_required: true } : {}),
    } : {}),
  }
  const file = join(queueDir, 'deferred.json')
  let rows: Array<Record<string, unknown>> = []
  if (existsSync(file)) {
    try { rows = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>> } catch { rows = [] }
  }
  rows = [...rows.filter((r) => r.id !== fx.id), row]
  writeFileSync(file, JSON.stringify(rows), 'utf8')
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'outcome-inbox-'))
  for (const k of ENV_KEYS) before[k] = process.env[k]
  queueDir = join(dir, 'queue')
  process.env.HERMES_AUTONOMY_GOV_DIR = join(dir, 'autonomygov')
  process.env.HERMES_ENFORCE_APPROVALS_DIR = join(dir, 'enforce')
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals-log.json')
  process.env.HERMES_REVIEW_DIR = join(dir, 'review')
  process.env.HERMES_APPROVALS_QUEUE_DIR = queueDir
  process.env.HUMAN_GATE_STORE = join(dir, 'hgate.json')
  process.env.AGENT_IDENTITY_STORE = join(dir, 'people-store')
  process.env.OUTCOME_STORE = join(dir, 'outcome-store')
  delete process.env.AUTONOMY_DUAL_SIGN
  mkdirSync(queueDir, { recursive: true })
  mkdirSync(process.env.AGENT_IDENTITY_STORE, { recursive: true })
  mkdirSync(process.env.OUTCOME_STORE, { recursive: true })
  // 名册：owner/verifier 两自然人（emails 供 actor 映射）
  writeFileSync(join(process.env.AGENT_IDENTITY_STORE, 'people.json'), JSON.stringify({
    people: [
      { id: 'p-owner', name: '张三', emails: ['owner@example.com'], active: true, source: 'manual', createdAt: 1 },
      { id: 'p-verifier', name: '李四', emails: ['verifier@example.com'], active: true, source: 'manual', createdAt: 1 },
    ],
    nextSeq: 3,
  }), 'utf8')
  currentActor = 'owner@example.com'
  await start()
})

afterEach(() => {
  server?.close()
  server = null
  for (const k of ENV_KEYS) {
    if (before[k] === undefined) delete process.env[k]
    else process.env[k] = before[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('pending 聚合：outcome 绑定标注', () => {
  it('deferred 条目携带 outcome_ref/dual_sign_required → 待审项标注 outcomeId/contractVersion/双签要求', async () => {
    await makeContract('oc-anno', 1)
    writeDeferred({ id: 'd-anno', requestId: 'rq-anno', outcomeId: 'oc-anno', contractVersion: 1, dualSign: true })
    writeDeferred({ id: 'd-plain', requestId: 'rq-plain' })
    const items = await pendingItems()
    const bound = items.find((i) => i.id === 'deferredfile:d-anno')
    expect(bound).toBeTruthy()
    expect((bound!.outcomeRef as { outcomeId: string }).outcomeId).toBe('oc-anno')
    expect((bound!.outcomeRef as { contractVersion: number }).contractVersion).toBe(1)
    expect(bound!.dualSignRequired).toBe(true)
    // 无绑定条目不带 outcome 面（回归不变）
    const plain = items.find((i) => i.id === 'deferredfile:d-plain')
    expect(plain).toBeTruthy()
    expect(plain!.outcomeRef).toBeUndefined()
    expect(plain!.dualSignRequired).toBeUndefined()
  })

  it('fleetfile 队列条目携带 outcome_ref → 同样标注（gateway 源经 worker 插件入队形态）', async () => {
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
      request_id: 'rq-ff', digest: 'd1', command: 'git push origin main',
      allowed_choices: ['once', 'deny'], timeout_seconds: 300, enqueued_at: Date.now(),
      outcome_ref: { outcomeId: 'oc-ff', contractVersion: 3, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
    }) + '\n', 'utf8')
    const items = await pendingItems()
    const ff = items.find((i) => i.id === 'fleetfile:rq-ff')
    expect(ff).toBeTruthy()
    expect((ff!.outcomeRef as { outcomeId: string }).outcomeId).toBe('oc-ff')
    expect((ff!.outcomeRef as { contractVersion: number }).contractVersion).toBe(3)
    expect(ff!.dualSignRequired).toBeUndefined()
  })
})

describe('decide 门：stale 合同与 fail-closed', () => {
  it('contractVersion 与当前合同不符 → 409 stale_contract，不写响应、仍 pending', async () => {
    await makeContract('oc-stale', 1)
    writeDeferred({ id: 'd-stale', requestId: 'rq-stale', outcomeId: 'oc-stale', contractVersion: 2, dualSign: true })
    const r = await decide('deferredfile:d-stale', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('stale_contract')
    expect(existsSync(join(queueDir, 'responses', 'rq-stale.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-stale')).toBe(true)
  })

  it('合同不可读（不存在/坏档）→ 409 outcome_unavailable（fail-closed 不猜）', async () => {
    writeDeferred({ id: 'd-ghost', requestId: 'rq-ghost', outcomeId: 'oc-ghost', contractVersion: 1 })
    const r = await decide('deferredfile:d-ghost', 'once')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('outcome_unavailable')
    expect(existsSync(join(queueDir, 'responses', 'rq-ghost.json'))).toBe(false)
  })
})

describe('decide 门：owner/verifier 双签', () => {
  beforeEach(async () => {
    await makeContract('oc-ds', 1)
    writeDeferred({ id: 'd-ds', requestId: 'rq-ds', outcomeId: 'oc-ds', contractVersion: 1, dualSign: true })
  })

  it('单签（owner 第一签）→ 409 仍 pending：签署落账但不写响应文件', async () => {
    const first = await decide('deferredfile:d-ds', 'once')
    expect(first.status).toBe(409)
    expect(first.body.code).toBe('dual-sign-required')
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-ds')).toBe(true)
  })

  it('owner 两票不生效（同人重复签仍 409、仍 pending）', async () => {
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-ds')).toBe(true)
  })

  it('owner+verifier 顺序两笔不同 actor → resolved：响应文件落地、历史含 outcome 引用、不再在列', async () => {
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    currentActor = 'verifier@example.com'
    const second = await decide('deferredfile:d-ds', 'once')
    expect(second.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-ds.json'), 'utf8')) as { request_id: string; choice: string }
    expect(resp.request_id).toBe('rq-ds')
    expect(resp.choice).toBe('once')
    // 历史落账携带 outcome 引用（resolved 的授权回执形态）
    const entry = (second.body.entry as { outcomeRef?: { outcomeId: string; contractVersion: number }; decision: string })
    expect(entry.decision).toBe('once')
    expect(entry.outcomeRef).toEqual({ outcomeId: 'oc-ds', contractVersion: 1 })
    expect((await pendingItems()).some((i) => i.id === 'deferredfile:d-ds')).toBe(false)
  })

  it('映射失败 actor（既非 owner 也非 verifier）→ 403 拒签、不落签署账', async () => {
    currentActor = 'stranger'
    const r = await decide('deferredfile:d-ds', 'once')
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('not_outcome_signer')
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
    // 拒签未污染签署账：owner 首签仍走第一签路径（409 pending）
    currentActor = 'owner@example.com'
    expect((await decide('deferredfile:d-ds', 'once')).status).toBe(409)
    expect(existsSync(join(queueDir, 'responses', 'rq-ds.json'))).toBe(false)
  })

  it('否决不设双签：owner 单人 deny 即决（收紧方向不加门槛）', async () => {
    const r = await decide('deferredfile:d-ds', 'deny')
    expect(r.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-ds.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('deny')
  })
})

describe('decide 门：绑定但非双签格与无绑定回归', () => {
  it('outcome 绑定但非 dual_sign_required → 单签即决（版本门仍生效）', async () => {
    await makeContract('oc-single', 1)
    writeDeferred({ id: 'd-single', requestId: 'rq-single', outcomeId: 'oc-single', contractVersion: 1, dualSign: false })
    const r = await decide('deferredfile:d-single', 'once')
    expect(r.status).toBe(200)
    const resp = JSON.parse(readFileSync(join(queueDir, 'responses', 'rq-single.json'), 'utf8')) as { choice: string }
    expect(resp.choice).toBe('once')
    expect((r.body.entry as { outcomeRef?: { outcomeId: string } }).outcomeRef?.outcomeId).toBe('oc-single')
  })

  it('无 outcome 绑定条目行为回归不变（任意 actor 单签直决）', async () => {
    writeDeferred({ id: 'd-plain', requestId: 'rq-plain' })
    currentActor = 'whoever'
    const r = await decide('deferredfile:d-plain', 'once')
    expect(r.status).toBe(200)
    expect(existsSync(join(queueDir, 'responses', 'rq-plain.json'))).toBe(true)
  })

  it('fleetfile 绑定条目走同一门：stale 409 / 版本符合且非双签格单签直决', async () => {
    await makeContract('oc-ff2', 1)
    const now = Date.now()
    writeFileSync(join(queueDir, 'queue.jsonl'), [
      JSON.stringify({
        request_id: 'rq-ff-stale', digest: 'd1', command: 'git push', timeout_seconds: 300, enqueued_at: now,
        outcome_ref: { outcomeId: 'oc-ff2', contractVersion: 9, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      }),
      JSON.stringify({
        request_id: 'rq-ff-ok', digest: 'd2', command: 'git push', timeout_seconds: 300, enqueued_at: now,
        outcome_ref: { outcomeId: 'oc-ff2', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      }),
    ].join('\n') + '\n', 'utf8')
    const stale = await decide('fleetfile:rq-ff-stale', 'once')
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('stale_contract')
    expect(existsSync(join(queueDir, 'responses', 'rq-ff-stale.json'))).toBe(false)
    const okRes = await decide('fleetfile:rq-ff-ok', 'once')
    expect(okRes.status).toBe(200)
    expect(existsSync(join(queueDir, 'responses', 'rq-ff-ok.json'))).toBe(true)
  })

  it('outcome 绑定条目不吃 autopass 低风险自动放行（stale/双签门不可绕）', async () => {
    process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS = '0'
    try {
      // 低风险只读命令＋outcome 绑定（矩阵 externalEffect 等格可对 low 命令 ask）——
      // 若 autopass 放行将绕过 stale 合同门；治理面不随抽检器放宽（T11 同则）。
      writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
        request_id: 'rq-ff-auto', digest: 'd9', command: 'grep deploy README.md',
        timeout_seconds: 300, enqueued_at: Date.now() - 60_000,
        outcome_ref: { outcomeId: 'oc-ff2', contractVersion: 1, ownerPersonId: 'p-owner', verificationOwnerId: 'p-verifier' },
      }) + '\n', 'utf8')
      const { _resetAutopassScanThrottleForTests } = await import('../pending-controller')
      _resetAutopassScanThrottleForTests()
      const res = await fetch(`${base}/api/approvals/autopass/scan`, { method: 'POST' })
      const body = await res.json() as { ok: boolean; acted: number }
      expect(res.status).toBe(200)
      expect(body.acted).toBe(0)
      expect(existsSync(join(queueDir, 'responses', 'rq-ff-auto.json'))).toBe(false)
      // 无绑定低风险条目仍照常自动放行（回归不变）
      writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify({
        request_id: 'rq-ff-auto2', digest: 'd10', command: 'grep deploy README.md',
        timeout_seconds: 300, enqueued_at: Date.now() - 60_000,
      }) + '\n', 'utf8')
      _resetAutopassScanThrottleForTests()
      const res2 = await fetch(`${base}/api/approvals/autopass/scan`, { method: 'POST' })
      const body2 = await res2.json() as { acted: number }
      expect(body2.acted).toBe(1)
      expect(existsSync(join(queueDir, 'responses', 'rq-ff-auto2.json'))).toBe(true)
    } finally {
      delete process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS
    }
  })
})
